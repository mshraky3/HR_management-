/**
 * Main Routes Index
 * Combines all route modules
 */

import express from 'express';
import sql from '../config/database.js';
import { schemaState } from '../database/criticalSchema.js';
import authRoutes from './auth.js';
import userRoutes from './users.js';
import branchRoutes from './branches.js';
import notificationRoutes from './notifications.js';
import termRoutes from './terms.js';
import academicYearRoutes from './academic-years.js';
import dashboardRoutes from './dashboard.js';
import requestRoutes from './requests.js';
import utilsRoutes from './utils.js';
import suggestionsRoutes from './suggestions.js';
import errorReportRoutes from './error-report.js';

const router = express.Router();

// Load a route module the first time its path is requested instead of at cold
// start. Several of these pull in exceljs, pdf-lib and the AWS SDK (together
// ~900 ms of CPU to load), and Vercel bills that CPU on every cold start even
// when the request is for something else. Once loaded, a module is reused.
const lazy = (load) => {
  let handler;
  return async (req, res, next) => {
    try {
      handler ??= (await load()).default;
      return handler(req, res, next);
    } catch (err) {
      return next(err);
    }
  };
};

// Health check
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'HRM API is running' });
});

// Schema self-report (no secrets): are the columns the code needs present, and what is the newest recorded migration.
router.get('/health/schema', async (req, res) => {
  try {
    const state = schemaState();
    const [latest] = await sql`SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1`.catch(() => []);
    res.json({
      success: true,
      critical: state.errorCode ? 'error' : 'ok',
      checkedAt: state.checkedAt,
      repaired: state.applied,
      errorCode: state.errorCode,
      latestMigration: latest?.name || null,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'schema report failed' });
  }
});

// Mount route modules
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/branches', branchRoutes);
router.use('/employees', lazy(() => import('./employees.js')));
router.use('/documents', lazy(() => import('./documents.js')));
router.use('/branch-documents', lazy(() => import('./branch-documents.js')));
router.use('/reports', lazy(() => import('./reports.js')));
router.use('/employee-file', lazy(() => import('./employee-file.js')));
router.use('/notifications', notificationRoutes);
router.use('/terms', termRoutes);
router.use('/academic-years', academicYearRoutes);
router.use('/archive', lazy(() => import('./archive.js')));
router.use('/branch-statistics', lazy(() => import('./branch-statistics.js')));
router.use('/dashboard', dashboardRoutes);
router.use('/admin', lazy(() => import('./admin.js')));
router.use('/requests', requestRoutes);
router.use('/utils', utilsRoutes);
router.use('/payroll-absences', lazy(() => import('./payroll-absences.js')));
router.use('/bus-transportation', lazy(() => import('./bus-transportation.js')));
router.use('/bus-transportation-report', lazy(() => import('./bus-transportation-report.js')));
router.use('/students-report', lazy(() => import('./students-report.js')));
router.use('/suggestions', suggestionsRoutes);
router.use('/beneficiaries', lazy(() => import('./beneficiaries.js')));
router.use('/error-report', errorReportRoutes);
router.use('/employee-expiry', lazy(() => import('./employee-expiry.js')));
router.use('/tasks', lazy(() => import('./tasks.js')));
router.use('/employee-import', lazy(() => import('./employee-import.js')));
router.use('/year-cycle', lazy(() => import('./year-cycle.js')));

export default router;

