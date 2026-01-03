import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { branchesAPI, employeesAPI, reportsAPI } from '../utils/api';
import BranchBadge from '../components/BranchBadge';
import { DATA_COMPLETION_STATUS } from '../utils/employeeConstants';
import { formatDate } from '../utils/dateConverters';
import { translateValue } from '../utils/translations';
import './Payrolls.css';

const availableFields = [
    { value: 'full_name', label: 'الاسم الكامل' },
    { value: 'id_or_residency_number', label: 'رقم الهوية/الإقامة' },
    { value: 'id_type', label: 'نوع الهوية' },
    { value: 'id_expiry_date_hijri', label: 'تاريخ انتهاء الهوية (هجري)' },
    { value: 'id_expiry_date_gregorian', label: 'تاريخ انتهاء الهوية (ميلادي)' },
    { value: 'occupation', label: 'المهنة' },
    { value: 'job_title', label: 'المسمى الوظيفي' },
    { value: 'nationality', label: 'الجنسية' },
    { value: 'gender', label: 'الجنس' },
    { value: 'date_of_birth_hijri', label: 'تاريخ الميلاد (هجري)' },
    { value: 'date_of_birth_gregorian', label: 'تاريخ الميلاد (ميلادي)' },
    { value: 'phone_number', label: 'رقم الهاتف' },
    { value: 'email', label: 'البريد الإلكتروني' },
    { value: 'bank_iban', label: 'الآيبان' },
    { value: 'bank_name', label: 'اسم البنك' },
    { value: 'religion', label: 'الديانة' },
    { value: 'marital_status', label: 'الحالة الاجتماعية' },
    { value: 'educational_qualification', label: 'المؤهل التعليمي' },
    { value: 'specialization', label: 'التخصص' },
    { value: 'graduation_year', label: 'سنة التخرج' },
    { value: 'university_gpa', label: 'المعدل التراكمي' },
    { value: 'contract_type', label: 'نوع العقد' },
    { value: 'national_address', label: 'العنوان الوطني' },
    { value: 'years_of_experience_in_same_institution', label: 'سنوات الخبرة في نفس المؤسسة' },
    { value: 'base_salary', label: 'الراتب الأساسي' },
    { value: 'housing_allowance', label: 'بدل السكن' },
    { value: 'transportation_allowance', label: 'بدل المواصلات' },
    { value: 'end_of_service_allowance', label: 'بدل نهاية الخدمة' },
    { value: 'annual_leave_allowance', label: 'بدل الإجازة السنوية' },
    { value: 'other_allowances', label: 'بدلات أخرى' },
    { value: 'deductions', label: 'الخصومات' },
    { value: 'total_salary', label: 'اجمالي الراتب' },
    { value: 'passport_number', label: 'رقم الجواز' },
    { value: 'passport_issue_date', label: 'تاريخ إصدار الجواز' },
    { value: 'passport_expiry_date', label: 'تاريخ انتهاء الجواز' },
    { value: 'passport_issue_place', label: 'مكان إصدار الجواز' },
    { value: 'residency_issue_date', label: 'تاريخ إصدار الإقامة' },
    { value: 'status', label: 'الحالة' },
    { value: 'data_completion_status', label: 'حالة إكمال البيانات' }
];

