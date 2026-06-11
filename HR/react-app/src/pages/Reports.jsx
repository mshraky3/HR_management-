import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { branchesAPI, employeesAPI, reportsAPI, branchDocumentsAPI, documentsAPI } from '../utils/api';
import { downloadFile } from '../utils/downloadFile';
import BranchBadge from '../components/BranchBadge';
import { DATA_COMPLETION_STATUS, getDocumentTypeLabel, DOCUMENT_TYPE_LABELS } from '../utils/employeeConstants';
import { formatDate } from '../utils/dateConverters';
import { translateValue } from '../utils/translations';
import './Reports.css';

const PREVIEW_PAGE_SIZE = 50;

const availableFields = [
    { value: 'employee_id_number', label: 'رقم الموظف' },
    { value: 'full_name', label: 'الاسم الكامل' },
    { value: 'first_name', label: 'الاسم الأول' },
    { value: 'second_name', label: 'الاسم الثاني' },
    { value: 'third_name', label: 'الاسم الثالث' },
    { value: 'fourth_name', label: 'الاسم الرابع' },
    { value: 'branch_id', label: 'الفرع' },
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
    { value: 'age', label: 'العمر' },
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
    { value: 'contract_start_date_hijri', label: 'تاريخ بداية العقد (هجري)' },
    { value: 'contract_start_date_gregorian', label: 'تاريخ بداية العقد (ميلادي)' },
    { value: 'contract_end_date_hijri', label: 'تاريخ نهاية العقد (هجري)' },
    { value: 'contract_end_date_gregorian', label: 'تاريخ نهاية العقد (ميلادي)' },
    { value: 'contract_days_remaining', label: 'الأيام المتبقية للعقد' },
    { value: 'national_address', label: 'العنوان الوطني' },
    { value: 'years_of_experience_in_same_institution', label: 'سنوات الخبرة في نفس المؤسسة' },
    { value: 'years_of_experience_in_company', label: 'سنوات الخبرة في الشركة' },
    { value: 'salary', label: 'الراتب' },
    { value: 'base_salary', label: 'الراتب الأساسي' },
    { value: 'housing_allowance', label: 'بدل السكن' },
    { value: 'transportation_allowance', label: 'بدل المواصلات' },
    { value: 'end_of_service_allowance', label: 'بدل نهاية الخدمة' },
    { value: 'annual_leave_allowance', label: 'بدل الإجازة السنوية' },
    { value: 'other_allowances', label: 'بدلات أخرى' },
    { value: 'total_salary', label: 'اجمالي الراتب' },
    { value: 'passport_number', label: 'رقم الجواز' },
    { value: 'passport_issue_date', label: 'تاريخ إصدار الجواز' },
    { value: 'passport_expiry_date', label: 'تاريخ انتهاء الجواز' },
    { value: 'passport_issue_place', label: 'مكان إصدار الجواز' },
    { value: 'residency_issue_date', label: 'تاريخ إصدار الإقامة' },
    { value: 'status', label: 'الحالة' },
    { value: 'data_completion_status', label: 'حالة إكمال البيانات' }
];

// Contract-expiry filter buckets — computed from contract_end_date_gregorian (days remaining)
const CONTRACT_EXPIRY_OPTIONS = [
    { value: 'expired', label: 'منتهي' },
    { value: 'within_30', label: '0 - 30 يوم' },
    { value: 'within_60', label: '31 - 60 يوم' },
    { value: 'within_90', label: '61 - 90 يوم' },
    { value: 'over_90', label: 'أكثر من 90 يوم' },
];

const matchesContractBucket = (daysRemaining, bucket) => {
    if (daysRemaining === null) return false;
    switch (bucket) {
        case 'expired': return daysRemaining < 0;
        case 'within_30': return daysRemaining >= 0 && daysRemaining <= 30;
        case 'within_60': return daysRemaining >= 31 && daysRemaining <= 60;
        case 'within_90': return daysRemaining >= 61 && daysRemaining <= 90;
        case 'over_90': return daysRemaining > 90;
        default: return false;
    }
};

