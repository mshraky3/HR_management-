/**
 * Notifications Routes
 * Send notifications to branches and manage responses
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager } from '../middleware/authorization.js';
import { Notification } from '../models/Notification.js';
import { NotificationResponse } from '../models/NotificationResponse.js';
import { Branch } from '../models/Branch.js';
import { User } from '../models/User.js';
import { uploadSingle, validateUploadedFile } from '../middleware/upload.js';
import { uploadNotificationAttachmentToBlob } from '../utils/blobStorage.js';
import { fixFilenameEncoding } from '../utils/fileUpload.js';
import { getExtensionFromMimeType } from '../utils/fileUpload.js';
import { sendNotificationEmail } from '../utils/emailService.js';
import sql from '../config/database.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/notifications
 * Create a new notification (Main Manager only)
 * Body: { message, importance_level, branch_ids: [1, 2, 3] }
 * Form data: file (optional attachment)
 */
router.post('/', requireMainManager, uploadSingle, async (req, res) => {
  try {
    const { message, importance_level, duration_days, one_time } = req.body;

    // Handle branch_ids from FormData
    // When using FormData with JSON.stringify, it comes as a string that needs parsing
    let branch_ids = req.body.branch_ids;

    // Debug logging (remove in production if needed)
    console.log('Received branch_ids:', branch_ids, 'Type:', typeof branch_ids);
    console.log('All req.body keys:', Object.keys(req.body));

    // If branch_ids is a string (from JSON.stringify), parse it
    if (typeof branch_ids === 'string') {
      try {
        branch_ids = JSON.parse(branch_ids);
      } catch (parseError) {
        console.error('Error parsing branch_ids JSON:', parseError);
        return res.status(400).json({
          success: false,
          message: 'خطأ في معالجة قائمة الفروع. يرجى المحاولة مرة أخرى.'
        });
      }
    }

    // Ensure it's an array
    if (!Array.isArray(branch_ids)) {
      if (branch_ids !== undefined && branch_ids !== null) {
        branch_ids = [branch_ids];
      } else {
        branch_ids = [];
      }
    }

    // Ensure all values are valid numbers and convert to integers
    branch_ids = branch_ids
      .filter(id => id !== null && id !== undefined && id !== '')
      .map(id => parseInt(id))
      .filter(id => !isNaN(id));

    console.log('Processed branch_ids:', branch_ids);

    // Validation
    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'الرسالة مطلوبة'
      });
    }

    if (!importance_level || ![1, 2, 3, 4].includes(parseInt(importance_level))) {
      return res.status(400).json({
        success: false,
        message: 'مستوى الأهمية يجب أن يكون 1، 2، 3، أو 4'
      });
    }

    if (!branch_ids || !Array.isArray(branch_ids) || branch_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'يجب اختيار فرع واحد على الأقل'
      });
    }

    // Validate and calculate expires_at
    let expires_at = null;
    let durationDays = duration_days !== undefined && duration_days !== null && duration_days !== ''
      ? parseInt(duration_days)
      : 7; // Default to 7 days

    if (isNaN(durationDays) || durationDays < 1) {
      return res.status(400).json({
        success: false,
        message: 'مدة الإشعار يجب أن تكون رقمًا صحيحًا أكبر من أو يساوي 1'
      });
    }

    if (durationDays > 365) {
      return res.status(400).json({
        success: false,
        message: 'مدة الإشعار لا يمكن أن تتجاوز 365 يومًا'
      });
    }

    // Calculate expires_at: created_at + duration_days
    const now = new Date();
    expires_at = new Date(now);
    expires_at.setDate(expires_at.getDate() + durationDays);

    // Validate branch IDs exist and are active
    const validBranchIds = branch_ids.map(id => parseInt(id)).filter(id => !isNaN(id));
    const branches = await Branch.findAll({ is_active: true });
    const validBranches = branches.filter(b => validBranchIds.includes(b.id));

    if (validBranches.length !== validBranchIds.length) {
      return res.status(400).json({
        success: false,
        message: 'بعض الفروع المحددة غير صحيحة أو غير نشطة'
      });
    }

    // Handle file upload if provided
    let attachmentUrl = null;
    let attachmentName = null;
    let attachmentType = null;

    if (req.file) {
      // Validate file
      const allowedMimes = [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif'
      ];

      if (!allowedMimes.includes(req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: 'نوع الملف غير مدعوم. يُسمح فقط بملفات PDF والصور'
        });
      }

      // Validate file size (10MB max for notifications)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (req.file.size > maxSize) {
        return res.status(400).json({
          success: false,
          message: 'حجم الملف يتجاوز الحد الأقصى المسموح به (10 ميجابايت)'
        });
      }

      // Fix filename encoding
      const fixedFileName = fixFilenameEncoding(req.file.originalname);

      // Upload to blob storage (we'll get notification ID after creation, so use temp path)
      // We'll need to update the notification after creation with the correct path
      // For now, we'll create a temporary notification ID or use a different approach
      // Actually, we can upload first with a temp ID, then update, or better: create notification first, then upload
      // Let's create notification first, then upload file
    }

    // Create notification first (without attachment)
    const notification = await Notification.create({
      message: message.trim(),
      importance_level: parseInt(importance_level),
      created_by: req.user.id,
      branch_ids: validBranchIds,
      attachment_url: null,
      attachment_name: null,
      attachment_type: null,
      expires_at: expires_at,
      one_time: one_time === 'true' || one_time === true
    });

    // Upload file if provided (now we have notification ID)
    if (req.file) {
      try {
        const fixedFileName = fixFilenameEncoding(req.file.originalname);
        const uploadResult = await uploadNotificationAttachmentToBlob(
          req.file.buffer,
          fixedFileName,
          req.file.mimetype,
          notification.id
        );
        attachmentUrl = uploadResult.url;
        const r2AttachmentUrl = uploadResult.r2Url || null;
        attachmentName = fixedFileName;
        attachmentType = req.file.mimetype;

        // Update notification with attachment info
        await sql`
          UPDATE notifications 
          SET attachment_url = ${attachmentUrl},
              attachment_name = ${attachmentName},
              attachment_type = ${attachmentType},
              r2_attachment_url = ${r2AttachmentUrl}
          WHERE id = ${notification.id}
        `;
      } catch (uploadError) {
        console.error('Error uploading attachment:', uploadError);
        // Don't fail the notification creation if upload fails
        // Just log the error
      }
    }

    // Fetch updated notification
    const updatedNotification = await Notification.findById(notification.id);

    // Send email to main manager
    try {
      const mainManagerEmail = 'Sharaksa@gmail.com';
      const appUrl = process.env.APP_URL || 'http://localhost:5173';

      // Get branch names for email
      const branchNames = validBranches.map(b => b.branch_name).join('، ');

      await sendNotificationEmail({
        to: mainManagerEmail,
        subject: `إشعار جديد - ${['منخفضة', 'عادية', 'متوسطة', 'عالية'][parseInt(importance_level) - 1] || 'عادية'}`,
        message: message.trim(),
        notificationType: 'notification_created',
        appUrl: `${appUrl}/notify-branches`,
        data: {
          'الفروع المستهدفة': branchNames,
          'مستوى الأهمية': ['منخفضة', 'عادية', 'متوسطة', 'عالية'][parseInt(importance_level) - 1] || 'عادية',
          'تاريخ الانتهاء': expires_at ? new Date(expires_at).toLocaleDateString('ar-SA') : 'غير محدد',
        }
      });
    } catch (emailError) {
      console.error('Failed to send email notification:', emailError);
      // Don't fail the notification creation if email fails
    }

    res.status(201).json({
      success: true,
      message: 'تم إرسال الإشعار بنجاح',
      data: updatedNotification
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'فشل إنشاء الإشعار',
      error: process.env.NODE_ENV === 'development' ? error.message : 'حدث خطأ أثناء إنشاء الإشعار'
    });
  }
});

