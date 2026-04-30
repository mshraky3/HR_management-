/**
 * Employee Statistics Report Page
 * Generate comprehensive PDF reports with selected statistics and charts
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { employeesAPI } from '../utils/api';
import { downloadFile } from '../utils/downloadFile';
import './EmployeeStatisticsReport.css';

const EmployeeStatisticsReport = () => {
    const { isMainManager } = useAuth();
    const { showError, showSuccess, showWarning } = useNotification();

    const [statistics, setStatistics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);

    // Selected sections for PDF
    const [selectedSections, setSelectedSections] = useState({
        overview: true,
        gender: true,
        salary: true,
        jobTitles: true,
        contractTypes: true,
        maritalStatus: true,
        nationalities: true,
        educationalQualifications: true,
        status: true,
        ageGroups: true,
        experienceLevels: true,
        companyExperience: true,
        branches: true,
        salaryByBranch: true,
    });

    const availableSections = [
        { key: 'overview', label: 'ملخص عام', icon: '📊' },
        { key: 'gender', label: 'توزيع حسب الجنس', icon: '👥' },
        { key: 'salary', label: 'توزيع الرواتب', icon: '💰' },
        { key: 'jobTitles', label: 'المسميات الوظيفية', icon: '💼' },
        { key: 'contractTypes', label: 'نوع العقد', icon: '📝' },
        { key: 'maritalStatus', label: 'الحالة الاجتماعية', icon: '💑' },
        { key: 'nationalities', label: 'الجنسيات', icon: '🌍' },
        { key: 'educationalQualifications', label: 'المؤهلات التعليمية', icon: '🎓' },
        { key: 'status', label: 'حالة الموظف', icon: '✅' },
        { key: 'ageGroups', label: 'فئات العمر', icon: '📅' },
        { key: 'experienceLevels', label: 'مستويات الخبرة', icon: '⭐' },
        { key: 'companyExperience', label: 'خبرة الموظف بالشركة', icon: '🏢' },
        { key: 'branches', label: 'توزيع حسب الفروع', icon: '🏪' },
        { key: 'salaryByBranch', label: 'الرواتب حسب الفرع', icon: '💵' },
    ];

    useEffect(() => {
        loadStatistics();
    }, []);

    const loadStatistics = async () => {
        try {
            setLoading(true);
            const response = await employeesAPI.getStatistics();
            if (response.data.success) {
                setStatistics(response.data.data);
            } else {
                showError('فشل تحميل الإحصائيات');
            }
        } catch (error) {
            console.error('Error loading statistics:', error);
            showError('فشل تحميل الإحصائيات');
        } finally {
            setLoading(false);
        }
    };

    const handleSectionToggle = (sectionKey) => {
        setSelectedSections(prev => ({
            ...prev,
            [sectionKey]: !prev[sectionKey]
        }));
    };

    const handleSelectAll = () => {
        const allSelected = Object.values(selectedSections).every(v => v === true);
        if (allSelected) {
            setSelectedSections(
                Object.keys(selectedSections).reduce((acc, key) => {
                    acc[key] = false;
                    return acc;
                }, {})
            );
        } else {
            setSelectedSections(
                Object.keys(selectedSections).reduce((acc, key) => {
                    acc[key] = true;
                    return acc;
                }, {})
            );
        }
    };

    const handleGeneratePDF = async (e) => {
        e.preventDefault();

        const selectedCount = Object.values(selectedSections).filter(v => v === true).length;
        if (selectedCount === 0) {
            showWarning('الرجاء اختيار قسم واحد على الأقل');
            return;
        }

        try {
            setGenerating(true);

            // Send request to generate PDF
            const response = await employeesAPI.generateStatisticsPDF({
                selectedSections: selectedSections
            }, {
                responseType: 'blob'
            });

            // Handle blob download
            const blob = response.data instanceof Blob
                ? response.data
                : new Blob([response.data], { type: 'application/pdf' });
            downloadFile(blob, `تقرير_احصائيات_الموظفين_${new Date().toLocaleDateString('ar-SA')}.pdf`);

            showSuccess('تم إنشاء التقرير بنجاح');
        } catch (error) {
            console.error('Error generating PDF:', error);
            const errorMessage = error.response?.data?.message || 'فشل إنشاء التقرير';
            showError(errorMessage);
        } finally {
            setGenerating(false);
        }
    };

    if (!isMainManager()) {
        return null;
    }

    if (loading) {
        return (
            <div className="statistics-report-page">
                <div className="loading">جاري التحميل...</div>
            </div>
        );
    }

    if (!statistics) {
        return (
            <div className="statistics-report-page">
                <div className="error-message">لا توجد بيانات متاحة</div>
            </div>
        );
    }

    const selectedCount = Object.values(selectedSections).filter(v => v === true).length;
    const allSelected = Object.values(selectedSections).every(v => v === true);

    return (
        <div className="statistics-report-page">
            <div className="page-header">
                <h1>تقرير إحصائيات الموظفين</h1>
                <p className="page-subtitle">اختر الأقسام المراد تضمينها في التقرير المولد</p>
            </div>

            <form onSubmit={handleGeneratePDF} className="report-form">
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
                                تم تحديد {selectedCount} من {availableSections.length}
                            </span>
                        </div>
                    </div>

                    <div className="sections-grid">
                        {availableSections.map(section => (
                            <label key={section.key} className="section-checkbox">
                                <input
                                    type="checkbox"
                                    checked={selectedSections[section.key] || false}
                                    onChange={() => handleSectionToggle(section.key)}
                                />
                                <span className="section-icon">{section.icon}</span>
                                <span className="section-label">{section.label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Summary Stats */}
                <div className="form-section">
                    <h2>ملخص البيانات</h2>
                    <div className="stats-preview">
                        <div className="stat-item">
                            <span className="stat-label">إجمالي الموظفين:</span>
                            <span className="stat-value">{statistics.overview?.total || 0}</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-label">متوسط الراتب:</span>
                            <span className="stat-value">
                                {(statistics.overview?.avgSalary || 0).toLocaleString('en-US')} ريال
                            </span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-label">إجمالي الرواتب:</span>
                            <span className="stat-value">
                                {(statistics.overview?.totalSalaryBudget || 0).toLocaleString('en-US')} ريال
                            </span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-label">نسبة الإكمال:</span>
                            <span className="stat-value">{statistics.overview?.completionRate || 0}%</span>
                        </div>
                    </div>
                </div>

                {/* Generate Button */}
                <div className="form-actions">
                    <button
                        type="submit"
                        disabled={generating}
                        className="btn btn-primary btn-lg"
                    >
                        {generating ? (
                            <>
                                <span className="spinner"></span>
                                جاري إنشاء التقرير...
                            </>
                        ) : (
                            <>
                                <span>📄</span>
                                إنشاء التقرير (PDF)
                            </>
                        )}
                    </button>
                    <p className="form-info">
                        سيتم إنشاء ملف PDF يتضمن الأقسام المختارة أعلاه
                    </p>
                </div>
            </form>
        </div>
    );
};

export default EmployeeStatisticsReport;
