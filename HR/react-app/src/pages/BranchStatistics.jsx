/**
 * Branch Statistics Page
 * Monitor branch activity, employee completion rates, and generate performance reports
 * Main Manager only
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { branchStatisticsAPI } from '../utils/api';
import './BranchStatistics.css';

const BranchStatistics = () => {
  const { isMainManager } = useAuth();
  const { showError, showSuccess } = useNotification();
  
  const [statistics, setStatistics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [filterOperational, setFilterOperational] = useState('all'); // 'all', 'operational', 'inactive'
  const [sortBy, setSortBy] = useState('branch_name'); // 'branch_name', 'completion', 'logins', 'activity'
  const [generatingReport, setGeneratingReport] = useState(false);

  const loadStatistics = async () => {
    try {
      setLoading(true);
      const response = await branchStatisticsAPI.getAll();
      
      if (response.data.success) {
        setStatistics(response.data.data || []);
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
          throw new Error('Invalid response format');
        }
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `performance-report-${selectedYear}-${selectedMonth}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
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
          return b.completion_percentage - a.completion_percentage;
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
                {new Date(selectedYear, month - 1).toLocaleDateString('ar-SA', { month: 'long' })}
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
            className="btn btn-primary"
            onClick={() => handleGenerateReport('excel')}
            disabled={generatingReport}
          >
            {generatingReport ? 'جاري الإنشاء...' : 'إنشاء تقرير Excel'}
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
          <h3>متوسط نسبة الإكمال</h3>
          <div className="summary-value">
            {statistics.length > 0
              ? Math.round(
                  statistics.reduce((sum, s) => sum + s.completion_percentage, 0) /
                    statistics.length
                )
              : 0}%
          </div>
        </div>
      </div>

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
                <th>حالة التشغيل</th>
                <th>أيام تسجيل الدخول (هذا الشهر)</th>
                <th>إجمالي الموظفين</th>
                <th>الموظفون المكتملون</th>
                <th>نسبة الإكمال</th>
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
                    {stat.branch_type === 'school' ? 'مدرسة' : 'مركز صحي'}
                  </td>
                  <td>
                    <span
                      className={`status-badge ${
                        stat.is_operational ? 'operational' : 'inactive'
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
                  <td>{stat.total_employees}</td>
                  <td>{stat.complete_employees}</td>
                  <td>
                    <div className="completion-bar-container">
                      <div className="completion-bar">
                        <div
                          className="completion-fill"
                          style={{
                            width: `${stat.completion_percentage}%`,
                            backgroundColor:
                              stat.completion_percentage >= 80
                                ? '#4CAF50'
                                : stat.completion_percentage >= 50
                                ? '#FF9800'
                                : '#F44336'
                          }}
                        />
                      </div>
                      <span className="completion-percentage">
                        {stat.completion_percentage}%
                      </span>
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
                      ? new Date(stat.last_login).toLocaleDateString('ar-SA')
                      : 'لا يوجد'}
                    {stat.days_since_last_login !== null && (
                      <div className="days-ago">
                        ({stat.days_since_last_login} يوم)
                      </div>
                    )}
                  </td>
                  <td>
                    {stat.last_activity
                      ? new Date(stat.last_activity).toLocaleDateString('ar-SA')
                      : 'لا يوجد'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Monthly Login History Chart */}
      {statistics.length > 0 && (
        <div className="chart-section">
          <h2>تاريخ تسجيلات الدخول (آخر 6 أشهر)</h2>
          <div className="login-history-chart">
            {statistics.slice(0, 5).map(stat => (
              <div key={stat.branch_id} className="chart-branch">
                <div className="chart-branch-name">{stat.branch_name}</div>
                <div className="chart-bars">
                  {stat.monthly_login_history && stat.monthly_login_history.length > 0 ? (
                    stat.monthly_login_history.map((month, idx) => {
                      const maxDays = 31;
                      const height = (month.login_days / maxDays) * 100;
                      return (
                        <div key={idx} className="chart-bar-container">
                          <div
                            className="chart-bar"
                            style={{ height: `${height}%` }}
                            title={`${month.login_days} يوم في ${new Date(month.month).toLocaleDateString('ar-SA', { month: 'short', year: 'numeric' })}`}
                          />
                          <div className="chart-bar-label">
                            {new Date(month.month).toLocaleDateString('ar-SA', {
                              month: 'short'
                            })}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="no-data">لا توجد بيانات</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BranchStatistics;