const Reports = () => {
    const { isMainManager, user } = useAuth();
    const { showError, showSuccess, showWarning } = useNotification();
    const [searchParams, setSearchParams] = useSearchParams();
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);

    // Branch selection state
    const [selectedBranchId, setSelectedBranchId] = useState(null); // For single branch (branch managers or single selection)
    const [selectedBranchIds, setSelectedBranchIds] = useState([]); // For multi-branch (main managers)
    const [selectAllBranches, setSelectAllBranches] = useState(false);
    const [branchTypeFilter, setBranchTypeFilter] = useState([]); // Filter by branch type
    const [currentBranchId, setCurrentBranchId] = useState(null);

    const [selectedFields, setSelectedFields] = useState(['full_name', 'id_or_residency_number']);
    const [employees, setEmployees] = useState([]);
    const [totalEmployees, setTotalEmployees] = useState(0);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [generatingExcel, setGeneratingExcel] = useState(false);
    const [reportTitle, setReportTitle] = useState('التقارير');
    const [generationProgress, setGenerationProgress] = useState(0);
    const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);

    // File type and document selection
    const [fileType, setFileType] = useState('pdf');
    const [selectedDocuments, setSelectedDocuments] = useState([]);
    const [showDocumentWarning, setShowDocumentWarning] = useState(false);
    const [missingDocumentsInfo, setMissingDocumentsInfo] = useState(null);

    // Filters state (including age)
    const [filters, setFilters] = useState({
        nationality: [],
        job_title: [],
        gender: [],
        marital_status: [],
        educational_qualification: [],
        contract_type: [],
        data_completion_status: [],
        contract_expiry: [],
        min_age: '',
        max_age: '',
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

    // UI state for compact dropdowns
    const [showFieldsDropdown, setShowFieldsDropdown] = useState(false);
    const fieldsDropdownRef = useRef(null);
    const fieldsToggleRef = useRef(null);

    const [showFiltersDropdown, setShowFiltersDropdown] = useState(false);
    const filtersDropdownRef = useRef(null);
    const filtersToggleRef = useRef(null);

    const [showBranchesDropdown, setShowBranchesDropdown] = useState(false);
    const branchesDropdownRef = useRef(null);
    const branchToggleRef = useRef(null);
    const [branchSearchTerm, setBranchSearchTerm] = useState('');
    const formSectionRef = useRef(null);

    // Multi-branch selection UI (for main managers) - dropdown style
    const [showMultiBranchDropdown, setShowMultiBranchDropdown] = useState(false);
    const multiBranchDropdownRef = useRef(null);
    const multiBranchToggleRef = useRef(null);
    const [multiBranchSearchTerm, setMultiBranchSearchTerm] = useState('');

    // Document selection dropdown
    const [showDocumentsDropdown, setShowDocumentsDropdown] = useState(false);
    const documentsDropdownRef = useRef(null);
    const documentsToggleRef = useRef(null);

    // Confirmation modal for large exports
    const [confirmExportOpen, setConfirmExportOpen] = useState(false);
    const [confirmExportType, setConfirmExportType] = useState('pdf');
    const exportThreshold = 500;
    const [isGeneratingOverlay, setIsGeneratingOverlay] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const isGlobalLoading = loading || previewLoading || isGeneratingOverlay || generating || generatingExcel;

    // Helper functions
    const handleSelectAllFields = () => setSelectedFields(availableFields.map(f => f.value));
    const handleClearFields = () => setSelectedFields([]);
    const toggleField = (value) => {
        setSelectedFields(prev => prev.includes(value) ? prev.filter(f => f !== value) : [...prev, value]);
    };

    const getCurrentBranchId = useCallback(() => {
        return currentBranchId ||
            (!isMainManager() && user?.branch_id ? user.branch_id : null) ||
            (isMainManager() ? parseInt(searchParams.get('branch_id') || '0') || null : null);
    }, [currentBranchId, isMainManager, user, searchParams]);

    // Load branches with filters
    const loadBranches = async () => {
        try {
            const filters = { is_active: true };

            if (!isMainManager() && user?.branch_id) {
                filters.id = user.branch_id;
            } else if (isMainManager() && branchTypeFilter.length > 0) {
                if (branchTypeFilter.length === 1) {
                    filters.branch_type = branchTypeFilter[0];
                }
            }

            const response = await branchesAPI.getAll(filters);
            if (response.data.success) {
                setBranches(response.data.data || []);
                if (!isMainManager() && user?.branch_id) {
                    setCurrentBranchId(user.branch_id);
                }
            }
        } catch (error) {
            console.error('Error loading branches:', error);
            showError('فشل تحميل الفروع');
        } finally {
            setLoading(false);
        }
    };

    // Load filter options
    const loadFilterOptions = async () => {
        try {
            const filters = { is_active: true };

            if (!isMainManager() && user?.branch_id) {
                filters.branch_id = user.branch_id;
            } else if (isMainManager() && !selectAllBranches && selectedBranchIds.length > 0) {
                filters.branch_id = selectedBranchIds.length === 1 ? selectedBranchIds[0] : selectedBranchIds;
            } else if (isMainManager() && selectAllBranches) {
                // Don't filter by branch_id if selecting all
            } else if (selectedBranchId) {
                filters.branch_id = selectedBranchId;
            }

            const response = await employeesAPI.getAll(filters);
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
        loadBranches();
    }, [branchTypeFilter, isMainManager, user]);

    useEffect(() => {
        loadFilterOptions();
    }, [selectedBranchIds, selectAllBranches, selectedBranchId, isMainManager, user]);

    useEffect(() => {
        if (isMainManager() && branches.length > 0) {
            const branchIdFromUrl = searchParams.get('branch_id');
            if (branchIdFromUrl) {
                const branchId = parseInt(branchIdFromUrl);
                setCurrentBranchId(branchId);
                setSelectedBranchIds([branchId]);
                setSelectedBranchId(branchId);
                setSelectAllBranches(false);
            } else {
                setCurrentBranchId(null);
                setSelectedBranchId(null);
                setSelectedBranchIds([]);
                setSelectAllBranches(false);
            }
        }
    }, [searchParams, isMainManager, branches]);

    // Filter handlers
    const toggleFilter = (filterType, value) => {
        setFilters(prev => ({
            ...prev,
            [filterType]: prev[filterType].includes(value)
                ? prev[filterType].filter(f => f !== value)
                : [...prev[filterType], value]
        }));
    };

    const handleFilterChange = (filterName, value) => {
        setFilters(prev => ({
            ...prev,
            [filterName]: value
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
            contract_expiry: [],
            min_age: '',
            max_age: '',
        });
    };

    const getActiveFiltersCount = () => {
        return Object.values(filters).reduce((count, val) => {
            if (Array.isArray(val)) {
                return count + val.length;
            } else if (val !== '' && val !== null && val !== undefined) {
                return count + 1;
            }
            return count;
        }, 0);
    };

    // Report templates
    const reportTemplates = {
        contactInfo: {
            title: 'تقرير بيانات التواصل',
            fields: ['full_name', 'phone_number', 'email', 'id_or_residency_number']
        },
        bankAccounts: {
            title: 'تقرير الحسابات البنكية',
            fields: ['full_name', 'bank_iban', 'id_or_residency_number', 'bank_name']
        },
        jobs: {
            title: 'تقرير الوظائف',
            fields: ['full_name', 'occupation', 'job_title', 'nationality']
        }
    };

    const hasMultipleBranches = () => {
        if (isMainManager()) {
            return selectAllBranches || selectedBranchIds.length > 1;
        }
        return false;
    };

    const applyTemplate = (templateKey) => {
        const template = reportTemplates[templateKey];
        if (!template) return;

        setReportTitle(template.title);
        let fieldsToSelect = [...template.fields];

        if (hasMultipleBranches() && !fieldsToSelect.includes('branch_id')) {
            fieldsToSelect.push('branch_id');
        }

        setSelectedFields(fieldsToSelect);
        showSuccess(`تم تطبيق ${template.title} بنجاح`);
    };

    // Update selected fields when branch selection changes to add/remove branch_id automatically
    useEffect(() => {
        const needsBranchField = hasMultipleBranches();
        const hasBranchField = selectedFields.includes('branch_id');

        if (needsBranchField && !hasBranchField) {
            setSelectedFields(prev => [...prev, 'branch_id']);
        }
    }, [selectAllBranches, selectedBranchIds]);

    // Check for missing documents before generating report
    const checkMissingDocuments = async (employees, selectedDocTypes) => {
        if (!selectedDocTypes || selectedDocTypes.length === 0) {
            return null;
        }

        const missingInfo = {};

        for (const employee of employees) {
            try {
                const docsResponse = await documentsAPI.getByEmployeeId(employee.id);
                const employeeDocs = docsResponse.data.success ? docsResponse.data.data : [];
                const employeeDocTypes = employeeDocs.map(doc => doc.document_type);

                const missing = selectedDocTypes.filter(docType => !employeeDocTypes.includes(docType));
                if (missing.length > 0) {
                    missingInfo[employee.id] = {
                        name: `${employee.first_name || ''} ${employee.second_name || ''} ${employee.third_name || ''} ${employee.fourth_name || ''}`.trim(),
                        missing: missing
                    };
                }
            } catch (error) {
                console.error(`Error checking documents for employee ${employee.id}:`, error);
            }
        }

        return Object.keys(missingInfo).length > 0 ? missingInfo : null;
    };

    // Calculate age helper
    const calculateAge = (dateOfBirth) => {
        if (!dateOfBirth) return null;
        const birthDate = new Date(dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    };

    // Days remaining until contract end (from Gregorian end date). Negative = expired.
    const calculateDaysRemaining = (endDate) => {
        if (!endDate) return null;
        const end = new Date(endDate);
        if (isNaN(end.getTime())) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        return Math.round((end - today) / (1000 * 60 * 60 * 24));
    };

    // Filter employees by age
    const filterByAge = (employees) => {
        if (!filters.min_age && !filters.max_age) return employees;

        const minAge = filters.min_age ? parseInt(filters.min_age) : null;
        const maxAge = filters.max_age ? parseInt(filters.max_age) : null;

        return employees.filter(emp => {
            const age = calculateAge(emp.date_of_birth_gregorian);
            if (age === null) return false;
            if (minAge !== null && age < minAge) return false;
            if (maxAge !== null && age > maxAge) return false;
            return true;
        });
    };

    // Filter by selected contract-expiry buckets (union of buckets)
    const filterByContractExpiry = (employees) => {
        const buckets = filters.contract_expiry;
        if (!buckets || buckets.length === 0) return employees;

        return employees.filter(emp => {
            const daysRemaining = calculateDaysRemaining(emp.contract_end_date_gregorian);
            return buckets.some(bucket => matchesContractBucket(daysRemaining, bucket));
        });
    };

    const loadPreview = async () => {
        const branchIds = isMainManager()
            ? (selectAllBranches ? branches.map(b => b.id) : selectedBranchIds)
            : (selectedBranchId ? [selectedBranchId] : (user?.branch_id ? [user.branch_id] : []));

        if (branchIds.length === 0) {
            showWarning('الرجاء اختيار فرع للعرض');
            return;
        }
        if (selectedFields.length === 0) {
            showWarning('اختر حقل واحد على الأقل');
            return;
        }

        try {
            setPreviewLoading(true);

            // Load total employees count (without filters) for display
            const totalResponse = await employeesAPI.getAll({
                branch_id: branchIds.length === 1 ? branchIds[0] : branchIds,
                is_active: true
            });
            if (totalResponse.data.success) {
                setTotalEmployees(totalResponse.data.data?.length || 0);
            }

            // Build filter query
            const queryParams = {
                branch_id: branchIds.length === 1 ? branchIds[0] : branchIds,
                is_active: true
            };

            // Add filters to query
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

                // Filter by age
                employeesData = filterByAge(employeesData);

                // Filter by contract expiry buckets
                employeesData = filterByContractExpiry(employeesData);

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
                setShowMultiBranchDropdown(false);
                setShowDocumentsDropdown(false);
                setBranchSearchTerm('');
                setMultiBranchSearchTerm('');
            }
        };
        document.addEventListener('keydown', handleEsc);
        return () => {
            document.removeEventListener('keydown', handleEsc);
        };
    }, [showFieldsDropdown, showBranchesDropdown, showFiltersDropdown, showMultiBranchDropdown, showDocumentsDropdown]);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
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

            const isOutsideMultiBranch = multiBranchDropdownRef.current &&
                !multiBranchDropdownRef.current.contains(event.target) &&
                multiBranchToggleRef.current &&
                !multiBranchToggleRef.current.contains(event.target);

            const isOutsideDocuments = documentsDropdownRef.current &&
                !documentsDropdownRef.current.contains(event.target) &&
                documentsToggleRef.current &&
                !documentsToggleRef.current.contains(event.target);

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
            if (showMultiBranchDropdown && isOutsideMultiBranch) {
                setShowMultiBranchDropdown(false);
                setMultiBranchSearchTerm('');
            }
            if (showDocumentsDropdown && isOutsideDocuments) {
                setShowDocumentsDropdown(false);
            }
        };

        if (showBranchesDropdown || showFieldsDropdown || showFiltersDropdown || showMultiBranchDropdown || showDocumentsDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [showBranchesDropdown, showFieldsDropdown, showFiltersDropdown, showMultiBranchDropdown, showDocumentsDropdown]);

    // Auto-load preview when selected branch or filters change
    useEffect(() => {
        if ((isMainManager() && (selectAllBranches || selectedBranchIds.length > 0)) || (!isMainManager() && selectedBranchId)) {
            loadPreview();
        }
    }, [selectedBranchId, selectedBranchIds, selectAllBranches, filters, isMainManager]);

    // Auto-switch to PDF when documents are selected and fileType is Excel
    useEffect(() => {
        if (selectedDocuments.length > 0 && fileType === 'excel') {
            setFileType('pdf');
        }
    }, [selectedDocuments]);

    useEffect(() => {
        let intervalId;
        let resetTimeout;

        if (loading || previewLoading || isGeneratingOverlay) {
            setLoadingProgress(0);
            intervalId = setInterval(() => {
                setLoadingProgress((prev) => {
                    if (prev >= 90) return prev;
                    const increment = Math.max(2, Math.round((90 - prev) / 8));
                    return Math.min(90, prev + increment);
                });
            }, 300);
        } else if (loadingProgress > 0) {
            setLoadingProgress(100);
            resetTimeout = setTimeout(() => setLoadingProgress(0), 400);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
            if (resetTimeout) clearTimeout(resetTimeout);
        };
    }, [loading, previewLoading, isGeneratingOverlay]);

    // Position dropdowns to span full width of form-section
    useEffect(() => {
        const positionDropdown = (dropdownRef, toggleRef) => {
            if (!dropdownRef.current || !toggleRef.current || !formSectionRef.current) return;

            const formSection = formSectionRef.current;
            const toggle = toggleRef.current;
            const dropdown = dropdownRef.current;
            const dropdownParent = dropdown.parentElement;
            const parentRect = dropdownParent.getBoundingClientRect();

            const formRect = formSection.getBoundingClientRect();
            const toggleRect = toggle.getBoundingClientRect();

            dropdown.style.position = 'absolute';
            dropdown.style.top = `${toggleRect.bottom - parentRect.top + 8}px`;
            dropdown.style.left = `${formRect.left - parentRect.left}px`;
            dropdown.style.width = `${formRect.width}px`;
        };

        const updatePositions = () => {
            // Only position dropdowns that are in the formSectionRef (fields, filters, branches for branch managers)
            // Multi-branch and documents dropdowns use their own positioning (inline styles with relative parent)
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

        const timeoutId = setTimeout(updatePositions, 0);
        window.addEventListener('resize', updatePositions);
        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener('resize', updatePositions);
        };
    }, [showBranchesDropdown, showFieldsDropdown, showFiltersDropdown, showMultiBranchDropdown, showDocumentsDropdown]);

    // Generate report with all features
    const proceedGenerateReport = async (fileTypeToUse) => {
        try {
            setGenerating(fileTypeToUse === 'pdf');
            setGeneratingExcel(fileTypeToUse === 'excel');
            setIsGeneratingOverlay(true);
            setGenerationProgress(0);

            // Simulate progress
            const progressInterval = setInterval(() => {
                setGenerationProgress(prev => {
                    if (prev >= 90) return prev;
                    return prev + Math.random() * 15;
                });
            }, 300);

            if (!reportTitle.trim()) {
                showWarning('الرجاء إدخال عنوان التقرير');
                return;
            }

            // Prepare branch IDs
            let branchIds = null;
            if (isMainManager()) {
                if (selectAllBranches) {
                    branchIds = branches.map(b => b.id);
                } else {
                    branchIds = selectedBranchIds;
                }
            } else {
                branchIds = [getCurrentBranchId() || selectedBranchId || user?.branch_id].filter(Boolean);
            }

            if (branchIds.length === 0) {
                showWarning('الرجاء تحديد فرع واحد على الأقل');
                return;
            }

            // Clean filters
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

            // Check for missing documents if documents are selected
            if (selectedDocuments.length > 0) {
                try {
                    const employeesResponse = await employeesAPI.getAll({
                        ...cleanFilters,
                        branch_id: branchIds.length === 1 ? branchIds[0] : branchIds,
                        is_active: true
                    });

                    if (employeesResponse.data.success) {
                        let employeesList = employeesResponse.data.data || [];
                        employeesList = filterByAge(employeesList);
                        employeesList = filterByContractExpiry(employeesList);
                        const missingInfo = await checkMissingDocuments(employeesList, selectedDocuments);
                        if (missingInfo) {
                            setMissingDocumentsInfo(missingInfo);
                            setShowDocumentWarning(true);
                            setGenerating(false);
                            setGeneratingExcel(false);
                            setIsGeneratingOverlay(false);
                            return;
                        }
                    }
                } catch (error) {
                    console.error('Error checking missing documents:', error);
                }
            }

            // Force PDF if documents are selected
            const finalFileType = selectedDocuments.length > 0 ? 'pdf' : fileTypeToUse;

            const response = await reportsAPI.generate({
                title: reportTitle,
                filters: cleanFilters,
                selectedFields: selectedFields,
                selectedDocuments: selectedDocuments.length > 0 ? selectedDocuments : undefined,
                branch_ids: branchIds,
                branch_id: !isMainManager() ? getCurrentBranchId() : undefined,
                fileType: finalFileType
            }, {
                responseType: 'blob'
            });

            clearInterval(progressInterval);
            setGenerationProgress(100);

            const mimeType = finalFileType === 'excel'
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : 'application/pdf';
            const fileExtension = finalFileType === 'excel' ? 'xlsx' : 'pdf';

            const blob = response.data instanceof Blob
                ? response.data
                : new Blob([response.data], { type: mimeType });
            downloadFile(blob, `${reportTitle}.${fileExtension}`);

            setShowSuccessAnimation(true);
            setTimeout(() => {
                setShowSuccessAnimation(false);
                showSuccess(`تم إنشاء التقرير بنجاح`);
            }, 2000);
        } catch (error) {
            clearInterval(progressInterval);
            console.error('Error generating report:', error);
            showError(error.response?.data?.message || 'فشل إنشاء التقرير');
        } finally {
            setGenerating(false);
            setGeneratingExcel(false);
            setIsGeneratingOverlay(false);
            setGenerationProgress(0);
        }
    };

    const handleContinueWithMissing = async () => {
        setShowDocumentWarning(false);
        setMissingDocumentsInfo(null);
        await proceedGenerateReport(fileType);
    };

    const handleGeneratePdf = async () => {
        setFileType('pdf'); // Track that user selected PDF
        const branchIds = isMainManager()
            ? (selectAllBranches ? branches.map(b => b.id) : selectedBranchIds)
            : (selectedBranchId ? [selectedBranchId] : (user?.branch_id ? [user.branch_id] : []));

        if (branchIds.length === 0) {
            showWarning('الرجاء اختيار فرع');
            return;
        }
        if (selectedFields.length === 0) {
            showWarning('الرجاء اختيار حقل واحد على الأقل');
            return;
        }

        if (employees.length > exportThreshold) {
            setConfirmExportType('pdf');
            setConfirmExportOpen(true);
            return;
        }

        await proceedGenerateReport('pdf');
    };

    const handleGenerateExcel = async () => {
        setFileType('excel'); // Track that user selected Excel
        const branchIds = isMainManager()
            ? (selectAllBranches ? branches.map(b => b.id) : selectedBranchIds)
            : (selectedBranchId ? [selectedBranchId] : (user?.branch_id ? [user.branch_id] : []));

        if (branchIds.length === 0) {
            showWarning('الرجاء اختيار فرع');
            return;
        }
        if (selectedFields.length === 0) {
            showWarning('الرجاء اختيار حقل واحد على الأقل');
            return;
        }

        if (selectedDocuments.length > 0) {
            showWarning('عند اختيار المستندات، يجب أن يكون التقرير بصيغة PDF فقط');
            return;
        }

        if (employees.length > exportThreshold) {
            setConfirmExportType('excel');
            setConfirmExportOpen(true);
            return;
        }

        await proceedGenerateReport('excel');
    };

    const handleCellClick = async (e, text) => {
        e.stopPropagation();
        e.preventDefault();

        const textToCopy = String(text || '').trim();
        if (!textToCopy || textToCopy === '-' || textToCopy === '') return;

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(textToCopy);
                showSuccess('تم نسخ البيانات');
                return;
            }
            throw new Error('Clipboard API not available');
        } catch (error) {
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

    const getSelectedBranchDisplay = () => {
        if (isMainManager()) {
            if (selectAllBranches) {
                return 'كل الفروع';
            } else if (selectedBranchIds.length > 0) {
                if (selectedBranchIds.length === 1) {
                    const branch = branches.find(b => b.id === selectedBranchIds[0]);
                    return branch ? branch.branch_name : 'فرع محدد';
                } else {
                    return `${selectedBranchIds.length} فروع محددة`;
                }
            }
            return 'اختر فرعاً';
        } else {
            if (selectedBranchId) {
                const branch = branches.find(b => b.id === selectedBranchId);
                return branch ? branch.branch_name : 'فرع محدد';
            }
            return 'اختر فرعاً';
        }
    };

    return (
        <div className="table-page reports-page">
            <div className="page-header">
                <h1>التقارير</h1>
                {isGlobalLoading && (
                    <div className="reports-loading-pill">
                        <span>جاري التحميل</span>
                        <span>{loadingProgress}%</span>
                    </div>
                )}
            </div>
            {isGlobalLoading && (
                <div className="reports-loading-bar" aria-hidden="true">
                    <div className="reports-loading-bar-fill" style={{ width: `${Math.max(10, loadingProgress)}%` }}></div>
                </div>
            )}

            {/* Branch Selection Section for Main Manager - MOVED TO TOP */}
            {isMainManager() && (
                <div className="form-section section-branches section-branches-top">
                    <div className="section-header-with-icon">
                        <h2>اختيار الفروع</h2>
                        <div className="selection-summary">
                            {selectAllBranches ? (
                                <span className="summary-badge summary-all">كل الفروع</span>
                            ) : selectedBranchIds.length > 0 ? (
                                <span className="summary-badge summary-selected">{selectedBranchIds.length} فروع محددة</span>
                            ) : (
                                <span className="summary-badge summary-none">لم يتم الاختيار</span>
                            )}
                        </div>
                    </div>

                    {/* Branch Selection - Always Visible */}
                    <div className="branches-selection-always-visible">
                        <div className="branches-action-buttons">
                            <button
                                className="btn btn-link"
                                onClick={() => {
                                    setSelectAllBranches(true);
                                    setSelectedBranchIds([]);
                                    setCurrentBranchId(null);
                                    setSelectedBranchId(null);
                                    setSearchParams({});
                                }}
                            >
                                تحديد الكل
                            </button>
                            <button
                                className="btn btn-link"
                                onClick={() => {
                                    setSelectAllBranches(false);
                                    setSelectedBranchIds([]);
                                    setSearchParams({});
                                }}
                            >
                                مسح الكل
                            </button>
                        </div>

                        <div className="branches-search-always-visible">
                            <input
                                type="search"
                                placeholder="ابحث عن فرع..."
                                value={multiBranchSearchTerm}
                                onChange={(e) => setMultiBranchSearchTerm(e.target.value)}
                                className="branches-search-input"
                            />
                        </div>

                        <div className="branches-grid-always-visible">
                            {branches
                                .filter(b =>
                                    !multiBranchSearchTerm ||
                                    b.branch_name.toLowerCase().includes(multiBranchSearchTerm.trim().toLowerCase()) ||
                                    b.branch_location?.toLowerCase().includes(multiBranchSearchTerm.trim().toLowerCase())
                                )
                                .map(branch => (
                                    <button
                                        key={branch.id}
                                        type="button"
                                        className={`field-btn ${selectedBranchIds.includes(branch.id) ? 'selected' : ''}`}
                                        onClick={() => {
                                            if (selectedBranchIds.includes(branch.id)) {
                                                setSelectedBranchIds(selectedBranchIds.filter(id => id !== branch.id));
                                            } else {
                                                setSelectedBranchIds([...selectedBranchIds, branch.id]);
                                            }
                                            setSelectAllBranches(false);
                                            setSearchParams({});
                                        }}
                                    >
                                        <BranchBadge branch={branch} />
                                        <span>{branch.branch_name}</span>
                                    </button>
                                ))}
                            {branches.filter(b =>
                                !multiBranchSearchTerm ||
                                b.branch_name.toLowerCase().includes(multiBranchSearchTerm.trim().toLowerCase()) ||
                                b.branch_location?.toLowerCase().includes(multiBranchSearchTerm.trim().toLowerCase())
                            ).length === 0 && (
                                    <div className="no-branches-message">
                                        لا توجد فروع مطابقة
                                    </div>
                                )}
                        </div>
                    </div>
                </div>
            )}

            {/* Report Templates Section */}
            <div className="form-section section-templates">
                <h2>نماذج التقارير الجاهزة</h2>
                <p className="template-description">اختر نموذج تقرير جاهز لملء الحقول تلقائياً:</p>
                <div className="report-templates">
                    <button
                        type="button"
                        className="template-button"
                        onClick={() => applyTemplate('contactInfo')}
                    >
                        <div className="template-content">
                            <h3>تقرير بيانات التواصل</h3>
                            <p>الاسم، رقم الجوال، الإيميل، رقم الهوية/الإقامة</p>
                        </div>
                    </button>

                    <button
                        type="button"
                        className="template-button"
                        onClick={() => applyTemplate('bankAccounts')}
                    >
                        <div className="template-content">
                            <h3>تقرير الحسابات البنكية</h3>
                            <p>الاسم، رقم الآيبان، رقم الهوية، اسم البنك</p>
                        </div>
                    </button>

                    <button
                        type="button"
                        className="template-button"
                        onClick={() => applyTemplate('jobs')}
                    >
                        <div className="template-content">
                            <h3>تقرير الوظائف</h3>
                            <p>الاسم، المهنة، المسمى الوظيفي، الفرع، الجنسية</p>
                        </div>
                    </button>
                </div>
            </div>

            <div className="form-section section-config" ref={formSectionRef}>
                <h2>اختيار الفرع والحقول</h2>

                {/* Report Title */}
                <div style={{ marginBottom: 'var(--spacing-sm)' }}>
                    <label style={{ display: 'block', marginBottom: 'var(--spacing-xs)', fontWeight: 600 }}>عنوان التقرير:</label>
                    <input
                        type="text"
                        value={reportTitle}
                        onChange={(e) => setReportTitle(e.target.value)}
                        placeholder="أدخل عنوان التقرير"
                        className="form-control"
                        style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: 'var(--radius-lg)', border: '2px solid var(--border)', fontSize: 'var(--font-size-base)' }}
                    />
                </div>

                <div className="selection-row">
                    {/* Branch Selection (for branch managers or single selection) */}
                    {!isMainManager() && (
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
                                                setShowMultiBranchDropdown(false);
                                                setShowDocumentsDropdown(false);
                                            }
                                            return !prev;
                                        });
                                    }}
                                >
                                    {getSelectedBranchDisplay()} ▾
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
                                                    onClick={() => {
                                                        setSelectedBranchId(b.id);
                                                        setShowBranchesDropdown(false);
                                                        setBranchSearchTerm('');
                                                    }}
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
                    )}

                    {/* Fields Selection */}
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
                                        setShowMultiBranchDropdown(false);
                                        setShowDocumentsDropdown(false);
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

                    {/* Filters Selection */}
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
                                        setShowMultiBranchDropdown(false);
                                        setShowDocumentsDropdown(false);
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
                                    {/* Nationality Filter */}
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

                                    {/* Job Title Filter */}
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

                                    {/* Gender Filter */}
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

                                    {/* Marital Status Filter */}
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

                                    {/* Educational Qualification Filter */}
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

                                    {/* Contract Type Filter */}
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

                                    {/* Data Completion Status Filter */}
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

                                    {/* Contract Expiry Filter */}
                                    <div className="filter-group">
                                        <div className="filter-group-header">
                                            <span>انتهاء العقد</span>
                                            <button className="btn btn-link btn-sm" onClick={() => clearFilter('contract_expiry')}>مسح</button>
                                        </div>
                                        <div className="filter-grid">
                                            {CONTRACT_EXPIRY_OPTIONS.map(opt => (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    className={`filter-btn ${filters.contract_expiry.includes(opt.value) ? 'selected' : ''}`}
                                                    onClick={() => toggleFilter('contract_expiry', opt.value)}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Age Filters */}
                                    <div className="filter-group" style={{ minWidth: '280px', maxWidth: 'none' }}>
                                        <div className="filter-group-header">
                                            <span>العمر</span>
                                            <button className="btn btn-link btn-sm" onClick={() => {
                                                handleFilterChange('min_age', '');
                                                handleFilterChange('max_age', '');
                                            }}>مسح</button>
                                        </div>
                                        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexDirection: 'column' }}>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '4px', fontSize: 'var(--font-size-sm)' }}>من:</label>
                                                <input
                                                    type="number"
                                                    value={filters.min_age}
                                                    onChange={(e) => handleFilterChange('min_age', e.target.value)}
                                                    placeholder="الحد الأدنى"
                                                    min="0"
                                                    style={{ width: '100%', padding: '8px', borderRadius: 'var(--radius-md)', border: '2px solid var(--border)', fontSize: 'var(--font-size-sm)' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '4px', fontSize: 'var(--font-size-sm)' }}>إلى:</label>
                                                <input
                                                    type="number"
                                                    value={filters.max_age}
                                                    onChange={(e) => handleFilterChange('max_age', e.target.value)}
                                                    placeholder="الحد الأقصى"
                                                    min="0"
                                                    style={{ width: '100%', padding: '8px', borderRadius: 'var(--radius-md)', border: '2px solid var(--border)', fontSize: 'var(--font-size-sm)' }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Document Selection - Dropdown Style */}
                <div className="documents-section">
                    <h3 className="documents-section-title">المستندات المرفقة (اختياري)</h3>
                    <p className="documents-section-desc">
                        يمكنك اختيار مستندات الموظفين لإدراجها في التقرير. عند اختيار المستندات، سيتم إنشاء تقرير لكل موظف على حدة مع بياناته ومستنداته.
                    </p>
                    <div style={{ position: 'relative' }}>
                        <button
                            ref={documentsToggleRef}
                            type="button"
                            className="documents-toggle"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowDocumentsDropdown(prev => {
                                    if (!prev) {
                                        setShowBranchesDropdown(false);
                                        setShowFieldsDropdown(false);
                                        setShowFiltersDropdown(false);
                                        setShowMultiBranchDropdown(false);
                                    }
                                    return !prev;
                                });
                            }}
                            aria-haspopup="true"
                            aria-expanded={showDocumentsDropdown}
                        >
                            المستندات: {selectedDocuments.length} محددة ▾
                        </button>

                        {showDocumentsDropdown && (
                            <div ref={documentsDropdownRef} className="documents-dropdown">
                                <div className="documents-dropdown-actions">
                                    <button
                                        className="btn btn-link"
                                        onClick={() => {
                                            setSelectedDocuments(Object.keys(DOCUMENT_TYPE_LABELS));
                                            if (fileType === 'excel') {
                                                setFileType('pdf');
                                            }
                                        }}
                                    >
                                        تحديد الكل
                                    </button>
                                    <button
                                        className="btn btn-link"
                                        onClick={() => {
                                            setSelectedDocuments([]);
                                        }}
                                    >
                                        مسح الكل
                                    </button>
                                    <button className="btn btn-link" onClick={() => setShowDocumentsDropdown(false)}>إغلاق</button>
                                </div>
                                <div className="fields-grid">
                                    {Object.entries(DOCUMENT_TYPE_LABELS).map(([docType, label]) => (
                                        <button
                                            key={docType}
                                            type="button"
                                            role="menuitem"
                                            tabIndex={0}
                                            className={`field-btn ${selectedDocuments.includes(docType) ? 'selected' : ''}`}
                                            onClick={() => {
                                                if (selectedDocuments.includes(docType)) {
                                                    setSelectedDocuments(selectedDocuments.filter(d => d !== docType));
                                                } else {
                                                    setSelectedDocuments([...selectedDocuments, docType]);
                                                    if (fileType === 'excel') {
                                                        setFileType('pdf');
                                                    }
                                                }
                                            }}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (selectedDocuments.includes(docType)) { setSelectedDocuments(selectedDocuments.filter(d => d !== docType)); } else { setSelectedDocuments([...selectedDocuments, docType]); if (fileType === 'excel') { setFileType('pdf'); } } } }}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="actions-section">
                    <button className="btn btn-primary" onClick={loadPreview} disabled={previewLoading}>{previewLoading ? 'جاري التحميل...' : 'عرض المعاينة'}</button>
                    <button className="btn btn-primary" onClick={handleGeneratePdf} disabled={generating}>{generating ? 'جاري الإنشاء...' : 'توليد PDF'}</button>
                    <div className="excel-btn-wrapper">
                        <button className="btn btn-primary" onClick={handleGenerateExcel} disabled={generatingExcel || selectedDocuments.length > 0}>{generatingExcel ? 'جاري الإنشاء...' : 'توليد Excel'}</button>
                        {selectedDocuments.length > 0 && (
                            <span className="excel-disabled-hint">Excel لا يدعم تصدير المستندات - استخدم PDF</span>
                        )}
                    </div>
                </div>

                <div className="preview-section">
                    <div className="preview-header">
                        {((isMainManager() && (selectAllBranches || selectedBranchIds.length > 0)) || (!isMainManager() && selectedBranchId)) && (
                            <div className="branch-info">
                                <div className="branch-info-name">
                                    {isMainManager()
                                        ? (selectAllBranches ? 'كل الفروع' : (selectedBranchIds.length === 1 ? branches.find(b => b.id === selectedBranchIds[0])?.branch_name : `${selectedBranchIds.length} فروع`))
                                        : branches.find(b => b.id === selectedBranchId)?.branch_name}
                                </div>
                                <div className="branch-info-stats">
                                    <span>عدد الموظفين: {employees.length} / {totalEmployees}</span>
                                    <span>مكتمل: {employees.filter(e => e.data_completion_status === 'complete').length}</span>
                                    <span>غير مكتمل: {employees.filter(e => e.data_completion_status !== 'complete').length}</span>
                                </div>
                            </div>
                        )}
                        {employees.length > PREVIEW_PAGE_SIZE && (
                            <div className="preview-pagination-hint">
                                يتم عرض {PREVIEW_PAGE_SIZE} سجل في المعاينة من أصل {employees.length} — التقرير سيشمل جميع البيانات
                            </div>
                        )}
                    </div>

                    {previewLoading ? (
                        <div className="loading">
                            <div className="skeleton-rows">
                                {[...Array(8)].map((_, i) => (
                                    <div key={i} className="skeleton skeleton-row" style={{ animationDelay: `${i * 0.05}s` }}></div>
                                ))}
                            </div>
                        </div>
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
                                        employees.slice(0, PREVIEW_PAGE_SIZE).map(emp => {
                                            const getDisplayValue = (field) => {
                                                let value = emp[field];

                                                if (field === 'full_name') {
                                                    const names = [
                                                        emp.first_name,
                                                        emp.second_name,
                                                        emp.third_name,
                                                        emp.fourth_name
                                                    ].filter(name => name && name.trim());
                                                    return names.length > 0 ? names.join(' ') : emp.full_name || '-';
                                                }

                                                if (field === 'branch_id') {
                                                    const branch = branches.find(b => b.id === emp.branch_id);
                                                    return branch ? branch.branch_name : emp.branch_id || '-';
                                                }

                                                if (field === 'age') {
                                                    const age = calculateAge(emp.date_of_birth_gregorian);
                                                    return age !== null ? age.toString() : '-';
                                                }

                                                if (field === 'contract_days_remaining') {
                                                    const d = calculateDaysRemaining(emp.contract_end_date_gregorian);
                                                    if (d === null) return '-';
                                                    if (d < 0) return 'منتهي';
                                                    if (d === 0) return 'ينتهي اليوم';
                                                    return `${d} يوم متبقي`;
                                                }

                                                if (field === 'total_salary') {
                                                    // Use computed total_salary column if available, otherwise calculate manually
                                                    if (emp.total_salary != null) {
                                                        return parseFloat(emp.total_salary).toFixed(2);
                                                    }
                                                    const baseSalary = parseFloat(emp.base_salary) || 0;
                                                    const housingAllowance = parseFloat(emp.housing_allowance) || 0;
                                                    const transportationAllowance = parseFloat(emp.transportation_allowance) || 0;
                                                    const endOfServiceAllowance = parseFloat(emp.end_of_service_allowance) || 0;
                                                    const annualLeaveAllowance = parseFloat(emp.annual_leave_allowance) || 0;
                                                    const otherAllowances = parseFloat(emp.other_allowances) || 0;

                                                    const total = baseSalary + housingAllowance + transportationAllowance +
                                                        endOfServiceAllowance + annualLeaveAllowance + otherAllowances;

                                                    return total > 0 ? total.toFixed(2) : '0.00';
                                                }

                                                if (field === 'date_of_birth_gregorian' || field === 'id_expiry_date_gregorian' ||
                                                    field === 'passport_issue_date' || field === 'passport_expiry_date' ||
                                                    field === 'residency_issue_date' ||
                                                    field === 'contract_start_date_gregorian' || field === 'contract_end_date_gregorian') {
                                                    if (value) {
                                                        return formatDate(value);
                                                    }
                                                    return '-';
                                                }

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
                                    setFileType(confirmExportType); // Track the file type
                                    setConfirmExportOpen(false);
                                    proceedGenerateReport(confirmExportType);
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
                            <div className="progress-container">
                                <div className="progress-header">
                                    <span className="progress-title">جاري إنشاء التقرير</span>
                                    <span className="progress-percentage">{Math.round(generationProgress)}%</span>
                                </div>
                                <div className="progress-bar">
                                    <div className="progress-bar-fill" style={{ width: `${generationProgress}%` }}>
                                        {generationProgress > 20 && `${Math.round(generationProgress)}%`}
                                    </div>
                                </div>
                                <div className="progress-status">
                                    {generationProgress < 30 && 'جاري تجهيز البيانات...'}
                                    {generationProgress >= 30 && generationProgress < 60 && 'جاري معالجة الموظفين...'}
                                    {generationProgress >= 60 && generationProgress < 90 && 'جاري إنشاء المستند...'}
                                    {generationProgress >= 90 && 'جاري الانتهاء...'}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Success Animation */}
                {showSuccessAnimation && (
                    <div className="success-overlay">
                        <div className="success-card">
                            <div className="success-icon"></div>
                            <div className="success-message">تم إنشاء التقرير بنجاح!</div>
                            <div className="success-submessage">جاري تحميل الملف...</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Missing Documents Warning Modal */}
            {showDocumentWarning && missingDocumentsInfo && (
                <div className="modal-overlay" onClick={() => setShowDocumentWarning(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                        <h2>تنبيه: مستندات مفقودة</h2>
                        <p style={{ marginBottom: '15px', color: '#666' }}>
                            بعض الموظفين لا يمتلكون المستندات المختارة. سيتم كتابة "مستند غير متواجد" في التقرير للمستندات المفقودة.
                        </p>
                        <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '20px', border: '1px solid #ddd', padding: '10px', borderRadius: '4px' }}>
                            {Object.entries(missingDocumentsInfo).map(([employeeId, info]) => (
                                <div key={employeeId} style={{ marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px solid #eee' }}>
                                    <strong style={{ display: 'block', marginBottom: '5px' }}>{info.name}</strong>
                                    <div style={{ fontSize: '14px', color: '#d32f2f' }}>
                                        المستندات المفقودة:
                                        <ul style={{ marginTop: '5px', paddingRight: '20px' }}>
                                            {info.missing.map(docType => (
                                                <li key={docType}>{getDocumentTypeLabel(docType)}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="form-actions">
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleContinueWithMissing}
                            >
                                المتابعة مع المستندات المفقودة
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                    setShowDocumentWarning(false);
                                    setMissingDocumentsInfo(null);
                                }}
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Reports;