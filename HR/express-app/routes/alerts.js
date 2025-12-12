/**
 * Alerts Routes
 * Smart Alerts System - Manage alerts for ID expiry, missing documents, incomplete data, etc.
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { checkBranchAccess } from '../middleware/authorization.js';
import { Alert } from '../models/Alert.js';
import { AlertSettings } from '../models/AlertSettings.js';
import { runAlertGeneration, getSchedulerStatus, startScheduler, stopScheduler } from '../utils/alertScheduler.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/alerts
 * Get all alerts (filtered by role)
 */
router.get('/', async (req, res) => {
  try {
    const filters = {};

    // Branch managers only see their branch alerts
    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      filters.branch_id = req.user.branch_id;
    }

    // Apply query filters
    if (req.query.alert_type) {
      filters.alert_type = req.query.alert_type;
    }

    if (req.query.priority) {
      filters.priority = req.query.priority;
    }

    if (req.query.is_read !== undefined) {
      filters.is_read = req.query.is_read === 'true';
    }

    if (req.query.is_resolved !== undefined) {
      filters.is_resolved = req.query.is_resolved === 'true';
    }

    if (req.query.employee_id) {
      filters.employee_id = parseInt(req.query.employee_id);
    }

    const alerts = await Alert.findAll(filters);

    res.json({
      success: true,
      data: alerts
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب التنبيهات',
      error: error.message
    });
  }
});

/**
 * GET /api/alerts/unread-count
 * Get count of unread alerts
 */
router.get('/unread-count', async (req, res) => {
  try {
    const filters = {};

    // Branch managers only see their branch alerts
    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      filters.branch_id = req.user.branch_id;
    }

    const count = await Alert.getUnreadCount(filters);

    res.json({
      success: true,
      count: count
    });
  } catch (error) {
    console.error('Error fetching unread alerts count:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب عدد التنبيهات غير المقروءة',
      error: error.message
    });
  }
});

/**
 * GET /api/alerts/:id
 * Get alert by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const alert = await Alert.findById(parseInt(req.params.id));

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'التنبيه غير موجود'
      });
    }

    // Check access: branch managers can only see their branch alerts
    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      if (alert.branch_id !== req.user.branch_id) {
        return res.status(403).json({
          success: false,
          message: 'ليس لديك صلاحية لعرض هذا التنبيه'
        });
      }
    }

    res.json({
      success: true,
      data: alert
    });
  } catch (error) {
    console.error('Error fetching alert:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب التنبيه',
      error: error.message
    });
  }
});

/**
 * POST /api/alerts
 * Create new alert (Main Manager only, or system-generated)
 */
router.post('/', async (req, res) => {
  try {
    const {
      alert_type,
      priority = 'medium',
      title,
      message,
      branch_id,
      employee_id,
      related_entity_type,
      related_entity_id,
      alert_data,
      expires_at
    } = req.body;

    // Validation
    if (!alert_type || !title || !message) {
      return res.status(400).json({
        success: false,
        message: 'نوع التنبيه والعنوان والرسالة مطلوبة'
      });
    }

    // Branch managers can only create alerts for their branch
    if (req.user.role === 'branch_manager') {
      if (!req.user.branch_id) {
        return res.status(403).json({
          success: false,
          message: 'ليس لديك صلاحية لإنشاء تنبيهات'
        });
      }
      // Override branch_id to user's branch
      if (branch_id && branch_id !== req.user.branch_id) {
        return res.status(403).json({
          success: false,
          message: 'لا يمكنك إنشاء تنبيهات لفرع آخر'
        });
      }
      req.body.branch_id = req.user.branch_id;
    }

    // Validate branch access if branch_id is provided
    if (branch_id) {
      const hasAccess = await checkBranchAccess(req.user, branch_id);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'ليس لديك صلاحية للوصول إلى هذا الفرع'
        });
      }
    }

    const alert = await Alert.create(req.body);

    res.status(201).json({
      success: true,
      data: alert,
      message: 'تم إنشاء التنبيه بنجاح'
    });
  } catch (error) {
    console.error('Error creating alert:', error);
    res.status(500).json({
      success: false,
      message: 'فشل إنشاء التنبيه',
      error: error.message
    });
  }
});

