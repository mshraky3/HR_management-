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
  const [branchDocuments, setBranchDocuments] = useState([]);
  const [loadingBranchDocuments, setLoadingBranchDocuments] = useState(true);
  const [selectedBranchDocs, setSelectedBranchDocs] = useState(new Set());
  const [convertingDocs, setConvertingDocs] = useState({});
  const [abnormalDates, setAbnormalDates] = useState([]);
  const [loadingAbnormalDates, setLoadingAbnormalDates] = useState(true);
  const [editingDates, setEditingDates] = useState({});
  const [savingDates, setSavingDates] = useState({});

  useEffect(() => {
    if (!isMainManager()) {
      return;
    }
    loadEmployees();
    loadDuplicates();
    loadDuplicateDocuments();
    loadPaperContractDocs();
    loadBranchDocuments();
    loadAbnormalDates();
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

  const loadBranchDocuments = async () => {
    try {
      setLoadingBranchDocuments(true);
      const res = await adminAPI.getBranchDocumentsDateStatus();
      if (res.data?.success) {
        setBranchDocuments(res.data.data || []);
      }
    } catch (error) {
      console.error('Error loading branch documents:', error);
      showError(error.response?.data?.message || 'فشل جلب مستندات الفروع');
    } finally {
      setLoadingBranchDocuments(false);
    }
  };

  const toggleBranchDoc = (docId) => {
    setSelectedBranchDocs((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  const handleConvertDates = async (docId) => {
    const doc = branchDocuments.find(d => d.id === docId);
    if (!doc) return;

    setConvertingDocs((prev) => ({ ...prev, [docId]: true }));
    try {
      // Determine what needs conversion
      const needsIssueConversion = (doc.has_issue_gregorian && !doc.has_issue_hijri) || 
                                   (doc.has_issue_hijri && !doc.has_issue_gregorian);
      const needsExpiryConversion = (doc.has_expiry_gregorian && !doc.has_expiry_hijri) || 
                                     (doc.has_expiry_hijri && !doc.has_expiry_gregorian);

      if (!needsIssueConversion && !needsExpiryConversion) {
        showWarning('لا يحتاج هذا المستند للتحويل - كلا التقويمين موجودان');
        return;
      }

      const res = await adminAPI.convertBranchDocumentDates(docId, {
        convert_issue_date: needsIssueConversion,
        convert_expiry_date: needsExpiryConversion
      });

      if (res.data?.success) {
        showSuccess('تم تحويل التواريخ بنجاح');
        await loadBranchDocuments();
      }
    } catch (error) {
      console.error('Error converting dates:', error);
      showError(error.response?.data?.message || 'فشل تحويل التواريخ');
    } finally {
      setConvertingDocs((prev) => ({ ...prev, [docId]: false }));
    }
  };

  const handleBulkConvert = async () => {
    if (selectedBranchDocs.size === 0) {
      showWarning('يرجى اختيار مستند واحد على الأقل');
      return;
    }

    const docIds = Array.from(selectedBranchDocs);
    let successCount = 0;
    let failCount = 0;

    for (const docId of docIds) {
      try {
        await handleConvertDates(docId);
        successCount++;
      } catch (error) {
        failCount++;
      }
    }

    if (successCount > 0) {
      showSuccess(`تم تحويل التواريخ لـ ${successCount} مستند${successCount > 1 ? 'ات' : ''}`);
    }
    if (failCount > 0) {
      showError(`فشل تحويل التواريخ لـ ${failCount} مستند${failCount > 1 ? 'ات' : ''}`);
    }

    setSelectedBranchDocs(new Set());
  };

  const formatDateDisplay = (date) => {
    if (!date) return '-';
    if (typeof date === 'string') {
      if (date.includes('T')) {
        return date.split('T')[0];
      }
      return date;
    }
    return date;
  };

  const loadAbnormalDates = async () => {
    try {
      setLoadingAbnormalDates(true);
      const res = await adminAPI.getBranchDocumentsAbnormalDates();
      if (res.data?.success) {
        setAbnormalDates(res.data.data || []);
      }
    } catch (error) {
      console.error('Error loading abnormal dates:', error);
      showError(error.response?.data?.message || 'فشل جلب التواريخ غير الطبيعية');
    } finally {
      setLoadingAbnormalDates(false);
    }
  };

  const getYearFromHijri = (hijriDate) => {
    if (!hijriDate) return null;
    const parts = hijriDate.split('/');
    if (parts.length === 3) {
      return parseInt(parts[2]);
    }
    return null;
  };

  const getYearFromGregorian = (gregorianDate) => {
    if (!gregorianDate) return null;
    if (typeof gregorianDate === 'string') {
      const dateStr = gregorianDate.includes('T') ? gregorianDate.split('T')[0] : gregorianDate;
      const parts = dateStr.split('-');
      if (parts.length >= 1) {
        return parseInt(parts[0]);
      }
    }
    return null;
  };

  const handleDateEdit = (docId, field, value) => {
    setEditingDates((prev) => ({
      ...prev,
      [docId]: {
        ...prev[docId],
        [field]: value
      }
    }));
  };

  const handleSaveDates = async (docId) => {
    const editedDates = editingDates[docId];
    if (!editedDates) return;

    setSavingDates((prev) => ({ ...prev, [docId]: true }));
    try {
      const updateData = {};
      if (editedDates.issue_date !== undefined) updateData.issue_date = editedDates.issue_date || null;
      if (editedDates.issue_date_hijri !== undefined) updateData.issue_date_hijri = editedDates.issue_date_hijri || null;
      if (editedDates.expiry_date !== undefined) updateData.expiry_date = editedDates.expiry_date || null;
      if (editedDates.expiry_date_hijri !== undefined) updateData.expiry_date_hijri = editedDates.expiry_date_hijri || null;

      const res = await adminAPI.updateBranchDocumentDates(docId, updateData);

      if (res.data?.success) {
        showSuccess('تم تحديث التواريخ بنجاح');
        // Clear editing state for this document
        setEditingDates((prev) => {
          const next = { ...prev };
          delete next[docId];
          return next;
        });
        // Reload abnormal dates
        await loadAbnormalDates();
      }
    } catch (error) {
      console.error('Error saving dates:', error);
      showError(error.response?.data?.message || 'فشل تحديث التواريخ');
    } finally {
      setSavingDates((prev) => ({ ...prev, [docId]: false }));
    }
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
        <h2>مستندات الفروع مع تواريخ غير طبيعية</h2>
        <p style={{ marginBottom: '1rem', color: '#666' }}>
          سنوات أقل من 2000 ميلادي أو أقل من 1400 هجري
        </p>
        {loadingAbnormalDates ? (
          <p>جاري التحميل...</p>
        ) : abnormalDates.length === 0 ? (
          <p>✅ لا توجد مستندات مع تواريخ غير طبيعية.</p>
        ) : (
          <div className="table-container">
            <table className="employees-table">
              <thead>
                <tr>
                  <th>الفرع</th>
                  <th>نوع المستند</th>
                  <th>اسم الملف</th>
                  <th>تاريخ الإصدار</th>
                  <th>تاريخ الانتهاء</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {abnormalDates.map((doc) => {
                  const issueGYear = getYearFromGregorian(doc.issue_date);
                  const issueHYear = getYearFromHijri(doc.issue_date_hijri);
                  const expiryGYear = getYearFromGregorian(doc.expiry_date);
                  const expiryHYear = getYearFromHijri(doc.expiry_date_hijri);
                  const edited = editingDates[doc.id] || {};
                  const hasChanges = Object.keys(edited).length > 0;

                  return (
                    <tr key={doc.id} className="abnormal-date-row">
                      <td>{doc.branch_name}</td>
                      <td>{doc.document_type}</td>
                      <td>{doc.file_name}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <div>
                            <label style={{ fontSize: '0.875rem', display: 'block', marginBottom: '0.25rem' }}>
                              ميلادي:
                            </label>
                            <input
                              type="date"
                              value={edited.issue_date !== undefined 
                                ? (edited.issue_date || '') 
                                : (doc.issue_date ? (typeof doc.issue_date === 'string' ? doc.issue_date.split('T')[0] : doc.issue_date) : '')}
                              onChange={(e) => handleDateEdit(doc.id, 'issue_date', e.target.value)}
                              className={issueGYear && issueGYear < 2000 ? 'abnormal-input' : ''}
                              style={{ 
                                padding: '0.25rem 0.5rem',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                width: '100%',
                                maxWidth: '200px'
                              }}
                            />
                            {issueGYear && issueGYear < 2000 && (
                              <span style={{ color: 'red', marginLeft: '0.5rem', fontSize: '0.875rem' }}>
                                ⚠️ سنة {issueGYear}
                              </span>
                            )}
                          </div>
                          <div>
                            <label style={{ fontSize: '0.875rem', display: 'block', marginBottom: '0.25rem' }}>
                              هجري (DD/MM/YYYY):
                            </label>
                            <input
                              type="text"
                              placeholder="DD/MM/YYYY"
                              value={edited.issue_date_hijri !== undefined 
                                ? (edited.issue_date_hijri || '') 
                                : (doc.issue_date_hijri || '')}
                              onChange={(e) => handleDateEdit(doc.id, 'issue_date_hijri', e.target.value)}
                              className={issueHYear && issueHYear < 1400 ? 'abnormal-input' : ''}
                              style={{ 
                                padding: '0.25rem 0.5rem',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                width: '100%',
                                maxWidth: '200px'
                              }}
                            />
                            {issueHYear && issueHYear < 1400 && (
                              <span style={{ color: 'red', marginLeft: '0.5rem', fontSize: '0.875rem' }}>
                                ⚠️ سنة {issueHYear}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <div>
                            <label style={{ fontSize: '0.875rem', display: 'block', marginBottom: '0.25rem' }}>
                              ميلادي:
                            </label>
                            <input
                              type="date"
                              value={edited.expiry_date !== undefined 
                                ? (edited.expiry_date || '') 
                                : (doc.expiry_date ? (typeof doc.expiry_date === 'string' ? doc.expiry_date.split('T')[0] : doc.expiry_date) : '')}
                              onChange={(e) => handleDateEdit(doc.id, 'expiry_date', e.target.value)}
                              className={expiryGYear && expiryGYear < 2000 ? 'abnormal-input' : ''}
                              style={{ 
                                padding: '0.25rem 0.5rem',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                width: '100%',
                                maxWidth: '200px'
                              }}
                            />
                            {expiryGYear && expiryGYear < 2000 && (
                              <span style={{ color: 'red', marginLeft: '0.5rem', fontSize: '0.875rem' }}>
                                ⚠️ سنة {expiryGYear}
                              </span>
                            )}
                          </div>
                          <div>
                            <label style={{ fontSize: '0.875rem', display: 'block', marginBottom: '0.25rem' }}>
                              هجري (DD/MM/YYYY):
                            </label>
                            <input
                              type="text"
                              placeholder="DD/MM/YYYY"
                              value={edited.expiry_date_hijri !== undefined 
                                ? (edited.expiry_date_hijri || '') 
                                : (doc.expiry_date_hijri || '')}
                              onChange={(e) => handleDateEdit(doc.id, 'expiry_date_hijri', e.target.value)}
                              className={expiryHYear && expiryHYear < 1400 ? 'abnormal-input' : ''}
                              style={{ 
                                padding: '0.25rem 0.5rem',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                width: '100%',
                                maxWidth: '200px'
                              }}
                            />
                            {expiryHYear && expiryHYear < 1400 && (
                              <span style={{ color: 'red', marginLeft: '0.5rem', fontSize: '0.875rem' }}>
                                ⚠️ سنة {expiryHYear}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {hasChanges && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleSaveDates(doc.id)}
                            disabled={savingDates[doc.id]}
                          >
                            {savingDates[doc.id] ? 'جارٍ الحفظ...' : 'حفظ'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="duplicates-section">
        <h2>مستندات الفروع مع تواريخ ناقصة</h2>
        {loadingBranchDocuments ? (
          <p>جاري التحميل...</p>
        ) : branchDocuments.length === 0 ? (
          <p>✅ جميع مستندات الفروع تحتوي على كلا التقويمين (هجري وميلادي).</p>
        ) : (
          <div className="branch-docs-section">
            <div className="bulk-actions" style={{ marginBottom: '1rem' }}>
              <button
                className="btn btn-primary"
                onClick={handleBulkConvert}
                disabled={selectedBranchDocs.size === 0 || Object.values(convertingDocs).some(v => v)}
              >
                {Object.values(convertingDocs).some(v => v) 
                  ? 'جارٍ التحويل...' 
                  : `تحويل المحدد (${selectedBranchDocs.size})`}
              </button>
              <span style={{ marginLeft: '1rem' }}>
                إجمالي المستندات الناقصة: {branchDocuments.length}
              </span>
            </div>
            <div className="table-container">
              <table className="employees-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={selectedBranchDocs.size === branchDocuments.length && branchDocuments.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedBranchDocs(new Set(branchDocuments.map(d => d.id)));
                          } else {
                            setSelectedBranchDocs(new Set());
                          }
                        }}
                      />
                    </th>
                    <th>الفرع</th>
                    <th>نوع المستند</th>
                    <th>اسم الملف</th>
                    <th>تاريخ الإصدار</th>
                    <th>تاريخ الانتهاء</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {branchDocuments.map((doc) => {
                    const needsIssueConversion = (doc.has_issue_gregorian && !doc.has_issue_hijri) || 
                                                 (doc.has_issue_hijri && !doc.has_issue_gregorian);
                    const needsExpiryConversion = (doc.has_expiry_gregorian && !doc.has_expiry_hijri) || 
                                                   (doc.has_expiry_hijri && !doc.has_expiry_gregorian);
                    const needsConversion = needsIssueConversion || needsExpiryConversion;

                    return (
                      <tr key={doc.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedBranchDocs.has(doc.id)}
                            onChange={() => toggleBranchDoc(doc.id)}
                          />
                        </td>
                        <td>{doc.branch_name}</td>
                        <td>{doc.document_type}</td>
                        <td>{doc.file_name}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <div>
                              ميلادي: {doc.issue_date ? (
                                <span className="valid-badge">{formatDateDisplay(doc.issue_date)}</span>
                              ) : (
                                <span className="missing-badge">❌ مفقود</span>
                              )}
                            </div>
                            <div>
                              هجري: {doc.issue_date_hijri ? (
                                <span className="valid-badge">{doc.issue_date_hijri}</span>
                              ) : (
                                <span className="missing-badge">❌ مفقود</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <div>
                              ميلادي: {doc.expiry_date ? (
                                <span className="valid-badge">{formatDateDisplay(doc.expiry_date)}</span>
                              ) : (
                                <span className="missing-badge">❌ مفقود</span>
                              )}
                            </div>
                            <div>
                              هجري: {doc.expiry_date_hijri ? (
                                <span className="valid-badge">{doc.expiry_date_hijri}</span>
                              ) : (
                                <span className="missing-badge">❌ مفقود</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleConvertDates(doc.id)}
                            disabled={convertingDocs[doc.id] || !needsConversion}
                            title={needsConversion ? 'تحويل التواريخ' : 'لا يحتاج تحويل'}
                          >
                            {convertingDocs[doc.id] ? 'جارٍ...' : 'تحويل'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
