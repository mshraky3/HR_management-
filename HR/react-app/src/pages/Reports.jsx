/**
 * Reports Page
 * Generate PDF reports based on employee filters and selected fields
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { reportsAPI, branchesAPI, employeesAPI, branchDocumentsAPI, setBranchDocumentsPassword } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import NationalitySelect from '../components/NationalitySelect';
import BankSelect from '../components/BankSelect';
import './TablePage.css';
import './Reports.css';

const Reports = () => {
  const { isMainManager, user } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isPasswordVerified, setIsPasswordVerified] = useState(false);
  const [currentBranchId, setCurrentBranchId] = useState(null);
  // For main manager: support multiple branch selection
  const [selectedBranchIds, setSelectedBranchIds] = useState([]);
  const [selectAllBranches, setSelectAllBranches] = useState(false);
  const [branchTypeFilter, setBranchTypeFilter] = useState([]); // For main manager: filter by branch type
  
  // Form state
  const [reportTitle, setReportTitle] = useState('');
  const [fileType, setFileType] = useState('pdf'); // 'pdf' or 'excel'
  const [filters, setFilters] = useState({
    nationality: [],
    job_title: [],
    gender: [],
    marital_status: [],
    educational_qualification: [],
    contract_type: [],
    data_completion_status: [],
    min_age: '',
    max_age: '',
  });
  
  const [selectedFields, setSelectedFields] = useState([
    'full_name',
    'employee_id_number',
    'id_or_residency_number',
    'nationality',
  ]);
  
  // Available fields for selection
  const availableFields = [
    { value: 'employee_id_number', label: 'رقم الموظف' },
    { value: 'full_name', label: 'الاسم الكامل' },
    { value: 'first_name', label: 'الاسم الأول' },
    { value: 'second_name', label: 'الاسم الثاني' },
    { value: 'third_name', label: 'الاسم الثالث' },
    { value: 'fourth_name', label: 'الاسم الرابع' },
    { value: 'branch_id', label: 'الفرع' },
    { value: 'occupation', label: 'المهنة' },
    { value: 'job_title', label: 'المسمى الوظيفي' },
    { value: 'nationality', label: 'الجنسية' },
    { value: 'date_of_birth_hijri', label: 'تاريخ الميلاد (هجري)' },
    { value: 'date_of_birth_gregorian', label: 'تاريخ الميلاد (ميلادي)' },
    { value: 'age', label: 'العمر' },
    { value: 'id_or_residency_number', label: 'رقم الهوية/الإقامة' },
    { value: 'id_type', label: 'نوع الهوية' },
    { value: 'gender', label: 'الجنس' },
    { value: 'id_expiry_date_hijri', label: 'تاريخ انتهاء الهوية (هجري)' },
    { value: 'id_expiry_date_gregorian', label: 'تاريخ انتهاء الهوية (ميلادي)' },
    { value: 'religion', label: 'الدين' },
    { value: 'marital_status', label: 'الحالة الاجتماعية' },
    { value: 'educational_qualification', label: 'المؤهل التعليمي' },
    { value: 'specialization', label: 'التخصص' },
    { value: 'bank_iban', label: 'الآيبان' },
    { value: 'bank_name', label: 'اسم البنك' },
    { value: 'email', label: 'البريد الإلكتروني' },
    { value: 'phone_number', label: 'رقم الهاتف' },
    { value: 'national_address', label: 'العنوان الوطني' },
    { value: 'contract_type', label: 'نوع العقد' },
    { value: 'years_of_experience_in_same_institution', label: 'سنوات الخبرة في نفس المؤسسة' },
    { value: 'years_of_experience_in_company', label: 'سنوات الخبرة في الشركة' },
    { value: 'salary', label: 'الراتب' },
    { value: 'base_salary', label: 'الراتب الأساسي' },
    { value: 'housing_allowance', label: 'بدل السكن' },
    { value: 'transportation_allowance', label: 'بدل المواصلات' },
    { value: 'end_of_service_allowance', label: 'بدل نهاية الخدمة' },
    { value: 'annual_leave_allowance', label: 'بدل الإجازة السنوية' },
    { value: 'other_allowances', label: 'بدلات أخرى' },
    { value: 'deductions', label: 'الخصومات' },
    { value: 'graduation_year', label: 'سنة التخرج' },
    { value: 'university_gpa', label: 'المعدل التراكمي' },
    { value: 'passport_number', label: 'رقم الجواز' },
    { value: 'passport_issue_date', label: 'تاريخ إصدار الجواز' },
    { value: 'passport_expiry_date', label: 'تاريخ انتهاء الجواز' },
    { value: 'passport_issue_place', label: 'مكان إصدار الجواز' },
    { value: 'residency_issue_date', label: 'تاريخ إصدار الإقامة' },
    { value: 'data_completion_status', label: 'حالة إكمال البيانات' },
  ];
  
  // Get unique values for filters
  const [filterOptions, setFilterOptions] = useState({
    nationalities: [],
    jobTitles: [],
    genders: ['male', 'female'],
    maritalStatuses: [],
    educationalQualifications: [],
    contractTypes: [],
    dataCompletionStatuses: ['complete', 'incomplete'],
  });

  const loadBranches = async () => {
    try {
      const filters = { is_active: true };
      
      if (!isMainManager() && user?.branch_id) {
        filters.id = user.branch_id;
      } else if (isMainManager() && branchTypeFilter.length > 0) {
        // Filter by branch type for main manager
        if (branchTypeFilter.length === 1) {
          filters.branch_type = branchTypeFilter[0];
        }
        // If both types selected, don't filter (show all)
      }
      
      const response = await branchesAPI.getAll(filters);
      if (response.data.success) {
        setBranches(response.data.data);
        if (!isMainManager() && user?.branch_id) {
          setCurrentBranchId(user.branch_id);
          setIsPasswordVerified(false);
          setShowPasswordModal(true);
        }
      }
    } catch (error) {
      console.error('Error loading branches:', error);
    }
  };

  const loadFilterOptions = async () => {
    try {
      const filters = { is_active: true };
      
      if (!isMainManager() && user?.branch_id) {
        filters.branch_id = user.branch_id;
      } else if (isMainManager() && !selectAllBranches && selectedBranchIds.length > 0) {
        // For main manager: filter by selected branches (only if not selecting all)
        filters.branch_id = selectedBranchIds;
      }
      // If selectAllBranches is true, don't filter by branch_id (get all employees)
      
      const response = await employeesAPI.getAll(filters);
      if (response.data.success) {
        const employees = response.data.data || [];
        
        // Extract unique values
        const nationalities = [...new Set(employees.map(e => e.nationality).filter(Boolean))];
        const jobTitles = [...new Set(employees.map(e => e.job_title).filter(Boolean))];
        const maritalStatuses = [...new Set(employees.map(e => e.marital_status).filter(Boolean))];
        const educationalQualifications = [...new Set(employees.map(e => e.educational_qualification).filter(Boolean))];
        const contractTypes = [...new Set(employees.map(e => e.contract_type).filter(Boolean))];
        
        setFilterOptions({
          nationalities: nationalities.sort(),
          jobTitles: jobTitles.sort(),
          genders: ['male', 'female'],
          maritalStatuses: maritalStatuses.sort(),
          educationalQualifications: educationalQualifications.sort(),
          contractTypes: contractTypes.sort(),
          dataCompletionStatuses: ['complete', 'incomplete'],
        });
      }
    } catch (error) {
      console.error('Error loading filter options:', error);
    }
  };

  useEffect(() => {
    loadBranches();
  }, [branchTypeFilter, isMainManager, user]);

  useEffect(() => {
    loadFilterOptions();
  }, [selectedBranchIds, selectAllBranches, isMainManager, user]);

  useEffect(() => {
    if (isMainManager() && branches.length > 0) {
      const branchIdFromUrl = searchParams.get('branch_id');
      if (branchIdFromUrl) {
        const branchId = parseInt(branchIdFromUrl);
        setCurrentBranchId(branchId);
        setSelectedBranchIds([branchId]);
        setSelectAllBranches(false);
        // Main manager doesn't need password verification
        setIsPasswordVerified(true);
        setShowPasswordModal(false);
      } else {
        setIsPasswordVerified(false);
        setCurrentBranchId(null);
        setSelectedBranchIds([]);
        setSelectAllBranches(false);
        setShowPasswordModal(false);
      }
    }
  }, [searchParams, isMainManager, branches]);

  const getCurrentBranchId = useCallback(() => {
    return currentBranchId || 
           (!isMainManager() && user?.branch_id ? user.branch_id : null) ||
           (isMainManager() ? parseInt(searchParams.get('branch_id') || '0') || null : null);
  }, [currentBranchId, isMainManager, user, searchParams]);

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    
    if (!password.trim()) {
      setPasswordError('الرجاء إدخال كلمة المرور');
      return;
    }

    const targetBranchId = getCurrentBranchId();
    if (!targetBranchId) {
      setPasswordError('الرجاء تحديد الفرع أولاً');
      return;
    }

    try {
      const response = await branchDocumentsAPI.verifyPassword(targetBranchId, password);
      if (response.data.success) {
        setBranchDocumentsPassword(targetBranchId, password);
        setIsPasswordVerified(true);
        setShowPasswordModal(false);
        setCurrentBranchId(targetBranchId);
        setPassword('');
      }
    } catch (error) {
      setPasswordError(error.response?.data?.message || 'كلمة المرور غير صحيحة');
    }
  };

  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
  };

  const handleFilterToggle = (filterName, itemValue) => {
    setFilters(prev => {
      const currentValues = prev[filterName] || [];
      if (Array.isArray(currentValues)) {
        if (currentValues.includes(itemValue)) {
          return {
            ...prev,
            [filterName]: currentValues.filter(v => v !== itemValue)
          };
        } else {
          return {
            ...prev,
            [filterName]: [...currentValues, itemValue]
          };
        }
      }
      return prev;
    });
  };

  const handleSelectAll = (filterName, allOptions) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: [...allOptions]
    }));
  };

  const handleDeselectAll = (filterName) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: []
    }));
  };

  const handleSelectAllToggle = (filterName, allOptions) => {
    setFilters(prev => {
      const currentValues = prev[filterName] || [];
      const allSelected = allOptions.every(opt => currentValues.includes(opt));
      
      if (allSelected) {
        // Deselect all
        return {
          ...prev,
          [filterName]: []
        };
      } else {
        // Select all
        return {
          ...prev,
          [filterName]: [...allOptions]
        };
      }
    });
  };

  const isAllSelected = (filterName, allOptions) => {
    const currentValues = filters[filterName] || [];
    return allOptions.length > 0 && allOptions.every(opt => currentValues.includes(opt));
  };

  const handleFieldToggle = (fieldValue) => {
    setSelectedFields(prev => {
      if (prev.includes(fieldValue)) {
        return prev.filter(f => f !== fieldValue);
      } else {
        return [...prev, fieldValue];
      }
    });
  };

  const handleGenerateReport = async (e) => {
    e.preventDefault();
    
    if (!reportTitle.trim()) {
      showWarning('الرجاء إدخال عنوان التقرير');
      return;
    }
    
    if (selectedFields.length === 0) {
      showWarning('الرجاء اختيار حقل واحد على الأقل للعرض');
      return;
    }
    
    // For main manager: check if branches are selected
    if (isMainManager()) {
      if (!selectAllBranches && selectedBranchIds.length === 0) {
        showWarning('الرجاء تحديد فرع واحد على الأقل أو اختيار كل الفروع');
        return;
      }
    } else {
      const targetBranchId = getCurrentBranchId();
      if (!targetBranchId) {
        showWarning('الرجاء تحديد الفرع');
        return;
      }
    }
    
    // Main manager doesn't need password verification
    if (!isMainManager() && !isPasswordVerified) {
      setShowPasswordModal(true);
      return;
    }
    
    try {
      setGenerating(true);
      
      // Clean filters - remove empty arrays and empty strings
      const cleanFilters = {};
      Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (Array.isArray(value) && value.length > 0) {
          cleanFilters[key] = value;
        } else if (!Array.isArray(value) && value !== '' && value !== null && value !== undefined) {
          cleanFilters[key] = value;
        }
      });
      
      // Convert age strings to numbers
      if (cleanFilters.min_age) {
        cleanFilters.min_age = parseInt(cleanFilters.min_age);
      }
      if (cleanFilters.max_age) {
        cleanFilters.max_age = parseInt(cleanFilters.max_age);
      }
      
      // Prepare branch IDs for main manager
      let branchIds = null;
      if (isMainManager()) {
        if (selectAllBranches) {
          branchIds = branches.map(b => b.id);
        } else {
          branchIds = selectedBranchIds;
        }
      } else {
        branchIds = [getCurrentBranchId()];
      }
      
      const response = await reportsAPI.generate({
        title: reportTitle,
        filters: cleanFilters,
        selectedFields: selectedFields,
        branch_ids: branchIds, // Send as array for main manager
        branch_id: !isMainManager() ? getCurrentBranchId() : undefined, // Keep for backward compatibility
        fileType: fileType // Send file type (pdf or excel)
      }, {
        responseType: 'blob'
      });
      
      // Create blob and download based on file type
      const mimeType = fileType === 'excel' 
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf';
      const fileExtension = fileType === 'excel' ? 'xlsx' : 'pdf';
      
      const blob = new Blob([response.data], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${reportTitle}.${fileExtension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      showSuccess('تم إنشاء التقرير بنجاح');
      
    } catch (error) {
      console.error('Error generating report:', error);
      showError(error.response?.data?.message || 'فشل إنشاء التقرير');
    } finally {
      setGenerating(false);
    }
  };

  const getGenderLabel = (value) => {
    return value === 'male' ? 'ذكر' : 'أنثى';
  };

  const getDataCompletionStatusLabel = (value) => {
    return value === 'complete' ? 'مكتمل' : 'غير مكتمل';
  };

  // Only show password modal for branch managers, not main manager
  if (!isMainManager() && !isPasswordVerified && getCurrentBranchId()) {
    return (
      <div className="table-page">
        {showPasswordModal && (
          <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2>إدخال كلمة المرور</h2>
              <p>هذه الصفحة تتطلب كلمة مرور للوصول</p>
              <form onSubmit={handlePasswordSubmit}>
                <div className="form-group">
                  <label>كلمة المرور:</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="أدخل كلمة المرور"
                    autoFocus
                  />
                  {passwordError && <div className="error-message">{passwordError}</div>}
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary">تأكيد</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowPasswordModal(false)}>
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="table-page">
      <div className="page-header">
        <h1> التقارير</h1>
      </div>

      {isMainManager() && (
        <div className="form-section">
          <h2>اختيار الفروع</h2>
          
          {/* Branch Type Filter */}
          <div className="branch-type-filter">
            <label className="filter-header-label">نوع الفرع:</label>
            <div className="branch-type-options">
              <label className="branch-type-checkbox-label">
                <input
                  type="checkbox"
                  checked={branchTypeFilter.includes('school')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setBranchTypeFilter([...branchTypeFilter, 'school']);
                    } else {
                      setBranchTypeFilter(branchTypeFilter.filter(t => t !== 'school'));
                    }
                    // Reset branch selection when type filter changes
                    setSelectedBranchIds([]);
                    setSelectAllBranches(false);
                  }}
                />
                <span>مدارس</span>
              </label>
              <label className="branch-type-checkbox-label">
                <input
                  type="checkbox"
                  checked={branchTypeFilter.includes('healthcare_center')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setBranchTypeFilter([...branchTypeFilter, 'healthcare_center']);
                    } else {
                      setBranchTypeFilter(branchTypeFilter.filter(t => t !== 'healthcare_center'));
                    }
                    // Reset branch selection when type filter changes
                    setSelectedBranchIds([]);
                    setSelectAllBranches(false);
                  }}
                />
                <span>مراكز رعاية نهارية</span>
              </label>
            </div>
          </div>

          <div className="branches-selection">
            <label className="branch-checkbox-label select-all-branch-label">
              <input
                type="checkbox"
                checked={selectAllBranches}
                onChange={(e) => {
                  setSelectAllBranches(e.target.checked);
                  if (e.target.checked) {
                    setSelectedBranchIds([]);
                    setCurrentBranchId(null);
                    setSearchParams({});
                  }
                  setIsPasswordVerified(true);
                }}
              />
              <span className="select-all-branch-text">كل الفروع</span>
            </label>
            <div className="branches-list">
              {branches.map(branch => (
                <label key={branch.id} className="branch-checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedBranchIds.includes(branch.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedBranchIds([...selectedBranchIds, branch.id]);
                        setSelectAllBranches(false);
                      } else {
                        setSelectedBranchIds(selectedBranchIds.filter(id => id !== branch.id));
                      }
                      setIsPasswordVerified(true);
                      setSearchParams({});
                    }}
                  />
                  <span>{branch.branch_name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleGenerateReport} className="report-form">
        <div className="form-section">
          <h2>عنوان التقرير</h2>
          <div className="form-group">
            <input
              type="text"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              placeholder="أدخل عنوان التقرير"
              required
              className="form-control"
            />
          </div>
        </div>

        <div className="form-section">
          <h2>الفلاتر</h2>
          <div className="filters-grid">
            <div className="filter-group">
              <div className="filter-header">
                <label>الجنسية</label>
              </div>
              <div className="filter-info-text">
                {filters.nationality.length === 0 ? 'الكل (لم يتم تحديد أي خيار)' : `تم تحديد ${filters.nationality.length} من ${filterOptions.nationalities.length}`}
              </div>
              <div className="filter-options">
                {filterOptions.nationalities.map(nat => (
                  <label key={nat} className="filter-checkbox-label">
                    <input
                      type="checkbox"
                      checked={filters.nationality.includes(nat)}
                      onChange={() => handleFilterToggle('nationality', nat)}
                    />
                    <span>{nat}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <div className="filter-header">
                <label>المسمى الوظيفي</label>
              </div>
              <div className="filter-info-text">
                {filters.job_title.length === 0 ? 'الكل (لم يتم تحديد أي خيار)' : `تم تحديد ${filters.job_title.length} من ${filterOptions.jobTitles.length}`}
              </div>
              <div className="filter-options">
                {filterOptions.jobTitles.map(jt => (
                  <label key={jt} className="filter-checkbox-label">
                    <input
                      type="checkbox"
                      checked={filters.job_title.includes(jt)}
                      onChange={() => handleFilterToggle('job_title', jt)}
                    />
                    <span>{jt}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <div className="filter-header">
                <label>الجنس</label>
              </div>
              <div className="filter-info-text">
                {filters.gender.length === 0 ? 'الكل (لم يتم تحديد أي خيار)' : `تم تحديد ${filters.gender.length} من ${filterOptions.genders.length}`}
              </div>
              <div className="filter-options">
                {filterOptions.genders.map(g => (
                  <label key={g} className="filter-checkbox-label">
                    <input
                      type="checkbox"
                      checked={filters.gender.includes(g)}
                      onChange={() => handleFilterToggle('gender', g)}
                    />
                    <span>{getGenderLabel(g)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <div className="filter-header">
                <label>الحالة الاجتماعية</label>
              </div>
              <div className="filter-info-text">
                {filters.marital_status.length === 0 ? 'الكل (لم يتم تحديد أي خيار)' : `تم تحديد ${filters.marital_status.length} من ${filterOptions.maritalStatuses.length}`}
              </div>
              <div className="filter-options">
                {filterOptions.maritalStatuses.map(ms => (
                  <label key={ms} className="filter-checkbox-label">
                    <input
                      type="checkbox"
                      checked={filters.marital_status.includes(ms)}
                      onChange={() => handleFilterToggle('marital_status', ms)}
                    />
                    <span>{ms}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <div className="filter-header">
                <label>المؤهل التعليمي</label>
              </div>
              <div className="filter-info-text">
                {filters.educational_qualification.length === 0 ? 'الكل (لم يتم تحديد أي خيار)' : `تم تحديد ${filters.educational_qualification.length} من ${filterOptions.educationalQualifications.length}`}
              </div>
              <div className="filter-options">
                {filterOptions.educationalQualifications.map(eq => (
                  <label key={eq} className="filter-checkbox-label">
                    <input
                      type="checkbox"
                      checked={filters.educational_qualification.includes(eq)}
                      onChange={() => handleFilterToggle('educational_qualification', eq)}
                    />
                    <span>{eq}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <div className="filter-header">
                <label>نوع العقد</label>
              </div>
              <div className="filter-info-text">
                {filters.contract_type.length === 0 ? 'الكل (لم يتم تحديد أي خيار)' : `تم تحديد ${filters.contract_type.length} من ${filterOptions.contractTypes.length}`}
              </div>
              <div className="filter-options">
                {filterOptions.contractTypes.map(ct => (
                  <label key={ct} className="filter-checkbox-label">
                    <input
                      type="checkbox"
                      checked={filters.contract_type.includes(ct)}
                      onChange={() => handleFilterToggle('contract_type', ct)}
                    />
                    <span>{ct}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <div className="filter-header">
                <label>حالة إكمال البيانات</label>
              </div>
              <div className="filter-info-text">
                {filters.data_completion_status.length === 0 ? 'الكل (لم يتم تحديد أي خيار)' : `تم تحديد ${filters.data_completion_status.length} من ${filterOptions.dataCompletionStatuses.length}`}
              </div>
              <div className="filter-options">
                {filterOptions.dataCompletionStatuses.map(dcs => (
                  <label key={dcs} className="filter-checkbox-label">
                    <input
                      type="checkbox"
                      checked={filters.data_completion_status.includes(dcs)}
                      onChange={() => handleFilterToggle('data_completion_status', dcs)}
                    />
                    <span>{getDataCompletionStatusLabel(dcs)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>العمر (من):</label>
              <input
                type="number"
                value={filters.min_age}
                onChange={(e) => handleFilterChange('min_age', e.target.value)}
                placeholder="الحد الأدنى"
                min="0"
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label>العمر (إلى):</label>
              <input
                type="number"
                value={filters.max_age}
                onChange={(e) => handleFilterChange('max_age', e.target.value)}
                placeholder="الحد الأقصى"
                min="0"
                className="form-control"
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2>الحقول المراد عرضها</h2>
          <div className="fields-grid">
            {availableFields.map(field => (
              <label key={field.value} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedFields.includes(field.value)}
                  onChange={() => handleFieldToggle(field.value)}
                />
                <span>{field.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="form-section">
          <h2>نوع الملف</h2>
          <div className="file-type-selection">
            <label className="file-type-radio-label">
              <input
                type="radio"
                name="fileType"
                value="pdf"
                checked={fileType === 'pdf'}
                onChange={(e) => setFileType(e.target.value)}
              />
              <span>PDF</span>
            </label>
            <label className="file-type-radio-label">
              <input
                type="radio"
                name="fileType"
                value="excel"
                checked={fileType === 'excel'}
                onChange={(e) => setFileType(e.target.value)}
              />
              <span>Excel</span>
            </label>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={generating}>
            {generating ? 'جاري الإنشاء...' : 'إنشاء التقرير'}
          </button>
        </div>
      </form>

      {!isMainManager() && showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>إدخال كلمة المرور</h2>
            <p>هذه الصفحة تتطلب كلمة مرور للوصول</p>
            <form onSubmit={handlePasswordSubmit}>
              <div className="form-group">
                <label>كلمة المرور:</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور"
                  autoFocus
                />
                {passwordError && <div className="error-message">{passwordError}</div>}
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">تأكيد</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPasswordModal(false)}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;

