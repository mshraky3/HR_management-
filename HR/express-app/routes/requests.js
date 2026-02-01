/**
 * Requests Routes
 * Branch managers can submit requests to main managers
 * Main managers can view and respond to requests
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager } from '../middleware/authorization.js';
import { Request } from '../models/Request.js';
import { Branch } from '../models/Branch.js';
import { User } from '../models/User.js';
import { uploadSingle } from '../middleware/upload.js';
import { uploadRequestAttachmentToBlob } from '../utils/blobStorage.js';
import { fixFilenameEncoding } from '../utils/fileUpload.js';
import { sendNotificationEmail } from '../utils/emailService.js';
import sql from '../config/database.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/requests/main-managers
 * Get list of main managers (for branch managers to select when creating requests)
 */
router.get('/main-managers', async (req, res) => {
  try {
    const { User } = await import('../models/User.js');
    const managers = await User.findAll({
      role: 'main_manager',
      is_active: true
    });

    res.json({
      success: true,
      data: managers
    });
  } catch (error) {
    log.error('Error fetching main managers', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'فشل جلب قائمة المديرين الرئيسيين',
      error: error.message
    });
  }
});

/**
 * POST /api/requests
 * Create a new request (Branch Manager only)
 * Form data: main_manager_id, employee_id (optional), request_name, request_text, file (optional)
 */
router.post('/', uploadSingle, async (req, res) => {
  try {
    const { main_manager_id, employee_id, request_name, request_text } = req.body;

    // Validation
    if (!main_manager_id || !request_name || !request_text) {
      return res.status(400).json({
        success: false,
        message: 'معرف المدير الرئيسي واسم الطلب ونص الطلب مطلوبة'
      });
    }

    // Branch managers can only create requests for their branch
    if (req.user.role !== 'branch_manager' || !req.user.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'يمكن لمديري الفروع فقط إنشاء الطلبات'
      });
    }

    // Validate main manager exists and is active
    const { User } = await import('../models/User.js');
    const mainManager = await User.findById(parseInt(main_manager_id));
    if (!mainManager || mainManager.role !== 'main_manager' || !mainManager.is_active) {
      return res.status(400).json({
        success: false,
        message: 'المدير الرئيسي المحدد غير صحيح'
      });
    }

    // Validate employee if provided
    if (employee_id) {
      const { Employee } = await import('../models/Employee.js');
      const employee = await Employee.findById(parseInt(employee_id));
      if (!employee || employee.branch_id !== req.user.branch_id) {
        return res.status(400).json({
          success: false,
          message: 'الموظف المحدد غير صحيح'
        });
      }
    }

    // Create request without attachment first
    const request = await Request.create({
      branch_id: req.user.branch_id,
      main_manager_id: parseInt(main_manager_id),
      employee_id: employee_id ? parseInt(employee_id) : null,
      request_name: request_name.trim(),
      request_text: request_text.trim(),
      attachment_url: null,
      attachment_name: null,
      attachment_type: null
    });

    // Upload file if provided
    let attachmentUrl = null;
    let attachmentName = null;
    let attachmentType = null;

    if (req.file) {
      try {
        const fixedFileName = fixFilenameEncoding(req.file.originalname);
        attachmentUrl = await uploadRequestAttachmentToBlob(
          req.file.buffer,
          fixedFileName,
          req.file.mimetype,
          request.id
        );
        attachmentName = fixedFileName;
        attachmentType = req.file.mimetype;

        // Update request with attachment info
        await sql`
          UPDATE requests 
          SET attachment_url = ${attachmentUrl},
              attachment_name = ${attachmentName},
              attachment_type = ${attachmentType}
          WHERE id = ${request.id}
        `;
      } catch (uploadError) {
        log.error('Error uploading attachment', { error: uploadError.message, stack: uploadError.stack });
        // Don't fail the request creation if upload fails
      }
    }

    // Fetch updated request
    const updatedRequest = await Request.findById(request.id);

    // Send email notification to main manager
    try {
      const branch = await Branch.findById(req.user.branch_id);
      const branchName = branch ? branch.branch_name : 'غير محدد';
      const requesterName = req.user.full_name || req.user.username;
      const mainManagerEmail = 'Sharaksa@gmail.com';

      log.info('Sending request notification email', {
        to: mainManagerEmail,
        branch: branchName,
        requesterName: requesterName
      });

      const emailResult = await sendNotificationEmail({
        to: mainManagerEmail,
        subject: `طلب جديد من ${branchName}`,
        message: `تلقيت طلب جديد من ${requesterName} بخصوص: ${request_name}`,
        notificationType: 'new_request',
        appUrl: `${process.env.REACT_APP_URL || 'https://hr-react-theta.vercel.app'}/manage-requests`,
        data: {
          'الفرع': branchName,
          'المرسل': requesterName,
          'عنوان الطلب': request_name,
          'التفاصيل': request_text.substring(0, 100) + (request_text.length > 100 ? '...' : '')
        }
      });

      log.info('Request notification email result', { emailResult });
    } catch (emailError) {
      log.error('Error sending request notification email', {
        error: emailError.message,
        stack: emailError.stack
      });
      // Don't fail the request creation if email fails
    }

    res.status(201).json({
      success: true,
      message: 'تم إرسال الطلب بنجاح',
      data: updatedRequest
    });
  } catch (error) {
    log.error('Error creating request', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'فشل إنشاء الطلب',
      error: process.env.NODE_ENV === 'development' ? error.message : 'حدث خطأ أثناء إنشاء الطلب'
    });
  }
});


