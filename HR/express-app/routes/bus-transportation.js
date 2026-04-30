/**
 * Bus Transportation Routes
 * CRUD operations for bus transportation system
 */

import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { requireAnyManager, checkBranchAccess, loadAssignedBranches } from '../middleware/authorization.js';
import { validateRequired } from '../middleware/validation.js';
import { BusTransportation } from '../models/BusTransportation.js';
import { BusRegistrationData } from '../models/BusRegistrationData.js';
import { DriverLicenseData } from '../models/DriverLicenseData.js';
import { LicensePlateData } from '../models/LicensePlateData.js';
import { BusDetails } from '../models/BusDetails.js';
import { BusStudent } from '../models/BusStudent.js';
import { Branch } from '../models/Branch.js';
import { uploadBusRegistrationDocument, uploadDriverLicenseDocument, uploadBusLeaseContractDocument, deleteFromBlob } from '../utils/blobStorage.js';
import { log } from '../utils/logger.js';
import { getScopedBranchFilter, getScopedTermFilter } from '../utils/policyScope.js';
import { printer as pdfPrinter } from '../utils/pdfFonts.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';

const router = express.Router();

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// All routes require authentication and manager role
router.use(authenticate);
router.use(requireAnyManager);
router.use(loadAssignedBranches);

/**
 * GET /api/bus-transportation
 * List all buses (filtered by branch for branch managers, filtered by term)
 */
router.get('/', async (req, res) => {
  try {
    const filters = {
      bus_number: req.query.bus_number,
      route_name: req.query.route_name,
      driver_name: req.query.driver_name,
      plate_number: req.query.plate_number
    };

    // Filter by term_id if provided
    const scopedTermId = getScopedTermFilter(req);
    if (scopedTermId) {
      filters.term_id = scopedTermId;
    }

    // Branch managers only see their own branch's buses
    const scopedBranchId = getScopedBranchFilter(req, { allowMultiple: false });
    if (scopedBranchId) {
      filters.branch_id = scopedBranchId;
    }

    // Branch operations managers only see their assigned branches
    if (req.user.role === 'branch_operations_manager' && req.user.assigned_branches) {
      if (filters.branch_id) {
        if (!req.user.assigned_branches.includes(filters.branch_id)) {
          return res.json({ success: true, data: [] });
        }
      } else {
        // If no branch_id filter, return all buses for assigned branches in parallel
        const results = await Promise.all(
          req.user.assigned_branches.map(branchId =>
            BusTransportation.findAll({ ...filters, branch_id: branchId })
          )
        );
        const allBuses = results.flat().filter(Boolean);
        return res.json({ success: true, data: allBuses });
      }
    }

    // Filter by branch_type if provided (to get relevant terms)
    if (req.query.branch_type) {
      filters.branch_type = req.query.branch_type;
    }

    const buses = await BusTransportation.findAll(filters);
    res.json({ success: true, data: buses });
  } catch (error) {
    log.error('Error listing buses', { error: error.message });
    handleRouteError(error, req, res, 'فشل جلب بيانات الحافلات');
  }
});

/**
 * GET /api/bus-transportation/:id
 * Get single bus with all related data
 */
router.get('/:id', checkBranchAccess, async (req, res) => {
  try {
    const busId = parseInt(req.params.id);
    const bus = await BusTransportation.findById(busId);

    if (!bus) {
      return res.status(404).json({
        success: false,
        message: 'الحافلة غير موجودة'
      });
    }

    // Check branch access for branch managers
    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      if (parseInt(bus.branch_id) !== parseInt(req.user.branch_id)) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول. يمكنك فقط الوصول إلى بيانات فرعك.'
        });
      }
    }

    res.json({ success: true, data: bus });
  } catch (error) {
    log.error('Error getting bus', { error: error.message });
    handleRouteError(error, req, res, 'فشل جلب بيانات الحافلة');
  }
});

/**
 * POST /api/bus-transportation
 * Create new bus
 */
