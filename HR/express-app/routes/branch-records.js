/**
 * Branch records: the two lists a healthcare centre keeps next to its documents.
 *   /api/branch-achievements  thank-you certificates and accomplishments (name, description, optional file)
 *   /api/branch-partnerships  partners ("الشراكات"): government or private, service, optional contract file
 *
 * One router factory, two instances (see branch-achievements.js / branch-partnerships.js).
 *
 * Access (checked on EVERY route, including the ones addressed by record id):
 *   main_manager: all branches · branch_manager: own branch · branch_operations_manager: assigned branches
 * Writes are for healthcare centres only. Delete is a soft delete (the file stays, so a mistake is recoverable).
 * Files: optional; same storage, type, size and direct-to-R2 rules as branch documents.
 */
import express from 'express';
import sql from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import {
  uploadSingle,
  validateUploadedFile,
  acceptDirectUpload,
  buildDirectUploadKey,
  MAX_DIRECT_UPLOAD_BYTES,
  directFileTooLargeMessage,
} from '../middleware/upload.js';
import { validateDateFields } from '../middleware/dateValidation.js';
import { loadAssignedBranches } from '../middleware/authorization.js';
import { resolveBranchAccessFromScope } from '../utils/policyScope.js';
import { presignR2Put } from '../utils/r2Storage.js';
import { isValidMimeType } from '../utils/validators.js';
import { fixFilenameEncoding } from '../utils/fileUpload.js';
import { fileStore } from '../utils/branchRecordFiles.js';
import { recordAudit, actorFromReq } from '../services/auditService.js';
import { healAndRetry } from '../database/criticalSchema.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
import { log } from '../utils/logger.js';

const HEALTHCARE = 'healthcare_center';
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

const clean = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
};

const fail = (res, status, message) => res.status(status).json({ success: false, message });

const safeFilename = (name) => String(name || 'file').replace(/[\x00-\x1F\x7F-\x9F]/g, '').replace(/[\r\n]/g, '');