/**
 * GET /api/requests
 * Get all requests
 * - Branch managers see only their branch's requests
 * - Main managers see requests assigned to them
 * Query params: status, employee_id
 */
router.get('/', async (req, res) => {
  try {
    let filters = {};

    if (req.user.role === 'branch_manager') {
      // Branch managers see only their branch's requests
      filters.branch_id = req.user.branch_id;
    } else if (req.user.role === 'main_manager') {
      // Main managers see requests assigned to them
      filters.main_manager_id = req.user.id;
    } else {
      return res.status(403).json({
        success: false,
        message: 'تم رفض الوصول'
      });
    }

    if (req.query.status) {
      filters.status = req.query.status;
    }

    if (req.query.employee_id) {
      filters.employee_id = parseInt(req.query.employee_id);
    }

    const requests = await Request.findAll(filters);

    res.json({
      success: true,
      data: requests
    });
  } catch (error) {
    log.error('Error fetching requests', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'فشل جلب الطلبات',
      error: error.message
    });
  }
});

/**
 * GET /api/requests/:id
 * Get request by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const request = await Request.findById(parseInt(req.params.id));

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'الطلب غير موجود'
      });
    }

    // Check access
    if (req.user.role === 'branch_manager') {
      if (request.branch_id !== req.user.branch_id) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول'
        });
      }
    } else if (req.user.role === 'main_manager') {
      if (request.main_manager_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول'
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: 'تم رفض الوصول'
      });
    }

    res.json({
      success: true,
      data: request
    });
  } catch (error) {
    log.error('Error fetching request', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'فشل جلب الطلب',
      error: error.message
    });
  }
});

/**
 * PUT /api/requests/:id/respond
 * Respond to a request (Main Manager only)
 * Form data: { status: 'approved' | 'rejected' | 'in_progress' | 'completed', response_text: string, file: File (optional) }
 */
