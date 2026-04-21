/**
 * Main Routes Index
 * Combines all route modules
 */

import express from 'express';
import authRoutes from './auth.js';
import userRoutes from './users.js';
import branchRoutes from './branches.js';
import employeeRoutes from './employees.js';
import documentRoutes from './documents.js';
import branchDocumentRoutes from './branch-documents.js';
import reportRoutes from './reports.js';
import employeeFileRoutes from './employee-file.js';
import notificationRoutes from './notifications.js';
import termRoutes from './terms.js';
import academicYearRoutes from './academic-years.js';
import archiveRoutes from './archive.js';
import branchStatisticsRoutes from './branch-statistics.js';
import dashboardRoutes from './dashboard.js';
import adminRoutes from './admin.js';
import requestRoutes from './requests.js';
import utilsRoutes from './utils.js';
import payrollAbsenceRoutes from './payroll-absences.js';
import busTransportationRoutes from './bus-transportation.js';
import busTransportationReportRoutes from './bus-transportation-report.js';
import studentsReportRoutes from './students-report.js';
import suggestionsRoutes from './suggestions.js';
import errorReportRoutes from './error-report.js';
import beneficiariesRoutes from './beneficiaries.js';
import blobRecoveryRoutes from './blob-recovery.js';
import treatmentPlansRoutes from './treatment-plans.js';
import employeeExpiryRoutes from './employee-expiry.js';

const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'HRM API is running' });
});

// Mount route modules
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/branches', branchRoutes);
router.use('/employees', employeeRoutes);
router.use('/documents', documentRoutes);
router.use('/branch-documents', branchDocumentRoutes);
router.use('/reports', reportRoutes);
router.use('/employee-file', employeeFileRoutes);
router.use('/notifications', notificationRoutes);
router.use('/terms', termRoutes);
router.use('/academic-years', academicYearRoutes);
router.use('/archive', archiveRoutes);
router.use('/branch-statistics', branchStatisticsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/admin', adminRoutes);
router.use('/requests', requestRoutes);
router.use('/utils', utilsRoutes);
router.use('/payroll-absences', payrollAbsenceRoutes);
router.use('/bus-transportation', busTransportationRoutes);
router.use('/bus-transportation-report', busTransportationReportRoutes);
router.use('/students-report', studentsReportRoutes);
router.use('/suggestions', suggestionsRoutes);
router.use('/beneficiaries', beneficiariesRoutes);
router.use('/error-report', errorReportRoutes);
router.use('/blob-recovery', blobRecoveryRoutes);
router.use('/treatment-plans', treatmentPlansRoutes);
router.use('/employee-expiry', employeeExpiryRoutes);

export default router;

