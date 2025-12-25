/**
 * Dashboard Progress Component
 * Displays overall progress for branch managers with loading state
 */

import { useState, useEffect } from 'react';
import { DATA_COMPLETION_STATUS } from '../utils/employeeConstants';

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
    if (!branch) return;
    
    setProgressLoading(true);
    try {
      // 1. Calculate employees data completion
      // Use branch.number_of_employees if set, otherwise use actual employees count
      // This provides more accurate percentage when branch has expected number of employees
      const expectedEmployeeCount = branch.number_of_employees && branch.number_of_employees > 0 
        ? branch.number_of_employees 
        : employees.length;
      const completeEmployees = employees.filter(emp => emp.data_completion_status === DATA_COMPLETION_STATUS.COMPLETE).length;
      const employeesCompletion = expectedEmployeeCount > 0 
        ? Math.round((completeEmployees / expectedEmployeeCount) * 100) 
        : 0;
      
      // 2. Calculate branch documents completion
      const { getRequiredBranchDocuments } = await import('../utils/employeeHelpers');
      const requiredDocs = getRequiredBranchDocuments(branch.branch_type);
      const uploadedDocs = documents.filter(doc => 
        requiredDocs.includes(doc.document_type) && doc.is_active
      );
      const branchDocumentsCompletion = requiredDocs.length > 0
        ? Math.round((uploadedDocs.length / requiredDocs.length) * 100)
        : 0;
      
      // 3. Calculate overall progress (weighted average)
      // Employees: 50%, Documents: 50%
      const overallProgress = Math.round(
        (employeesCompletion * 0.5) + 
        (branchDocumentsCompletion * 0.5)
      );
      
      setProgressData({
        employeesCompletion,
        branchDocumentsCompletion,
        alertsResolved: 0, // Not used anymore
        overallProgress
      });
    } catch (error) {
      console.error('Error calculating progress:', error);
    } finally {
      setProgressLoading(false);
    }
  };

  // Calculate progress when data changes (run in parallel, non-blocking)
  useEffect(() => {
    if (branch && employees && Array.isArray(employees) && documents && Array.isArray(documents)) {
      // Run calculation in parallel without blocking
      calculateProgress(employees, documents, branch);
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