router.put('/:id/respond', requireMainManager, uploadSingle, async (req, res) => {
  try {
    const { status, response_text } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'الحالة مطلوبة'
      });
    }

    const validStatuses = ['approved', 'rejected', 'in_progress', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `يجب أن تكون الحالة واحدة من: ${validStatuses.join(', ')}`
      });
    }

    const request = await Request.findById(parseInt(req.params.id));

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'الطلب غير موجود'
      });
    }

    // Check if request is assigned to this main manager
    if (request.main_manager_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'يمكنك فقط الرد على الطلبات المخصصة لك'
      });
    }

    // Upload response attachment if provided
    let responseAttachmentUrl = null;
    let responseAttachmentName = null;
    let responseAttachmentType = null;

    if (req.file) {
      try {
        const fixedFileName = fixFilenameEncoding(req.file.originalname);
        responseAttachmentUrl = await uploadRequestAttachmentToBlob(
          req.file.buffer,
          `response_${fixedFileName}`,
          req.file.mimetype,
          request.id
        );
        responseAttachmentName = fixedFileName;
        responseAttachmentType = req.file.mimetype;
      } catch (uploadError) {
        log.error('Error uploading response attachment', { error: uploadError.message, stack: uploadError.stack });
        // Don't fail the response if upload fails
      }
    }

    // Update request
    const updateData = {
      status,
      response_text: response_text || null,
      responded_by: req.user.id
    };

    if (responseAttachmentUrl) {
      updateData.response_attachment_url = responseAttachmentUrl;
      updateData.response_attachment_name = responseAttachmentName;
      updateData.response_attachment_type = responseAttachmentType;
    }

    const updatedRequest = await Request.update(parseInt(req.params.id), updateData);

    // Send email notification to branch manager
    try {
      const branchManager = await User.findById(request.created_by);
      const branch = await Branch.findById(request.branch_id);
      const branchName = branch ? branch.branch_name : 'غير محدد';
      const managerName = req.user.full_name || req.user.username;

      // Map status to Arabic
      const statusLabels = {
        'approved': 'موافق عليه',
        'rejected': 'مرفوض',
        'in_progress': 'قيد المعالجة',
        'completed': 'مكتمل'
      };
      const statusLabel = statusLabels[status] || status;

      if (branchManager && branchManager.email) {
        await sendNotificationEmail({
          to: branchManager.email,
          subject: `رد على طلبك: ${request.request_name}`,
          message: `تم الرد على طلبك من قبل ${managerName} بحالة: ${statusLabel}`,
          notificationType: 'request_response',
          appUrl: `${process.env.REACT_APP_URL || 'https://hr-react-theta.vercel.app'}/manage-requests`,
          data: {
            'عنوان الطلب': request.request_name,
            'المدير': managerName,
            'الحالة الجديدة': statusLabel,
            'الملاحظات': response_text ? response_text.substring(0, 100) + (response_text.length > 100 ? '...' : '') : 'بدون ملاحظات'
          }
        });
      }
    } catch (emailError) {
      log.error('Error sending request response email', { error: emailError.message });
      // Don't fail the response if email fails
    }

    res.json({
      success: true,
      message: 'تم الرد على الطلب بنجاح',
      data: updatedRequest
    });
  } catch (error) {
    log.error('Error responding to request', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'فشل الرد على الطلب',
      error: error.message
    });
  }
});

/**
 * DELETE /api/requests/:id
 * Delete a request (Branch Manager can delete their own requests if pending)
 */
router.delete('/:id', async (req, res) => {
  try {
    const request = await Request.findById(parseInt(req.params.id));

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'الطلب غير موجود'
      });
    }

    // Branch managers can only delete their own branch's pending requests
    if (req.user.role === 'branch_manager') {
      if (request.branch_id !== req.user.branch_id) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول'
        });
      }
      if (request.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'يمكن حذف الطلبات المعلقة فقط'
        });
      }
    } else if (req.user.role !== 'main_manager') {
      return res.status(403).json({
        success: false,
        message: 'تم رفض الوصول'
      });
    }

    // Delete attachment from blob storage if exists
    if (request.attachment_url) {
      try {
        const { deleteFromBlob } = await import('../utils/blobStorage.js');
        await deleteFromBlob(request.attachment_url);
      } catch (deleteError) {
        log.error('Error deleting attachment', { error: deleteError.message, stack: deleteError.stack });
        // Continue with request deletion even if attachment deletion fails
      }
    }

    await Request.delete(parseInt(req.params.id));

    res.json({
      success: true,
      message: 'تم حذف الطلب بنجاح'
    });
  } catch (error) {
    log.error('Error deleting request', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: 'فشل حذف الطلب',
      error: error.message
    });
  }
});

export default router;