/**
 * GET /api/notifications
 * Get all notifications (Main Manager only)
 * Query params: importance_level, created_by
 */
router.get('/', requireMainManager, async (req, res) => {
  try {
    const filters = {
      importance_level: req.query.importance_level ? parseInt(req.query.importance_level) : undefined,
      created_by: req.query.created_by ? parseInt(req.query.created_by) : undefined,
      include_inactive: req.query.include_inactive === 'true'
    };

    const notifications = await Notification.findAll(filters);

    // Get response statistics for each notification
    const notificationsWithStats = await Promise.all(
      notifications.map(async (notification) => {
        const stats = await NotificationResponse.getStatistics(notification.id);
        return {
          ...notification,
          stats
        };
      })
    );

    res.json({
      success: true,
      data: notificationsWithStats
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب الإشعارات',
      error: error.message
    });
  }
});

/**
 * GET /api/notifications/:id
 * Get notification details with branches and responses (Main Manager only)
 */
router.get('/:id', requireMainManager, async (req, res) => {
  try {
    const notification = await Notification.findByIdWithDetails(parseInt(req.params.id));

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'الإشعار غير موجود'
      });
    }

    // Get response statistics
    const stats = await NotificationResponse.getStatistics(notification.id);

    res.json({
      success: true,
      data: {
        ...notification,
        stats
      }
    });
  } catch (error) {
    console.error('Error fetching notification:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب الإشعار',
      error: error.message
    });
  }
});

/**
 * GET /api/notifications/branch/:branchId
 * Get notifications for a specific branch (Branch Manager can access their own branch)
 */
