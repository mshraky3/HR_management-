/**
 * Employee Statistics Page
 * Display comprehensive employee analytics with charts and data visualizations
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { employeesAPI } from '../utils/api';
import './EmployeeStatistics.css';

// Format numbers in English numerals
const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return new Intl.NumberFormat('en-US', { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  }).format(num);
};

const formatCurrency = (amount) => {
  if (!amount || isNaN(amount)) return '0';
  return new Intl.NumberFormat('en-US', { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  }).format(amount);
};

const formatPercentage = (value, total) => {
  if (!total || total === 0) return '0';
  return ((value / total) * 100).toFixed(1);
};

const EmployeeStatistics = () => {
  const { isMainManager } = useAuth();
  const { showError } = useNotification();
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPercentages, setShowPercentages] = useState(false);

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
      console.error('Error loading employee statistics:', error);
      showError('فشل تحميل الإحصائيات');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="employee-statistics-page">
        <div className="loading">جاري التحميل...</div>
      </div>
    );
  }

  if (!statistics) {
    return (
      <div className="employee-statistics-page">
        <div className="error-message">لا توجد بيانات متاحة</div>
      </div>
    );
  }

  const { overview, gender, salary, jobTitles, contractTypes, maritalStatus, nationalities, educationalQualifications, status, ageGroups, experienceLevels, branches, idTypes, companyExperience, salaryByBranch } = statistics;

  // Chart colors
  const chartColors = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
  ];

  const genderColors = {
    male: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    female: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  };

  const total = overview?.total || 0;

  return (
    <div className="employee-statistics-page">
      <div className="page-header">
        <h1>إحصائيات الموظفين</h1>
        <div className="header-controls">
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={showPercentages}
              onChange={(e) => setShowPercentages(e.target.checked)}
            />
            <span className="toggle-slider"></span>
            <span className="toggle-label">عرض النسب المئوية</span>
          </label>
        </div>
      </div>

      {/* Overview Statistics Cards */}
      <div className="stats-cards-grid">
        <div className="stat-card stat-card-primary">
          <div className="stat-card-icon">👥</div>
          <div className="stat-card-content">
            <div className="stat-card-label">إجمالي الموظفين</div>
            <div className="stat-card-value">{formatNumber(overview?.total || 0)}</div>
          </div>
        </div>
        <div className="stat-card stat-card-male">
          <div className="stat-card-icon">👨</div>
          <div className="stat-card-content">
            <div className="stat-card-label">ذكور</div>
            <div className="stat-card-value">{formatNumber(overview?.male || 0)}</div>
            <div className="stat-card-sub">{formatPercentage(overview?.male || 0, total)}%</div>
          </div>
        </div>
        <div className="stat-card stat-card-female">
          <div className="stat-card-icon">👩</div>
          <div className="stat-card-content">
            <div className="stat-card-label">إناث</div>
            <div className="stat-card-value">{formatNumber(overview?.female || 0)}</div>
            <div className="stat-card-sub">{formatPercentage(overview?.female || 0, total)}%</div>
          </div>
        </div>
        <div className="stat-card stat-card-salary">
          <div className="stat-card-icon">💰</div>
          <div className="stat-card-content">
            <div className="stat-card-label">متوسط الراتب</div>
            <div className="stat-card-value">{formatCurrency(overview?.avgSalary || 0)}</div>
            <div className="stat-card-sub">ريال</div>
          </div>
        </div>
        <div className="stat-card stat-card-budget">
          <div className="stat-card-icon">📊</div>
          <div className="stat-card-content">
            <div className="stat-card-label">إجمالي الرواتب</div>
            <div className="stat-card-value">{formatCurrency(overview?.totalSalaryBudget || 0)}</div>
            <div className="stat-card-sub">ريال</div>
          </div>
        </div>
        <div className="stat-card stat-card-completion">
          <div className="stat-card-icon">✅</div>
          <div className="stat-card-content">
            <div className="stat-card-label">نسبة الإكمال</div>
            <div className="stat-card-value">{formatNumber(overview?.completionRate || 0)}%</div>
          </div>
        </div>
        {salary && (
          <>
            <div className="stat-card stat-card-min">
              <div className="stat-card-icon">📉</div>
              <div className="stat-card-content">
                <div className="stat-card-label">أقل راتب</div>
                <div className="stat-card-value">{formatCurrency(salary.min || 0)}</div>
                <div className="stat-card-sub">ريال</div>
              </div>
            </div>
            <div className="stat-card stat-card-max">
              <div className="stat-card-icon">📈</div>
              <div className="stat-card-content">
                <div className="stat-card-label">أعلى راتب</div>
                <div className="stat-card-value">{formatCurrency(salary.max || 0)}</div>
                <div className="stat-card-sub">ريال</div>
              </div>
            </div>
          </>
        )}
        <div className="stat-card stat-card-active">
          <div className="stat-card-icon">✓</div>
          <div className="stat-card-content">
            <div className="stat-card-label">نشط</div>
            <div className="stat-card-value">{formatNumber(overview?.active || 0)}</div>
            <div className="stat-card-sub">{formatPercentage(overview?.active || 0, total)}%</div>
          </div>
        </div>
        <div className="stat-card stat-card-pending">
          <div className="stat-card-icon">⏳</div>
          <div className="stat-card-content">
            <div className="stat-card-label">قيد الانتظار</div>
            <div className="stat-card-value">{formatNumber(overview?.pending || 0)}</div>
            <div className="stat-card-sub">{formatPercentage(overview?.pending || 0, total)}%</div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* Gender Distribution */}
        {gender && gender.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">توزيع الموظفين حسب الجنس</h3>
            <div className="chart-container">
              <div className="gender-chart">
                {gender.map((item) => {
                  const displayValue = showPercentages 
                    ? `${item.percentage}%` 
                    : formatNumber(item.count);
                  return (
                    <div key={item.gender} className="gender-chart-item">
                      <div className="gender-label">{item.gender === 'male' ? 'ذكور' : 'إناث'}</div>
                      <div className="gender-bar-wrapper">
                        <div
                          className="gender-bar"
                          style={{
                            width: total > 0 ? `${(item.count / total) * 100}%` : '0%',
                            background: genderColors[item.gender],
                            minWidth: item.count > 0 ? '60px' : '0'
                          }}
                        >
                          <span className="gender-value">{displayValue}</span>
                        </div>
                      </div>
                      <div className="gender-percentage">{item.percentage}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Salary by Gender */}
        {salary?.byGender && Object.keys(salary.byGender).length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">متوسط الراتب حسب الجنس</h3>
            <div className="chart-container">
              <div className="salary-gender-chart">
                {Object.entries(salary.byGender).map(([genderKey, data]) => (
                  <div key={genderKey} className="salary-gender-item">
                    <div className="salary-gender-label">{genderKey === 'male' ? 'ذكور' : 'إناث'}</div>
                    <div className="salary-gender-bar-wrapper">
                      <div
                        className="salary-gender-bar"
                        style={{
                          width: salary.max > 0 ? `${(data.average / salary.max) * 100}%` : '0%',
                          background: genderColors[genderKey],
                          minWidth: data.average > 0 ? '60px' : '0'
                        }}
                      >
                        <span className="salary-gender-value">{formatCurrency(data.average)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Salary Ranges */}
        {salary?.ranges && salary.ranges.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">توزيع الرواتب حسب الفئات</h3>
            <div className="chart-container">
              <div className="salary-ranges-chart">
                {salary.ranges.map((item, idx) => {
                  const maxCount = Math.max(...salary.ranges.map(r => r.count));
                  const displayValue = showPercentages 
                    ? `${formatPercentage(item.count, total)}%` 
                    : formatNumber(item.count);
                  return (
                    <div key={item.range} className="salary-range-item">
                      <div className="salary-range-label">{item.range} ريال</div>
                      <div className="salary-range-bar-wrapper">
                        <div
                          className="salary-range-bar"
                          style={{
                            width: maxCount > 0 ? `${(item.count / maxCount) * 100}%` : '0%',
                            background: chartColors[idx % chartColors.length],
                            minWidth: item.count > 0 ? '20px' : '0'
                          }}
                        >
                          {item.count > 0 && <span className="salary-range-value">{displayValue}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Job Titles Distribution */}
        {jobTitles && jobTitles.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">
              توزيع الموظفين حسب المسمى الوظيفي
              <span className="chart-subtitle">
                ({formatNumber(jobTitles.reduce((sum, item) => sum + item.count, 0))} من {formatNumber(total)} موظف)
              </span>
            </h3>
            <div className="chart-container">
              <div className="horizontal-bars-chart">
                {jobTitles.map((item, idx) => {
                  const maxCount = Math.max(...jobTitles.map(j => j.count));
                  const displayValue = showPercentages 
                    ? `${formatPercentage(item.count, total)}%` 
                    : formatNumber(item.count);
                  return (
                    <div key={item.job_title} className="horizontal-bar-item">
                      <div className="horizontal-bar-label">{item.job_title}</div>
                      <div className="horizontal-bar-wrapper">
                        <div
                          className="horizontal-bar"
                          style={{
                            width: maxCount > 0 ? `${(item.count / maxCount) * 100}%` : '0%',
                            background: chartColors[idx % chartColors.length],
                            minWidth: item.count > 0 ? '20px' : '0'
                          }}
                        >
                          <span className="horizontal-bar-value">{displayValue}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Contract Types */}
        {contractTypes && contractTypes.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">توزيع الموظفين حسب نوع العقد</h3>
            <div className="chart-container">
              <div className="horizontal-bars-chart">
                {contractTypes.map((item, idx) => {
                  const maxCount = Math.max(...contractTypes.map(c => c.count));
                  const displayValue = showPercentages 
                    ? `${formatPercentage(item.count, total)}%` 
                    : formatNumber(item.count);
                  return (
                    <div key={item.contract_type} className="horizontal-bar-item">
                      <div className="horizontal-bar-label">{item.contract_type}</div>
                      <div className="horizontal-bar-wrapper">
                        <div
                          className="horizontal-bar"
                          style={{
                            width: maxCount > 0 ? `${(item.count / maxCount) * 100}%` : '0%',
                            background: chartColors[idx % chartColors.length],
                            minWidth: item.count > 0 ? '20px' : '0'
                          }}
                        >
                          <span className="horizontal-bar-value">{displayValue}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Marital Status */}
        {maritalStatus && maritalStatus.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">توزيع الموظفين حسب الحالة الاجتماعية</h3>
            <div className="chart-container">
              <div className="horizontal-bars-chart">
                {maritalStatus.map((item, idx) => {
                  const maxCount = Math.max(...maritalStatus.map(m => m.count));
                  const displayValue = showPercentages 
                    ? `${formatPercentage(item.count, total)}%` 
                    : formatNumber(item.count);
                  return (
                    <div key={item.status} className="horizontal-bar-item">
                      <div className="horizontal-bar-label">{item.status}</div>
                      <div className="horizontal-bar-wrapper">
                        <div
                          className="horizontal-bar"
                          style={{
                            width: maxCount > 0 ? `${(item.count / maxCount) * 100}%` : '0%',
                            background: chartColors[idx % chartColors.length],
                            minWidth: item.count > 0 ? '20px' : '0'
                          }}
                        >
                          <span className="horizontal-bar-value">{displayValue}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Nationalities */}
        {nationalities && nationalities.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">توزيع الموظفين حسب الجنسية</h3>
            <div className="chart-container">
              <div className="horizontal-bars-chart">
                {nationalities.map((item, idx) => {
                  const maxCount = Math.max(...nationalities.map(n => n.count));
                  const displayValue = showPercentages 
                    ? `${formatPercentage(item.count, total)}%` 
                    : formatNumber(item.count);
                  return (
                    <div key={item.nationality} className="horizontal-bar-item">
                      <div className="horizontal-bar-label">{item.nationality}</div>
                      <div className="horizontal-bar-wrapper">
                        <div
                          className="horizontal-bar"
                          style={{
                            width: maxCount > 0 ? `${(item.count / maxCount) * 100}%` : '0%',
                            background: chartColors[idx % chartColors.length],
                            minWidth: item.count > 0 ? '20px' : '0'
                          }}
                        >
                          <span className="horizontal-bar-value">{displayValue}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Educational Qualifications */}
        {educationalQualifications && educationalQualifications.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">توزيع الموظفين حسب المؤهل التعليمي</h3>
            <div className="chart-container">
              <div className="horizontal-bars-chart">
                {educationalQualifications.map((item, idx) => {
                  const maxCount = Math.max(...educationalQualifications.map(e => e.count));
                  const displayValue = showPercentages 
                    ? `${formatPercentage(item.count, total)}%` 
                    : formatNumber(item.count);
                  return (
                    <div key={item.qualification} className="horizontal-bar-item">
                      <div className="horizontal-bar-label">{item.qualification}</div>
                      <div className="horizontal-bar-wrapper">
                        <div
                          className="horizontal-bar"
                          style={{
                            width: maxCount > 0 ? `${(item.count / maxCount) * 100}%` : '0%',
                            background: chartColors[idx % chartColors.length],
                            minWidth: item.count > 0 ? '20px' : '0'
                          }}
                        >
                          <span className="horizontal-bar-value">{displayValue}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Status Distribution */}
        {status && status.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">توزيع الموظفين حسب الحالة</h3>
            <div className="chart-container">
              <div className="horizontal-bars-chart">
                {status.map((item, idx) => {
                  const maxCount = Math.max(...status.map(s => s.count));
                  const statusLabels = {
                    active: 'نشط',
                    pending: 'قيد الانتظار',
                    terminated: 'منتهي',
                    resigned: 'استقال',
                    contract_ended: 'انتهى العقد',
                    non_renewal: 'عدم التجديد',
                    other: 'أخرى'
                  };
                  const displayValue = showPercentages 
                    ? `${formatPercentage(item.count, total)}%` 
                    : formatNumber(item.count);
                  return (
                    <div key={item.status} className="horizontal-bar-item">
                      <div className="horizontal-bar-label">{statusLabels[item.status] || item.status}</div>
                      <div className="horizontal-bar-wrapper">
                        <div
                          className="horizontal-bar"
                          style={{
                            width: maxCount > 0 ? `${(item.count / maxCount) * 100}%` : '0%',
                            background: chartColors[idx % chartColors.length],
                            minWidth: item.count > 0 ? '20px' : '0'
                          }}
                        >
                          <span className="horizontal-bar-value">{displayValue}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Branch Distribution - Main Manager Only */}
        {isMainManager() && branches && branches.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">توزيع الموظفين حسب الفروع</h3>
            <div className="chart-container">
              <div className="horizontal-bars-chart">
                {branches.map((item, idx) => {
                  const maxCount = Math.max(...branches.map(b => b.count));
                  const displayValue = showPercentages 
                    ? `${formatPercentage(item.count, total)}%` 
                    : formatNumber(item.count);
                  return (
                    <div key={item.branch_id} className="horizontal-bar-item">
                      <div className="horizontal-bar-label">{item.branch_name}</div>
                      <div className="horizontal-bar-wrapper">
                        <div
                          className="horizontal-bar"
                          style={{
                            width: maxCount > 0 ? `${(item.count / maxCount) * 100}%` : '0%',
                            background: chartColors[idx % chartColors.length],
                            minWidth: item.count > 0 ? '20px' : '0'
                          }}
                        >
                          <span className="horizontal-bar-value">{displayValue}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Age Groups */}
        {ageGroups && ageGroups.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">توزيع الموظفين حسب الفئة العمرية</h3>
            <div className="chart-container">
              <div className="horizontal-bars-chart">
                {ageGroups.map((item, idx) => {
                  const maxCount = Math.max(...ageGroups.map(a => a.count));
                  const displayValue = showPercentages 
                    ? `${formatPercentage(item.count, total)}%` 
                    : formatNumber(item.count);
                  return (
                    <div key={item.age_group} className="horizontal-bar-item">
                      <div className="horizontal-bar-label">{item.age_group} سنة</div>
                      <div className="horizontal-bar-wrapper">
                        <div
                          className="horizontal-bar"
                          style={{
                            width: maxCount > 0 ? `${(item.count / maxCount) * 100}%` : '0%',
                            background: chartColors[idx % chartColors.length],
                            minWidth: item.count > 0 ? '20px' : '0'
                          }}
                        >
                          <span className="horizontal-bar-value">{displayValue}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Experience Levels */}
        {experienceLevels && experienceLevels.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">توزيع الموظفين حسب سنوات الخبرة</h3>
            <div className="chart-container">
              <div className="horizontal-bars-chart">
                {experienceLevels.map((item, idx) => {
                  const maxCount = Math.max(...experienceLevels.map(e => e.count));
                  const displayValue = showPercentages 
                    ? `${formatPercentage(item.count, total)}%` 
                    : formatNumber(item.count);
                  return (
                    <div key={item.experience_range} className="horizontal-bar-item">
                      <div className="horizontal-bar-label">{item.experience_range} سنة</div>
                      <div className="horizontal-bar-wrapper">
                        <div
                          className="horizontal-bar"
                          style={{
                            width: maxCount > 0 ? `${(item.count / maxCount) * 100}%` : '0%',
                            background: chartColors[idx % chartColors.length],
                            minWidth: item.count > 0 ? '20px' : '0'
                          }}
                        >
                          <span className="horizontal-bar-value">{displayValue}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Top Paid Employees */}
        {salary?.topPaid && salary.topPaid.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">أعلى 10 رواتب</h3>
            <div className="chart-container">
              <div className="top-paid-list">
                {salary.topPaid.map((item, idx) => (
                  <div key={item.employee_id} className="top-paid-item">
                    <div className="top-paid-rank">#{idx + 1}</div>
                    <div className="top-paid-details">
                      <div className="top-paid-name">{item.name}</div>
                      <div className="top-paid-id">{item.employee_id}</div>
                    </div>
                    <div className="top-paid-salary">{formatCurrency(item.salary)} ريال</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Salary by Job Title */}
        {salary?.byJobTitle && salary.byJobTitle.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">متوسط الراتب حسب المسمى الوظيفي</h3>
            <div className="chart-container">
              <div className="horizontal-bars-chart">
                {salary.byJobTitle.slice(0, 15).map((item, idx) => {
                  const maxSalary = Math.max(...salary.byJobTitle.map(j => j.average));
                  return (
                    <div key={item.job_title} className="horizontal-bar-item">
                      <div className="horizontal-bar-label">{item.job_title}</div>
                      <div className="horizontal-bar-wrapper">
                        <div
                          className="horizontal-bar"
                          style={{
                            width: maxSalary > 0 ? `${(item.average / maxSalary) * 100}%` : '0%',
                            background: chartColors[idx % chartColors.length],
                            minWidth: item.average > 0 ? '20px' : '0'
                          }}
                        >
                          <span className="horizontal-bar-value">{formatCurrency(item.average)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ID Type Distribution */}
        {idTypes && idTypes.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">توزيع الموظفين حسب نوع الهوية</h3>
            <div className="chart-container">
              <div className="horizontal-bars-chart">
                {idTypes.map((item, idx) => {
                  const maxCount = Math.max(...idTypes.map(i => i.count));
                  const idTypeLabels = {
                    citizen: 'مواطن',
                    resident: 'مقيم',
                    'غير محدد': 'غير محدد'
                  };
                  const displayValue = showPercentages 
                    ? `${formatPercentage(item.count, total)}%` 
                    : formatNumber(item.count);
                  return (
                    <div key={item.id_type} className="horizontal-bar-item">
                      <div className="horizontal-bar-label">{idTypeLabels[item.id_type] || item.id_type}</div>
                      <div className="horizontal-bar-wrapper">
                        <div
                          className="horizontal-bar"
                          style={{
                            width: maxCount > 0 ? `${(item.count / maxCount) * 100}%` : '0%',
                            background: chartColors[idx % chartColors.length],
                            minWidth: item.count > 0 ? '20px' : '0'
                          }}
                        >
                          <span className="horizontal-bar-value">{displayValue}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Company Experience */}
        {companyExperience && companyExperience.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">توزيع الموظفين حسب سنوات الخبرة في الشركة</h3>
            <div className="chart-container">
              <div className="horizontal-bars-chart">
                {companyExperience.map((item, idx) => {
                  const maxCount = Math.max(...companyExperience.map(e => e.count));
                  const displayValue = showPercentages 
                    ? `${formatPercentage(item.count, total)}%` 
                    : formatNumber(item.count);
                  return (
                    <div key={item.experience_range} className="horizontal-bar-item">
                      <div className="horizontal-bar-label">{item.experience_range}</div>
                      <div className="horizontal-bar-wrapper">
                        <div
                          className="horizontal-bar"
                          style={{
                            width: maxCount > 0 ? `${(item.count / maxCount) * 100}%` : '0%',
                            background: chartColors[idx % chartColors.length],
                            minWidth: item.count > 0 ? '20px' : '0'
                          }}
                        >
                          <span className="horizontal-bar-value">{displayValue}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Salary by Branch - Main Manager Only */}
        {isMainManager() && salaryByBranch && salaryByBranch.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">متوسط الراتب حسب الفروع</h3>
            <div className="chart-container">
              <div className="horizontal-bars-chart">
                {salaryByBranch.map((item, idx) => {
                  const maxSalary = Math.max(...salaryByBranch.map(b => b.average_salary));
                  return (
                    <div key={item.branch_id} className="horizontal-bar-item">
                      <div className="horizontal-bar-label">{item.branch_name}</div>
                      <div className="horizontal-bar-wrapper">
                        <div
                          className="horizontal-bar"
                          style={{
                            width: maxSalary > 0 ? `${(item.average_salary / maxSalary) * 100}%` : '0%',
                            background: chartColors[idx % chartColors.length],
                            minWidth: item.average_salary > 0 ? '20px' : '0'
                          }}
                        >
                          <span className="horizontal-bar-value">{formatCurrency(item.average_salary)}</span>
                        </div>
                      </div>
                      <div className="horizontal-bar-count">{formatNumber(item.count)} موظف</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeStatistics;
