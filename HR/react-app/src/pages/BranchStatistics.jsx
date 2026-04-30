/**
 * Branch Statistics Page
 * Monitor branch activity, employee completion rates, and generate performance reports
 * Main Manager only
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { branchStatisticsAPI, branchDocumentsAPI } from '../utils/api';
import { calculateOverallProgress, calculateDocumentsCompletion } from '../utils/dataCompletionUtils';
import { formatDate } from '../utils/dateConverters';
import { downloadFile } from '../utils/downloadFile';
import BranchesOverallProgressChart from '../components/BranchesOverallProgressChart';
import './BranchStatistics.css';

const formatMonthLabel = (month, year) => {
  if (!month || !year) return '';
  const m = String(month).padStart(2, '0');
  return `${m}/${year}`;
};

const BranchStatistics = () => {
  const { isMainManager } = useAuth();
  const { showError, showSuccess } = useNotification();

  const [statistics, setStatistics] = useState([]);
  const [branchDocuments, setBranchDocuments] = useState({}); // { branchId: documents[] }
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [filterOperational, setFilterOperational] = useState('all'); // 'all', 'operational', 'inactive'
  const [sortBy, setSortBy] = useState('completion'); // 'branch_name', 'completion', 'logins', 'activity'
  const [generatingReport, setGeneratingReport] = useState(false);

  const loadStatistics = async () => {
    try {
      setLoading(true);
      const response = await branchStatisticsAPI.getAll();

      if (response.data.success) {
        const stats = response.data.data || [];
        setStatistics(stats);

        // Load documents for all branches to calculate overall progress
        const documentsMap = {};
        await Promise.all(
          stats.map(async (stat) => {
            try {
              const docsResponse = await branchDocumentsAPI.getAll({
                branch_id: stat.branch_id
              });
              if (docsResponse.data.success) {
                documentsMap[stat.branch_id] = docsResponse.data.data || [];
              } else {
                documentsMap[stat.branch_id] = [];
              }
            } catch (error) {
              console.error(`Error loading documents for branch ${stat.branch_id}:`, error);
              documentsMap[stat.branch_id] = [];
            }
          })
        );
        setBranchDocuments(documentsMap);
      }
    } catch (error) {
      console.error('Error loading statistics:', error);
      showError('فشل تحميل الإحصائيات');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async (format = 'excel') => {
    try {
      setGeneratingReport(true);
      const branchIds = statistics.map(s => s.branch_id);

      const response = await branchStatisticsAPI.generatePerformanceReport({
        month: selectedMonth,
        year: selectedYear,
        branch_ids: branchIds,
        format: format
      });

      if (format === 'excel') {
        // Download Excel file
        // Check if response.data is already a Blob
        let blob;
        if (response.data instanceof Blob) {
          blob = response.data;
        } else if (response.data instanceof ArrayBuffer) {
          blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        } else {
          // If it's not a blob, it might be an error response
          throw new Error('تنسيق الاستجابة غير صحيح');
        }

        downloadFile(blob, `performance-report-${selectedYear}-${selectedMonth}.xlsx`);
        showSuccess('تم تحميل التقرير بنجاح');
      } else {
        // Handle PDF or other formats
        showSuccess('تم إنشاء التقرير بنجاح');
      }
    } catch (error) {
      console.error('Error generating report:', error);
      // Handle error response
      let errorMessage = 'فشل إنشاء التقرير';

      if (error.response) {
        // Check if error response is JSON (not blob)
        if (error.response.data && typeof error.response.data === 'object' && !(error.response.data instanceof Blob)) {
          errorMessage = error.response.data.message || errorMessage;
        } else if (error.response.data instanceof Blob) {
          // If error is a blob, try to read it as text to get JSON error
          try {
            const text = await error.response.data.text();
            const jsonError = JSON.parse(text);
            errorMessage = jsonError.message || errorMessage;
          } catch (parseError) {
            // If parsing fails, use default message
            console.error('Failed to parse error response:', parseError);
          }
        } else if (typeof error.response.data === 'string') {
          // String error response
          try {
            const jsonError = JSON.parse(error.response.data);
            errorMessage = jsonError.message || errorMessage;
          } catch {
            errorMessage = error.response.data || errorMessage;
          }
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      showError(errorMessage);
    } finally {
      setGeneratingReport(false);
    }
  };

  useEffect(() => {
    if (!isMainManager()) {
      return;
    }
    loadStatistics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMainManager, selectedMonth, selectedYear]);

  // Calculate overall progress for each branch (employees + documents)
  const calculateBranchOverallProgress = (stat) => {
    const employeesCompletion = stat.completion_percentage;

    // Calculate branch documents completion using unified utility
    const documents = branchDocuments[stat.branch_id] || [];
    const documentMetrics = calculateDocumentsCompletion(documents, stat.branch_type);

    // Overall progress = 50% employees + 50% documents
    return calculateOverallProgress(employeesCompletion, documentMetrics.percentage);
  };

  // Filter and sort statistics
  const filteredAndSortedStats = statistics
    .filter(stat => {
      if (filterOperational === 'operational') {
        return stat.is_operational === true;
      } else if (filterOperational === 'inactive') {
        return stat.is_operational === false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'completion':
          return calculateBranchOverallProgress(b) - calculateBranchOverallProgress(a);
        case 'logins':
          return b.login_days_this_month - a.login_days_this_month;
        case 'activity':
          return b.activities_last_30_days.total - a.activities_last_30_days.total;
        case 'branch_name':
        default:
          return a.branch_name.localeCompare(b.branch_name, 'ar');
      }
    });

  const operationalCount = statistics.filter(s => s.is_operational).length;
  const inactiveCount = statistics.filter(s => !s.is_operational).length;
  const totalBranches = statistics.length;

  // Calculate overall progress across all branches
  const overallProgress = statistics.length > 0
    ? Math.round(
      statistics.reduce((sum, s) => sum + calculateBranchOverallProgress(s), 0) /
      statistics.length
    )
    : 0;

  // Get progress color class based on percentage
  const getProgressColorClass = (percentage) => {
    if (percentage >= 90) return 'excellent';
    if (percentage >= 70) return 'good';
    if (percentage >= 50) return 'moderate';
    if (percentage >= 30) return 'low';
    return 'critical';
  };

  if (!isMainManager()) {
    return (
      <div className="branch-statistics-page">
        <h1>غير مصرح</h1>
        <p>هذه الصفحة متاحة فقط للمدير الرئيسي</p>
      </div>
    );
  }

  return (
    <div className="branch-statistics-page">
      <div className="page-header">
        <h1>إحصائيات ومتابعة الفروع</h1>
        <div className="header-actions">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="month-select"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => (
              <option key={month} value={month}>
                {formatMonthLabel(month, selectedYear)}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="year-input"
            min="2020"
            max="2100"
          />
          <button
            className="btn btn-primary btn-lg btn-ready"
            onClick={() => handleGenerateReport('excel')}
            disabled={generatingReport}
          >
            {generatingReport ? 'جاري الإنشاء...' : 'إنشاء تقرير Excel'}
          </button>
          <button
            className="btn btn-secondary btn-lg"
            onClick={() => window.location.href = '/test-emails'}
            style={{ marginLeft: '10px' }}
          >
            📧 اختبار البريد
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <h3>إجمالي الفروع</h3>
          <div className="summary-value">{totalBranches}</div>
        </div>
        <div className="summary-card operational">
          <h3>الفروع النشطة</h3>
          <div className="summary-value">{operationalCount}</div>
        </div>
        <div className="summary-card inactive">
          <h3>الفروع غير النشطة</h3>
          <div className="summary-value">{inactiveCount}</div>
        </div>
        <div className="summary-card">
          <h3>متوسط التقدم الإجمالي</h3>
          <div className="summary-value">
            {Object.keys(branchDocuments).length > 0 ? overallProgress : '-'}%
          </div>
        </div>
      </div>

      {/* Overall Progress Chart (re-usable component) */}
      <BranchesOverallProgressChart
        statistics={statistics}
        branchDocumentsMap={branchDocuments}
      />

      {/* Filters and Sort */}
      <div className="filters-section">
        <div className="filter-group">
          <label>فلترة حسب الحالة:</label>
          <select
            value={filterOperational}
            onChange={(e) => setFilterOperational(e.target.value)}
          >
            <option value="all">الكل</option>
            <option value="operational">نشط فقط</option>
            <option value="inactive">غير نشط فقط</option>
          </select>
        </div>
        <div className="filter-group">
          <label>ترتيب حسب:</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="branch_name">اسم الفرع</option>
            <option value="completion">نسبة الإكمال</option>
            <option value="logins">أيام تسجيل الدخول</option>
            <option value="activity">النشاط</option>
          </select>
        </div>
      </div>

      {/* Statistics Table */}
      {loading ? (
        <div className="loading">جاري التحميل...</div>
      ) : filteredAndSortedStats.length === 0 ? (
        <div className="empty-state">لا توجد فروع</div>
      ) : (
        <div className="statistics-table-container">
          <table className="statistics-table">
            <thead>
              <tr>
                <th>اسم الفرع</th>
                <th>نوع الفرع</th>
                <th>الحالة </th>
                <th>تسجيل الدخول</th>
                <th>النشاط (آخر 30 يوم)</th>
                <th>آخر تسجيل دخول</th>
                <th>آخر نشاط</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedStats.map(stat => (
                <tr
                  key={stat.branch_id}
                  className={stat.is_operational ? 'operational-row' : 'inactive-row'}
                >
                  <td>
                    <strong>{stat.branch_name}</strong>
                  </td>
                  <td>
                    {stat.branch_type === 'school' ? 'مدرسة' : 'مركز رعاية نهارية'}
                  </td>
                  <td>
                    <span
                      className={`status-badge ${stat.is_operational ? 'operational' : 'inactive'
                        }`}
                    >
                      {stat.is_operational ? 'نشط' : 'غير نشط'}
                    </span>
                  </td>
                  <td>
                    <div className="metric-value">
                      {stat.login_days_this_month}
                      <span className="metric-label">يوم</span>
                    </div>
                  </td>
                  <td>
                    <div className="activity-details">
                      <div>تحديثات: {stat.activities_last_30_days.employee_updates}</div>
                      <div>مستندات: {stat.activities_last_30_days.document_uploads}</div>
                      <div>إضافات: {stat.activities_last_30_days.employee_creations}</div>
                      <div className="total-activity">
                        المجموع: {stat.activities_last_30_days.total}
                      </div>
                    </div>
                  </td>
                  <td>
                    {stat.last_login
                      ? formatDate(stat.last_login)
                      : 'لا يوجد'}
                    {stat.days_since_last_login !== null && (
                      <div className="days-ago">
                        ({stat.days_since_last_login} يوم)
                      </div>
                    )}
                  </td>
                  <td>
                    {stat.last_activity
                      ? formatDate(stat.last_activity)
                      : 'لا يوجد'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Monthly Login History Chart - Single Month */}
      {statistics.length > 0 && (() => {
        // Get all branches with login history for the selected month
        const targetMonthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

        const branchesForLoginChart = statistics
          .filter(stat => {
            if (!stat.monthly_login_history || stat.monthly_login_history.length === 0) {
              return false;
            }
            // Check if branch has data for the selected month
            return stat.monthly_login_history.some(m => {
              const mDate = new Date(m.month);
              const mKey = `${mDate.getFullYear()}-${String(mDate.getMonth() + 1).padStart(2, '0')}`;
              return mKey === targetMonthKey;
            });
          })
          .map(stat => {
            // Find matching month data
            const monthData = stat.monthly_login_history.find(m => {
              const mDate = new Date(m.month);
              const mKey = `${mDate.getFullYear()}-${String(mDate.getMonth() + 1).padStart(2, '0')}`;
              return mKey === targetMonthKey;
            });
            return {
              ...stat,
              loginDays: monthData ? monthData.login_days : 0
            };
          })
          .sort((a, b) => b.loginDays - a.loginDays); // Sort by login days descending

        if (branchesForLoginChart.length === 0) {
          return (
            <div className="chart-section">
              <h2>تسجيلات الدخول - {formatMonthLabel(selectedMonth, selectedYear)}</h2>
              <div className="no-chart-data">
                لا توجد بيانات تسجيل دخول متاحة لهذا الشهر
              </div>
            </div>
          );
        }

        // Find max value for scaling
        const allLoginDays = branchesForLoginChart.map(b => b.loginDays);
        const maxDays = Math.max(31, ...allLoginDays);
        // Round up to nearest 5 for cleaner y-axis labels
        const yAxisMax = Math.ceil(maxDays / 5) * 5;

        // Generate colors for branches
        const branchColors = [
          '#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#F44336',
          '#00BCD4', '#8BC34A', '#FFC107', '#E91E63', '#3F51B5',
          '#009688', '#FF5722', '#795548', '#607D8B', '#9E9E9E'
        ];

        const monthName = formatMonthLabel(selectedMonth, selectedYear);

        return (
          <div className="chart-section">
            <div className="chart-header-section">
              <h2>تسجيلات الدخول</h2>
              <div className="chart-header-actions">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                  className="month-select"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => (
                    <option key={month} value={month}>
                      {formatMonthLabel(month, selectedYear)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="year-input"
                  min="2020"
                  max="2100"
                />
                <div className="chart-summary-stats">
                  <div className="summary-stat-item">
                    <span className="summary-stat-label">إجمالي الفروع:</span>
                    <span className="summary-stat-value">{branchesForLoginChart.length}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="combined-chart-container">
              {/* Legend */}
              <div className="chart-legend">
                {branchesForLoginChart.map((stat, idx) => (
                  <div key={stat.branch_id} className="legend-item">
                    <div
                      className="legend-color"
                      style={{ backgroundColor: branchColors[idx % branchColors.length] }}
                    ></div>
                    <span className="legend-label">{stat.branch_name}</span>
                    <span className="legend-total">
                      ({stat.loginDays} يوم)
                    </span>
                  </div>
                ))}
              </div>

              {/* Login Chart */}
              <div className="chart-wrapper progress-chart-wrapper">
                <div className="chart-y-axis">
                  {(() => {
                    // Generate y-axis labels based on max value
                    const step = yAxisMax / 4;
                    const labels = [];
                    for (let i = 0; i <= 4; i++) {
                      labels.push(Math.round(i * step));
                    }
                    return labels.map(val => (
                      <div key={val} className="y-axis-label">
                        <span className="y-axis-value">{val}</span>
                        {val > 0 && <div className="y-axis-line"></div>}
                      </div>
                    ));
                  })()}
                </div>
                <div className="chart-bars-container">
                  <div className="chart-bars combined-bars progress-bars">
                    {branchesForLoginChart.map((stat, idx) => {
                      const loginDays = stat.loginDays;
                      const branchColor = branchColors[idx % branchColors.length];
                      // Calculate height based on yAxisMax
                      let height = yAxisMax > 0 ? (loginDays / yAxisMax) * 100 : 0;
                      // Ensure height doesn't exceed 100%
                      height = Math.min(height, 100);
                      // Ensure minimum height for visibility if there's data
                      if (loginDays > 0 && height < 3) {
                        height = 3;
                      }

                      return (
                        <div key={stat.branch_id} className="chart-month-group progress-bar-group">
                          <div className="month-bars-container">
                            <div className="combined-bar-wrapper">
                              <div
                                className="combined-bar progress-bar-enhanced"
                                style={{
                                  height: `${Math.max(height, loginDays > 0 ? 3 : 0)}%`,
                                  backgroundColor: branchColor,
                                  maxHeight: '100%'
                                }}
                                title={`${stat.branch_name}: ${loginDays} يوم`}
                              >
                                {loginDays > 0 && height > 8 && (
                                  <span className="combined-bar-value">{loginDays}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default BranchStatistics;

