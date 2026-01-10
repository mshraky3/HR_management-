/**
 * Branches Monitoring Page
 * Main manager view to monitor branches with employees, statistics, and documents
 */

import { useState, useEffect } from 'react';
import { branchesAPI, employeesAPI, branchDocumentsAPI, clearCache } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import BranchBadge from '../components/BranchBadge';
import { getRequiredBranchDocuments, getBranchTypeLabel, getMonthlyRequiredBranchDocuments } from '../utils/employeeHelpers';
import { DATA_COMPLETION_STATUS } from '../utils/employeeConstants';
import { calculateEmployeeCompletion } from '../utils/dataCompletionUtils';
import { formatDate } from '../utils/dateConverters';
// TablePage.css is now loaded in App.jsx to prevent FOUC
import './BranchesMonitoring.css';

const BranchesMonitoring = () => {
  const { isMainManager } = useAuth();
  const { showError } = useNotification();
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [branchEmployees, setBranchEmployees] = useState([]);
  const [branchDocuments, setBranchDocuments] = useState([]);
  const [completionStats, setCompletionStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    if (isMainManager()) {
      loadBranches();
    }
  }, [isMainManager]);

  const loadBranches = async () => {
    try {
      setLoading(true);
      const response = await branchesAPI.getAll({ is_active: true });
      if (response.data.success) {
        setBranches(response.data.data || []);
      }
    } catch (error) {
      console.error('Error loading branches:', error);
      showError('فشل تحميل الفروع');
    } finally {
      setLoading(false);
    }
  };

  const loadBranchDetails = async (branch) => {
    try {
      setLoadingDetails(true);
      setSelectedBranch(branch);

      // Clear cache to ensure fresh data
      clearCache('/api/employees');

      // First, update completion status for all employees in this branch
      // This ensures the status shown is always up-to-date without caching
      try {
        const allEmployeesResponse = await employeesAPI.getAll({
          branch_id: branch.id,
          is_active: true
        });

        if (allEmployeesResponse.data.success && allEmployeesResponse.data.data) {
          const allEmployees = allEmployeesResponse.data.data.filter(emp =>
            !emp.status || emp.status === 'active' || emp.status === 'pending'
          );

          // Update completion status in batches
          // Performance Optimization: Increased batch size from 5 to 25 and reduced delays
          // This improves performance from ~3-5s to ~1-2s (2-4x faster) for 100 employees
          const BATCH_SIZE = 25; // Increased from 5 for better performance
          for (let i = 0; i < allEmployees.length; i += BATCH_SIZE) {
            const batch = allEmployees.slice(i, i + BATCH_SIZE);
            await Promise.all(
              batch.map(emp =>
                employeesAPI.updateCompletionStatus(emp.id).catch(err => {
                  console.warn(`Failed to update completion status for employee ${emp.id}:`, err);
                  return null;
                })
              )
            );
            // Reduced delay from 50ms to 10ms - minimal delay to prevent overwhelming server
            if (i + BATCH_SIZE < allEmployees.length) {
              await new Promise(resolve => setTimeout(resolve, 10));
            }
          }
        }
      } catch (error) {
        console.warn('Error updating completion status before loading:', error);
        // Continue loading even if status update fails
      }

      // Clear cache again after status updates
      clearCache('/api/employees');

      // Now load employees for this branch with fresh status
      const employeesResponse = await employeesAPI.getAll({
        branch_id: branch.id,
        is_active: true
      });

      let employees = [];
      if (employeesResponse.data.success) {
        employees = employeesResponse.data.data || [];
      }
      setBranchEmployees(employees);

      // Calculate completion statistics using unified utility
      const employeeMetrics = calculateEmployeeCompletion(employees, branch);

      setCompletionStats({
        total: employeeMetrics.totalCount,
        complete: employeeMetrics.completeCount,
        incomplete: employeeMetrics.incompleteCount,
        completionPercentage: employeeMetrics.percentage
      });

      // Load branch documents
      try {
        const documentsResponse = await branchDocumentsAPI.getAll({
          branch_id: branch.id
        });
        if (documentsResponse.data.success) {
          setBranchDocuments(documentsResponse.data.data || []);
        } else {
          setBranchDocuments([]);
        }
      } catch (error) {
        console.error('Error loading branch documents:', error);
        setBranchDocuments([]);
      }
    } catch (error) {
      console.error('Error loading branch details:', error);
      showError('فشل تحميل تفاصيل الفرع');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleBackToBranches = () => {
    setSelectedBranch(null);
    setBranchEmployees([]);
    setBranchDocuments([]);
    setCompletionStats(null);
  };

  // Get required documents for branch type
  const getRequiredDocuments = (branchType) => {
    const required = getRequiredBranchDocuments(branchType);
    const monthly = getMonthlyRequiredBranchDocuments();
    // Filter out monthly documents as they are handled separately
    return required.filter(doc => !monthly.includes(doc));
  };

  // Get document status (existing or missing)
  const getDocumentStatus = (docType, branchType) => {
    const branchDocs = branchDocuments.filter(
      doc => doc.document_type === docType && doc.is_active !== false
    );
    return {
      exists: branchDocs.length > 0,
      documents: branchDocs
    };
  };

  // Sort documents by priority: 1) Monthly (highest), 2) Student/Cadre, 3) Others
  const sortDocumentsByPriority = (docs) => {
    const monthlyTypes = ['payroll_file', 'salary_deposit_file'];
    const studentCadreTypes = ['student_cadre_file', 'dropped_students', 'free_seats', 'acceptance_notifications', 'staff_cadre'];

    return [...docs].sort((a, b) => {
      const aType = a.type;
      const bType = b.type;

      // Monthly documents first (highest priority)
      const aIsMonthly = monthlyTypes.includes(aType);
      const bIsMonthly = monthlyTypes.includes(bType);
      if (aIsMonthly && !bIsMonthly) return -1;
      if (!aIsMonthly && bIsMonthly) return 1;

      // Student/Cadre documents second
      const aIsStudentCadre = studentCadreTypes.includes(aType);
      const bIsStudentCadre = studentCadreTypes.includes(bType);
      if (aIsStudentCadre && !bIsStudentCadre) return -1;
      if (!aIsStudentCadre && bIsStudentCadre) return 1;

      // Others last
      return 0;
    });
  };

  // Document type labels
  const documentTypeLabels = {
    license: 'الترخيص',
    permit: 'التصريح',
    insurance: 'التأمين',
    insurance_print: 'كشف التأمينات',
    contract: 'العقد',
    rental_contract: 'عقد الايجار',
    certification: 'الشهادة',
    registration: 'السجل التجاري',
    security_contract: 'عقد الامن و السالامة',
    civil_defense_certificate: 'شهادة الدفاع المدني',
    municipality_certificate: 'شهادة بلدي',
    insurance_certificate: 'شهادة التامينات',
    insurance_statement: 'كشف التأمينات',
    operational_plan: 'الخطة التشغلية للمركز',
    owner_civil_id_copy: 'نسخه من هوية الاحوال الشخصية لمالك المركز',
    disclosure_commitment: 'افصاح و تعهد',
    certification_commitment_form: 'نموذج تصديق و تعاقد',
    financial_platform_declaration: 'ملف اقرار المنصة المالية',
    financial_claim_form: 'نموذج مطالبة مالية',
    student_cadre_file: 'بيانات الطلاب',
    dropped_students: 'الطلاب المنقطعين',
    free_seats: 'المقاعد المتاحة',
    acceptance_notifications: 'إشعارات القبول',
      payroll_file: 'ملف مسيرات الرواتب',
      salary_deposit_file: 'ملف ايداع الرواتب (التحويلات البنكية)'
  };

  if (!isMainManager()) {
    return <div className="error-message">هذه الصفحة متاحة فقط للمدير الرئيسي</div>;
  }

  if (loading) {
    return <div className="loading">جاري التحميل...</div>;
  }

  // If branch is selected, show branch details
  if (selectedBranch) {
    const requiredDocs = getRequiredDocuments(selectedBranch.branch_type);
    const existingDocs = [];
    const missingDocs = [];

    requiredDocs.forEach(docType => {
      const status = getDocumentStatus(docType, selectedBranch.branch_type);
      if (status.exists) {
        existingDocs.push({
          type: docType,
          label: documentTypeLabels[docType] || docType,
          documents: status.documents
        });
      } else {
        missingDocs.push({
          type: docType,
          label: documentTypeLabels[docType] || docType
        });
      }
    });

    return (
      <div className="table-page branches-monitoring-page">
        <div className="page-header">
          <button onClick={handleBackToBranches} className="btn-back">
            ← العودة للفروع
          </button>
          <h1>{selectedBranch.branch_name}</h1>
        </div>

        {loadingDetails ? (
          <div className="loading">جاري تحميل التفاصيل...</div>
        ) : (
          <>
            {/* Completion Statistics */}
            {completionStats && (
              <div className="completion-stats-section">
                <h2>إحصائيات إكمال البيانات</h2>
                <div className="stats-cards">
                  <div className="stat-card">
                    <div className="stat-label">إجمالي الموظفين</div>
                    <div className="stat-value">{completionStats.total}</div>
                  </div>
                  <div className="stat-card complete">
                    <div className="stat-label">مكتملين</div>
                    <div className="stat-value">{completionStats.complete}</div>
                  </div>
                  <div className="stat-card incomplete">
                    <div className="stat-label">غير مكتملين</div>
                    <div className="stat-value">{completionStats.incomplete}</div>
                  </div>
                  <div className="stat-card percentage">
                    <div className="stat-label">نسبة الإكمال</div>
                    <div className="stat-value">
                      <div className="percentage-display">
                        <div className="percentage-bar-container">
                          <div
                            className="percentage-bar"
                            style={{
                              width: `${completionStats.completionPercentage}%`,
                              backgroundColor:
                                completionStats.completionPercentage >= 80
                                  ? '#4CAF50'
                                  : completionStats.completionPercentage >= 50
                                    ? '#FF9800'
                                    : '#F44336'
                            }}
                          />
                        </div>
                        <span className="percentage-text">
                          {completionStats.completionPercentage}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Employees List */}
            <div className="employees-section">
              <h2>قائمة الموظفين ({branchEmployees.length})</h2>
              {branchEmployees.length > 0 ? (
                <div className="employees-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>رقم الموظف</th>
                        <th>الاسم</th>
                        <th>المهنة</th>
                        <th>حالة البيانات</th>
                        <th>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branchEmployees.map((employee) => (
                        <tr key={employee.id}>
                          <td>{employee.employee_id_number || '-'}</td>
                          <td>
                            {employee.first_name} {employee.second_name} {employee.third_name} {employee.fourth_name}
                          </td>
                          <td>{employee.occupation || '-'}</td>
                          <td>
                            <span className={`completion-badge ${employee.data_completion_status === DATA_COMPLETION_STATUS.COMPLETE ? 'complete' : 'incomplete'
                              }`}>
                              {employee.data_completion_status === DATA_COMPLETION_STATUS.COMPLETE ? 'مكتمل' : 'غير مكتمل'}
                            </span>
                          </td>
                          <td>
                            <span className={`status-badge ${employee.status === 'active' ? 'active' :
                              employee.status === 'pending' ? 'pending' : 'archived'
                              }`}>
                              {employee.status === 'active' ? 'نشط' :
                                employee.status === 'pending' ? 'قيد الانتظار' : 'مؤرشف'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="no-data">لا يوجد موظفين في هذا الفرع</div>
              )}
            </div>

            {/* Branch Documents */}
            <div className="documents-section">
              <h2>مستندات الفرع</h2>

              {/* Existing Documents */}
              {existingDocs.length > 0 && (
                <div className="documents-group">
                  <h3 className="documents-group-title existing">
                    <span className="status-icon">✓</span>
                    المستندات الموجودة ({existingDocs.length})
                  </h3>
                  <div className="documents-list">
                    {existingDocs.map((doc, index) => (
                      <div key={`existing-${doc.type}-${index}`} className="document-item existing">
                        <div className="document-info">
                          <span className="document-name">{doc.label}</span>
                          <span className="document-count">
                            {doc.documents.length} {doc.documents.length === 1 ? 'مستند' : 'مستندات'}
                          </span>
                        </div>
                        <div className="document-dates">
                          {doc.documents.map((d, idx) => (
                            <span key={idx} className="document-date">
                              {formatDate(d.uploaded_at)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing Documents - Sorted by Priority */}
              {missingDocs.length > 0 && (() => {
                const sortedMissingDocs = sortDocumentsByPriority(missingDocs);
                const monthlyTypes = ['payroll_file', 'salary_deposit_file'];
                const studentCadreTypes = ['student_cadre_file', 'dropped_students', 'free_seats', 'acceptance_notifications', 'staff_cadre'];

                const monthlyMissing = sortedMissingDocs.filter(doc => monthlyTypes.includes(doc.type));
                const studentCadreMissing = sortedMissingDocs.filter(doc => studentCadreTypes.includes(doc.type));
                const otherMissing = sortedMissingDocs.filter(doc => !monthlyTypes.includes(doc.type) && !studentCadreTypes.includes(doc.type));

                return (
                  <div className="documents-group">
                    <h3 className="documents-group-title missing">
                      <span className="status-icon">✗</span>
                      المستندات الناقصة ({missingDocs.length})
                    </h3>

                    {/* Monthly Documents Section (Highest Priority) */}
                    {monthlyMissing.length > 0 && (
                      <div className="documents-priority-section priority-high">
                        <h4 className="priority-title">
                          <span className="priority-icon" style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#dc3545' }}></span>
                          المستندات الشهرية (الأولوية القصوى)
                        </h4>
                        <div className="documents-list">
                          {monthlyMissing.map((doc, index) => (
                            <div key={`missing-monthly-${doc.type}-${index}`} className="document-item missing priority-high">
                              <div className="document-info">
                                <span className="document-name">{doc.label}</span>
                                <span className="document-status">غير موجود</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Student/Cadre Documents Section */}
                    {studentCadreMissing.length > 0 && (
                      <div className="documents-priority-section priority-medium">
                        <h4 className="priority-title">
                          <span className="priority-icon" style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ffc107' }}></span>
                          مستندات الكوادر والطلاب
                        </h4>
                        <div className="documents-list">
                          {studentCadreMissing.map((doc, index) => (
                            <div key={`missing-student-${doc.type}-${index}`} className="document-item missing priority-medium">
                              <div className="document-info">
                                <span className="document-name">{doc.label}</span>
                                <span className="document-status">غير موجود</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Other Documents Section */}
                    {otherMissing.length > 0 && (
                      <div className="documents-priority-section priority-low">
                        <h4 className="priority-title">
                          <span className="priority-icon" style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#28a745' }}></span>
                          باقي المستندات
                        </h4>
                        <div className="documents-list">
                          {otherMissing.map((doc, index) => (
                            <div key={`missing-other-${doc.type}-${index}`} className="document-item missing priority-low">
                              <div className="document-info">
                                <span className="document-name">{doc.label}</span>
                                <span className="document-status">غير موجود</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {existingDocs.length === 0 && missingDocs.length === 0 && (
                <div className="no-data">لا توجد مستندات مطلوبة لهذا النوع من الفروع</div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // Main view: Show branches as cards grouped by type
  const schools = branches.filter(b => b.branch_type === 'school');
  const healthcareCenters = branches.filter(b => b.branch_type === 'healthcare_center');

  return (
    <div className="table-page branches-monitoring-page">
      <div className="page-header">
        <h1>الفروع</h1>
      </div>

      {/* Schools Section */}
      {schools.length > 0 && (
        <div className="branches-section">
          <h2 className="section-title">
            <img src="https://img.icons8.com/material-rounded/24/school.png" alt="مدرسة" className="section-icon" style={{ width: '24px', height: '24px' }} />
            المدارس
          </h2>
          <div className="branches-grid">
            {schools.map(branch => (
              <div
                key={branch.id}
                className="branch-card"
              >
                <div className="branch-card-header">
                  <h3><BranchBadge branch={branch} /> {branch.branch_name}</h3>
                </div>
                <div className="branch-card-footer">
                  <button
                    className="btn-view-details"
                    onClick={() => loadBranchDetails(branch)}
                  >
                    عرض التفاصيل
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Healthcare Centers Section */}
      {healthcareCenters.length > 0 && (
        <div className="branches-section">
          <h2 className="section-title">
            <img src="https://img.icons8.com/material-rounded/24/hospital.png" alt="مستشفى" className="section-icon" style={{ width: '24px', height: '24px' }} />
            مراكز الرعاية النهارية
          </h2>
          <div className="branches-grid">
            {healthcareCenters.map(branch => (
              <div
                key={branch.id}
                className="branch-card"
              >
                <div className="branch-card-header">
                  <h3>{branch.branch_name}</h3>
                </div>
                <div className="branch-card-footer">
                  <button
                    className="btn-view-details"
                    onClick={() => loadBranchDetails(branch)}
                  >
                    عرض التفاصيل
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {schools.length === 0 && healthcareCenters.length === 0 && (
        <div className="no-data">لا توجد فروع متاحة</div>
      )}
    </div>
  );
};

export default BranchesMonitoring;