router.get('/branch/:branchId', async (req, res) => {
  try {
    const branchId = parseInt(req.params.branchId);

    // Check access: branch managers can only access their own branch
    if (req.user.role === 'branch_manager' && req.user.branch_id !== branchId) {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بالوصول إلى هذا الفرع'
      });
    }

    const filters = {
      importance_level: req.query.importance_level ? parseInt(req.query.importance_level) : undefined,
      response_status: req.query.response_status
    };

    const notifications = await Notification.findByBranchId(branchId, filters, req.user.id);

    res.json({
      success: true,
      data: notifications
    });
  } catch (error) {
    console.error('Error fetching branch notifications:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب إشعارات الفرع',
      error: error.message
    });
  }
});

/**
 * GET /api/notifications/my-branch/notifications
 * Get notifications for current user's branch (convenience endpoint for branch managers)
 */
router.get('/my-branch/notifications', async (req, res) => {
  try {
    if (req.user.role !== 'branch_manager' || !req.user.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'هذا المسار متاح فقط لمديري الفروع'
      });
    }

    const filters = {
      importance_level: req.query.importance_level ? parseInt(req.query.importance_level) : undefined,
      response_status: req.query.response_status
    };

    const notifications = await Notification.findByBranchId(req.user.branch_id, filters, req.user.id);

    res.json({
      success: true,
      data: notifications
    });
  } catch (error) {
    console.error('Error fetching my branch notifications:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب الإشعارات',
      error: error.message
    });
  }
});

/**
 * POST /api/notifications/:id/respond
 * Respond to a notification (Branch Manager only)
 * Body: { response_status: 'done' | 'working_on_it' | 'seen', response_message?: string }
 */
router.post('/:id/respond', async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);
    const { response_status, response_message } = req.body;

    // Validation
    if (!response_status || !['done', 'working_on_it', 'seen'].includes(response_status)) {
      return res.status(400).json({
        success: false,
        message: 'حالة الرد يجب أن تكون: done، working_on_it، أو seen'
      });
    }

    // Check if user is branch manager
    if (req.user.role !== 'branch_manager' || !req.user.branch_id) {
      return res.status(403).json({
        success: false,
        message: 'فقط مديرو الفروع يمكنهم الرد على الإشعارات'
      });
    }

    // Check if notification exists and is assigned to this branch
    const notification = await Notification.findById(notificationId);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'الإشعار غير موجود'
      });
    }

    // Verify notification is assigned to this branch
    const sql = (await import('../config/database.js')).default;
    const [assignment] = await sql`
      SELECT * FROM notification_branches 
      WHERE notification_id = ${notificationId} AND branch_id = ${req.user.branch_id}
    `;

    if (!assignment) {
      return res.status(403).json({
        success: false,
        message: 'هذا الإشعار غير مخصص لفرعك'
      });
    }

    // Create or update response
    const response = await NotificationResponse.createOrUpdate(
      notificationId,
      req.user.branch_id,
      {
        response_status,
        response_message: response_message ? response_message.trim() : null
      }
    );

    // Send email notification to main manager about response
    try {
      const branch = await Branch.findById(req.user.branch_id);
      const branchName = branch ? branch.branch_name : 'غير محدد';

      // Map response status to Arabic
      const statusLabels = {
        'received': 'وصل',
        'acknowledged': 'تم التأكيد',
        'in_progress': 'قيد التنفيذ',
        'completed': 'مكتمل',
        'needs_clarification': 'يحتاج توضيح'
      };
      const statusLabel = statusLabels[response_status] || response_status;
      const mainManagerEmail = 'Sharaksa@gmail.com';

      console.log('Sending notification response email', {
        to: mainManagerEmail,
        branch: branchName,
        status: statusLabel
      });

      const emailResult = await sendNotificationEmail({
        to: mainManagerEmail,
        subject: `رد جديد من ${branchName}`,
        message: `تلقيت ردًا على الإشعار من ${branchName} بحالة: ${statusLabel}`,
        notificationType: 'notification_response',
        appUrl: `${process.env.REACT_APP_URL || 'https://hr-react-theta.vercel.app'}/notify-branches`,
        data: {
          'الفرع': branchName,
          'الحالة': statusLabel,
          'الملاحظات': response_message ? response_message.substring(0, 100) + (response_message.length > 100 ? '...' : '') : 'بدون ملاحظات'
        }
      });

      console.log('Notification response email result', { emailResult });
    } catch (emailError) {
      console.error('Error sending notification response email:', emailError);
      // Don't fail the response if email fails
    }

    res.json({
      success: true,
      message: 'تم حفظ الرد بنجاح',
      data: response
    });
  } catch (error) {
    console.error('Error responding to notification:', error);
    res.status(500).json({
      success: false,
      message: 'فشل حفظ الرد',
      error: error.message
    });
  }
});

