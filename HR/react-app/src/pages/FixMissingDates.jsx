/**
 * Invalid Data Page
 * Page to view and manage employees with invalid/incomplete data
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { adminAPI, employeesAPI, branchesAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import {
  Page, PageHeader, Card, StatCard, Button, Badge, Alert, FormField, Input, DataTable, Pagination, EmptyState, useConfirm,
} from '../ui';
import './FixMissingDates.css';

const FixMissingDates = () => {
  const { isMainManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize] = useState(50);
  const [processing, setProcessing] = useState({});
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
  const [invalidSalaryEmployees, setInvalidSalaryEmployees] = useState([]);
  const [loadingInvalidSalary, setLoadingInvalidSalary] = useState(true);
  const [zeroSalaryEmployees, setZeroSalaryEmployees] = useState([]);
  const [loadingZeroSalary, setLoadingZeroSalary] = useState(true);
  const [notifyingZeroSalary, setNotifyingZeroSalary] = useState({});
  const [notifyingAbnormalDates, setNotifyingAbnormalDates] = useState({});

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
    loadInvalidSalaryEmployees();
    loadZeroSalaryEmployees();
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

  const loadInvalidSalaryEmployees = async () => {
    try {
      setLoadingInvalidSalary(true);
      // Get all employees and branches
      const [employeesResponse, branchesResponse] = await Promise.all([
        employeesAPI.getAll({ page: 1, limit: 10000 }),
        branchesAPI.getAll()
      ]);

      if (employeesResponse.data?.success) {
        const allEmployees = employeesResponse.data.data || [];
        // Build a map of active branches (is_active = true)
        const branchesData = branchesResponse.data?.data || branchesResponse.data || [];
        const activeBranchMap = {};
        branchesData.forEach(branch => {
          if (branch.is_active === true) {
            activeBranchMap[branch.id] = branch.branch_name;
          }
        });

        // Filter employees with salary < 500 (but not 0) or > 15000
        // Total salary = all allowances (no deductions)
        // Only include active employees from active branches
        const invalid = allEmployees.filter(emp => {
          // Check if employee is active (not archived/deleted)
          const isActiveEmployee = !emp.status || emp.status === 'active' || emp.status === 'pending';
          // Check if branch is active (must be in our active branch map)
          const isActiveBranch = emp.branch_id && activeBranchMap[emp.branch_id];

          if (!isActiveEmployee || !isActiveBranch) return false;

          // Use total_salary if available (computed column), otherwise calculate manually
          const total = emp.total_salary != null
            ? parseFloat(emp.total_salary)
            : parseFloat(emp.base_salary || 0) + parseFloat(emp.housing_allowance || 0) +
            parseFloat(emp.transportation_allowance || 0) + parseFloat(emp.end_of_service_allowance || 0) +
            parseFloat(emp.annual_leave_allowance || 0) + parseFloat(emp.other_allowances || 0);
          // Show if: (salary > 0 and < 500) OR (salary > 15000)
          return (total > 0 && total < 500) || total > 15000;
        }).map(emp => ({
          ...emp,
          branch_name: activeBranchMap[emp.branch_id] || 'غير محدد'
        }));
        setInvalidSalaryEmployees(invalid);
      }
    } catch (error) {
      console.error('Error loading invalid salary employees:', error);
      showError(error.response?.data?.message || 'فشل جلب الموظفين ذوي الرواتب غير الصحيحة');
    } finally {
      setLoadingInvalidSalary(false);
    }
  };

  const loadZeroSalaryEmployees = async () => {
    try {
      setLoadingZeroSalary(true);
      // Get all employees and branches
      const [employeesResponse, branchesResponse] = await Promise.all([
        employeesAPI.getAll({ page: 1, limit: 10000 }),
        branchesAPI.getAll()
      ]);

      if (employeesResponse.data?.success) {
        const allEmployees = employeesResponse.data.data || [];
        // Build a map of active branches (is_active = true)
        const branchesData = branchesResponse.data?.data || branchesResponse.data || [];
        const activeBranchMap = {};
        branchesData.forEach(branch => {
          if (branch.is_active === true) {
            activeBranchMap[branch.id] = branch.branch_name;
          }
        });

        // Filter employees with 0 total salary (all salary fields = 0)
        // Only include active employees from active branches
        const zeroSalary = allEmployees.filter(emp => {
          // Check if employee is active (not archived/deleted)
          const isActiveEmployee = !emp.status || emp.status === 'active' || emp.status === 'pending';
          // Check if branch is active (must be in our active branch map)
          const isActiveBranch = emp.branch_id && activeBranchMap[emp.branch_id];

          if (!isActiveEmployee || !isActiveBranch) return false;

          // Use total_salary if available (computed column), otherwise calculate manually
          const total = emp.total_salary != null
            ? parseFloat(emp.total_salary)
            : parseFloat(emp.base_salary || 0) + parseFloat(emp.housing_allowance || 0) +
            parseFloat(emp.transportation_allowance || 0) + parseFloat(emp.end_of_service_allowance || 0) +
            parseFloat(emp.annual_leave_allowance || 0) + parseFloat(emp.other_allowances || 0);
          return total === 0;
        }).map(emp => ({
          ...emp,
          branch_name: activeBranchMap[emp.branch_id] || 'غير محدد'
        }));
        setZeroSalaryEmployees(zeroSalary);
      }
    } catch (error) {
      console.error('Error loading zero salary employees:', error);
      showError(error.response?.data?.message || 'فشل جلب الموظفين ذوي الرواتب الصفرية');
    } finally {
      setLoadingZeroSalary(false);
    }
  };

  const handleNotifyZeroSalaryBranch = async (branchId, branchName) => {
    try {
      setNotifyingZeroSalary(prev => ({ ...prev, [branchId]: true }));

      // Get employees for this branch with zero salary
      const branchEmployees = zeroSalaryEmployees.filter(emp => emp.branch_id === branchId);
      const employeeNames = branchEmployees.map(emp => emp.name).join('، ');

      // Create notification with 1 day response time
      await api.post('/notifications', {
        branch_id: branchId,
        title: 'تنبيه: موظفين بدون راتب',
        message: `يوجد ${branchEmployees.length} موظف/ة بدون راتب محدد. يرجى تحديث بيانات الراتب للموظفين التاليين: ${employeeNames}`,
        type: 'warning',
        response_days: 1
      });

      showSuccess(`تم إرسال التنبيه إلى فرع ${branchName} بنجاح`);
    } catch (error) {
      console.error('Error sending notification:', error);
      showError(error.response?.data?.message || 'فشل إرسال التنبيه');
    } finally {
      setNotifyingZeroSalary(prev => ({ ...prev, [branchId]: false }));
    }
  };

  const handleNotifyAbnormalDatesBranch = async (branchId, branchName) => {
    try {
      setNotifyingAbnormalDates(prev => ({ ...prev, [branchId]: true }));

      // Get docs for this branch with abnormal dates
      const branchDocs = abnormalDates.filter(doc => doc.branch_id === branchId);
      const docTypes = [...new Set(branchDocs.map(doc => doc.document_type))].join('، ');

      // Create notification with 1 day response time
      await api.post('/notifications', {
        branch_id: branchId,
        title: 'تنبيه: مستندات بتواريخ غير طبيعية',
        message: `يوجد ${branchDocs.length} مستند/ات بتواريخ غير طبيعية (سنة أقل من 2000 ميلادي أو 1400 هجري). أنواع المستندات: ${docTypes}. يرجى مراجعة وتصحيح التواريخ.`,
        type: 'warning',
        response_days: 1
      });

      showSuccess(`تم إرسال التنبيه إلى فرع ${branchName} بنجاح`);
    } catch (error) {
      console.error('Error sending notification:', error);
      showError(error.response?.data?.message || 'فشل إرسال التنبيه');
    } finally {
      setNotifyingAbnormalDates(prev => ({ ...prev, [branchId]: false }));
    }
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

  const askNotify = async (employee) => {
    const ok = await confirm({
      title: 'إشعار الفرع',
      message: `هل أنت متأكد من إرسال إشعار للفرع (${employee.branch_name || '—'}) بخصوص الموظف ${[employee.first_name, employee.second_name, employee.third_name, employee.fourth_name].filter(Boolean).join(' ')}؟${employee.invalid_fields?.length ? `\n\nالمجالات غير الصحيحة: ${employee.invalid_fields.join('، ')}` : ''}`,
      confirmText: 'إرسال',
    });
    if (ok) await handleNotify(employee);
  };

  const askDelete = async (employee) => {
    const ok = await confirm({
      title: 'حذف الموظف',
      message: `هل أنت متأكد من حذف الموظف ${[employee.first_name, employee.second_name, employee.third_name, employee.fourth_name].filter(Boolean).join(' ')}؟\nهذا الإجراء لا يمكن التراجع عنه.`,
      tone: 'danger',
      confirmText: 'حذف',
    });
    if (ok) await handleDelete(employee);
  };

  const askDeletePaperDocs = async () => {
    const ok = await confirm({
      title: 'حذف التأمين الطبي',
      message: `سيتم حذف مستندات التأمين الطبي لـ ${selectedPaperEmployees.size} موظف. لا يمكن التراجع عن هذا الإجراء.`,
      tone: 'danger',
      confirmText: 'حذف',
    });
    if (ok) await handleDeletePaperDocs();
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

  const fullName = (e) => [e.first_name, e.second_name, e.third_name, e.fourth_name].filter(Boolean).join(' ');
  const dateOnly = (v) => (v ? String(v).split('T')[0] : '—');
  const money = (v) => (parseFloat(v) || 0).toFixed(2);
  const groupBy = (rows, idKey, nameKey) => Object.values(rows.reduce((acc, row) => {
    const id = row[idKey] || 'unknown';
    if (!acc[id]) acc[id] = { id, name: row[nameKey] || 'غير محدد', rows: [] };
    acc[id].rows.push(row);
    return acc;
  }, {}));

  if (!isMainManager()) {
    return (
      <Page>
        <PageHeader title="البيانات غير الدقيقة" />
        <Alert tone="warning">هذه الصفحة متاحة فقط للمدير الرئيسي</Alert>
      </Page>
    );
  }

  const totalPages = Math.ceil(totalCount / pageSize);
  const salaryTotal = (e) => (e.total_salary != null
    ? parseFloat(e.total_salary)
    : ['base_salary', 'housing_allowance', 'transportation_allowance', 'end_of_service_allowance', 'annual_leave_allowance', 'other_allowances']
      .reduce((sum, k) => sum + (parseFloat(e[k]) || 0), 0));
  const allowancesTotal = (e) => salaryTotal(e) - (parseFloat(e.base_salary) || 0);
  const totalProblems = duplicates.length + duplicateDocs.length + abnormalDates.length + branchDocuments.length
    + paperContractDocs.length + invalidSalaryEmployees.length + zeroSalaryEmployees.length + employees.length;
  const nothingFound = !loading && totalProblems === 0 && !loadingDuplicates && !loadingDuplicateDocs && !loadingAbnormalDates;

  const employeeLink = (e) => <Button variant="link" onClick={() => navigate(`/employees/${e.id}`)}>{fullName(e)}</Button>;
  const missingBadge = <Badge tone="danger">مفقود</Badge>;
  const dateCell = (g, h) => (
    <div className="fm-dates">
      <span><small>ميلادي</small> {g ? <Badge tone="success">{dateOnly(g)}</Badge> : missingBadge}</span>
      <span><small>هجري</small> {h ? <Badge tone="success">{h}</Badge> : missingBadge}</span>
    </div>
  );

  const employeeColumns = [
    { key: 'id', header: 'ID', width: '4rem', mobileHidden: true },
    { key: 'name', header: 'الموظف', mobilePrimary: true, render: employeeLink },
    { key: 'num', header: 'الرقم الوظيفي', mobileHidden: true, render: (e) => e.employee_id_number || '—' },
    { key: 'branch', header: 'الفرع', render: (e) => e.branch_name || '—' },
    { key: 'nat', header: 'الجنسية', mobileHidden: true, render: (e) => e.nationality || '—' },
    { key: 'dob', header: 'تاريخ الميلاد', render: (e) => dateCell(e.date_of_birth_gregorian, e.date_of_birth_hijri) },
    {
      key: 'age', header: 'العمر', align: 'center',
      render: (e) => (e.age !== null && e.age !== undefined
        ? <Badge tone={e.is_invalid_age ? 'danger' : 'neutral'}>{e.age} سنة</Badge> : '—'),
    },
    {
      key: 'fields', header: 'المجالات الناقصة',
      render: (e) => (e.invalid_fields?.length > 0 ? (
        <div className="fm-chips">
          {e.invalid_fields.slice(0, 3).map((f) => <Badge key={f} tone="warning">{f}</Badge>)}
          {e.invalid_fields.length > 3 && <Badge tone="neutral">+{e.invalid_fields.length - 3}</Badge>}
        </div>
      ) : <Badge tone="success">لا توجد</Badge>),
    },
    {
      key: 'actions', header: '', align: 'end',
      render: (e) => (
        <div className="fm-actions">
          <Button size="sm" variant="primary" icon="edit" disabled={processing[e.id]} onClick={() => handleEdit(e)}>تعديل</Button>
          <Button size="sm" variant="warning" icon="bell" disabled={processing[e.id]} onClick={() => askNotify(e)}>إشعار الفرع</Button>
          <Button size="sm" variant="danger" icon="trash" disabled={processing[e.id]} onClick={() => askDelete(e)}>حذف</Button>
        </div>
      ),
    },
  ];

  const salaryColumns = (withBranch) => [
    { key: 'id', header: 'ID', width: '4rem', mobileHidden: true },
    { key: 'name', header: 'الموظف', mobilePrimary: true, render: employeeLink },
    ...(withBranch ? [{ key: 'branch', header: 'الفرع', render: (e) => e.branch_name || '—' }] : []),
    { key: 'base', header: 'الراتب الأساسي', align: 'center', render: (e) => money(e.base_salary) },
    { key: 'allow', header: 'البدلات', align: 'center', render: (e) => money(allowancesTotal(e)) },
    ...(withBranch ? [
      { key: 'total', header: 'الإجمالي', align: 'center', render: (e) => <strong>{money(salaryTotal(e))}</strong> },
      { key: 'status', header: 'الحالة', render: (e) => (salaryTotal(e) < 500 ? <Badge tone="danger">منخفض جداً (&lt; 500)</Badge> : <Badge tone="info">مرتفع جداً (&gt; 15000)</Badge>) },
    ] : []),
    { key: 'edit', header: '', align: 'end', render: (e) => <Button size="sm" variant="primary" icon="edit" onClick={() => navigate(`/employees/${e.id}`)}>تعديل</Button> },
  ];

  const branchDocColumns = [
    { key: 'branch', header: 'الفرع', mobilePrimary: true, render: (d) => d.branch_name },
    { key: 'type', header: 'نوع المستند', render: (d) => d.document_type },
    { key: 'file', header: 'اسم الملف', mobileHidden: true, render: (d) => <bdi>{d.file_name}</bdi> },
    { key: 'issue', header: 'تاريخ الإصدار', render: (d) => dateCell(d.issue_date, d.issue_date_hijri) },
    { key: 'expiry', header: 'تاريخ الانتهاء', render: (d) => dateCell(d.expiry_date, d.expiry_date_hijri) },
    {
      key: 'convert', header: '', align: 'end',
      render: (d) => {
        const needs = (d.has_issue_gregorian !== d.has_issue_hijri) || (d.has_expiry_gregorian !== d.has_expiry_hijri);
        return <Button size="sm" variant="primary" icon="refresh" loading={convertingDocs[d.id]} disabled={!needs} onClick={() => handleConvertDates(d.id)}>تحويل</Button>;
      },
    },
  ];

  /** Editable Gregorian + Hijri pair for one document date, flagging implausible years. */
  const dateEditor = (doc, gKey, hKey) => {
    const edited = editingDates[doc.id] || {};
    const gValue = edited[gKey] !== undefined ? (edited[gKey] || '') : dateOnly(doc[gKey]).replace('—', '');
    const hValue = edited[hKey] !== undefined ? (edited[hKey] || '') : (doc[hKey] || '');
    const gYear = getYearFromGregorian(doc[gKey]);
    const hYear = getYearFromHijri(doc[hKey]);
    return (
      <div className="fm-editor">
        <FormField label="ميلادي" error={gYear && gYear < 2000 ? `سنة ${gYear}` : undefined}>
          <Input type="date" value={gValue} onChange={(e) => handleDateEdit(doc.id, gKey, e.target.value)} />
        </FormField>
        <FormField label="هجري (DD/MM/YYYY)" error={hYear && hYear < 1400 ? `سنة ${hYear}` : undefined}>
          <Input placeholder="DD/MM/YYYY" dir="ltr" value={hValue} onChange={(e) => handleDateEdit(doc.id, hKey, e.target.value)} />
        </FormField>
      </div>
    );
  };

  const abnormalColumns = [
    { key: 'type', header: 'نوع المستند', mobilePrimary: true, render: (d) => d.document_type },
    { key: 'file', header: 'اسم الملف', mobileHidden: true, render: (d) => <bdi>{d.file_name}</bdi> },
    { key: 'issue', header: 'تاريخ الإصدار', render: (d) => dateEditor(d, 'issue_date', 'issue_date_hijri') },
    { key: 'expiry', header: 'تاريخ الانتهاء', render: (d) => dateEditor(d, 'expiry_date', 'expiry_date_hijri') },
    {
      key: 'save', header: '', align: 'end',
      render: (d) => (Object.keys(editingDates[d.id] || {}).length > 0
        ? <Button size="sm" variant="primary" icon="check" loading={savingDates[d.id]} onClick={() => handleSaveDates(d.id)}>حفظ</Button> : null),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="البيانات غير الدقيقة"
        subtitle="سجلات ومستندات تحتاج مراجعة: مكررات، تواريخ ناقصة أو غير طبيعية، ورواتب غير منطقية"
      />

      <div className="ui-grid-stats">
        <StatCard label="إجمالي المشاكل" value={totalProblems} icon="alert" tone={totalProblems ? 'warning' : 'success'} loading={loading} />
        <StatCard label="سجلات مكررة" value={duplicates.length + duplicateDocs.length} icon="users" tone="primary" loading={loadingDuplicates} />
        <StatCard label="تواريخ مستندات" value={abnormalDates.length + branchDocuments.length} icon="calendar" tone="danger" loading={loadingAbnormalDates} />
        <StatCard label="رواتب غير صحيحة" value={invalidSalaryEmployees.length + zeroSalaryEmployees.length} icon="wallet" tone="warning" loading={loadingInvalidSalary} />
      </div>

      {nothingFound && <Card><EmptyState icon="check-circle" title="لا توجد بيانات تحتاج إلى مراجعة" /></Card>}

      {!loadingDuplicates && duplicates.length > 0 && (
        <Card title="سجلات مكررة (الاسم + تاريخ الميلاد)" subtitle="اختر السجل الذي يُبقى؛ تُدمج بقية السجلات فيه ثم تُحذف">
          <div className="fm-clusters">
            {duplicates.map((cluster, idx) => {
              const keepId = selectedCanonicals[idx] || cluster.ids[0];
              return (
                <div key={idx} className="fm-cluster">
                  <div className="fm-cluster-head"><strong>مجموعة #{idx + 1}</strong><Badge tone="neutral">{cluster.ids.length} سجلات</Badge></div>
                  {cluster.employees?.map((emp) => (
                    <label key={emp.id} className="fm-pick">
                      <input type="radio" name={`canonical-${idx}`} checked={selectedCanonicals[idx] === emp.id} onChange={() => setSelectedCanonicals((prev) => ({ ...prev, [idx]: emp.id }))} />
                      <span>
                        <strong>{fullName(emp)}</strong>
                        <span className="fm-meta">معرف: <bdi>{emp.id}</bdi> · الهوية: <bdi>{emp.id_or_residency_number || '—'}</bdi> · الميلاد: <bdi>{formatDob(emp.date_of_birth_gregorian)}</bdi></span>
                      </span>
                    </label>
                  ))}
                  <div><Button variant="primary" icon="transfer" loading={mergeProcessing[keepId]} onClick={() => handleMergeDuplicates(cluster, idx)}>دمج وحذف المكررات</Button></div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {!loadingDuplicateDocs && duplicateDocs.length > 0 && (
        <Card title="مستندات مكررة حسب النوع" subtitle="باستثناء الأنواع المسموح بتعددها. اختر المستند الذي يُبقى">
          <div className="fm-clusters">
            {duplicateDocs.map((row, idx) => {
              const key = `${row.employee_id}:${row.document_type}`;
              const selectedKeepId = mergeDocProcessing[key] || null;
              return (
                <div key={idx} className="fm-cluster">
                  <div className="fm-cluster-head">
                    <strong>موظف #{row.employee_id}</strong><Badge tone="info">{row.document_type}</Badge><Badge tone="neutral">عدد: {row.doc_count}</Badge>
                  </div>
                  {row.documents?.map((doc) => (
                    <label key={doc.id} className="fm-pick">
                      <input type="radio" name={`doc-${row.employee_id}-${row.document_type}`} checked={selectedKeepId === doc.id} onChange={() => setMergeDocProcessing((prev) => ({ ...prev, [key]: doc.id }))} />
                      <span>
                        <strong><bdi>{doc.file_name || 'غير مسمى'}</bdi></strong>
                        <span className="fm-meta">معرف: <bdi>{doc.id}</bdi> · الرفع: {dateOnly(doc.uploaded_at)} · نشط: {doc.is_active ? 'نعم' : 'لا'}</span>
                      </span>
                    </label>
                  ))}
                  <div><Button variant="primary" icon="transfer" loading={mergeDocProcessing[row.employee_id] === true} disabled={!selectedKeepId} onClick={() => handleMergeDocs(row.employee_id, row.document_type, selectedKeepId)}>دمج وحذف المكررات</Button></div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {!loadingAbnormalDates && abnormalDates.length > 0 && groupBy(abnormalDates, 'branch_id', 'branch_name').map((group) => (
        <Card
          key={group.id}
          title={`تواريخ غير طبيعية · ${group.name}`}
          subtitle={`${group.rows.length} مستند · سنوات أقل من 2000 ميلادي أو 1400 هجري`}
          actions={<Button size="sm" variant="warning" icon="bell" loading={notifyingAbnormalDates[group.id]} onClick={() => handleNotifyAbnormalDatesBranch(parseInt(group.id, 10), group.name)}>تنبيه الفرع</Button>}
          flush
        >
          <DataTable columns={abnormalColumns} rows={group.rows} rowKey="id" />
        </Card>
      ))}

      {!loadingBranchDocuments && branchDocuments.length > 0 && (
        <Card
          title="مستندات الفروع مع تواريخ ناقصة"
          subtitle={`إجمالي المستندات الناقصة: ${branchDocuments.length}`}
          actions={<Button size="sm" variant="primary" icon="refresh" disabled={selectedBranchDocs.size === 0 || Object.values(convertingDocs).some(Boolean)} onClick={handleBulkConvert}>تحويل المحدد ({selectedBranchDocs.size})</Button>}
          flush
        >
          <DataTable columns={branchDocColumns} rows={branchDocuments} rowKey="id" selectable selectedKeys={selectedBranchDocs} onSelectionChange={setSelectedBranchDocs} />
        </Card>
      )}

      {!loadingPaperContractDocs && paperContractDocs.length > 0 && (
        <Card
          title="مستندات التأمين الطبي لموظفي العقد الورقي"
          subtitle="حدّد الموظفين لحذف مستندات التأمين الطبي"
          actions={<Button size="sm" variant="danger" icon="trash" loading={processingPaperDelete} disabled={selectedPaperEmployees.size === 0} onClick={askDeletePaperDocs}>حذف للمحددين ({selectedPaperEmployees.size})</Button>}
        >
          <div className="fm-clusters">
            {paperContractDocs.map((row, idx) => (
              <div key={idx} className="fm-cluster">
                <label className="fm-cluster-head">
                  <input type="checkbox" checked={selectedPaperEmployees.has(row.employee_id)} onChange={() => togglePaperEmployee(row.employee_id)} />
                  <strong>موظف #{row.employee_id}</strong>
                  <Badge tone="info">العقد: {row.contract_type}</Badge>
                  <Badge tone="neutral">المستندات: {row.documents?.length || 0}</Badge>
                </label>
                {row.documents?.map((doc) => (
                  <div key={doc.id} className="fm-pick">
                    <span>
                      <strong><bdi>{doc.file_name || 'غير مسمى'}</bdi></strong>
                      <span className="fm-meta">معرف: <bdi>{doc.id}</bdi> · الرفع: {dateOnly(doc.uploaded_at)}</span>
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}

      {!loadingInvalidSalary && invalidSalaryEmployees.length > 0 && (
        <Card title="موظفون برواتب غير صحيحة" subtitle="رواتب أقل من 500 ريال (باستثناء الصفر) أو أكثر من 15000 ريال" flush>
          <DataTable columns={salaryColumns(true)} rows={invalidSalaryEmployees} rowKey="id" />
        </Card>
      )}

      {!loadingZeroSalary && zeroSalaryEmployees.length > 0 && groupBy(zeroSalaryEmployees, 'branch_id', 'branch_name').map((group) => (
        <Card
          key={group.id}
          title={`موظفون براتب صفر · ${group.name}`}
          subtitle={`${group.rows.length} موظف · الراتب الأساسي + البدلات = 0`}
          actions={<Button size="sm" variant="warning" icon="bell" loading={notifyingZeroSalary[group.id]} onClick={() => handleNotifyZeroSalaryBranch(parseInt(group.id, 10), group.name)}>تنبيه الفرع</Button>}
          flush
        >
          <DataTable columns={salaryColumns(false)} rows={group.rows} rowKey="id" />
        </Card>
      ))}

      {employees.length > 0 && (
        <Card title="موظفون ببيانات ناقصة أو غير صحيحة" subtitle="تواريخ ميلاد مفقودة أو أعمار غير منطقية" flush>
          <DataTable columns={employeeColumns} rows={employees} rowKey="id" rowClassName={(e) => (e.is_invalid_age ? 'fm-invalid-row' : '')} />
          {totalPages > 1 && (
            <Pagination page={currentPage + 1} pageSize={pageSize} total={totalCount} onPageChange={(p) => setCurrentPage(p - 1)} pageSizeOptions={[pageSize]} />
          )}
        </Card>
      )}
    </Page>
  );
};

export default FixMissingDates;
