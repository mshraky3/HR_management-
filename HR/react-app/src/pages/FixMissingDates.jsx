/**
 * Invalid Data Page
 * Page to view and manage employees with invalid/incomplete data
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import './FixMissingDates.css';

const FixMissingDates = () => {
  const { isMainManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize] = useState(50);
  const [processing, setProcessing] = useState({});
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [actionType, setActionType] = useState(''); // 'notify' or 'delete'

  useEffect(() => {
    if (!isMainManager()) {
      return;
    }
    loadEmployees();
  }, [currentPage]);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getEmployeesWithInvalidData(pageSize, currentPage * pageSize);
      if (response.data.success) {
        setEmployees(response.data.data || []);
        setTotalCount(response.data.pagination?.total || 0);
      }
    } catch (error) {
      console.error('Error loading employees:', error);
      showError(error.response?.data?.message || 'فشل تحميل الموظفين');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (employee) => {
    navigate('/employees', { state: { editEmployeeId: employee.id } });
  };

  const handleNotify = async (employee) => {
    try {
      setProcessing({ ...processing, [employee.id]: true });
      const response = await adminAPI.notifyBranchInvalidData(employee.id);
      if (response.data.success) {
        showSuccess(`تم إرسال إشعار للفرع بخصوص الموظف ${employee.first_name} ${employee.second_name}`);
      }
    } catch (error) {
      console.error('Error notifying branch:', error);
      showError(error.response?.data?.message || 'فشل إرسال الإشعار للفرع');
    } finally {
      setProcessing({ ...processing, [employee.id]: false });
    }
  };

  const handleDelete = async (employee) => {
    try {
      setProcessing({ ...processing, [employee.id]: true });
      const response = await adminAPI.fixEmployeeDate(employee.id, 'delete');
      if (response.data.success) {
        showSuccess(`تم حذف الموظف ${employee.first_name} ${employee.second_name}`);
        loadEmployees();
      }
    } catch (error) {
      console.error('Error deleting employee:', error);
      showError(error.response?.data?.message || 'فشل حذف الموظف');
    } finally {
      setProcessing({ ...processing, [employee.id]: false });
    }
  };

  const openConfirmModal = (employee, action) => {
    setSelectedEmployee(employee);
    setActionType(action);
    setShowConfirmModal(true);
  };

  const confirmAction = async () => {
    if (!selectedEmployee) return;
    
    setShowConfirmModal(false);
    if (actionType === 'notify') {
      await handleNotify(selectedEmployee);
    } else if (actionType === 'delete') {
      await handleDelete(selectedEmployee);
    }
    setSelectedEmployee(null);
    setActionType('');
  };

  const navigateToEmployee = (employeeId) => {
    if (!employeeId) return;
    navigate(`/employees/${employeeId}`);
  };

  if (!isMainManager()) {
    return (
      <div className="fix-missing-dates-container">
        <div className="empty-state">
          <p>هذه الصفحة متاحة فقط للمدير الرئيسي</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="fix-missing-dates-container">
        <div className="loading-container">
          <p>جاري التحميل...</p>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="fix-missing-dates-container">
      <div className="fix-missing-dates-header">
        <div>
          <h1>البيانات غير الدقيقة</h1>
          <p className="total-count">إجمالي الموظفين مع بيانات غير دقيقة: {totalCount}</p>
        </div>
      </div>

      {employees.length === 0 ? (
        <div className="empty-state">
          <p>✅ لا يوجد موظفين مع بيانات غير دقيقة</p>
        </div>
      ) : (
        <>
          <div className="employees-table-container">
            <table className="employees-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>اسم الموظف</th>
                  <th>الرقم الوظيفي</th>
                  <th>الفرع</th>
                  <th>الجنسية</th>
                  <th>تاريخ الميلاد الهجري</th>
                  <th>تاريخ الميلاد الميلادي</th>
                  <th>العمر</th>
                  <th>المجالات الناقصة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id} className={employee.is_invalid_age ? 'invalid-age-row' : ''}>
                    <td>{employee.id}</td>
                    <td>
                      <button
                        className="link-button"
                        onClick={() => navigateToEmployee(employee.id)}
                      >
                        {employee.first_name} {employee.second_name} {employee.third_name} {employee.fourth_name}
                      </button>
                    </td>
                    <td>{employee.employee_id_number || 'N/A'}</td>
                    <td>{employee.branch_name || 'N/A'}</td>
                    <td>{employee.nationality || 'N/A'}</td>
                    <td>
                      {employee.date_of_birth_hijri ? (
                        employee.date_of_birth_hijri
                      ) : (
                        <span className="missing-badge">❌ مفقود</span>
                      )}
                    </td>
                    <td>
                      {employee.date_of_birth_gregorian ? (
                        employee.date_of_birth_gregorian?.split('T')[0] || employee.date_of_birth_gregorian
                      ) : (
                        <span className="missing-badge">❌ مفقود</span>
                      )}
                    </td>
                    <td>
                      {employee.age !== null ? (
                        <span className={employee.is_invalid_age ? 'invalid-age' : ''}>
                          {employee.age} سنة
                          {employee.is_invalid_age && <span className="invalid-icon"> ⚠️</span>}
                        </span>
                      ) : (
                        <span className="missing-badge">-</span>
                      )}
                    </td>
                    <td>
                      {employee.invalid_fields && employee.invalid_fields.length > 0 ? (
                        <div className="missing-fields-list">
                          {employee.invalid_fields.slice(0, 3).map((field, idx) => (
                            <span key={idx} className="missing-field-badge">
                              {field}
                            </span>
                          ))}
                          {employee.invalid_fields.length > 3 && (
                            <span className="more-fields">+{employee.invalid_fields.length - 3} أخرى</span>
                          )}
                        </div>
                      ) : (
                        <span className="valid-badge">لا توجد</span>
                      )}
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleEdit(employee)}
                          disabled={processing[employee.id]}
                          title="تعديل"
                        >
                          تعديل
                        </button>
                        <button
                          className="btn btn-warning btn-sm"
                          onClick={() => openConfirmModal(employee, 'notify')}
                          disabled={processing[employee.id]}
                          title="إشعار الفرع"
                        >
                          {processing[employee.id] ? 'جاري...' : 'إشعار الفرع'}
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => openConfirmModal(employee, 'delete')}
                          disabled={processing[employee.id]}
                          title="حذف"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="btn btn-secondary"
                onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                disabled={currentPage === 0}
              >
                السابق
              </button>
              <span className="pagination-info">
                صفحة {currentPage + 1} من {totalPages}
              </span>
              <button
                className="btn btn-secondary"
                onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
                disabled={currentPage >= totalPages - 1}
              >
                التالي
              </button>
            </div>
          )}
        </>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && selectedEmployee && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>تأكيد الإجراء</h2>
            {actionType === 'notify' && (
              <>
                <p>
                  هل أنت متأكد من إرسال إشعار للفرع بخصوص الموظف:
                  <br />
                  <strong>
                    {selectedEmployee.first_name} {selectedEmployee.second_name} {selectedEmployee.third_name} {selectedEmployee.fourth_name}
                  </strong>
                  <br />
                  ({selectedEmployee.branch_name})
                </p>
                {selectedEmployee.invalid_fields && selectedEmployee.invalid_fields.length > 0 && (
                  <div className="missing-fields-modal">
                    <p><strong>المجالات غير الصحيحة:</strong></p>
                    <ul>
                      {selectedEmployee.invalid_fields.map((field, idx) => (
                        <li key={idx}>{field}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            {actionType === 'delete' && (
              <p>
                هل أنت متأكد من حذف الموظف:
                <br />
                <strong>
                  {selectedEmployee.first_name} {selectedEmployee.second_name} {selectedEmployee.third_name} {selectedEmployee.fourth_name}
                </strong>
                <br />
                <span className="warning-text">⚠️ هذا الإجراء لا يمكن التراجع عنه</span>
              </p>
            )}
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowConfirmModal(false)}
              >
                إلغاء
              </button>
              <button
                className={`btn ${actionType === 'delete' ? 'btn-danger' : 'btn-primary'}`}
                onClick={confirmAction}
              >
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FixMissingDates;