/**
 * PUT /api/notifications/:id
 * Update notification (Main Manager only)
 */
router.put('/:id', requireMainManager, async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);
    const { message, importance_level } = req.body;

    const updates = {};
    if (message !== undefined) updates.message = message.trim();
    if (importance_level !== undefined) {
      if (![1, 2, 3, 4].includes(parseInt(importance_level))) {
        return res.status(400).json({
          success: false,
          message: 'مستوى الأهمية يجب أن يكون 1، 2، 3، أو 4'
        });
      }
      updates.importance_level = parseInt(importance_level);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'لا توجد حقول للتحديث'
      });
    }

    const notification = await Notification.update(notificationId, updates);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'الإشعار غير موجود'
      });
    }

    res.json({
      success: true,
      message: 'تم تحديث الإشعار بنجاح',
      data: notification
    });
  } catch (error) {
    console.error('Error updating notification:', error);
    res.status(500).json({
      success: false,
      message: 'فشل تحديث الإشعار',
      error: error.message
    });
  }
});

/**
 * DELETE /api/notifications/:id
 * Hard delete notification (permanently remove from database) (Main Manager only)
 */
router.delete('/:id', requireMainManager, async (req, res) => {
  try {
    // Fetch full notification to get attachment URLs before deleting
    const notification = await Notification.findById(parseInt(req.params.id));

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'الإشعار غير موجود'
      });
    }

    // Delete attachment files from storage
    if (notification.attachment_url) {
      try {
        const { deleteFromBlob } = await import('../utils/blobStorage.js');
        await deleteFromBlob(notification.attachment_url);
      } catch (e) { /* non-blocking */ }
    }
    if (notification.r2_attachment_url) {
      try {
        const { deleteFromR2Mirror } = await import('../utils/dualStorage.js');
        await deleteFromR2Mirror(notification.r2_attachment_url);
      } catch (e) { /* non-blocking */ }
    }

    await Notification.delete(parseInt(req.params.id));

    res.json({
      success: true,
      message: 'تم حذف الإشعار نهائياً من قاعدة البيانات',
      data: notification
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: 'فشل حذف الإشعار',
      error: error.message
    });
  }
});

/**
 * POST /api/notifications/:id/mark-viewed
 * Mark a one-time notification as seen by the current user's branch
 */
router.post('/:id/mark-viewed', async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);

    // Check if notification exists and is one-time
    const notification = await Notification.findById(notificationId);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'الإشعار غير موجود'
      });
    }

    if (!notification.one_time) {
      return res.status(400).json({
        success: false,
        message: 'هذا الإشعار ليس إشعارًا لمرة واحدة'
      });
    }

    // Get the user's branch ID
    const branchId = req.user.branch_id;
    if (!branchId) {
      return res.status(400).json({
        success: false,
        message: 'المستخدم غير مرتبط بفرع'
      });
    }

    // Verify the notification is assigned to this branch
    const sql = (await import('../config/database.js')).default;
    const [assignment] = await sql`
      SELECT * FROM notification_branches 
      WHERE notification_id = ${notificationId} AND branch_id = ${branchId}
    `;

    if (!assignment) {
      return res.status(403).json({
        success: false,
        message: 'هذا الإشعار غير مخصص لفرعك'
      });
    }

    // Mark the branch as having seen this notification
    const result = await Notification.markBranchAsSeen(notificationId, branchId);

    if (!result) {
      return res.status(500).json({
        success: false,
        message: 'فشل تمييز الإشعار كمقروء'
      });
    }

    res.json({
      success: true,
      message: 'تم تمييز الإشعار كمقروء',
      data: {
        seen_by_branches: result.seen_by_branches
      }
    });
  } catch (error) {
    console.error('Error marking notification as viewed:', error);
    res.status(500).json({
      success: false,
      message: 'فشل تمييز الإشعار كمقروء',
      error: error.message
    });
  }
});

/**
 * PATCH /api/notifications/:id/toggle-active
 * Toggle notification active status (activate/deactivate)
 * Main Manager only
 */
router.patch('/:id/toggle-active', requireMainManager, async (req, res) => {
  try {
    const notification = await Notification.toggleActive(parseInt(req.params.id));

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'الإشعار غير موجود'
      });
    }

    res.json({
      success: true,
      message: notification.is_active ? 'تم تفعيل الإشعار بنجاح' : 'تم إلغاء تفعيل الإشعار بنجاح',
      data: notification
    });
  } catch (error) {
    console.error('Error toggling notification active status:', error);
    res.status(500).json({
      success: false,
      message: 'فشل تحديث حالة الإشعار',
      error: error.message
    });
  }
});

export default router;

