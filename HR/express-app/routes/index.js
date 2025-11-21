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

export default router;