/**
 * PUT /api/alerts/:id
 * Update alert
 */
router.put('/:id', async (req, res) => {
  try {
    const alert = await Alert.findById(parseInt(req.params.id));

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'التنبيه غير موجود'
      });
    }

    // Check access: branch managers can only update their branch alerts
    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      if (alert.branch_id !== req.user.branch_id) {
        return res.status(403).json({
          success: false,
          message: 'ليس لديك صلاحية لتعديل هذا التنبيه'
        });
      }
    }

    // If resolving, set resolved_by
    if (req.body.is_resolved === true && !req.body.resolved_by) {
      req.body.resolved_by = req.user.id;
    }

    const updatedAlert = await Alert.update(parseInt(req.params.id), req.body);

    res.json({
      success: true,
      data: updatedAlert,
      message: 'تم تحديث التنبيه بنجاح'
    });
  } catch (error) {
    console.error('Error updating alert:', error);
    res.status(500).json({
      success: false,
      message: 'فشل تحديث التنبيه',
      error: error.message
    });
  }
});

/**
 * PATCH /api/alerts/:id/read
 * Mark alert as read
 */
router.patch('/:id/read', async (req, res) => {
  try {
    const alert = await Alert.findById(parseInt(req.params.id));

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'التنبيه غير موجود'
      });
    }

    // Check access
    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      if (alert.branch_id !== req.user.branch_id) {
        return res.status(403).json({
          success: false,
          message: 'ليس لديك صلاحية لعرض هذا التنبيه'
        });
      }
    }

    const updatedAlert = await Alert.markAsRead(parseInt(req.params.id));

    res.json({
      success: true,
      data: updatedAlert,
      message: 'تم تمييز التنبيه كمقروء'
    });
  } catch (error) {
    console.error('Error marking alert as read:', error);
    res.status(500).json({
      success: false,
      message: 'فشل تمييز التنبيه كمقروء',
      error: error.message
    });
  }
});

/**
 * PATCH /api/alerts/:id/resolve
 * Mark alert as resolved
 */
router.patch('/:id/resolve', async (req, res) => {
  try {
    const alert = await Alert.findById(parseInt(req.params.id));

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'التنبيه غير موجود'
      });
    }

    // Check access
    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      if (alert.branch_id !== req.user.branch_id) {
        return res.status(403).json({
          success: false,
          message: 'ليس لديك صلاحية لحل هذا التنبيه'
        });
      }
    }

    const updatedAlert = await Alert.markAsResolved(parseInt(req.params.id), req.user.id);

    res.json({
      success: true,
      data: updatedAlert,
      message: 'تم حل التنبيه بنجاح'
    });
  } catch (error) {
    console.error('Error resolving alert:', error);
    res.status(500).json({
      success: false,
      message: 'فشل حل التنبيه',
      error: error.message
    });
  }
});

/**
 * POST /api/alerts/mark-read
 * Mark multiple alerts as read
 */
router.post('/mark-read', async (req, res) => {
  try {
    const { alert_ids } = req.body;

    if (!Array.isArray(alert_ids) || alert_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'مصفوفة معرفات التنبيهات مطلوبة'
      });
    }

    // Verify all alerts belong to user's branch if branch manager
    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      const alerts = await Alert.findAll({});
      const userAlerts = alerts.filter(a => 
        alert_ids.includes(a.id) && a.branch_id === req.user.branch_id
      );
      
      if (userAlerts.length !== alert_ids.length) {
        return res.status(403).json({
          success: false,
          message: 'بعض التنبيهات لا يمكنك الوصول إليها'
        });
      }
    }

    const updatedAlerts = await Alert.markMultipleAsRead(alert_ids);

    res.json({
      success: true,
      data: updatedAlerts,
      count: updatedAlerts.length,
      message: `تم تمييز ${updatedAlerts.length} تنبيه كمقروء`
    });
  } catch (error) {
    console.error('Error marking alerts as read:', error);
    res.status(500).json({
      success: false,
      message: 'فشل تمييز التنبيهات كمقروءة',
      error: error.message
    });
  }
});