router.post('/', validateRequired(['branch_id', 'bus_number', 'term_id']), async (req, res) => {
  try {
    const { branch_id, bus_number, term_id } = req.body;

    // Branch managers can only create buses for their own branch
    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      if (parseInt(branch_id) !== req.user.branch_id) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول. يمكنك فقط إنشاء حافلات لفرعك.'
        });
      }
    }

    // Validate term exists and is active
    const { Term } = await import('../models/Term.js');
    const term = await Term.findById(parseInt(term_id));
    if (!term) {
      return res.status(400).json({
        success: false,
        message: 'الفصل الدراسي غير موجود'
      });
    }

    if (!term.is_active) {
      return res.status(400).json({
        success: false,
        message: 'الفصل الدراسي غير نشط'
      });
    }

    // Validate term matches branch type
    const branch = await Branch.findById(parseInt(branch_id));
    if (branch && branch.branch_type !== term.branch_type) {
      return res.status(400).json({
        success: false,
        message: 'نوع الفرع لا يطابق نوع الفصل الدراسي'
      });
    }

    const bus = await BusTransportation.create({
      branch_id: parseInt(branch_id),
      term_id: parseInt(term_id),
      bus_number,
      created_by: req.user.existsInDb ? req.user.id : null
    });

    res.status(201).json({ success: true, data: bus });
  } catch (error) {
    log.error('Error creating bus', { error: error.message });

    // Handle unique constraint violation
    if (error.message && error.message.includes('unique')) {
      return res.status(400).json({
        success: false,
        message: 'رقم الحافلة موجود بالفعل لهذا الفرع في هذا الفصل الدراسي'
      });
    }

    handleRouteError(error, req, res, 'فشل إنشاء الحافلة');
  }
});

/**
 * PUT /api/bus-transportation/:id
 * Update bus basic information
 */
router.put('/:id', checkBranchAccess, async (req, res) => {
  try {
    const busId = parseInt(req.params.id);

    // Verify bus exists and user has access
    const bus = await BusTransportation.findById(busId);
    if (!bus) {
      return res.status(404).json({
        success: false,
        message: 'الحافلة غير موجودة'
      });
    }

    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      if (parseInt(bus.branch_id) !== parseInt(req.user.branch_id)) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول. يمكنك فقط تعديل حافلات فرعك.'
        });
      }
    }

    // Validate term_id if being updated
    if (req.body.term_id && parseInt(req.body.term_id) !== bus.term_id) { // policy-scope:allow-direct: body term_id is entity-update validation, not scope bypass
      const { Term } = await import('../models/Term.js');
      const term = await Term.findById(parseInt(req.body.term_id)); // policy-scope:allow-direct
      if (!term) {
        return res.status(400).json({
          success: false,
          message: 'الفصل الدراسي غير موجود'
        });
      }

      if (!term.is_active) {
        return res.status(400).json({
          success: false,
          message: 'الفصل الدراسي غير نشط'
        });
      }

      // Validate term matches branch type
      const branch = await Branch.findById(bus.branch_id);
      if (branch && branch.branch_type !== term.branch_type) {
        return res.status(400).json({
          success: false,
          message: 'نوع الفرع لا يطابق نوع الفصل الدراسي'
        });
      }
    }

    const updated = await BusTransportation.update(busId, {
      ...req.body,
      updated_by: req.user.existsInDb ? req.user.id : null
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    log.error('Error updating bus', { error: error.message });

    // Handle unique constraint violation
    if (error.message && error.message.includes('unique')) {
      return res.status(400).json({
        success: false,
        message: 'رقم الحافلة موجود بالفعل لهذا الفرع في هذا الفصل الدراسي'
      });
    }

    handleRouteError(error, req, res, 'فشل تحديث الحافلة');
  }
});

/**
 * DELETE /api/bus-transportation/:id
 * Delete bus (hard delete - buses are term-specific)
 * Note: checkBranchAccess removed - branch access is checked inside the route
 */
router.delete('/:id', async (req, res) => {
  try {
    const busId = parseInt(req.params.id);

    // Verify bus exists and user has access
    const bus = await BusTransportation.findById(busId);
    if (!bus) {
      return res.status(404).json({
        success: false,
        message: 'الحافلة غير موجودة'
      });
    }

    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      if (parseInt(bus.branch_id) !== parseInt(req.user.branch_id)) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول. يمكنك فقط حذف حافلات فرعك.'
        });
      }
    }

    // Gather document URLs before deletion (cascade will remove related records)
    const regData = await BusRegistrationData.findByBusId(busId).catch(() => null);
    const licData = await DriverLicenseData.findByBusId(busId).catch(() => null);
    const filesToDelete = [
      bus.lease_contract_document_url,
      regData?.registration_document_url,
      licData?.license_document_url,
    ].filter(Boolean);
    const r2FilesToDelete = [
      bus.r2_lease_contract_document_url,
      regData?.r2_registration_document_url,
      licData?.r2_license_document_url,
    ].filter(Boolean);

    const deleted = await BusTransportation.delete(busId);

    // Clean up document files from storage
    for (const url of filesToDelete) {
      try { await deleteFromBlob(url); } catch { /* non-blocking */ }
    }
    for (const r2Url of r2FilesToDelete) {
      try {
        const { deleteFromR2Mirror } = await import('../utils/dualStorage.js');
        await deleteFromR2Mirror(r2Url);
      } catch { /* non-blocking */ }
    }

    res.json({ success: true, message: 'تم حذف الحافلة بنجاح', data: deleted });
  } catch (error) {
    log.error('Error deleting bus', { error: error.message });
    handleRouteError(error, req, res, 'فشل حذف الحافلة');
  }
});

