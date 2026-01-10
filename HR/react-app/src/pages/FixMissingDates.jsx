/**
 * Invalid Data Page
 * Page to view and manage employees with invalid/incomplete data
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI, employeesAPI } from '../utils/api';
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
  const [duplicates, setDuplicates] = useState([]);
  const [loadingDuplicates, setLoadingDuplicates] = useState(true);
  const [mergeProcessing, setMergeProcessing] = useState({});
  const [selectedCanonicals, setSelectedCanonicals] = useState({});
  const [duplicateDocs, setDuplicateDocs] = useState([]);
  const [loadingDuplicateDocs, setLoadingDuplicateDocs] = useState(true);
  const [mergeDocProcessing, setMergeDocProcessing] = useState({});
  const [paperContractDocs, setPaperContractDocs] = useState([]);
  const [loadingPaperContractDocs, setLoadingPaperContractDocs] = useState(true);
  const [selectedPaperEmployees, setSelectedPaperEmployees] = useState(new Set());
  const [processingPaperDelete, setProcessingPaperDelete] = useState(false);

  useEffect(() => {
    if (!isMainManager()) {
      return;
    }
    loadEmployees();
    loadDuplicates();
    loadDuplicateDocuments();
    loadPaperContractDocs();
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

  const loadDuplicates = async () => {
    try {
      setLoadingDuplicates(true);
      const res = await employeesAPI.getDuplicates();
      if (res.data?.success) {
        const data = res.data.data || [];
        setDuplicates(data);
        const defaults = {};
        data.forEach((cluster, idx) => {
          defaults[idx] = cluster.ids?.[0];
        });
        setSelectedCanonicals(defaults);
      }
    } catch (error) {
      console.error('Error loading duplicates:', error);
      showError(error.response?.data?.message || 'فشل جلب الموظفين المكررين');
    } finally {
      setLoadingDuplicates(false);
    }
  };

  const loadDuplicateDocuments = async () => {
    try {
      setLoadingDuplicateDocs(true);
      const res = await employeesAPI.getDuplicateDocuments();
      if (res.data?.success) {
        setDuplicateDocs(res.data.data || []);
      }
    } catch (error) {
      console.error('Error loading duplicate documents:', error);
      showError(error.response?.data?.message || 'فشل جلب المستندات المكررة');
    } finally {
      setLoadingDuplicateDocs(false);
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

  const handleMergeDuplicates = async (cluster, clusterIndex) => {
    const canonicalId = selectedCanonicals[clusterIndex] || cluster.ids[0];
    if (!canonicalId) return;
    const dupIds = cluster.ids.filter((id) => id !== canonicalId);
    if (dupIds.length === 0) return;
    setMergeProcessing((prev) => ({ ...prev, [canonicalId]: true }));
    try {
      await employeesAPI.mergeDuplicates(canonicalId, dupIds);
      showSuccess('تم دمج السجلات المكررة');
      await loadDuplicates();
      await loadEmployees();
    } catch (error) {
      console.error('Error merging duplicates:', error);
      showError(error.response?.data?.message || 'فشل دمج السجلات المكررة');
    } finally {
      setMergeProcessing((prev) => ({ ...prev, [canonicalId]: false }));
    }
  };

  const formatDob = (dob) => {
    if (!dob) return 'غير متوفر';
    return dob.split('T')[0];
  };

  const handleMergeDocs = async (employeeId, docType, keepId) => {
    if (!employeeId || !docType || !keepId) return;
    setMergeDocProcessing((prev) => ({ ...prev, [employeeId]: true }));
    try {
      await employeesAPI.mergeDuplicateDocuments(employeeId, docType, keepId);
      showSuccess('تم دمج المستندات المكررة لهذا الموظف');
      await loadDuplicateDocuments();
    } catch (error) {
      console.error('Error merging duplicate documents:', error);
      showError(error.response?.data?.message || 'فشل دمج المستندات المكررة');
    } finally {
      setMergeDocProcessing((prev) => ({ ...prev, [employeeId]: false }));
    }
  };

  const loadPaperContractDocs = async () => {
    try {
      setLoadingPaperContractDocs(true);
      const res = await employeesAPI.getPaperContractInsurance();
      if (res.data?.success) {
        setPaperContractDocs(res.data.data || []);
      }
    } catch (error) {
      console.error('Error loading paper contract insurance docs:', error);
      showError(error.response?.data?.message || 'فشل جلب مستندات التأمين الطبي');
    } finally {
      setLoadingPaperContractDocs(false);
    }
  };

  const togglePaperEmployee = (id) => {
    setSelectedPaperEmployees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDeletePaperDocs = async () => {
    if (selectedPaperEmployees.size === 0) return;
    setProcessingPaperDelete(true);
    try {
      await employeesAPI.deletePaperContractInsurance(Array.from(selectedPaperEmployees));
      showSuccess('تم حذف مستندات التأمين الطبي للموظفين المحددين');
      setSelectedPaperEmployees(new Set());
      await loadPaperContractDocs();
    } catch (error) {
      console.error('Error deleting paper contract insurance docs:', error);
      showError(error.response?.data?.message || 'فشل حذف مستندات التأمين الطبي');
    } finally {
      setProcessingPaperDelete(false);
    }
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

      <div className="duplicates-section">
        <h2>سجلات مكررة (الاسم + تاريخ الميلاد)</h2>
        {loadingDuplicates ? (
          <p>جاري التحميل...</p>
        ) : duplicates.length === 0 ? (
          <p>لا توجد سجلات مكررة.</p>
        ) : (
          <div className="duplicates-list">
                    {duplicates.map((cluster, idx) => (
                      <div key={idx} className="duplicate-cluster-card">
                        <div className="cluster-header">
                          <strong>مجموعة #{idx + 1}</strong>
                          <span>({cluster.ids.length} سجلات)</span>
                        </div>
                        <div className="cluster-body">
                          {cluster.employees?.map((emp) => (
                            <label key={emp.id} className="duplicate-row">
                              <input
                                type="radio"
                                name={`canonical-${idx}`}
                                checked={selectedCanonicals[idx] === emp.id}
                                onChange={() => setSelectedCanonicals((prev) => ({ ...prev, [idx]: emp.id }))}
                              />
                              <div className="duplicate-info">
                                <div className="dup-name">
                                  {emp.first_name} {emp.second_name} {emp.third_name} {emp.fourth_name}
                                </div>
                                <div className="dup-meta">
                                  <span>معرف: {emp.id}</span>
                                  <span>الهوية: {emp.id_or_residency_number || '—'}</span>
                                  <span>الميلاد: {formatDob(emp.date_of_birth_gregorian)}</span>
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                        <div className="cluster-actions">
                          <button
                            className="btn btn-primary"
                            onClick={() => handleMergeDuplicates(cluster, idx)}
                            disabled={mergeProcessing[selectedCanonicals[idx] || cluster.ids[0]]}
                          >
                            {mergeProcessing[selectedCanonicals[idx] || cluster.ids[0]] ? 'جارٍ الدمج...' : 'دمج وحذف المكررات'}
                          </button>
                        </div>
                      </div>
                    ))}
          </div>
        )}
      </div>

      <div className="duplicates-section">
        <h2>مستندات مكررة حسب النوع (باستثناء الأنواع المسموح بتعددها)</h2>
        {loadingDuplicateDocs ? (
          <p>جاري التحميل...</p>
        ) : duplicateDocs.length === 0 ? (
          <p>لا توجد مستندات مكررة.</p>
        ) : (
          <div className="duplicates-list">
            {duplicateDocs.map((row, idx) => {
              const key = `${row.employee_id}:${row.document_type}`;
              const selectedKeepId = mergeDocProcessing[key] || null;
              return (
                <div key={idx} className="duplicate-cluster-card">
                  <div className="cluster-header">
                    <strong>موظف #{row.employee_id}</strong>
                    <span>نوع المستند: {row.document_type}</span>
                    <span>(عدد: {row.doc_count})</span>
                  </div>
                  <div className="cluster-body">
                    {row.documents?.map((doc) => (
                      <label key={doc.id} className="duplicate-row">
                        <input
                          type="radio"
                          name={`doc-${row.employee_id}-${row.document_type}`}
                          checked={selectedKeepId === doc.id}
                          onChange={() => {
                            setMergeDocProcessing((prev) => ({
                              ...prev,
                              [key]: doc.id
                            }));
                          }}
                        />
                        <div className="duplicate-info">
                          <div className="dup-name">ملف: {doc.file_name || 'غير مسمى'}</div>
                          <div className="dup-meta">
                            <span>معرف المستند: {doc.id}</span>
                            <span>تاريخ الرفع: {doc.uploaded_at?.split('T')[0] || '—'}</span>
                            <span>نشط: {doc.is_active ? 'نعم' : 'لا'}</span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="cluster-actions">
                    <button
                      className="btn btn-primary"
                      onClick={() =>
                        handleMergeDocs(
                          row.employee_id,
                          row.document_type,
                          selectedKeepId
                        )
                      }
                      disabled={!selectedKeepId || mergeDocProcessing[row.employee_id]}
                    >
                      {mergeDocProcessing[row.employee_id] ? 'جارٍ الدمج...' : 'دمج وحذف المكررات'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="duplicates-section">
        <h2>مستندات التأمين الطبي لموظفي العقد الورقي</h2>
        {loadingPaperContractDocs ? (
          <p>جاري التحميل...</p>
        ) : paperContractDocs.length === 0 ? (
          <p>لا توجد مستندات تأمين طبي لعقود ورقية.</p>
        ) : (
          <div className="duplicates-list">
            {paperContractDocs.map((row, idx) => (
              <div key={idx} className="duplicate-cluster-card">
                <div className="cluster-header">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedPaperEmployees.has(row.employee_id)}
                      onChange={() => togglePaperEmployee(row.employee_id)}
                    />{' '}
                    موظف #{row.employee_id}
                  </label>
                  <span>العقد: {row.contract_type}</span>
                  <span>المستندات: {row.documents?.length || 0}</span>
                </div>
                <div className="cluster-body">
                  {row.documents?.map((doc) => (
                    <div key={doc.id} className="duplicate-row">
                      <div className="duplicate-info">
                        <div className="dup-name">ملف: {doc.file_name || 'غير مسمى'}</div>
                        <div className="dup-meta">
                          <span>معرف المستند: {doc.id}</span>
                          <span>تاريخ الرفع: {doc.uploaded_at?.split('T')[0] || '—'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="cluster-actions">
              <button
                className="btn btn-danger"
                onClick={handleDeletePaperDocs}
                disabled={processingPaperDelete || selectedPaperEmployees.size === 0}
              >
                {processingPaperDelete ? 'جارٍ الحذف...' : 'حذف التأمين الطبي للموظفين المحددين'}
              </button>
            </div>
          </div>
        )}
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
