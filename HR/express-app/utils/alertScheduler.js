/**
 * Alert Scheduler
 * Runs alert generation tasks on a schedule
 */

import { generateAllAlerts } from './alertGenerators.js';
import { Alert } from '../models/Alert.js';

let schedulerInterval = null;
let isRunning = false;

/**
 * Start the alert scheduler
 * @param {number} intervalMinutes - Interval in minutes (default: 1440 = 24 hours)
 */
export function startScheduler(intervalMinutes = 1440) {
  if (schedulerInterval) {
    console.log('Alert scheduler is already running');
    return;
  }

  console.log(`Starting alert scheduler (runs every ${intervalMinutes} minutes)`);
  
  // Run immediately on start
  runAlertGeneration();

  // Schedule periodic runs
  schedulerInterval = setInterval(() => {
    runAlertGeneration();
  }, intervalMinutes * 60 * 1000);

  isRunning = true;
}

/**
 * Stop the alert scheduler
 */
export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    isRunning = false;
    console.log('Alert scheduler stopped');
  }
}

/**
 * Run alert generation once
 */
export async function runAlertGeneration() {
  if (isRunning) {
    console.log('Alert generation is already running, skipping...');
    return;
  }

  try {
    isRunning = true;
    console.log('Running alert generation...');
    
    const results = await generateAllAlerts();
    
    // Clean up expired alerts
    await Alert.deleteExpired();
    
    console.log('Alert generation completed successfully');
    return results;
  } catch (error) {
    console.error('Error in alert generation:', error);
    throw error;
  } finally {
    isRunning = false;
  }
}

/**
 * Check if scheduler is running
 */
export function isSchedulerRunning() {
  return isRunning && schedulerInterval !== null;
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus() {
  return {
    isRunning: isSchedulerRunning(),
    intervalMinutes: schedulerInterval ? (schedulerInterval._idleTimeout / 60000) : null
  };
}

