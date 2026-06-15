import React, { useState, useEffect, useRef } from 'react';
import { busTransportationReportAPI } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';
import { downloadFile } from '../utils/downloadFile';
import { useBranches } from '../hooks/useBranches';
import '../styles/BusTransportationReport.css';
export default function BusTransportationReport() {
    const { branches } = useBranches({});
    const [selectedBranches, setSelectedBranches] = useState([]);
    const [branchesFilter, setBranchesFilter] = useState('');
    const [showBranchesDropdown, setShowBranchesDropdown] = useState(false);
    const branchesDropdownRef = useRef(null);

    const [selectedData, setSelectedData] = useState({
        summary: true,
        busDetails: true,
        drivers: true,
        routes: true,
        students: true,
    });
    const [generating, setGenerating] = useState(false);
    const [generatingLicenses, setGeneratingLicenses] = useState(false);
    const { showError, showSuccess } = useNotification();

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (branchesDropdownRef.current && !branchesDropdownRef.current.contains(event.target)) {
                setShowBranchesDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleDataToggle = (key) => {
        setSelectedData(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const handleSelectAll = () => {
        const allTrue = Object.values(selectedData).every(v => v);
        const newData = {};
        Object.keys(selectedData).forEach(key => {
            newData[key] = !allTrue;
        });
        setSelectedData(newData);
    };

    const toggleBranch = (branchId) => {
        setSelectedBranches(prev => {
            if (prev.includes(branchId)) {
                return prev.filter(id => id !== branchId);
            } else {
                return [...prev, branchId];
            }
        });
    };

    const handleSelectAllBranches = () => {
        if (branches.length === 0) {
            return;
        }

        if (selectedBranches.length === branches.length) {
            setSelectedBranches([]);
            return;
        }

        const allBranchIds = branches.map(branch => branch.id);
        setSelectedBranches(allBranchIds);
    };

    const generatePDF = async () => {
        if (selectedBranches.length === 0) {
            showError('الرجاء اختيار فرع واحد على الأقل');
            return;
        }

        const selectedCount = Object.values(selectedData).filter(v => v === true).length;
        if (selectedCount === 0) {
            showError('الرجاء اختيار قسم واحد على الأقل');
            return;
        }

        setGenerating(true);
        try {
            const response = await busTransportationReportAPI.generatePDF({
                branchIds: selectedBranches.map(id => Number(id)),
                sections: selectedData,
            }, { responseType: 'blob' });

            const blob = response.data instanceof Blob
                ? response.data
                : new Blob([response.data], { type: 'application/pdf' });
            downloadFile(blob, `تقرير-النقل-بالحافلات-${new Date().toLocaleDateString('ar-SA')}.pdf`);

            showSuccess('تم إنشاء التقرير بنجاح');
        } catch (error) {
            console.error('Error generating PDF:', error);
            const errorMessage = error.response?.data?.message || 'فشل إنشاء التقرير';
            showError(errorMessage);
        } finally {
            setGenerating(false);
        }
    };

    const generateDriverLicensesReport = async () => {
        if (selectedBranches.length === 0) {
            showError('الرجاء اختيار فرع واحد على الأقل');
            return;
        }

        setGeneratingLicenses(true);
        try {
            const response = await busTransportationReportAPI.generateDriverLicenses({
                branchIds: selectedBranches.map(id => Number(id)),
            }, { responseType: 'blob' });

            const blob = response.data instanceof Blob
                ? response.data
                : new Blob([response.data], { type: 'application/pdf' });
            downloadFile(blob, `تقرير-رخص-السائقين-${new Date().toLocaleDateString('ar-SA')}.pdf`);

            showSuccess('تم إنشاء تقرير رخص السائقين بنجاح');
        } catch (error) {
            console.error('Error generating driver licenses report:', error);
            // With responseType 'blob', error bodies arrive as a Blob — parse it for the Arabic message.
            let errorMessage = 'فشل إنشاء تقرير رخص السائقين';
            const data = error.response?.data;
            if (data instanceof Blob) {
                try {
                    const parsed = JSON.parse(await data.text());
                    errorMessage = parsed.error || parsed.message || errorMessage;
                } catch { /* keep default message */ }
            } else if (data?.error || data?.message) {
                errorMessage = data.error || data.message;
            }
            showError(errorMessage);
        } finally {
            setGeneratingLicenses(false);
        }
    };

    const dataOptions = [
        { key: 'summary', label: 'ملخص عام', icon: '📊' },
        { key: 'busDetails', label: 'تفاصيل الحافلات', icon: '🚌' },
        { key: 'drivers', label: 'بيانات السائقين', icon: '👨‍💼' },
        { key: 'routes', label: 'المسارات', icon: '🗺️' },
        { key: 'students', label: 'الطلاب المسجلين', icon: '👨‍🎓' },
    ];

    const filteredBranchesForDropdown = branches.filter(b =>
        b.branch_name && b.branch_name.includes(branchesFilter)
    );

    const selectedCount = Object.values(selectedData).filter(v => v === true).length;
    const allSelected = Object.values(selectedData).every(v => v === true);
    const allBranchesSelected = branches.length > 0 && selectedBranches.length === branches.length;

    return (
        <div className="bus-report-page">
            <form onSubmit={(e) => { e.preventDefault(); generatePDF(); }} className="report-form">
                {/* Branch Selection Section - Modern Design */}
                <div className="form-section branches-section">
                    <div className="section-header-modern">
                        <h2>🏢 اختيار الفروع</h2>
                        {selectedBranches.length > 0 && (
                            <div className="selection-badge">
                                <span className="badge-count">{selectedBranches.length}</span>
                                <span className="badge-text">فروع محددة</span>
                            </div>
                        )}
                    </div>

                    <div className="branches-selection-modern">
                        <div className="filter-group-modern" ref={branchesDropdownRef}>
                            <button
                                type="button"
                                className="filter-button-modern"
                                onClick={() => setShowBranchesDropdown(!showBranchesDropdown)}
                            >
                                <span className="button-content">
                                    {selectedBranches.length > 0 ? (
                                        <>
                                            <span className="selected-count-badge">{selectedBranches.length}</span>
                                            فروع محددة من {branches.length}
                                        </>
                                    ) : (
                                        <>
                                            <span className="icon">🔍</span>
                                            اختر الفروع لتوليد التقرير
                                        </>
                                    )}
                                </span>
                                <span className={`dropdown-arrow ${showBranchesDropdown ? 'open' : ''}`}>▼</span>
                            </button>

                            {showBranchesDropdown && (
                                <div className="filter-dropdown-wrapper-modern">
                                    <div className="dropdown-header-modern">
                                        <input
                                            type="text"
                                            placeholder="🔍 ابحث عن فرع..."
                                            value={branchesFilter}
                                            onChange={e => setBranchesFilter(e.target.value)}
                                            className="filter-search-input-modern"
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            onClick={handleSelectAllBranches}
                                            className="select-all-btn-modern"
                                            disabled={branches.length === 0}
                                        >
                                            {allBranchesSelected ? '✕ إلغاء الكل' : '✓ تحديد الكل'}
                                        </button>
                                    </div>
                                    <div className="filter-dropdown-menu-modern">
                                        {filteredBranchesForDropdown.length > 0 ? (
                                            filteredBranchesForDropdown.map(branch => (
                                                <label key={branch.id} className="dropdown-checkbox-item-modern">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedBranches.includes(branch.id)}
                                                        onChange={() => toggleBranch(branch.id)}
                                                    />
                                                    <span className="branch-name">{branch.branch_name}</span>
                                                    {selectedBranches.includes(branch.id) && (
                                                        <span className="check-icon">✓</span>
                                                    )}
                                                </label>
                                            ))
                                        ) : (
                                            <div className="empty-filter-message-modern">
                                                <span className="empty-icon">🔍</span>
                                                <span>لا توجد فروع مطابقة</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Selected Branches Display - Modern */}
                        {selectedBranches.length > 0 && (
                            <div className="selected-branches-display">
                                <div className="selected-items-grid">
                                    {selectedBranches.map(branchId => {
                                        const branch = branches.find(b => b.id === branchId);
                                        return (
                                            <div key={branchId} className="selected-branch-chip">
                                                <span className="chip-icon">🏢</span>
                                                <span className="chip-text">{branch?.branch_name}</span>
                                                <button
                                                    type="button"
                                                    className="chip-remove-btn"
                                                    onClick={() => toggleBranch(branchId)}
                                                    title="إزالة"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                                <button
                                    type="button"
                                    className="clear-all-branches-btn"
                                    onClick={() => setSelectedBranches([])}
                                >
                                    <span className="btn-icon">🗑️</span>
                                    مسح جميع الفروع
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sections Selection */}
                <div className="form-section">
                    <div className="section-header">
                        <h2>الأقسام المراد تضمينها</h2>
                        <div className="header-controls">
                            <button
                                type="button"
                                onClick={handleSelectAll}
                                className="btn btn-secondary btn-sm"
                            >
                                {allSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                            </button>
                            <span className="selection-counter">
                                تم تحديد {selectedCount} من {dataOptions.length}
                            </span>
                        </div>
                    </div>

                    <div className="sections-grid">
                        {dataOptions.map(section => (
                            <label key={section.key} className="section-checkbox">
                                <input
                                    type="checkbox"
                                    checked={selectedData[section.key] || false}
                                    onChange={() => handleDataToggle(section.key)}
                                />
                                <span className="checkbox-content">
                                    <span className="checkbox-icon">{section.icon}</span>
                                    <span className="checkbox-label">{section.label}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Generate Buttons */}
                <div className="form-actions">
                    <button
                        type="submit"
                        className="btn btn-primary btn-lg"
                        disabled={generating || generatingLicenses || selectedBranches.length === 0}
                    >
                        {generating ? (
                            <>
                                <span className="spinner"></span>
                                جاري الإنشاء...
                            </>
                        ) : (
                            <>
                                <span>📄</span>
                                إنشاء تقرير PDF
                            </>
                        )}
                    </button>
                </div>

                {/* Driver licenses report (with embedded documents) */}
                <div className="form-section">
                    <div className="section-header">
                        <h2>🪪 تقرير رخص السائقين</h2>
                    </div>
                    <p className="report-hint">
                        تقرير مستقل يحتوي على بيانات جميع السائقين ورخص القيادة للفروع المحددة،
                        مع إرفاق صورة/ملف رخصة كل سائق كصفحة داخل التقرير.
                    </p>
                    <div className="form-actions">
                        <button
                            type="button"
                            className="btn btn-secondary btn-lg"
                            onClick={generateDriverLicensesReport}
                            disabled={generating || generatingLicenses || selectedBranches.length === 0}
                        >
                            {generatingLicenses ? (
                                <>
                                    <span className="spinner"></span>
                                    جاري إنشاء تقرير الرخص...
                                </>
                            ) : (
                                <>
                                    <span>🪪</span>
                                    تحميل رخص السائقين + المستندات
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
