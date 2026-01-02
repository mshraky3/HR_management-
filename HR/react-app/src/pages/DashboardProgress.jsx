/**
 * Dashboard Progress Component
 * Displays overall progress for branch managers with loading state
 */

import { useState, useEffect } from 'react';
import { calculateDataCompletion } from '../utils/dataCompletionUtils';

const DashboardProgress = ({ employees, documents, branch }) => {
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressData, setProgressData] = useState({
    employeesCompletion: 0,
    branchDocumentsCompletion: 0,
    alertsResolved: 0,
    overallProgress: 0
  });

  // Calculate overall progress for branch manager
  const calculateProgress = async (employees, documents, branch) => {
    const calcStartTime = performance.now();
    console.log('[DashboardProgress] ========== calculateProgress STARTED ==========');
    console.log('[DashboardProgress] Branch:', branch?.id, branch?.branch_name);
    console.log('[DashboardProgress] Employees count:', employees?.length || 0);
    console.log('[DashboardProgress] Documents count:', documents?.length || 0);
    
    if (!branch) {
      console.log('[DashboardProgress] No branch provided, aborting calculation');
      return;
    }
    
    setProgressLoading(true);
    try {
      // Use unified calculation utility
      console.log('[DashboardProgress] Calculating progress using unified utility...');
      const completionData = calculateDataCompletion(employees, documents, branch);
      
      console.log('[DashboardProgress] Employees completion:', completionData.employeesCompletion + '%');
      console.log('[DashboardProgress] Documents completion:', completionData.branchDocumentsCompletion + '%');
      console.log('[DashboardProgress] Overall progress:', completionData.overallProgress + '%');
      
      const progressDataResult = {
        employeesCompletion: completionData.employeesCompletion,
        branchDocumentsCompletion: completionData.branchDocumentsCompletion,
        alertsResolved: 0, // Not used anymore
        overallProgress: completionData.overallProgress
      };
      console.log('[DashboardProgress] Setting progress data:', progressDataResult);
      setProgressData(progressDataResult);
      
      const calcEndTime = performance.now();
      console.log('[DashboardProgress] ========== calculateProgress COMPLETED ==========');
      console.log('[DashboardProgress] Calculation time:', (calcEndTime - calcStartTime).toFixed(2), 'ms');
    } catch (error) {
      const calcEndTime = performance.now();
      console.error('[DashboardProgress] ========== calculateProgress ERROR ==========');
      console.error('[DashboardProgress] Error calculating progress:', error);
      console.error('[DashboardProgress] Error after', (calcEndTime - calcStartTime).toFixed(2), 'ms');
      console.error('[DashboardProgress] Error details:', {
        message: error.message,
        stack: error.stack
      });
    } finally {
      setProgressLoading(false);
      console.log('[DashboardProgress] Progress loading set to false');
    }
  };

  // Calculate progress when data changes (run in parallel, non-blocking)
  useEffect(() => {
    console.log('[DashboardProgress] useEffect triggered');
    console.log('[DashboardProgress] Branch:', branch?.id, 'Employees:', employees?.length, 'Documents:', documents?.length);
    if (branch && employees && Array.isArray(employees) && documents && Array.isArray(documents)) {
      console.log('[DashboardProgress] All data available, calling calculateProgress...');
      // Run calculation in parallel without blocking
      calculateProgress(employees, documents, branch);
    } else {
      console.log('[DashboardProgress] Missing data, skipping calculation');
      console.log('[DashboardProgress] Branch exists:', !!branch);
      console.log('[DashboardProgress] Employees is array:', Array.isArray(employees));
      console.log('[DashboardProgress] Documents is array:', Array.isArray(documents));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch?.id, employees?.length, documents?.length]);

  // Get progress color class based on percentage
  const getProgressColorClass = (percentage) => {
    if (percentage >= 90) return 'excellent';
    if (percentage >= 70) return 'good';
    if (percentage >= 50) return 'moderate';
    if (percentage >= 30) return 'low';
    return 'critical';
  };

  return (
    <div className="dashboard-progress-section">
      <h2 className="dashboard-section-title">
        <img 
          src="https://img.icons8.com/material-rounded/24/combo-chart.png" 
          alt="إحصائيات" 
          className="section-icon" 
          style={{ width: '24px', height: '24px' }} 
        />
        التقدم الإجمالي
      </h2>
      <div className="progress-card">
        {progressLoading ? (
          <div style={{ 
            padding: '40px', 
            textAlign: 'center', 
            color: '#666',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '15px'
          }}>
            <div 
              className="loading-spinner" 
              style={{
                width: '40px',
                height: '40px',
                border: '4px solid #f3f3f3',
                borderTop: '4px solid var(--primary)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}
            ></div>
            <span>جاري حساب التقدم...</span>
          </div>
        ) : (
          <>
            <div className="progress-overall">
              <div className="progress-header">
                <span className="progress-label">التقدم الإجمالي</span>
                <span className="progress-percentage">{progressData.overallProgress}%</span>
              </div>
              <div className="progress-bar-container">
                <div 
                  className={`progress-bar progress-${getProgressColorClass(progressData.overallProgress)}`}
                  style={{ width: `${progressData.overallProgress}%` }}
                >
                  <div className="progress-bar-fill"></div>
                </div>
              </div>
            </div>
            
            <div className="progress-details">
              <div className="progress-item">
                <div className="progress-item-header">
                  <span className="progress-item-label">اكتمال بيانات الموظفين</span>
                  <span className="progress-item-value">{progressData.employeesCompletion}%</span>
                </div>
                <div className="progress-bar-container small">
                  <div 
                    className={`progress-bar progress-${getProgressColorClass(progressData.employeesCompletion)}`}
                    style={{ width: `${progressData.employeesCompletion}%` }}
                  >
                    <div className="progress-bar-fill"></div>
                  </div>
                </div>
              </div>
              
              <div className="progress-item">
                <div className="progress-item-header">
                  <span className="progress-item-label">اكتمال مستندات الفرع</span>
                  <span className="progress-item-value">{progressData.branchDocumentsCompletion}%</span>
                </div>
                <div className="progress-bar-container small">
                  <div 
                    className={`progress-bar progress-${getProgressColorClass(progressData.branchDocumentsCompletion)}`}
                    style={{ width: `${progressData.branchDocumentsCompletion}%` }}
                  >
                    <div className="progress-bar-fill"></div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DashboardProgress;