/**
 * POST /api/bus-transportation/:id/registration
 * Create or update bus registration data
 */
router.post('/:id/registration', checkBranchAccess, validateRequired([
  'registration_number',
  'chassis_number',
  'vehicle_model',
  'expiry_date_gregorian'
]), async (req, res) => {
  try {
    const busId = parseInt(req.params.id);

    // Verify bus exists and user has access
    const bus = await BusTransportation.findById(busId);
    if (!bus) {
      return res.status(404).json({
        success: false,
        message: 'الحافلة غير موجودة'
      });
    }

    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      if (parseInt(bus.branch_id) !== parseInt(req.user.branch_id)) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول.'
        });
      }
    }

    const registration = await BusRegistrationData.upsert(busId, req.body);
    res.json({ success: true, data: registration });
  } catch (error) {
    log.error('Error saving bus registration', { error: error.message });

    // Handle duplicate registration number
    if (error.code === '23505' || (error.message && error.message.includes('bus_registration_data_registration_number_key'))) {
      return res.status(409).json({
        success: false,
        message: 'رقم تسجيل الحافلة مستخدم بالفعل',
        error: 'duplicate_registration_number'
      });
    }

    handleRouteError(error, req, res, 'فشل حفظ بيانات تسجيل الحافلة');
  }
});

/**
 * POST /api/bus-transportation/:id/registration/upload
 * Upload bus registration document
 */
router.post('/:id/registration/upload', checkBranchAccess, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'لم يتم رفع الملف'
      });
    }

    const busId = parseInt(req.params.id);

    // Verify bus exists and user has access
    const bus = await BusTransportation.findById(busId);
    if (!bus) {
      return res.status(404).json({
        success: false,
        message: 'الحافلة غير موجودة'
      });
    }

    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      if (parseInt(bus.branch_id) !== parseInt(req.user.branch_id)) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول.'
        });
      }
    }

    // Upload to blob storage
    const { url: blobUrl, r2Url } = await uploadBusRegistrationDocument(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      busId
    );

    // Update registration data with document URL
    const existing = await BusRegistrationData.findByBusId(busId);
    if (existing) {
      // Delete old files if re-uploading
      if (existing.registration_document_url) {
        try { await deleteFromBlob(existing.registration_document_url); } catch { /* non-blocking */ }
      }
      if (existing.r2_registration_document_url) {
        try {
          const { deleteFromR2Mirror } = await import('../utils/dualStorage.js');
          await deleteFromR2Mirror(existing.r2_registration_document_url);
        } catch { /* non-blocking */ }
      }
      await BusRegistrationData.upsert(busId, {
        ...existing,
        registration_document_url: blobUrl,
        registration_document_name: req.file.originalname,
        registration_document_mime_type: req.file.mimetype,
        r2_registration_document_url: r2Url || null
      });
    } else {
      // Don't auto-create incomplete records via upload
      return res.status(400).json({
        success: false,
        message: 'يرجى حفظ بيانات رخصة السير أولاً قبل رفع المستند'
      });
    }

    res.json({
      success: true,
      data: {
        url: blobUrl,
        name: req.file.originalname,
        mime_type: req.file.mimetype
      }
    });
  } catch (error) {
    log.error('Error uploading bus registration document', { error: error.message });
    handleRouteError(error, req, res, 'فشل رفع مستند تسجيل الحافلة');
  }
});

/**
 * POST /api/bus-transportation/:id/driver-license
 * Create or update driver license data
 */