/**
 * DELETE /api/alerts/:id
 * Delete alert (Main Manager only)
 */
router.delete('/:id', async (req, res) => {
  try {
    const alert = await Alert.findById(parseInt(req.params.id));

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'التنبيه غير موجود'
      });
    }

    // Only main managers can delete alerts
    if (req.user.role !== 'main_manager') {
      return res.status(403).json({
        success: false,
        message: 'فقط المدير الرئيسي يمكنه حذف التنبيهات'
      });
    }

    await Alert.delete(parseInt(req.params.id));

    res.json({
      success: true,
      message: 'تم حذف التنبيه بنجاح'
    });
  } catch (error) {
    console.error('Error deleting alert:', error);
    res.status(500).json({
      success: false,
      message: 'فشل حذف التنبيه',
      error: error.message
    });
  }
});

// ========== Alert Settings Routes ==========

/**
 * GET /api/alerts/settings
 * Get alert settings for current user
 */
router.get('/settings', async (req, res) => {
  try {
    const settings = await AlertSettings.getOrCreateDefault(req.user.id);

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error fetching alert settings:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب إعدادات التنبيهات',
      error: error.message
    });
  }
});

/**
 * POST /api/alerts/generate
 * Manually trigger alert generation (Main Manager only)
 */
router.post('/generate', async (req, res) => {
  try {
    // Only main managers can manually trigger alert generation
    if (req.user.role !== 'main_manager') {
      return res.status(403).json({
        success: false,
        message: 'فقط المدير الرئيسي يمكنه تفعيل توليد التنبيهات يدوياً'
      });
    }

    const results = await runAlertGeneration();

    res.json({
      success: true,
      message: 'تم توليد التنبيهات بنجاح',
      data: results
    });
  } catch (error) {
    console.error('Error generating alerts:', error);
    res.status(500).json({
      success: false,
      message: 'فشل توليد التنبيهات',
      error: error.message
    });
  }
});

/**
 * GET /api/alerts/scheduler/status
 * Get scheduler status (Main Manager only)
 */
router.get('/scheduler/status', async (req, res) => {
  try {
    if (req.user.role !== 'main_manager') {
      return res.status(403).json({
        success: false,
        message: 'فقط المدير الرئيسي يمكنه عرض حالة المخطط'
      });
    }

    const status = getSchedulerStatus();

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Error getting scheduler status:', error);
    res.status(500).json({
      success: false,
      message: 'فشل جلب حالة المخطط',
      error: error.message
    });
  }
});

/**
 * PUT /api/alerts/settings
 * Update alert settings for current user
 */
router.put('/settings', async (req, res) => {
  try {
    const updates = {};
    const allowedFields = [
      'id_expiry_enabled', 'id_expiry_days_before',
      'missing_document_enabled', 'incomplete_data_enabled',
      'email_notifications_enabled', 'sms_notifications_enabled'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'لا توجد حقول صالحة للتحديث'
      });
    }

    // Ensure settings exist
    await AlertSettings.getOrCreateDefault(req.user.id);

    const updatedSettings = await AlertSettings.update(req.user.id, updates);

    res.json({
      success: true,
      data: updatedSettings,
      message: 'تم تحديث إعدادات التنبيهات بنجاح'
    });
  } catch (error) {
    console.error('Error updating alert settings:', error);
    res.status(500).json({
      success: false,
      message: 'فشل تحديث إعدادات التنبيهات',
      error: error.message
    });
  }
});

export default router;