const Payrolls = () => {
    const { isMainManager } = useAuth();
    const { showError, showSuccess, showWarning } = useNotification();
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedBranchId, setSelectedBranchId] = useState(null);
    const [selectedFields, setSelectedFields] = useState(['full_name', 'id_or_residency_number']);
    const [employees, setEmployees] = useState([]);
    const [totalEmployees, setTotalEmployees] = useState(0); // Total employees without filters
    const [previewLoading, setPreviewLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [generatingExcel, setGeneratingExcel] = useState(false);
    const [reportTitle, setReportTitle] = useState('المسيرات');

    // Filters state
    const [filters, setFilters] = useState({
        nationality: [],
        job_title: [],
        gender: [],
        marital_status: [],
        educational_qualification: [],
        contract_type: [],
        data_completion_status: [],
    });

    // Filter options state
    const [filterOptions, setFilterOptions] = useState({
        nationalities: [],
        jobTitles: [],
        genders: ['male', 'female'],
        maritalStatuses: [],
        educationalQualifications: [],
        contractTypes: [],
        dataCompletionStatuses: [DATA_COMPLETION_STATUS.COMPLETE, DATA_COMPLETION_STATUS.INCOMPLETE],
    });

    // UI state for compact field selection dropdown
    const [showFieldsDropdown, setShowFieldsDropdown] = useState(false);
    const fieldsDropdownRef = useRef(null);
    const fieldsToggleRef = useRef(null);

    // UI state for filters dropdown
    const [showFiltersDropdown, setShowFiltersDropdown] = useState(false);
    const filtersDropdownRef = useRef(null);
    const filtersToggleRef = useRef(null);

    // Branch dropdown state (modern UI)
    const [showBranchesDropdown, setShowBranchesDropdown] = useState(false);
    const branchesDropdownRef = useRef(null);
    const branchToggleRef = useRef(null);
    const [branchSearchTerm, setBranchSearchTerm] = useState('');
    const formSectionRef = useRef(null);

    // Confirmation modal for large exports
    const [confirmExportOpen, setConfirmExportOpen] = useState(false);
    const [confirmExportType, setConfirmExportType] = useState('pdf'); // 'pdf' or 'excel'
    const exportThreshold = 500; // warn if employee count exceeds this
    const [isGeneratingOverlay, setIsGeneratingOverlay] = useState(false);
    const handleSelectAllFields = () => setSelectedFields(availableFields.map(f => f.value));
    const handleClearFields = () => setSelectedFields([]);
    const toggleField = (value) => {
        setSelectedFields(prev => prev.includes(value) ? prev.filter(f => f !== value) : [...prev, value]);
    };

    // Filter handlers
    const toggleFilter = (filterType, value) => {
        setFilters(prev => ({
            ...prev,
            [filterType]: prev[filterType].includes(value)
                ? prev[filterType].filter(f => f !== value)
                : [...prev[filterType], value]
        }));
    };

    const clearFilter = (filterType) => {
        setFilters(prev => ({
            ...prev,
            [filterType]: []
        }));
    };

    const clearAllFilters = () => {
        setFilters({
            nationality: [],
            job_title: [],
            gender: [],
            marital_status: [],
            educational_qualification: [],
            contract_type: [],
            data_completion_status: [],
        });
    };

    const getActiveFiltersCount = () => {
        return Object.values(filters).reduce((count, arr) => count + arr.length, 0);
    };

    useEffect(() => {
        const load = async () => {
            try {
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
        load();
    }, []);

    // Load filter options
    const loadFilterOptions = async () => {
        if (!selectedBranchId) return;
        
        try {
            const response = await employeesAPI.getAll({ branch_id: selectedBranchId, is_active: true });
            if (response.data.success) {
                const employees = response.data.data || [];
                
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
                    dataCompletionStatuses: [DATA_COMPLETION_STATUS.COMPLETE, DATA_COMPLETION_STATUS.INCOMPLETE],
                });
            }
        } catch (error) {
            console.error('Error loading filter options:', error);
        }
    };

    useEffect(() => {
        if (selectedBranchId) {
            loadFilterOptions();
        }
    }, [selectedBranchId]);

    const handleFieldToggle = (value) => {
        setSelectedFields(prev => prev.includes(value) ? prev.filter(f => f !== value) : [...prev, value]);
    };

    const loadPreview = async () => {
        if (!selectedBranchId) {
            showWarning('الرجاء اختيار فرع للعرض');
            return;
        }
        if (selectedFields.length === 0) {
            showWarning('اختر حقل واحد على الأقل');
            return;
        }

        try {
            setPreviewLoading(true);
            
            // First, load total employees count (without filters) for display
            const totalResponse = await employeesAPI.getAll({ branch_id: selectedBranchId, is_active: true });
            if (totalResponse.data.success) {
                setTotalEmployees(totalResponse.data.data?.length || 0);
            }
            
            // Build filter query - serialize arrays as comma-separated strings for backend compatibility
            const queryParams = { branch_id: selectedBranchId, is_active: true };
            
            // Add filters to query - convert arrays to comma-separated strings
            if (filters.nationality.length > 0) queryParams.nationality = filters.nationality.join(',');
            if (filters.job_title.length > 0) queryParams.job_title = filters.job_title.join(',');
            if (filters.gender.length > 0) queryParams.gender = filters.gender.join(',');
            if (filters.marital_status.length > 0) queryParams.marital_status = filters.marital_status.join(',');
            if (filters.educational_qualification.length > 0) queryParams.educational_qualification = filters.educational_qualification.join(',');
            if (filters.contract_type.length > 0) queryParams.contract_type = filters.contract_type.join(',');
            if (filters.data_completion_status.length > 0) queryParams.data_completion_status = filters.data_completion_status.join(',');
            
            const response = await employeesAPI.getAll(queryParams);
            if (response.data.success) {
                let employeesData = response.data.data || [];
                
                // Sort employees alphabetically by full name
                employeesData = employeesData.sort((a, b) => {
                    const getFullName = (emp) => {
                        const names = [
                            emp.first_name,
                            emp.second_name,
                            emp.third_name,
                            emp.fourth_name
                        ].filter(name => name && name.trim());
                        return names.length > 0 ? names.join(' ') : emp.full_name || '';
                    };
                    
                    const nameA = getFullName(a).trim().toLowerCase();
                    const nameB = getFullName(b).trim().toLowerCase();
                    return nameA.localeCompare(nameB, 'ar');
                });
                
                setEmployees(employeesData);
            }
        } catch (error) {
            console.error('Error loading employees:', error);
            showError('فشل تحميل الموظفين');
        } finally {
            setPreviewLoading(false);
        }
    };

    // Close dropdowns when pressing Escape
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                setShowFieldsDropdown(false);
                setShowBranchesDropdown(false);
                setShowFiltersDropdown(false);
                setBranchSearchTerm('');
            }
        };
        document.addEventListener('keydown', handleEsc);
        return () => {
            document.removeEventListener('keydown', handleEsc);
        };
    }, [showFieldsDropdown, showBranchesDropdown, showFiltersDropdown]);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            // Check if click is outside all dropdowns and their toggles
            const isOutsideBranches = branchesDropdownRef.current && 
                !branchesDropdownRef.current.contains(event.target) && 
                branchToggleRef.current && 
                !branchToggleRef.current.contains(event.target);
            
            const isOutsideFields = fieldsDropdownRef.current && 
                !fieldsDropdownRef.current.contains(event.target) && 
                fieldsToggleRef.current && 
                !fieldsToggleRef.current.contains(event.target);
            
            const isOutsideFilters = filtersDropdownRef.current && 
                !filtersDropdownRef.current.contains(event.target) && 
                filtersToggleRef.current && 
                !filtersToggleRef.current.contains(event.target);

            if (showBranchesDropdown && isOutsideBranches) {
                setShowBranchesDropdown(false);
                setBranchSearchTerm('');
            }
            if (showFieldsDropdown && isOutsideFields) {
                setShowFieldsDropdown(false);
            }
            if (showFiltersDropdown && isOutsideFilters) {
                setShowFiltersDropdown(false);
            }
        };

        // Only add listener if any dropdown is open
        if (showBranchesDropdown || showFieldsDropdown || showFiltersDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [showBranchesDropdown, showFieldsDropdown, showFiltersDropdown]);

    // Auto-load preview when selected branch or filters change for a smoother UX
    useEffect(() => {
        if (selectedBranchId) {
            loadPreview();
        }
    }, [selectedBranchId, filters]);

    // Position dropdowns to span full width of form-section
    useEffect(() => {
        const positionDropdown = (dropdownRef, toggleRef) => {
            if (!dropdownRef.current || !toggleRef.current || !formSectionRef.current) return;
            
            const formSection = formSectionRef.current;
            const toggle = toggleRef.current;
            const dropdown = dropdownRef.current;
            
            const formRect = formSection.getBoundingClientRect();
            const toggleRect = toggle.getBoundingClientRect();
            const dropdownParent = dropdown.parentElement;
            const parentRect = dropdownParent.getBoundingClientRect();
            
            // Position relative to form-section
            dropdown.style.position = 'absolute';
            dropdown.style.top = `${toggleRect.bottom - parentRect.top + 8}px`;
            dropdown.style.left = `${formRect.left - parentRect.left}px`;
            dropdown.style.width = `${formRect.width}px`;
        };

        const updatePositions = () => {
            if (showBranchesDropdown && branchesDropdownRef.current && branchToggleRef.current) {
                positionDropdown(branchesDropdownRef, branchToggleRef);
            }
            if (showFieldsDropdown && fieldsDropdownRef.current && fieldsToggleRef.current) {
                positionDropdown(fieldsDropdownRef, fieldsToggleRef);
            }
            if (showFiltersDropdown && filtersDropdownRef.current && filtersToggleRef.current) {
                positionDropdown(filtersDropdownRef, filtersToggleRef);
            }
        };

        // Small delay to ensure DOM is updated
        const timeoutId = setTimeout(updatePositions, 0);
        window.addEventListener('resize', updatePositions);
        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener('resize', updatePositions);
        };
    }, [showBranchesDropdown, showFieldsDropdown, showFiltersDropdown]);

    // Proceed to actually call the reports API and download blob
    const proceedGeneratePdf = async () => {
        try {
            setGenerating(true);
            setIsGeneratingOverlay(true);
            const title = `${reportTitle} - ${branches.find(b => b.id === selectedBranchId)?.branch_name || ''}`.trim();

            const response = await reportsAPI.generate({
                title,
                selectedFields,
                branch_id: selectedBranchId,
                fileType: 'pdf'
            }, { responseType: 'blob' });

            const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${title || 'payroll'}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            showSuccess('تم إنشاء المسيرات بنجاح');
        } catch (error) {
            console.error('Error generating payroll PDF:', error);
            showError(error.response?.data?.message || 'فشل إنشاء المسيرات');
        } finally {
            setGenerating(false);
            setIsGeneratingOverlay(false);
        }
    };

    const handleGeneratePdf = async () => {
        if (!selectedBranchId) {
            showWarning('الرجاء اختيار فرع');
            return;
        }
        if (selectedFields.length === 0) {
            showWarning('الرجاء اختيار حقل واحد على الأقل');
            return;
        }

        // If export is large, confirm with the user
        if (employees.length > exportThreshold) {
            setConfirmExportType('pdf');
            setConfirmExportOpen(true);
            return;
        }

        await proceedGeneratePdf();
    };

    // Excel generation
    const proceedGenerateExcel = async () => {
        try {
            setGeneratingExcel(true);
            setIsGeneratingOverlay(true);
            const title = `${reportTitle} - ${branches.find(b => b.id === selectedBranchId)?.branch_name || ''}`.trim();

            const response = await reportsAPI.generate({
                title,
                selectedFields,
                branch_id: selectedBranchId,
                filters: filters,
                fileType: 'excel'
            }, { responseType: 'blob' });

            const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: mimeType });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${title || 'payroll'}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            showSuccess('تم إنشاء ملف Excel بنجاح');
        } catch (error) {
            console.error('Error generating payroll Excel:', error);
            showError(error.response?.data?.message || 'فشل إنشاء ملف Excel');
        } finally {
            setGeneratingExcel(false);
            setIsGeneratingOverlay(false);
        }
    };

    const handleGenerateExcel = async () => {
        if (!selectedBranchId) {
            showWarning('الرجاء اختيار فرع');
            return;
        }
        if (selectedFields.length === 0) {
            showWarning('الرجاء اختيار حقل واحد على الأقل');
            return;
        }

        // If export is large, confirm with the user
        if (employees.length > exportThreshold) {
            setConfirmExportType('excel');
            setConfirmExportOpen(true);
            return;
        }

        await proceedGenerateExcel();
    };

    const handleCellClick = async (e, text) => {
        e.stopPropagation();
        e.preventDefault();
        
        const textToCopy = String(text || '').trim();
        if (!textToCopy || textToCopy === '-' || textToCopy === '') return;
        
        try {
            // Try modern clipboard API first
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(textToCopy);
                showSuccess('تم نسخ البيانات');
                return;
            }
            throw new Error('Clipboard API not available');
        } catch (error) {
            // Fallback for older browsers or when clipboard API fails
            try {
                const textArea = document.createElement('textarea');
                textArea.value = textToCopy;
                textArea.style.position = 'fixed';
                textArea.style.top = '0';
                textArea.style.left = '0';
                textArea.style.width = '2em';
                textArea.style.height = '2em';
                textArea.style.padding = '0';
                textArea.style.border = 'none';
                textArea.style.outline = 'none';
                textArea.style.boxShadow = 'none';
                textArea.style.background = 'transparent';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                
                if (successful) {
                    showSuccess('تم نسخ البيانات');
                } else {
                    showError('فشل نسخ البيانات');
                }
            } catch (err) {
                console.error('Copy failed:', err);
                showError('فشل نسخ البيانات');
            }
        }
    };

    return (
        <div className="table-page payrolls-page">
            <div className="page-header">
                <h1>المسيرات</h1>
            </div>

            <div className="form-section" ref={formSectionRef}>
                <h2>اختيار الفرع والحقول</h2>
                <div className="selection-row">
                    <div className="branch-select-wrapper">
                        
                        <div className="branch-dropdown">
                            <button
                                ref={branchToggleRef}
                                className="branch-toggle btn btn-secondary"
                                aria-haspopup="listbox"
                                aria-expanded={showBranchesDropdown}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowBranchesDropdown(prev => {
                                        if (!prev) {
                                            setShowFieldsDropdown(false);
                                            setShowFiltersDropdown(false);
                                        }
                                        return !prev;
                                    });
                                }}
                            >
                                {selectedBranchId ? (branches.find(b => b.id === selectedBranchId)?.branch_name) : 'اختر فرعاً'} ▾
                            </button>

                            {showBranchesDropdown && (
                                <div ref={branchesDropdownRef} className="branches-dropdown" role="listbox" aria-label="قائمة الفروع">
                                    <div className="branch-search">
                                        <input
                                            aria-label="بحث في الفروع"
                                            type="search"
                                            placeholder="ابحث عن فرع..."
                                            value={branchSearchTerm}
                                            onChange={(e) => setBranchSearchTerm(e.target.value)}
                                            autoFocus
                                        />
                                    </div>
                                    <div className="branches-list">
                                        {branches.filter(b => b.branch_name.toLowerCase().includes(branchSearchTerm.trim().toLowerCase())).map(b => (
                                            <button
                                                key={b.id}
                                                type="button"
                                                role="option"
                                                aria-selected={selectedBranchId === b.id}
                                                className={`branch-item ${selectedBranchId === b.id ? 'selected' : ''}`}
                                                onClick={() => { setSelectedBranchId(b.id); setShowBranchesDropdown(false); setBranchSearchTerm(''); }}
                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedBranchId(b.id); setShowBranchesDropdown(false); setBranchSearchTerm(''); } }}
                                            >
                                                <BranchBadge branch={b} />
                                                <span className="branch-name">{b.branch_name}</span>
                                            </button>
                                        ))}
                                        {branches.filter(b => b.branch_name.toLowerCase().includes(branchSearchTerm.trim().toLowerCase())).length === 0 && (
                                            <div className="no-branches">لا توجد فروع مطابقة</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="fields-compact">
                    <button 
                        ref={fieldsToggleRef} 
                        type="button" 
                        className="fields-toggle btn btn-secondary" 
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowFieldsDropdown(prev => {
                                if (!prev) {
                                    setShowBranchesDropdown(false);
                                    setShowFiltersDropdown(false);
                                }
                                return !prev;
                            });
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
                                        onClick={() => toggleField(field.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleField(field.value); } }}
                                    >
                                        {field.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    </div>

                    <div className="filters-compact">
                        <button 
                            ref={filtersToggleRef} 
                            type="button" 
                            className="filters-toggle btn btn-secondary" 
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowFiltersDropdown(prev => {
                                    if (!prev) {
                                        setShowBranchesDropdown(false);
                                        setShowFieldsDropdown(false);
                                    }
                                    return !prev;
                                });
                            }} 
                            aria-haspopup="true" 
                            aria-expanded={showFiltersDropdown}
                        >
                            الفلاتر: {getActiveFiltersCount()} محددة ▾
                        </button>

                        {showFiltersDropdown && (
                            <div ref={filtersDropdownRef} className="filters-dropdown" role="menu" aria-label="اختيار الفلاتر">
                                <div className="filters-actions">
                                    <button className="btn btn-link" onClick={clearAllFilters}>مسح الكل</button>
                                    <button className="btn btn-link" onClick={() => setShowFiltersDropdown(false)}>إغلاق</button>
                                </div>
                                
                                <div className="filters-grid">
                                    {/* Nationality Filter - only if nationality field is selected */}
                                    {selectedFields.includes('nationality') && (
                                        <div className="filter-group">
                                            <div className="filter-group-header">
                                                <span>الجنسية</span>
                                                <button className="btn btn-link btn-sm" onClick={() => clearFilter('nationality')}>مسح</button>
                                            </div>
                                            <div className="filter-grid">
                                                {filterOptions.nationalities.map(nat => (
                                                    <button
                                                        key={nat}
                                                        type="button"
                                                        className={`filter-btn ${filters.nationality.includes(nat) ? 'selected' : ''}`}
                                                        onClick={() => toggleFilter('nationality', nat)}
                                                    >
                                                        {nat}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Job Title Filter - only if job_title field is selected */}
                                    {selectedFields.includes('job_title') && (
                                        <div className="filter-group">
                                            <div className="filter-group-header">
                                                <span>المسمى الوظيفي</span>
                                                <button className="btn btn-link btn-sm" onClick={() => clearFilter('job_title')}>مسح</button>
                                            </div>
                                            <div className="filter-grid">
                                                {filterOptions.jobTitles.map(job => (
                                                    <button
                                                        key={job}
                                                        type="button"
                                                        className={`filter-btn ${filters.job_title.includes(job) ? 'selected' : ''}`}
                                                        onClick={() => toggleFilter('job_title', job)}
                                                    >
                                                        {job}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Gender Filter - only if gender field is selected */}
                                    {selectedFields.includes('gender') && (
                                        <div className="filter-group">
                                            <div className="filter-group-header">
                                                <span>الجنس</span>
                                                <button className="btn btn-link btn-sm" onClick={() => clearFilter('gender')}>مسح</button>
                                            </div>
                                            <div className="filter-grid">
                                                {filterOptions.genders.map(gender => (
                                                    <button
                                                        key={gender}
                                                        type="button"
                                                        className={`filter-btn ${filters.gender.includes(gender) ? 'selected' : ''}`}
                                                        onClick={() => toggleFilter('gender', gender)}
                                                    >
                                                        {gender === 'male' ? 'ذكر' : 'أنثى'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Marital Status Filter - only if marital_status field is selected */}
                                    {selectedFields.includes('marital_status') && (
                                        <div className="filter-group">
                                            <div className="filter-group-header">
                                                <span>الحالة الاجتماعية</span>
                                                <button className="btn btn-link btn-sm" onClick={() => clearFilter('marital_status')}>مسح</button>
                                            </div>
                                            <div className="filter-grid">
                                                {filterOptions.maritalStatuses.map(status => (
                                                    <button
                                                        key={status}
                                                        type="button"
                                                        className={`filter-btn ${filters.marital_status.includes(status) ? 'selected' : ''}`}
                                                        onClick={() => toggleFilter('marital_status', status)}
                                                    >
                                                        {status}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Educational Qualification Filter - only if educational_qualification field is selected */}
                                    {selectedFields.includes('educational_qualification') && (
                                        <div className="filter-group">
                                            <div className="filter-group-header">
                                                <span>المؤهل التعليمي</span>
                                                <button className="btn btn-link btn-sm" onClick={() => clearFilter('educational_qualification')}>مسح</button>
                                            </div>
                                            <div className="filter-grid">
                                                {filterOptions.educationalQualifications.map(qual => (
                                                    <button
                                                        key={qual}
                                                        type="button"
                                                        className={`filter-btn ${filters.educational_qualification.includes(qual) ? 'selected' : ''}`}
                                                        onClick={() => toggleFilter('educational_qualification', qual)}
                                                    >
                                                        {qual}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Contract Type Filter - only if contract_type field is selected */}
                                    {selectedFields.includes('contract_type') && (
                                        <div className="filter-group">
                                            <div className="filter-group-header">
                                                <span>نوع العقد</span>
                                                <button className="btn btn-link btn-sm" onClick={() => clearFilter('contract_type')}>مسح</button>
                                            </div>
                                            <div className="filter-grid">
                                                {filterOptions.contractTypes.map(contract => (
                                                    <button
                                                        key={contract}
                                                        type="button"
                                                        className={`filter-btn ${filters.contract_type.includes(contract) ? 'selected' : ''}`}
                                                        onClick={() => toggleFilter('contract_type', contract)}
                                                    >
                                                        {contract}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Data Completion Status Filter - only if data_completion_status field is selected */}
                                    {selectedFields.includes('data_completion_status') && (
                                        <div className="filter-group">
                                            <div className="filter-group-header">
                                                <span>حالة إكمال البيانات</span>
                                                <button className="btn btn-link btn-sm" onClick={() => clearFilter('data_completion_status')}>مسح</button>
                                            </div>
                                            <div className="filter-grid">
                                                {filterOptions.dataCompletionStatuses.map(status => (
                                                    <button
                                                        key={status}
                                                        type="button"
                                                        className={`filter-btn ${filters.data_completion_status.includes(status) ? 'selected' : ''}`}
                                                        onClick={() => toggleFilter('data_completion_status', status)}
                                                    >
                                                        {status === DATA_COMPLETION_STATUS.COMPLETE ? 'مكتمل' : 'غير مكتمل'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="actions-section">
                    <button className="btn btn-primary" onClick={loadPreview} disabled={previewLoading}>{previewLoading ? 'جاري التحميل...' : 'عرض المعاينة'}</button>
                    <button className="btn btn-primary" onClick={handleGeneratePdf} disabled={generating}>{generating ? 'جاري الإنشاء...' : 'توليد PDF'}</button>
                    <button className="btn btn-primary" onClick={handleGenerateExcel} disabled={generatingExcel}>{generatingExcel ? 'جاري الإنشاء...' : 'توليد Excel'}</button>
                </div>

                <div className="preview-section">
                    <div className="preview-header">
                        {selectedBranchId && (
                            <div className="branch-info">
                                <div className="branch-info-name">{branches.find(b => b.id === selectedBranchId)?.branch_name}</div>
                                <div className="branch-info-stats">
                                    <span>عدد الموظفين: {employees.length} / {totalEmployees}</span>
                                    <span>مكتمل: {employees.filter(e => e.data_completion_status === 'complete').length}</span>
                                    <span>غير مكتمل: {employees.filter(e => e.data_completion_status !== 'complete').length}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {previewLoading ? (
                        <div className="loading">جاري التحميل...</div>
                    ) : (
                        <div className="preview-table-wrapper">
                            <table className="preview-table">
                                <thead>
                                    <tr>
                                        {selectedFields.map(f => (
                                            <th key={f}>{(availableFields.find(a => a.value === f) || {}).label || f}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {employees.length === 0 ? (
                                        <tr><td colSpan={selectedFields.length} className="empty-state" style={{ cursor: 'default' }}>لا توجد بيانات للعرض</td></tr>
                                    ) : (
                                        employees.map(emp => {
                                            // Construct full name from 4 name fields
                                            const getDisplayValue = (field) => {
                                                let value = emp[field];
                                                
                                                // Handle special cases
                                                if (field === 'full_name') {
                                                    const names = [
                                                        emp.first_name,
                                                        emp.second_name,
                                                        emp.third_name,
                                                        emp.fourth_name
                                                    ].filter(name => name && name.trim());
                                                    return names.length > 0 ? names.join(' ') : emp.full_name || '-';
                                                }
                                                
                                                // Calculate total salary (sum of all allowances minus deductions)
                                                if (field === 'total_salary') {
                                                    const baseSalary = parseFloat(emp.base_salary) || 0;
                                                    const housingAllowance = parseFloat(emp.housing_allowance) || 0;
                                                    const transportationAllowance = parseFloat(emp.transportation_allowance) || 0;
                                                    const endOfServiceAllowance = parseFloat(emp.end_of_service_allowance) || 0;
                                                    const annualLeaveAllowance = parseFloat(emp.annual_leave_allowance) || 0;
                                                    const otherAllowances = parseFloat(emp.other_allowances) || 0;
                                                    const deductions = parseFloat(emp.deductions) || 0;
                                                    
                                                    const total = baseSalary + housingAllowance + transportationAllowance + 
                                                                  endOfServiceAllowance + annualLeaveAllowance + otherAllowances - deductions;
                                                    
                                                    return total > 0 ? total.toFixed(2) : '0.00';
                                                }
                                                
                                                // Handle date fields - format Gregorian dates
                                                if (field === 'date_of_birth_gregorian' || field === 'id_expiry_date_gregorian' || 
                                                    field === 'passport_issue_date' || field === 'passport_expiry_date' || 
                                                    field === 'residency_issue_date') {
                                                    if (value) {
                                                        // Format date from ISO string or YYYY-MM-DD to dd/mm/yyyy
                                                        return formatDate(value);
                                                    }
                                                    return '-';
                                                }
                                                
                                                // Handle fields that need translation
                                                if (field === 'gender' || field === 'id_type' || field === 'marital_status' || 
                                                    field === 'religion' || field === 'status' || field === 'data_completion_status') {
                                                    return translateValue(field, value || '-');
                                                }
                                                
                                                return value ?? '-';
                                            };
                                            
                                            return (
                                                <tr key={emp.id}>
                                                    {selectedFields.map(f => {
                                                        const cellValue = getDisplayValue(f);
                                                        return (
                                                            <td 
                                                                key={f} 
                                                                className={f === 'full_name' ? 'full-name-cell' : ''}
                                                                onClick={(e) => handleCellClick(e, cellValue)}
                                                                title="انقر للنسخ"
                                                            >
                                                                {cellValue}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Confirmation modal for large exports */}
                {confirmExportOpen && (
                    <div className="modal-overlay" onClick={() => setConfirmExportOpen(false)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <h3>تأكيد التصدير</h3>
                            <p>عدد الموظفين في التقرير هو {employees.length}. قد تستغرق العملية وقتاً طويلاً وقد تؤثر على أداء الخادم. هل تريد المتابعة؟</p>
                            <div className="modal-actions">
                                <button className="btn btn-primary" onClick={() => { 
                                    setConfirmExportOpen(false); 
                                    if (confirmExportType === 'excel') {
                                        proceedGenerateExcel();
                                    } else {
                                        proceedGeneratePdf();
                                    }
                                }}>متابعة</button>
                                <button className="btn btn-secondary" onClick={() => setConfirmExportOpen(false)}>إلغاء</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Generating overlay */}
                {isGeneratingOverlay && (
                    <div className="generating-overlay">
                        <div className="generating-content">
                            <div className="spinner-large"></div>
                            <div className="generating-text">جاري إنشاء الملف، الرجاء الانتظار...</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Payrolls;