router.post('/:id/driver-license', checkBranchAccess, validateRequired([
  'driver_full_name',
  'driver_id_number',
  'license_number',
  'expiry_date_gregorian'
]), async (req, res) => {
  try {
    const busId = parseInt(req.params.id);

    // Verify bus exists and user has access
    const bus = await BusTransportation.findById(busId);
    if (!bus) {
      return res.status(404).json({
        success: false,
        message: 'الحافلة غير موجودة'
      });
    }

    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      if (parseInt(bus.branch_id) !== parseInt(req.user.branch_id)) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول.'
        });
      }
    }

    // Conditional validation: assistant driver fields
    const hasAssistant =
      req.body?.has_assistant === true ||
      req.body?.has_assistant === 'true' ||
      req.body?.has_assistant === 1 ||
      req.body?.has_assistant === '1';

    if (hasAssistant) {
      if (!req.body?.assistant_full_name || String(req.body.assistant_full_name).trim() === '') {
        return res.status(400).json({ success: false, message: 'يرجى إدخال اسم مرافق السائق' });
      }
      if (!req.body?.assistant_phone_number || String(req.body.assistant_phone_number).trim() === '') {
        return res.status(400).json({ success: false, message: 'يرجى إدخال رقم جوال مرافق السائق' });
      }
    }

    const license = await DriverLicenseData.upsert(busId, req.body);
    res.json({ success: true, data: license });
  } catch (error) {
    log.error('Error saving driver license', { error: error.message });
    handleRouteError(error, req, res, 'فشل حفظ بيانات رخصة السائق');
  }
});

/**
 * POST /api/bus-transportation/:id/driver-license/upload
 * Upload driver license document
 */
router.post('/:id/driver-license/upload', checkBranchAccess, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'لم يتم رفع الملف'
      });
    }

    const busId = parseInt(req.params.id);

    // Verify bus exists and user has access
    const bus = await BusTransportation.findById(busId);
    if (!bus) {
      return res.status(404).json({
        success: false,
        message: 'الحافلة غير موجودة'
      });
    }

    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      if (parseInt(bus.branch_id) !== parseInt(req.user.branch_id)) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول.'
        });
      }
    }

    // Upload to blob storage
    const { url: blobUrl, r2Url } = await uploadDriverLicenseDocument(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      busId
    );

    // Update license data with document URL
    const existing = await DriverLicenseData.findByBusId(busId);
    if (existing) {
      // Delete old files if re-uploading
      if (existing.license_document_url) {
        try { await deleteFromBlob(existing.license_document_url); } catch { /* non-blocking */ }
      }
      if (existing.r2_license_document_url) {
        try {
          const { deleteFromR2Mirror } = await import('../utils/dualStorage.js');
          await deleteFromR2Mirror(existing.r2_license_document_url);
        } catch { /* non-blocking */ }
      }
      await DriverLicenseData.upsert(busId, {
        ...existing,
        license_document_url: blobUrl,
        license_document_name: req.file.originalname,
        license_document_mime_type: req.file.mimetype,
        r2_license_document_url: r2Url || null
      });
    } else {
      // Don't auto-create incomplete records via upload
      return res.status(400).json({
        success: false,
        message: 'يرجى حفظ بيانات رخصة السائق أولاً قبل رفع المستند'
      });
    }

    res.json({
      success: true,
      data: {
        url: blobUrl,
        name: req.file.originalname,
        mime_type: req.file.mimetype
      }
    });
  } catch (error) {
    log.error('Error uploading driver license document', { error: error.message });
    handleRouteError(error, req, res, 'فشل رفع مستند رخصة السائق');
  }
});

/**
 * POST /api/bus-transportation/:id/lease-contract/upload
 * Upload lease contract document (for leased buses)
 */
router.post('/:id/lease-contract/upload', checkBranchAccess, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'لم يتم رفع الملف'
      });
    }

    const busId = parseInt(req.params.id);

    // Verify bus exists and user has access
    const bus = await BusTransportation.findById(busId);
    if (!bus) {
      return res.status(404).json({
        success: false,
        message: 'الحافلة غير موجودة'
      });
    }

    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      if (parseInt(bus.branch_id) !== parseInt(req.user.branch_id)) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول.'
        });
      }
    }

    // Upload to blob storage
    const { url: blobUrl, r2Url } = await uploadBusLeaseContractDocument(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      busId
    );

    // Delete old files if re-uploading
    if (bus.lease_contract_document_url) {
      try { await deleteFromBlob(bus.lease_contract_document_url); } catch { /* non-blocking */ }
    }
    if (bus.r2_lease_contract_document_url) {
      try {
        const { deleteFromR2Mirror } = await import('../utils/dualStorage.js');
        await deleteFromR2Mirror(bus.r2_lease_contract_document_url);
      } catch { /* non-blocking */ }
    }

    // Store document info on the bus_transportation record
    await BusTransportation.update(busId, {
      lease_contract_document_url: blobUrl,
      lease_contract_document_name: req.file.originalname,
      lease_contract_document_mime_type: req.file.mimetype,
      r2_lease_contract_document_url: r2Url || null,
      updated_by: req.user.existsInDb ? req.user.id : null
    });

    res.json({
      success: true,
      data: {
        url: blobUrl,
        name: req.file.originalname,
        mime_type: req.file.mimetype
      }
    });
  } catch (error) {
    log.error('Error uploading lease contract document', { error: error.message });
    handleRouteError(error, req, res, 'فشل رفع عقد التأجير');
  }
});

