import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { branchesAPI, employeesAPI, reportsAPI } from '../utils/api';
import BranchBadge from '../components/BranchBadge';
import './Payrolls.css';

const availableFields = [
    { value: 'full_name', label: 'الاسم الكامل' },
    { value: 'first_name', label: 'الاسم الأول' },
    { value: 'second_name', label: 'الاسم الثاني' },
    { value: 'third_name', label: 'الاسم الثالث' },
    { value: 'fourth_name', label: 'الاسم الرابع' },
    { value: 'employee_id_number', label: 'رقم الموظف' },
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
    { value: 'deductions', label: 'الخصومات' },
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
    const [previewLoading, setPreviewLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [reportTitle, setReportTitle] = useState('المسيرات');

    // UI state for compact field selection dropdown
    const [showFieldsDropdown, setShowFieldsDropdown] = useState(false);
    const fieldsDropdownRef = useRef(null);
    const fieldsToggleRef = useRef(null);

    // Branch dropdown state (modern UI)
    const [showBranchesDropdown, setShowBranchesDropdown] = useState(false);
    const branchesDropdownRef = useRef(null);
    const branchToggleRef = useRef(null);
    const [branchSearchTerm, setBranchSearchTerm] = useState('');

    // Confirmation modal for large exports
    const [confirmExportOpen, setConfirmExportOpen] = useState(false);
    const exportThreshold = 500; // warn if employee count exceeds this
    const [isGeneratingOverlay, setIsGeneratingOverlay] = useState(false);
    const handleSelectAllFields = () => setSelectedFields(availableFields.map(f => f.value));
    const handleClearFields = () => setSelectedFields([]);
    const toggleField = (value) => {
        setSelectedFields(prev => prev.includes(value) ? prev.filter(f => f !== value) : [...prev, value]);
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
            const response = await employeesAPI.getAll({ branch_id: selectedBranchId, is_active: true });
            if (response.data.success) {
                setEmployees(response.data.data || []);
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
                setBranchSearchTerm('');
            }
        };
        document.addEventListener('keydown', handleEsc);
        return () => {
            document.removeEventListener('keydown', handleEsc);
        };
    }, [showFieldsDropdown, showBranchesDropdown]);

    // Auto-load preview when selected branch changes for a smoother UX
    useEffect(() => {
        if (selectedBranchId) {
            loadPreview();
        }
    }, [selectedBranchId]);

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
            setConfirmExportOpen(true);
            return;
        }

        await proceedGeneratePdf();
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

            <div className="form-section">
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
                                    setShowBranchesDropdown(prev => !prev);
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
                </div>

                <div className="actions-section">
                    <button className="btn btn-primary" onClick={loadPreview} disabled={previewLoading}>{previewLoading ? 'جاري التحميل...' : 'عرض المعاينة'}</button>
                    <button className="btn btn-primary" onClick={handleGeneratePdf} disabled={generating}>{generating ? 'جاري الإنشاء...' : 'توليد PDF'}</button>
                </div>

                <div className="preview-section">
                    <div className="preview-header">
                        <h2>المعاينة</h2>
                        {selectedBranchId && (
                            <div className="branch-info">
                                <div className="branch-info-name">{branches.find(b => b.id === selectedBranchId)?.branch_name}</div>
                                <div className="branch-info-stats">
                                    <span>عدد الموظفين: {employees.length}</span>
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
                                                if (field === 'full_name') {
                                                    const names = [
                                                        emp.first_name,
                                                        emp.second_name,
                                                        emp.third_name,
                                                        emp.fourth_name
                                                    ].filter(name => name && name.trim());
                                                    return names.length > 0 ? names.join(' ') : emp.full_name || '-';
                                                }
                                                return emp[field] ?? '-';
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
                                <button className="btn btn-primary" onClick={() => { setConfirmExportOpen(false); proceedGeneratePdf(); }}>متابعة</button>
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
