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
import requestRoutes from './requests.js';
import alertRoutes from './alerts.js';

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
router.use('/requests', requestRoutes);
router.use('/alerts', alertRoutes);

export default router;

