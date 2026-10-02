/**
 * Employee import routes (head office and branch managers)
 *   GET  /api/employee-import/template               Excel template (Arabic headers + instructions)
 *   POST /api/employee-import/preview  (multipart)   validate the file, write nothing
 *   POST /api/employee-import/commit   (json)        create the valid rows
 * A branch manager always imports into their own branch; the head office names the branch.
 */

import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { requireManager } from '../middleware/authorization.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
import { actorFromReq } from '../services/auditService.js';
import { buildTemplate, parseWorkbook, previewRows, commitRows, MAX_IMPORT_ROWS } from '../services/employeeImportService.js';
import sql from '../config/database.js';

const router = express.Router();
router.use(authenticate);
router.use(requireManager);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function resolveBranch(req) {
  const id = req.user.role === 'branch_manager' ? Number(req.user.branch_id) : parseInt(req.body?.branch_id ?? req.query?.branch_id, 10);
  if (!Number.isInteger(id)) return { error: 'اختر الفرع' };
  const [branch] = await sql`SELECT id, branch_name, is_active FROM branches WHERE id = ${id}`;
  if (!branch || branch.is_active === false) return { error: 'الفرع غير موجود أو غير مفعل' };
  return { branch };
}

router.get('/template', async (req, res) => {
  try {
    const buffer = await buildTemplate();
    res.set('Content-Type', XLSX_MIME);
    res.set('Content-Disposition', `attachment; filename="employees-template.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    handleRouteError(error, req, res, 'فشل إنشاء القالب');
  }
});

router.post('/preview', upload.single('file'), async (req, res) => {
  try {
    const { branch, error } = await resolveBranch(req);
    if (error) return res.status(400).json({ success: false, message: error });
    if (!req.file) return res.status(400).json({ success: false, message: 'ارفع ملف Excel (.xlsx)' });

    let rows;
    try {
      rows = await parseWorkbook(req.file.buffer);
    } catch (err) {
      if (err.code === 'MISSING_COLUMNS' || err.code === 'TOO_MANY_ROWS') {
        return res.status(400).json({ success: false, message: err.message });
      }
      return res.status(400).json({ success: false, message: 'تعذّرت قراءة الملف. تأكد أنه ملف Excel بصيغة xlsx ومبني على القالب.' });
    }
    if (rows.length === 0) return res.status(400).json({ success: false, message: 'الملف لا يحتوي على موظفين' });

    const results = await previewRows(rows);
    res.json({
      success: true,
      data: {
        branch: { id: branch.id, name: branch.branch_name },
        max_rows: MAX_IMPORT_ROWS,
        counts: {
          total: results.length,
          ok: results.filter((r) => r.status === 'ok').length,
          error: results.filter((r) => r.status === 'error').length,
          duplicate: results.filter((r) => r.status === 'duplicate').length,
        },
        rows: results,
      },
    });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل فحص الملف');
  }
});

router.post('/commit', async (req, res) => {
  try {
    const { branch, error } = await resolveBranch(req);
    if (error) return res.status(400).json({ success: false, message: error });
    const rows = req.body?.rows;
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({ success: false, message: 'لا توجد صفوف للاستيراد' });
    }
    // The client sends back the raw cell values of the accepted rows; they are validated again here.
    const rawRows = rows.map((r) => (r && typeof r === 'object' ? r : {}));
    const userId = req.user.existsInDb ? req.user.id : null;
    const result = await commitRows({ branchId: branch.id, rawRows, actor: actorFromReq(req), userId });
    res.json({ success: true, data: result });
  } catch (error) {
    handleRouteError(error, req, res, 'فشل استيراد الموظفين');
  }
});

export default router;