/**
 * POST /api/bus-transportation/:id/license-plates
 * Add license plate to bus
 */
router.post('/:id/license-plates', checkBranchAccess, validateRequired(['plate_number']), async (req, res) => {
  try {
    const busId = parseInt(req.params.id);

    // Verify bus exists and user has access
    const bus = await BusTransportation.findById(busId);
    if (!bus) {
      return res.status(404).json({
        success: false,
        message: 'الحافلة غير موجودة'
      });
    }

    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      if (parseInt(bus.branch_id) !== parseInt(req.user.branch_id)) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول.'
        });
      }
    }

    const plate = await LicensePlateData.create({
      bus_id: busId,
      ...req.body
    });

    res.status(201).json({ success: true, data: plate });
  } catch (error) {
    log.error('Error creating license plate', { error: error.message });

    if (error.message && error.message.includes('unique')) {
      return res.status(400).json({
        success: false,
        message: 'رقم اللوحة موجود بالفعل لهذه الحافلة'
      });
    }

    handleRouteError(error, req, res, 'فشل إضافة لوحة الترخيص');
  }
});

/**
 * PUT /api/bus-transportation/:id/license-plates/:plateId
 * Update license plate
 */
router.put('/:id/license-plates/:plateId', checkBranchAccess, async (req, res) => {
  try {
    const plateId = parseInt(req.params.plateId);
    const updated = await LicensePlateData.update(plateId, req.body);

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'لوحة الترخيص غير موجودة'
      });
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    log.error('Error updating license plate', { error: error.message });
    handleRouteError(error, req, res, 'فشل تحديث لوحة الترخيص');
  }
});

/**
 * DELETE /api/bus-transportation/:id/license-plates/:plateId
 * Delete license plate
 */
router.delete('/:id/license-plates/:plateId', checkBranchAccess, async (req, res) => {
  try {
    const plateId = parseInt(req.params.plateId);
    const deleted = await LicensePlateData.delete(plateId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'لوحة الترخيص غير موجودة'
      });
    }

    res.json({ success: true, message: 'تم حذف لوحة الترخيص بنجاح', data: deleted });
  } catch (error) {
    log.error('Error deleting license plate', { error: error.message });
    handleRouteError(error, req, res, 'فشل حذف لوحة الترخيص');
  }
});

/**
 * POST /api/bus-transportation/:id/details
 * Create or update bus details
 */
router.post('/:id/details', checkBranchAccess, validateRequired(['number_of_seats', 'ownership_type']), async (req, res) => {
  try {
    const busId = parseInt(req.params.id);

    // Verify bus exists and user has access
    const bus = await BusTransportation.findById(busId);
    if (!bus) {
      return res.status(404).json({
        success: false,
        message: 'الحافلة غير موجودة'
      });
    }

    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      if (parseInt(bus.branch_id) !== parseInt(req.user.branch_id)) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول.'
        });
      }
    }

    const details = await BusDetails.upsert(busId, req.body);
    res.json({ success: true, data: details });
  } catch (error) {
    log.error('Error saving bus details', { error: error.message });
    handleRouteError(error, req, res, 'فشل حفظ تفاصيل الحافلة');
  }
});

/**
 * GET /api/bus-transportation/:id/students
 * Get all students for a bus
 */
router.get('/:id/students', checkBranchAccess, async (req, res) => {
  try {
    const busId = parseInt(req.params.id);

    // Verify bus exists and user has access
    const bus = await BusTransportation.findById(busId);
    if (!bus) {
      return res.status(404).json({
        success: false,
        message: 'الحافلة غير موجودة'
      });
    }

    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      if (parseInt(bus.branch_id) !== parseInt(req.user.branch_id)) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول.'
        });
      }
    }

    const filters = {};
    const scopedTermId = getScopedTermFilter(req);
    if (scopedTermId) {
      filters.term_id = scopedTermId;
    } else {
      // Default to bus's term_id
      filters.term_id = bus.term_id;
    }

    const students = await BusStudent.findByBusId(busId, filters);

    res.json({ success: true, data: students });
  } catch (error) {
    log.error('Error getting bus students', { error: error.message });
    handleRouteError(error, req, res, 'فشل جلب بيانات الطلاب');
  }
});

