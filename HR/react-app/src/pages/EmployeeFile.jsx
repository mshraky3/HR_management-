/**
 * Employee File Page
 * Generate employee files with documents - Main Manager only
 * Single employee only
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { employeesAPI, documentsAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { getDocumentTypeLabel } from '../utils/employeeConstants';
import { formatDate } from '../utils/dateConverters';
import { downloadFile } from '../utils/downloadFile';
import { useBranches } from '../hooks/useBranches';
// TablePage.css is now loaded in App.jsx to prevent FOUC
import './EmployeeFile.css';

const EmployeeFile = () => {
  const { isMainManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const [employees, setEmployees] = useState([]);
  const { branches: rawBranches } = useBranches();
  const branches = useMemo(
    () => [...rawBranches].sort((a, b) => (a.branch_name || '').localeCompare(b.branch_name || '', 'ar')),
    [rawBranches]
  );
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null); // Single employee only
  const [selectedEmployee, setSelectedEmployee] = useState(null); // Store selected employee data
  const [documents, setDocuments] = useState([]); // Documents for selected employee
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([]); // Selected document IDs
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [searchFilters, setSearchFilters] = useState({
    search_name: '',
    search_id: '',
    search_phone: '',
    branch_id: ''
  });
  const [hasSearched, setHasSearched] = useState(false); // Track if user has performed a search
  const [branchSearchTerm, setBranchSearchTerm] = useState(''); // Search term for filtering branches
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [showFieldsDropdown, setShowFieldsDropdown] = useState(false);

  // Refs to maintain focus on search inputs
  const searchNameRef = useRef(null);
  const searchIdRef = useRef(null);
  const searchPhoneRef = useRef(null);
  const fieldsToggleRef = useRef(null);
  const fieldsDropdownRef = useRef(null);

  // Available fields for selection
  const availableFields = [
    { value: 'employee_id_number', label: 'رقم الموظف' },
    { value: 'full_name', label: 'الاسم الكامل' },
    { value: 'first_name', label: 'الاسم الأول' },
    { value: 'second_name', label: 'الاسم الثاني' },
    { value: 'third_name', label: 'الاسم الثالث' },
    { value: 'fourth_name', label: 'الاسم الرابع' },
    { value: 'branch_id', label: 'الفرع' },
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
    { value: 'religion', label: 'الديانة' },
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
    { value: 'graduation_year', label: 'سنة التخرج' },
    { value: 'university_gpa', label: 'المعدل التراكمي' },
    { value: 'passport_number', label: 'رقم الجواز' },
    { value: 'passport_issue_date', label: 'تاريخ إصدار الجواز' },
    { value: 'passport_expiry_date', label: 'تاريخ انتهاء الجواز' },
    { value: 'passport_issue_place', label: 'مكان إصدار الجواز' },
    { value: 'residency_issue_date', label: 'تاريخ إصدار الإقامة' },
    { value: 'data_completion_status', label: 'حالة إكمال البيانات' },
  ];

  const [selectedFields, setSelectedFields] = useState([
    'full_name',
    'employee_id_number',
    'id_or_residency_number',
    'nationality',
  ]);

  // Redirect if not main manager
  useEffect(() => {
    if (!isMainManager()) {
      window.location.href = '/dashboard';
    }
  }, [isMainManager]);

  // Don't auto-load employees - only load when user explicitly searches

  const loadEmployees = async () => {
    // Check if at least one search filter is filled
    const hasSearchCriteria =
      searchFilters.search_name.trim() ||
      searchFilters.search_id.trim() ||
      searchFilters.search_phone.trim() ||
      searchFilters.branch_id;

    if (!hasSearchCriteria) {
      setEmployees([]);
      setHasSearched(false);
      return;
    }

    try {
      setLoading(true);
      setHasSearched(true);
      const filters = { is_active: true };

      // Add search filters
      if (searchFilters.search_name.trim()) {
        filters.search_name = searchFilters.search_name.trim();
      }
      if (searchFilters.search_id.trim()) {
        filters.search_id = searchFilters.search_id.trim();
      }
      if (searchFilters.search_phone.trim()) {
        filters.search_phone = searchFilters.search_phone.trim();
      }
      if (searchFilters.branch_id) {
        filters.branch_id = parseInt(searchFilters.branch_id);
      }

      const response = await employeesAPI.getAll(filters);
      if (response.data.success) {
        setEmployees(response.data.data || []);
      }
    } catch (error) {
      console.error('Error loading employees:', error);
      showError('فشل تحميل الموظفين');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    if (e) {
      e.preventDefault();
    }
    loadEmployees();
  };

  const handleClearSearch = () => {
    setSearchFilters({
      search_name: '',
      search_id: '',
      search_phone: '',
      branch_id: ''
    });
    setEmployees([]);
    setHasSearched(false);
    setSelectedEmployeeId(null);
    setSelectedEmployee(null);
    setDocuments([]);
    setSelectedDocumentIds([]);
  };

  // Load documents for selected employee
  useEffect(() => {
    const loadDocumentsForSelected = async () => {
      if (selectedEmployeeId && !loadingDocuments) {
        setLoadingDocuments(true);
        try {
          const response = await documentsAPI.getAll({ employee_id: selectedEmployeeId });
          if (response.data.success) {
            setDocuments(response.data.data || []);
          }
        } catch (error) {
          console.error(`Error loading documents for employee ${selectedEmployeeId}:`, error);
          setDocuments([]);
        } finally {
          setLoadingDocuments(false);
        }
      } else if (!selectedEmployeeId) {
        setDocuments([]);
        setSelectedDocumentIds([]);
      }
    };

    loadDocumentsForSelected();
  }, [selectedEmployeeId]);

  const handleEmployeeSelect = (employeeId) => {
    if (employeeId) {
      const employee = employees.find(emp => emp.id === parseInt(employeeId));
      setSelectedEmployeeId(parseInt(employeeId));
      setSelectedEmployee(employee);
    } else {
      setSelectedEmployeeId(null);
      setSelectedEmployee(null);
      setDocuments([]);
      setSelectedDocumentIds([]);
    }
  };

  const handleEmployeeClick = (employee) => {
    setSelectedEmployeeId(employee.id);
    setSelectedEmployee(employee);
  };

  const handleDocumentToggle = (documentId) => {
    setSelectedDocumentIds(prev => {
      if (prev.includes(documentId)) {
        return prev.filter(id => id !== documentId);
      } else {
        return [...prev, documentId];
      }
    });
  };

  const handleSelectAllDocuments = () => {
    const allSelected = documents.length > 0 && documents.every(doc => selectedDocumentIds.includes(doc.id));

    if (allSelected) {
      // Deselect all
      setSelectedDocumentIds([]);
    } else {
      // Select all
      setSelectedDocumentIds(documents.map(doc => doc.id));
    }
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

  const handleSelectAllFields = () => {
    setSelectedFields(availableFields.map(f => f.value));
  };

  const handleClearFields = () => {
    setSelectedFields([]);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        showFieldsDropdown &&
        fieldsDropdownRef.current &&
        fieldsToggleRef.current &&
        !fieldsDropdownRef.current.contains(event.target) &&
        !fieldsToggleRef.current.contains(event.target)
      ) {
        setShowFieldsDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFieldsDropdown]);

  const handleGenerateFile = async (e) => {
    e.preventDefault();

    if (!selectedEmployeeId) {
      showWarning('الرجاء اختيار موظف');
      return;
    }

    if (selectedFields.length === 0) {
      showWarning('الرجاء اختيار حقل واحد على الأقل للعرض');
      return;
    }

    try {
      setGenerating(true);

      // Generate fixed title: "ملف الموظف" + employee name
      const employeeName = selectedEmployee ? getFullName(selectedEmployee) : 'موظف';
      const fileTitle = `ملف الموظف ${employeeName}`;

      // Prepare selected documents map for single employee
      const selectedDocumentsForRequest = {
        [selectedEmployeeId]: selectedDocumentIds
      };

      const response = await employeesAPI.generateEmployeeFile({
        title: fileTitle,
        employee_ids: [selectedEmployeeId], // Single employee as array
        selectedFields: selectedFields,
        selected_documents: selectedDocumentsForRequest
      }, {
        responseType: 'blob'
      });

      // Create blob URL and download (response.data is already a blob when responseType is 'blob')
      const blob = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: 'application/pdf' });
      downloadFile(blob, `${fileTitle}.pdf`);

      showSuccess('تم إنشاء الملف بنجاح');

    } catch (error) {
      console.error('Error generating file:', error);
      const errorMessage = error.response?.data?.message || error.message || 'فشل إنشاء الملف';
      showError(errorMessage);
    } finally {
      setGenerating(false);
    }
  };

  const getFullName = (employee) => {
    return `${employee.first_name || ''} ${employee.second_name || ''} ${employee.third_name || ''} ${employee.fourth_name || ''}`.trim();
  };

  if (!isMainManager()) {
    return null;
  }

  return (
    <div className="table-page">
      <div className="page-header">
        <h1>ملف موظف</h1>
      </div>

      <form onSubmit={handleGenerateFile} className="employee-file-form">
        {/* Search Filters */}
        <div className="form-section">
          <h2>البحث عن الموظف</h2>
          <div className="search-form">
            <div className="search-filters">
              <div className="form-group">
                <label>البحث بالاسم:</label>
                <input
                  ref={searchNameRef}
                  type="text"
                  value={searchFilters.search_name}
                  onChange={(e) => setSearchFilters(prev => ({ ...prev, search_name: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearch(e);
                    }
                  }}
                  placeholder="ابحث بالاسم..."
                  className="form-control"
                />
              </div>
              <div className="form-group">
                <label>البحث برقم الهوية/الإقامة:</label>
                <input
                  ref={searchIdRef}
                  type="text"
                  value={searchFilters.search_id}
                  onChange={(e) => setSearchFilters(prev => ({ ...prev, search_id: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearch(e);
                    }
                  }}
                  placeholder="ابحث برقم الهوية..."
                  className="form-control"
                />
              </div>
              <div className="form-group">
                <label>البحث برقم الهاتف:</label>
                <input
                  ref={searchPhoneRef}
                  type="text"
                  value={searchFilters.search_phone}
                  onChange={(e) => setSearchFilters(prev => ({ ...prev, search_phone: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearch(e);
                    }
                  }}
                  placeholder="ابحث برقم الهاتف..."
                  className="form-control"
                />
              </div>
              <div className="form-group" style={{ position: 'relative' }}>
                <label>البحث بالفرع:</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={searchFilters.branch_id
                      ? branches.find(b => b.id === parseInt(searchFilters.branch_id))?.branch_name || ''
                      : branchSearchTerm}
                    onChange={(e) => {
                      const value = e.target.value;
                      setBranchSearchTerm(value);
                      setIsBranchDropdownOpen(true);
                      // Clear selection if user is typing (not selecting from dropdown)
                      if (value !== branches.find(b => b.id === parseInt(searchFilters.branch_id))?.branch_name) {
                        setSearchFilters(prev => ({ ...prev, branch_id: '' }));
                      }
                    }}
                    onFocus={() => {
                      setIsBranchDropdownOpen(true);
                      // If a branch is selected, show it in search term for editing
                      if (searchFilters.branch_id) {
                        const selectedBranch = branches.find(b => b.id === parseInt(searchFilters.branch_id));
                        if (selectedBranch) {
                          setBranchSearchTerm(selectedBranch.branch_name);
                        }
                      }
                    }}
                    onBlur={() => {
                      // Delay closing to allow click on option
                      setTimeout(() => {
                        setIsBranchDropdownOpen(false);
                        // If no branch selected and search term doesn't match any branch, clear it
                        if (!searchFilters.branch_id) {
                          const matchingBranch = branches.find(b =>
                            b.branch_name.toLowerCase() === branchSearchTerm.toLowerCase()
                          );
                          if (!matchingBranch) {
                            setBranchSearchTerm('');
                          }
                        }
                      }, 200);
                    }}
                    placeholder="ابحث واختر فرع..."
                    className="form-control"
                  />
                  {isBranchDropdownOpen && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 1000,
                      backgroundColor: 'white',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      maxHeight: '300px',
                      overflowY: 'auto',
                      boxShadow: 'var(--shadow-lg)',
                      marginTop: '4px'
                    }}>
                      <div
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--border-light)',
                          backgroundColor: searchFilters.branch_id === '' ? 'var(--primary-light)' : 'transparent'
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSearchFilters(prev => ({ ...prev, branch_id: '' }));
                          setBranchSearchTerm('');
                          setIsBranchDropdownOpen(false);
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = searchFilters.branch_id === '' ? 'var(--primary-light)' : 'transparent';
                        }}
                      >
                        جميع الفروع
                      </div>
                      {branches
                        .filter(branch =>
                          !branchSearchTerm ||
                          (branch.branch_name || '').toLowerCase().includes(branchSearchTerm.toLowerCase())
                        )
                        .map(branch => (
                          <div
                            key={branch.id}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              borderBottom: '1px solid var(--border-light)',
                              backgroundColor: searchFilters.branch_id === branch.id.toString() ? 'var(--primary-light)' : 'transparent'
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSearchFilters(prev => ({ ...prev, branch_id: branch.id.toString() }));
                              setBranchSearchTerm('');
                              setIsBranchDropdownOpen(false);
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = searchFilters.branch_id === branch.id.toString() ? 'var(--primary-light)' : 'transparent';
                            }}
                          >
                            {branch.branch_name}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="search-actions">
              <button type="button" onClick={handleSearch} className="btn btn-primary" disabled={loading}>
                {loading ? 'جاري البحث...' : 'بحث'}
              </button>
              {(hasSearched || employees.length > 0) && (
                <button type="button" onClick={handleClearSearch} className="btn btn-secondary">
                  مسح البحث
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Employee Selection - Show results as list */}
        {hasSearched && (
          <div className="form-section">
            <h2>نتائج البحث</h2>
            {loading ? (
              <div className="loading">جاري التحميل...</div>
            ) : employees.length === 0 ? (
              <div className="no-data">لا توجد موظفين ينطبق عليهم البحث</div>
            ) : (
              <div className="employees-list">
                {employees.map(employee => (
                  <div
                    key={employee.id}
                    className={`employee-item ${selectedEmployeeId === employee.id ? 'selected' : ''}`}
                    onClick={() => handleEmployeeClick(employee)}
                  >
                    <div className="employee-info">
                      <div className="employee-name">{getFullName(employee)}</div>
                      <div className="employee-details">
                        {employee.employee_id_number && (
                          <span className="employee-detail">رقم الموظف: {employee.employee_id_number}</span>
                        )}
                        {employee.id_or_residency_number && (
                          <span className="employee-detail">رقم الهوية: {employee.id_or_residency_number}</span>
                        )}
                        {employee.phone_number && (
                          <span className="employee-detail">الهاتف: {employee.phone_number}</span>
                        )}
                      </div>
                    </div>
                    {selectedEmployeeId === employee.id && (
                      <div className="selected-indicator">✓</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Documents Selection for Selected Employee */}
        {selectedEmployeeId && (
          <div className="form-section">
            <div className="section-header">
              <h2>اختيار المستندات</h2>
              {documents.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllDocuments}
                  className="btn btn-secondary btn-sm"
                >
                  {documents.length > 0 && documents.every(doc => selectedDocumentIds.includes(doc.id))
                    ? 'إلغاء تحديد الكل'
                    : 'تحديد الكل'}
                </button>
              )}
            </div>
            <div className="documents-preview">
              {loadingDocuments ? (
                <div className="loading">جاري تحميل المستندات...</div>
              ) : documents.length === 0 ? (
                <div className="no-documents">لا توجد مستندات</div>
              ) : (
                <div className="documents-list">
                  {documents.map((doc, index) => (
                    <label key={doc.id || index} className="document-checkbox-label">
                      <div className="document-switch-container">
                        <input
                          type="checkbox"
                          className="document-switch-input"
                          checked={selectedDocumentIds.includes(doc.id)}
                          onChange={() => handleDocumentToggle(doc.id)}
                        />
                        <span className="document-switch-slider"></span>
                      </div>
                      <div className="document-info">
                        <div className="document-name-row">
                          <span className="document-name">{getDocumentTypeLabel(doc.document_type) || 'مستند'}</span>
                          <span className="document-filename">- {doc.filename || doc.file_name || 'بدون اسم'}</span>
                        </div>
                        {doc.description && (
                          <span className="document-description"> ({doc.description})</span>
                        )}
                        {doc.expiry_date && (
                          <span className="document-expiry">
                            {' '}- تاريخ الانتهاء: {formatDate(doc.expiry_date)}
                          </span>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Fields Selection */}
        {selectedEmployeeId && (
          <div className="form-section">
            <div className="fields-compact">
              <button
                ref={fieldsToggleRef}
                type="button"
                className="fields-toggle btn btn-secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFieldsDropdown(prev => !prev);
                }}
                aria-haspopup="true"
                aria-expanded={showFieldsDropdown}
              >
                الحقول: {selectedFields.length} محددة ▾
              </button>

              {showFieldsDropdown && (
                <div ref={fieldsDropdownRef} className="fields-dropdown" role="menu" aria-label="اختيار الحقول">
                  <div className="fields-actions">
                    <button className="btn btn-link" onClick={handleSelectAllFields}>تحديد الكل</button>
                    <button className="btn btn-link" onClick={handleClearFields}>مسح الكل</button>
                    <button className="btn btn-link" onClick={() => setShowFieldsDropdown(false)}>إغلاق</button>
                  </div>
                  <div className="fields-grid">
                    {availableFields.map(field => (
                      <button
                        key={field.value}
                        type="button"
                        role="menuitem"
                        tabIndex={0}
                        className={`field-btn ${selectedFields.includes(field.value) ? 'selected' : ''}`}
                        onClick={() => handleFieldToggle(field.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleFieldToggle(field.value);
                          }
                        }}
                      >
                        {field.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Generate Button */}
        {selectedEmployeeId && (
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={generating}>
              {generating ? 'جاري الإنشاء...' : 'إنشاء الملف'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
};

export default EmployeeFile;
