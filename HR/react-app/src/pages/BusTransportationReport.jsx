import React, { useState, useEffect, useRef } from 'react';
import { busTransportationReportAPI, branchesAPI } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';
import '../styles/BusTransportationReport.css';
export default function BusTransportationReport() {
    const [branches, setBranches] = useState([]);
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

    useEffect(() => {
        loadBranches();
    }, []);

    const loadBranches = async () => {
        try {
            const response = await branchesAPI.getAll();
            const branchesData = Array.isArray(response.data) ? response.data : (response.data?.data || []);
            setBranches(branchesData);
        } catch (error) {
            console.error('Error loading branches:', error);
            showError('فشل تحميل الفروع');
            setBranches([]);
        }
    };

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
                branchIds: selectedBranches,
                sections: selectedData,
            }, { responseType: 'blob' });

            const blob = response.data instanceof Blob
                ? response.data
                : new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `تقرير-النقل-بالحافلات-${new Date().toLocaleDateString('ar-SA')}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            showSuccess('تم إنشاء التقرير بنجاح');
        } catch (error) {
            console.error('Error generating PDF:', error);
            const errorMessage = error.response?.data?.message || 'فشل إنشاء التقرير';
            showError(errorMessage);
        } finally {
            setGenerating(false);
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
                {/* Branch Selection Section */}
                <div className="form-section">
                    <div className="section-header">
                        <h2>اختيار الفروع</h2>
                        <div className="header-controls">
                            <button
                                type="button"
                                onClick={handleSelectAllBranches}
                                className="btn btn-secondary btn-sm"
                                disabled={branches.length === 0}
                            >
                                {allBranchesSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                            </button>
                            <span className="selection-counter">
                                تم تحديد {selectedBranches.length} من {branches.length}
                            </span>
                        </div>
                    </div>

                    <div className="filter-group" ref={branchesDropdownRef}>
                        <button
                            type="button"
                            className="filter-button"
                            onClick={() => setShowBranchesDropdown(!showBranchesDropdown)}
                        >
                            {selectedBranches.length > 0
                                ? `${selectedBranches.length} فروع محددة`
                                : 'اختيار الفروع'} ▾
                        </button>
                        {showBranchesDropdown && (
                            <div className="filter-dropdown-wrapper">
                                <input
                                    type="text"
                                    placeholder="ابحث عن فرع..."
                                    value={branchesFilter}
                                    onChange={e => setBranchesFilter(e.target.value)}
                                    className="filter-search-input"
                                    autoFocus
                                />
                                <div className="filter-dropdown-menu">
                                    {filteredBranchesForDropdown.length > 0 ? (
                                        filteredBranchesForDropdown.map(branch => (
                                            <label key={branch.id} className="dropdown-checkbox-item">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedBranches.includes(branch.id)}
                                                    onChange={() => toggleBranch(branch.id)}
                                                />
                                                <span>{branch.branch_name}</span>
                                            </label>
                                        ))
                                    ) : (
                                        <div className="empty-filter-message">لا توجد فروع مطابقة</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Selected Branches Display */}
                    {selectedBranches.length > 0 && (
                        <div className="selected-items-container">
                            <div className="selected-items">
                                {selectedBranches.map(branchId => {
                                    const branch = branches.find(b => b.id === branchId);
                                    return (
                                        <div key={branchId} className="selected-item">
                                            <span>{branch?.branch_name}</span>
                                            <button
                                                type="button"
                                                className="remove-item-btn"
                                                onClick={() => toggleBranch(branchId)}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                            <button
                                type="button"
                                className="clear-all-btn"
                                onClick={() => setSelectedBranches([])}
                            >
                                مسح الكل
                            </button>
                        </div>
                    )}
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

                {/* Generate Button */}
                <div className="form-actions">
                    <button
                        type="submit"
                        className="btn btn-primary btn-lg"
                        disabled={generating || selectedBranches.length === 0}
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
            </form>
        </div>
    );
}