/**
 * POST /api/bus-transportation/:id/students
 * Add student to bus
 */
// Notes (address) are optional in UI; keep term_id required due to DB constraint
router.post('/:id/students', checkBranchAccess, validateRequired(['student_full_name', 'contact_mobile_number', 'term_id']), async (req, res) => {
  try {
    const busId = parseInt(req.params.id);
    const { student_full_name, contact_mobile_number, term_id } = req.body;

    // Verify bus exists and user has access
    const bus = await BusTransportation.findById(busId);
    if (!bus) {
      return res.status(404).json({
        success: false,
        message: 'الحافلة غير موجودة'
      });
    }

    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      if (parseInt(bus.branch_id) !== parseInt(req.user.branch_id)) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول.'
        });
      }
    }

    // Check if student already exists in another bus in the same branch/term
    const duplicateStudent = await BusStudent.findDuplicateInOtherBus(
      student_full_name,
      contact_mobile_number,
      bus.branch_id,
      term_id,
      busId // exclude current bus
    );

    if (duplicateStudent) {
      const busIdentifier = duplicateStudent.primary_plate || duplicateStudent.bus_number || `رقم ${duplicateStudent.bus_id}`;
      return res.status(400).json({
        success: false,
        message: `هذا الطالب مسجل بالفعل في حافلة أخرى (${busIdentifier}). لا يمكن تسجيل نفس الطالب في أكثر من حافلة.`
      });
    }

    // Check phone number limit (max 2 students per phone number in same branch/term)
    const phoneCount = await BusStudent.countByPhoneNumber(
      contact_mobile_number,
      bus.branch_id,
      term_id
    );

    if (phoneCount >= 2) {
      return res.status(400).json({
        success: false,
        message: 'رقم الجوال مسجل بالفعل لطالبين. الحد الأقصى هو طالبين لكل رقم جوال.'
      });
    }

    const student = await BusStudent.create({
      ...req.body,
      bus_id: busId,
      created_by: req.user.existsInDb ? req.user.id : null
    });

    res.status(201).json({ success: true, data: student });
  } catch (error) {
    log.error('Error creating bus student', { error: error.message });

    if (error.message && error.message.includes('unique')) {
      return res.status(400).json({
        success: false,
        message: 'رقم الجوال موجود بالفعل لهذه الحافلة'
      });
    }

    handleRouteError(error, req, res, 'فشل إضافة الطالب');
  }
});

/**
 * PUT /api/bus-transportation/:id/students/:studentId
 * Update student
 */
router.put('/:id/students/:studentId', checkBranchAccess, async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { contact_mobile_number, term_id } = req.body;

    // Verify student exists and belongs to the bus
    const student = await BusStudent.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'الطالب غير موجود'
      });
    }

    // Verify bus access
    const bus = await BusTransportation.findById(student.bus_id);
    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      if (parseInt(bus.branch_id) !== parseInt(req.user.branch_id)) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول.'
        });
      }
    }

    // Get the values to check (use new values if provided, otherwise use existing)
    const nameToCheck = req.body.student_full_name || student.student_full_name;
    const phoneToCheck = contact_mobile_number || student.contact_mobile_number;
    const termToCheck = term_id || student.term_id;

    // Check if this update would create a duplicate in another bus
    const duplicateStudent = await BusStudent.findDuplicateInOtherBus(
      nameToCheck,
      phoneToCheck,
      bus.branch_id,
      termToCheck,
      student.bus_id, // exclude current bus
      studentId // exclude current student
    );

    if (duplicateStudent) {
      const busIdentifier = duplicateStudent.primary_plate || duplicateStudent.bus_number || `رقم ${duplicateStudent.bus_id}`;
      return res.status(400).json({
        success: false,
        message: `هذا الطالب مسجل بالفعل في حافلة أخرى (${busIdentifier}). لا يمكن تسجيل نفس الطالب في أكثر من حافلة.`
      });
    }

    // Check phone number limit if phone is being changed (max 2 students per phone number)
    if (contact_mobile_number && contact_mobile_number !== student.contact_mobile_number) {
      const phoneCount = await BusStudent.countByPhoneNumber(
        contact_mobile_number,
        bus.branch_id,
        termToCheck,
        studentId // Exclude current student from count
      );

      if (phoneCount >= 2) {
        return res.status(400).json({
          success: false,
          message: 'رقم الجوال مسجل بالفعل لطالبين. الحد الأقصى هو طالبين لكل رقم جوال.'
        });
      }
    }

    const updated = await BusStudent.update(studentId, {
      ...req.body,
      updated_by: req.user.existsInDb ? req.user.id : null
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    log.error('Error updating bus student', { error: error.message });
    handleRouteError(error, req, res, 'فشل تحديث بيانات الطالب');
  }
});

