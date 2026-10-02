/**
 * Employee access middleware.
 *
 * Every route that names one employee (`/:id/...`) goes through loadEmployee, which
 *   - rejects roles that have no business with individual employees (operations managers),
 *   - loads the employee and every branch it is linked to (primary + secondary links),
 *   - lets a branch manager through only when their branch is one of those,
 *   - attaches req.employee / req.employeeBranchIds for the handler.
 *
 * Before this each handler had its own check, and several had none: operations managers
 * and any role other than branch_manager were let through unchecked.
 */

import sql from '../config/database.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';

/** Roles allowed to work with a single employee record. */
export const EMPLOYEE_ROLES = ['main_manager', 'branch_manager'];

export const denyOperationsManager = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  if (!EMPLOYEE_ROLES.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'تم رفض الوصول' });
  }
  next();
};

/**
 * @param {object} [opts]
 * @param {boolean} [opts.primaryOnly] branch managers must own the employee's PRIMARY branch
 *   (use for destructive/status changes); otherwise any linked branch is enough (read, edit).
 */
export const loadEmployee = (opts = {}) => async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!EMPLOYEE_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'تم رفض الوصول' });
    }

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'معرّف الموظف غير صالح' });
    }

    const [employee] = await sql`SELECT * FROM employees WHERE id = ${id}`;
    if (!employee) {
      return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
    }

    const links = await sql`SELECT branch_id FROM employee_branches WHERE employee_id = ${id}`;
    const branchIds = new Set(links.map((l) => l.branch_id));
    if (employee.branch_id) branchIds.add(employee.branch_id);

    if (req.user.role === 'branch_manager') {
      const own = Number(req.user.branch_id);
      const allowed = opts.primaryOnly ? employee.branch_id === own : branchIds.has(own);
      if (!allowed) {
        return res.status(403).json({ success: false, message: 'تم رفض الوصول' });
      }
    }

    req.employee = employee;
    req.employeeBranchIds = [...branchIds];
    next();
  } catch (error) {
    handleRouteError(error, req, res, 'فشل التحقق من صلاحية الوصول للموظف');
  }
};