/** Escapes % _ \ so user text is matched literally by ILIKE. */
const likePattern = (text) => `%${String(text).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const FILE_COLUMNS = ['file_name', 'file_path', 'file_size', 'mime_type'];

/** Fields the client never sees (internal storage location). */
const publicRow = (row) => {
  if (!row) return row;
  const { file_path, ...rest } = row;
  return { ...rest, has_file: Boolean(file_path) };
};

/**
 * @param {object} spec
 *   kind        'achievements' | 'partnerships' (R2 folder and route label)
 *   table       table name (constant, never user input)
 *   entityType  audit_log entity type
 *   textFields  [{ name, max, required?, label }]
 *   dateFields  base names of the Gregorian/Hijri date pairs (`x` + `x_hijri`)
 *   enumFields  [{ name, values, required?, label }]
 *   searchFields text columns matched by ?search=
 *   orderBy     SQL fragment (constant)
 *   extraFilters(req) -> array of { column, value } taken from the query
 *   crossCheck(row) -> Arabic error message or null
 */
export function createBranchRecordRouter(spec) {
  const router = express.Router();
  const table = sql(spec.table);

  router.use(authenticate);
  router.use(loadAssignedBranches);

  const allowedBranch = (req, branchId) => resolveBranchAccessFromScope(req.scope, branchId).allowed;

  /** Branch ids the caller may see; null means all (main manager). */
  const visibleBranchIds = (req) => {
    if (req.user?.role === 'main_manager') return null;
    return req.scope?.branch?.allowedIds || [];
  };

  const loadRecord = (id) => healAndRetry(async () => {
    const [row] = await sql`
      SELECT r.*, b.branch_name, b.branch_type FROM ${table} r
      JOIN branches b ON b.id = r.branch_id
      WHERE r.id = ${id} AND r.is_active = true`;
    return row || null;
  });

  const parseId = (req) => {
    const id = parseInt(req.params.id, 10);
    return Number.isInteger(id) && id > 0 ? id : null;
  };

  /** Loads the record and checks the caller's access; sends the error response and returns null otherwise. */
  const recordForCaller = async (req, res) => {
    const id = parseId(req);
    if (!id) { fail(res, 400, 'معرف السجل غير صحيح'); return null; }
    const record = await loadRecord(id);
    if (!record) { fail(res, 404, 'السجل غير موجود'); return null; }
    if (!allowedBranch(req, record.branch_id)) { fail(res, 403, 'ليس لديك صلاحية على هذا الفرع'); return null; }
    return record;
  };

  const requireHealthcareBranch = async (res, branchId) => {
    const [branch] = await sql`SELECT id, branch_type, is_active FROM branches WHERE id = ${branchId}`;
    if (!branch) { fail(res, 404, 'الفرع غير موجود'); return null; }
    if (branch.branch_type !== HEALTHCARE) { fail(res, 400, 'هذا القسم متاح فقط لمراكز الرعاية الصحية'); return null; }
    return branch;
  };

  /**
   * Builds the row to store from the request body, merged over `existing` (for updates).
   * Returns { error } or { row }.
   */
  const buildRow = (body, existing = null) => {
    const row = {};
    for (const f of spec.textFields) {
      const value = body[f.name] !== undefined ? clean(body[f.name]) : (existing?.[f.name] ?? null);
      if (f.required && !value) return { error: `${f.label} مطلوب` };
      if (value && value.length > f.max) return { error: `${f.label} أطول من المسموح (${f.max} حرفاً)` };
      row[f.name] = value;
    }
    for (const f of spec.enumFields) {
      const value = body[f.name] !== undefined ? clean(body[f.name]) : (existing?.[f.name] ?? null);
      if (f.required && !value) return { error: `${f.label} مطلوب` };
      if (value && !f.values.includes(value)) return { error: `${f.label} غير صحيح` };
      row[f.name] = value;
    }
    for (const d of spec.dateFields) {
      const greg = body[d] !== undefined ? clean(body[d]) : (existing?.[d] ?? null);
      const hijri = body[`${d}_hijri`] !== undefined ? clean(body[`${d}_hijri`]) : (existing?.[`${d}_hijri`] ?? null);
      let gregText = greg instanceof Date ? greg.toISOString().slice(0, 10) : greg;
      if (gregText && !DATE_RE.test(gregText)) return { error: 'التاريخ غير صحيح' };
      gregText = gregText ? gregText.slice(0, 10) : null;
      // clearing one side of a pair clears the other too (never keep a lone stale calendar value)
      row[d] = gregText;
      row[`${d}_hijri`] = gregText ? hijri : (body[d] === '' || body[`${d}_hijri`] === '' ? null : hijri);
    }
    const crossError = spec.crossCheck?.(row);
    if (crossError) return { error: crossError };
    return { row };
  };

  const dateValidators = validateDateFields(Object.fromEntries(
    spec.dateFields.map((d) => [`${d}_hijri`, { calendarType: 'hijri', dateType: 'general', required: false }])
  ));

  const optionalFile = (req, res, next) => (req.file ? validateUploadedFile(req, res, next) : next());

  // ---- signed URL for files above the API limit ------------------------------------------------------------------
  router.post('/upload-url', async (req, res) => {
    try {
      const { file_name: fileName, content_type: contentType, size } = req.body || {};
      let branchId = parseInt(req.body?.branch_id, 10);
      if (req.body?.record_id) {
        const record = await loadRecord(parseInt(req.body.record_id, 10));
        if (!record) return fail(res, 404, 'السجل غير موجود');
        branchId = record.branch_id;
      }
      if (!branchId || !contentType) return fail(res, 400, 'معرف الفرع والملف مطلوبان');
      if (!isValidMimeType(contentType)) return fail(res, 400, 'نوع الملف غير مدعوم. يُسمح فقط بملفات PDF والصور.');
      if (Number(size) > MAX_DIRECT_UPLOAD_BYTES) return fail(res, 400, directFileTooLargeMessage());
      if (!allowedBranch(req, branchId)) return fail(res, 403, 'ليس لديك صلاحية على هذا الفرع');
      if (!(await requireHealthcareBranch(res, branchId))) return undefined;
      const key = buildDirectUploadKey(`branches/${branchId}/${spec.kind}/`, fileName);
      const uploadUrl = await presignR2Put(key, contentType);
      return res.json({ success: true, data: { upload_url: uploadUrl, key } });
    } catch (error) {
      log.error(`Error creating ${spec.kind} upload URL:`, error);
      return handleRouteError(error, req, res, 'فشل تجهيز رفع الملف');
    }
  });

  // ---- list --------------------------------------------------------------------------------------------------------
  router.get('/', async (req, res) => {
    try {
      const visible = visibleBranchIds(req);
      const requested = parseInt(req.query.branch_id, 10) || null;
      let branchIds = visible; // null = all
      if (requested) {
        if (!allowedBranch(req, requested)) return fail(res, 403, 'ليس لديك صلاحية على هذا الفرع');
        branchIds = [requested];
      }
      if (branchIds && branchIds.length === 0) return res.json({ success: true, data: [] });

      const conditions = [sql`r.is_active = true`];
      if (branchIds) conditions.push(sql`r.branch_id = ANY(${branchIds})`);
      for (const { column, value } of spec.extraFilters(req)) conditions.push(sql`r.${sql(column)} = ${value}`);
      const search = clean(req.query.search);
      if (search) {
        const pattern = likePattern(search);
        const likes = spec.searchFields.map((c) => sql`r.${sql(c)} ILIKE ${pattern}`);
        likes.push(sql`b.branch_name ILIKE ${pattern}`);
        conditions.push(sql`(${likes.reduce((a, c) => sql`${a} OR ${c}`)})`);
      }
      const where = conditions.reduce((a, c) => sql`${a} AND ${c}`);

      const rows = await healAndRetry(() => sql`
        SELECT r.*, b.branch_name, b.branch_type
        FROM ${table} r JOIN branches b ON b.id = r.branch_id
        WHERE ${where}
        ORDER BY ${spec.orderBy}`);
      return res.json({ success: true, data: rows.map(publicRow) });
    } catch (error) {
      log.error(`Error listing ${spec.kind}:`, error);
      return handleRouteError(error, req, res, 'فشل جلب السجلات');
    }
  });

  // ---- download ----------------------------------------------------------------------------------------------------
  router.get('/:id/download', async (req, res) => {
    try {
      const record = await recordForCaller(req, res);
      if (!record) return undefined;
      if (!record.file_path) return fail(res, 404, 'لا يوجد ملف مرفق');
      const directUrl = await fileStore.directUrl(record);
      if (directUrl) return res.json({ success: true, direct_url: directUrl });
      const { buffer, contentType } = await fileStore.read(record.file_path);
      res.setHeader('Content-Type', record.mime_type || contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename(record.file_name))}"`);
      return res.send(buffer);
    } catch (error) {
      log.error(`Error downloading ${spec.kind} file:`, error);
      return handleRouteError(error, req, res, 'فشل جلب الملف');
    }
  });

  // ---- one record --------------------------------------------------------------------------------------------------
  router.get('/:id', async (req, res) => {
    try {
      const record = await recordForCaller(req, res);
      if (!record) return undefined;
      return res.json({ success: true, data: publicRow(record) });
    } catch (error) {
      log.error(`Error fetching ${spec.kind} record:`, error);
      return handleRouteError(error, req, res, 'فشل جلب السجل');
    }
  });

  // ---- create ------------------------------------------------------------------------------------------------------
  router.post(
    '/',
    uploadSingle,
    acceptDirectUpload((req) => (parseInt(req.body?.branch_id, 10) ? `branches/${parseInt(req.body.branch_id, 10)}/${spec.kind}/` : null)),
    optionalFile,
    dateValidators,
    async (req, res) => {
      let storedUrl = null;
      try {
        const branchId = parseInt(req.body.branch_id, 10);
        if (!branchId) return fail(res, 400, 'معرف الفرع مطلوب');
        if (!allowedBranch(req, branchId)) return fail(res, 403, 'ليس لديك صلاحية على هذا الفرع');
        if (!(await requireHealthcareBranch(res, branchId))) return undefined;

        const built = buildRow(req.body);
        if (built.error) return fail(res, 400, built.error);
        const row = { ...built.row, branch_id: branchId, created_by_name: actorFromReq(req).name };

        if (req.file) {
          const fileName = fixFilenameEncoding(req.file.originalname);
          storedUrl = req.file.directKey
            ? req.file.url
            : (await fileStore.put(req.file.buffer, fileName, req.file.mimetype, branchId, spec.kind)).url;
          Object.assign(row, { file_name: fileName, file_path: storedUrl, file_size: req.file.size, mime_type: req.file.mimetype });
        }

        const cols = Object.keys(row);
        const [created] = await healAndRetry(() => sql`INSERT INTO ${table} ${sql(row, ...cols)} RETURNING *`);
        await recordAudit({
          entityType: spec.entityType, entityId: created.id, action: 'create', actor: actorFromReq(req), branchId,
          changes: { title: created[spec.auditLabelField] },
        });
        return res.status(201).json({ success: true, message: 'تمت الإضافة بنجاح', data: publicRow(created) });
      } catch (error) {
        if (storedUrl) await fileStore.remove(storedUrl);
        log.error(`Error creating ${spec.kind} record:`, error);
        return handleRouteError(error, req, res, 'فشل إضافة السجل');
      }
    }
  );

  // ---- update (fields, and optionally replace / remove the file) -------------------------------------------------------
  router.put(
    '/:id',
    uploadSingle,
    acceptDirectUpload(async (req) => {
      const id = parseId(req);
      const record = id ? await loadRecord(id) : null;
      return record ? `branches/${record.branch_id}/${spec.kind}/` : null;
    }),
    optionalFile,
    dateValidators,
    async (req, res) => {
      let storedUrl = null;
      try {
        const record = await recordForCaller(req, res);
        if (!record) {
          if (req.file?.directKey) await fileStore.remove(req.file.url);
          return undefined;
        }

        const built = buildRow(req.body, record);
        if (built.error) {
          if (req.file?.directKey) await fileStore.remove(req.file.url);
          return fail(res, 400, built.error);
        }
        const row = { ...built.row, updated_at: new Date() };

        const removeFile = String(req.body.remove_file) === 'true';
        if (req.file) {
          const fileName = fixFilenameEncoding(req.file.originalname);
          storedUrl = req.file.directKey
            ? req.file.url
            : (await fileStore.put(req.file.buffer, fileName, req.file.mimetype, record.branch_id, spec.kind)).url;
          Object.assign(row, { file_name: fileName, file_path: storedUrl, file_size: req.file.size, mime_type: req.file.mimetype });
        } else if (removeFile) {
          for (const c of FILE_COLUMNS) row[c] = null;
        }

        const cols = Object.keys(row);
        const [updated] = await healAndRetry(() => sql`UPDATE ${table} SET ${sql(row, ...cols)} WHERE id = ${record.id} AND is_active = true RETURNING *`);
        if (!updated) {
          if (storedUrl) await fileStore.remove(storedUrl);
          return fail(res, 404, 'السجل غير موجود');
        }
        if ((req.file || removeFile) && record.file_path) await fileStore.remove(record.file_path);

        await recordAudit({
          entityType: spec.entityType, entityId: record.id, action: 'update', actor: actorFromReq(req), branchId: record.branch_id,
          changes: { fields: spec.textFields.map((f) => f.name).filter((n) => (record[n] ?? null) !== (updated[n] ?? null)), file: req.file ? 'replaced' : removeFile ? 'removed' : 'kept' },
        });
        return res.json({ success: true, message: 'تم التحديث بنجاح', data: publicRow(updated) });
      } catch (error) {
        if (storedUrl) await fileStore.remove(storedUrl);
        log.error(`Error updating ${spec.kind} record:`, error);
        return handleRouteError(error, req, res, 'فشل تحديث السجل');
      }
    }
  );

  // ---- delete (soft) -----------------------------------------------------------------------------------------------
  router.delete('/:id', async (req, res) => {
    try {
      const record = await recordForCaller(req, res);
      if (!record) return undefined;
      await sql`UPDATE ${table} SET is_active = false, updated_at = NOW() WHERE id = ${record.id}`;
      await recordAudit({
        entityType: spec.entityType, entityId: record.id, action: 'delete', actor: actorFromReq(req), branchId: record.branch_id,
        changes: { title: record[spec.auditLabelField] },
      });
      return res.json({ success: true, message: 'تم الحذف' });
    } catch (error) {
      log.error(`Error deleting ${spec.kind} record:`, error);
      return handleRouteError(error, req, res, 'فشل حذف السجل');
    }
  });

  return router;
}