/**
 * DELETE /api/bus-transportation/:id/students/:studentId
 * Delete student (hard delete - students are term-specific)
 */
router.delete('/:id/students/:studentId', checkBranchAccess, async (req, res) => {
  try {
    const studentId = parseInt(req.params.studentId);

    // Verify student exists and belongs to the bus
    const student = await BusStudent.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'الطالب غير موجود'
      });
    }

    // Verify bus access
    const bus = await BusTransportation.findById(student.bus_id);
    if (req.user.role === 'branch_manager' && req.user.branch_id) {
      if (parseInt(bus.branch_id) !== parseInt(req.user.branch_id)) {
        return res.status(403).json({
          success: false,
          message: 'تم رفض الوصول.'
        });
      }
    }

    const deleted = await BusStudent.delete(studentId);
    res.json({ success: true, message: 'تم حذف الطالب بنجاح', data: deleted });
  } catch (error) {
    log.error('Error deleting bus student', { error: error.message });
    handleRouteError(error, req, res, 'فشل حذف الطالب');
  }
});

/**
 * POST /api/bus-transportation/generate-pdf
 * Generate PDF report for bus transportation
 */
router.post('/generate-pdf', authenticate, async (req, res) => {
  try {
    const { branchId, sections } = req.body;

    if (!branchId) {
      return res.status(400).json({ error: 'branchId is required' });
    }

    // Fetch branch data
    const branch = await Branch.findById(branchId);
    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    // Fetch bus data for branch
    const buses = await BusTransportation.findAll({ branch_id: branchId });
    const busIds = buses.map(b => b.id);
    const busStudents = await BusStudent.findByBusIds(busIds);

    // Get current date
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const dateStr = `${day}/${month}/${year}`;

    const docContent = [];

    // Title
    docContent.push({
      text: 'تقرير النقل بالحافلات',
      style: 'title',
    });

    docContent.push({
      text: `التاريخ: ${dateStr}`,
      style: 'subtitle',
      margin: [0, 0, 0, 10],
    });

    docContent.push({
      text: `الفرع: ${branch.branch_name}`,
      style: 'subtitle',
      margin: [0, 0, 0, 20],
    });

    // Summary Section
    if (sections?.summary) {
      docContent.push({
        text: 'الملخص العام',
        style: 'heading',
      });

      const summary = [
        { label: 'عدد الحافلات', value: buses.length },
        { label: 'إجمالي الطلاب المسجلين', value: busStudents.length },
        { label: 'الحافلات النشطة', value: buses.filter(b => b.status === 'active').length },
        { label: 'الحافلات المتوقفة', value: buses.filter(b => b.status === 'inactive').length },
      ];

      docContent.push({
        columns: summary.map((item, idx) => ({
          stack: [
            { text: item.label, style: 'cardLabel' },
            { text: item.value, style: 'cardValue' }
          ],
          width: idx % 2 === 0 ? '48%' : '48%'
        })),
        margin: [0, 0, 0, 20]
      });
    }

    // Bus Details Section
    if (sections?.busDetails && buses.length > 0) {
      docContent.push({
        text: 'تفاصيل الحافلات',
        style: 'heading',
      });

      const busDetailsRows = buses.map(bus => [
        { text: bus.bus_number || '-', fontSize: 10 },
        { text: bus.license_plate || '-', fontSize: 10 },
        { text: bus.capacity || '-', fontSize: 10 },
        { text: bus.status || '-', fontSize: 10 },
      ]);

      docContent.push({
        table: {
          headerRows: 1,
          widths: ['25%', '25%', '25%', '25%'],
          body: [
            [
              { text: 'رقم الحافلة', bold: true, alignment: 'center' },
              { text: 'لوحة الترخيص', bold: true, alignment: 'center' },
              { text: 'السعة', bold: true, alignment: 'center' },
              { text: 'الحالة', bold: true, alignment: 'center' },
            ],
            ...busDetailsRows,
          ],
        },
        margin: [0, 0, 0, 20]
      });
    }

    // Drivers Section
    if (sections?.drivers) {
      docContent.push({
        text: 'بيانات السائقين',
        style: 'heading',
      });

      const drivers = buses.filter(b => b.driver_id).map(b => [
        { text: b.driver_name || '-', fontSize: 10 },
        { text: b.license_number || '-', fontSize: 10 },
      ]);

      if (drivers.length > 0) {
        docContent.push({
          table: {
            headerRows: 1,
            widths: ['50%', '50%'],
            body: [
              [
                { text: 'اسم السائق', bold: true, alignment: 'center' },
                { text: 'رقم الرخصة', bold: true, alignment: 'center' },
              ],
              ...drivers,
            ],
          },
          margin: [0, 0, 0, 20]
        });
      } else {
        docContent.push({
          text: 'لا توجد بيانات سائقين',
          margin: [0, 0, 0, 20]
        });
      }
    }

    // Students Section
    if (sections?.students && busStudents.length > 0) {
      docContent.push({
        text: 'الطلاب المسجلين',
        style: 'heading',
      });

      const studentsByBus = {};
      busStudents.forEach(student => {
        if (!studentsByBus[student.bus_id]) {
          studentsByBus[student.bus_id] = [];
        }
        studentsByBus[student.bus_id].push(student);
      });

      Object.keys(studentsByBus).forEach(busId => {
        const bus = buses.find(b => b.id === parseInt(busId));
        const students = studentsByBus[busId];
        docContent.push({
          text: `حافلة ${bus?.bus_number || busId} (${students.length} طالب)`,
          style: 'subheading',
          margin: [0, 10, 0, 5]
        });
      });

      docContent.push({
        text: `إجمالي الطلاب المسجلين: ${busStudents.length}`,
        margin: [0, 0, 0, 20]
      });
    }

    // Financial Section
    if (sections?.financials) {
      docContent.push({
        text: 'البيانات المالية',
        style: 'heading',
      });

      const financialInfo = [
        { label: 'إجمالي الحافلات', value: buses.length },
        { label: 'عدد الطلاب', value: busStudents.length },
        { label: 'رسوم الطالب الشهرية (افتراضية)', value: 'حسب السياسة' },
        { label: 'الحافلات النشطة', value: buses.filter(b => b.status === 'active').length },
      ];

      docContent.push({
        columns: financialInfo.map((item, idx) => ({
          stack: [
            { text: item.label, style: 'cardLabel' },
            { text: item.value, style: 'cardValue' }
          ],
          width: idx % 2 === 0 ? '48%' : '48%'
        })),
        margin: [0, 0, 0, 20]
      });
    }

    // Routes Section (placeholder - to be enhanced)
    if (sections?.routes) {
      docContent.push({
        text: 'المسارات والمحطات',
        style: 'heading',
      });

      docContent.push({
        text: 'معلومات المسارات ستظهر هنا',
        margin: [0, 0, 0, 20]
      });
    }

    // PDF Definition
    const docDefinition = {
      content: docContent,
      styles: {
        title: {
          fontSize: 24,
          bold: true,
          alignment: 'center',
          margin: [0, 0, 0, 10],
          color: '#1e293b',
          font: 'Amiri',
        },
        subtitle: {
          fontSize: 12,
          alignment: 'center',
          color: '#64748b',
          font: 'Amiri',
        },
        heading: {
          fontSize: 16,
          bold: true,
          margin: [0, 15, 0, 10],
          color: '#2c3e50',
          font: 'Amiri',
          border: [false, false, false, true],
          borderColor: '#667eea',
          borderWidth: 2,
          paddingBottom: 8,
        },
        subheading: {
          fontSize: 12,
          bold: true,
          color: '#2c3e50',
          font: 'Amiri',
        },
        cardLabel: {
          fontSize: 10,
          color: '#64748b',
          font: 'Roboto',
          margin: [0, 0, 5, 0],
        },
        cardValue: {
          fontSize: 18,
          bold: true,
          color: '#667eea',
          font: 'Roboto',
        },
      },
      defaultStyle: {
        font: 'Roboto',
        fontSize: 11,
        color: '#1e293b',
      },
    };

    // Generate PDF
    const pdfDoc = pdfPrinter.createPdfKitDocument(docDefinition);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="bus-transportation-${branchId}-${dateStr.replace(/\//g, '-')}.pdf"`);

    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (error) {
    log.error('Error generating bus transportation PDF:', error);
    handleRouteError(error, req, res, 'حدث خطأ في الخادم');
  }
});

export default router;
