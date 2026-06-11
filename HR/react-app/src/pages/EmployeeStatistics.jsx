/**
 * Employee Statistics Page
 * Display comprehensive employee analytics with circle/pie charts and data visualizations
 */

import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNotification } from "../contexts/NotificationContext";
import { employeesAPI } from "../utils/api";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import "./EmployeeStatistics.css";

// Custom Tooltip Component
const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "12px",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        }}
      >
        <p
          style={{
            margin: 0,
            fontWeight: 600,
            color: "#1e293b",
            marginBottom: "4px",
          }}
        >
          {data.name}
        </p>
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: "14px",
          }}
        >
          العدد: {formatNumber(data.value)}
        </p>
      </div>
    );
  }
  return null;
};

const CustomCurrencyTooltip = ({ active, payload, labelPrefix = "" }) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "12px",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        }}
      >
        <p
          style={{
            margin: 0,
            fontWeight: 600,
            color: "#1e293b",
            marginBottom: "4px",
          }}
        >
          {data.name}
        </p>
        <p
          style={{
            margin: 0,
            color: "#64748b",
            fontSize: "14px",
            direction: "ltr",
          }}
        >
          {labelPrefix}{formatCurrency(data.value)} ريال
        </p>
      </div>
    );
  }
  return null;
};

// Format numbers in English numerals
const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return "0";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
};

const formatCurrency = (amount) => {
  if (!amount || isNaN(amount)) return "0";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatPercentage = (value, total) => {
  if (!total || total === 0) return "0";
  return ((value / total) * 100).toFixed(1);
};

// Custom label for pie charts - positioned inside colored sections
const renderCustomLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
  name,
}) => {
  const RADIAN = Math.PI / 180;
  // Position label closer to outer edge but still inside the slice
  const radius = innerRadius + (outerRadius - innerRadius) * 0.65;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.03) return null; // Don't show label for very small slices

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      style={{
        fontSize: "16px",
        fontWeight: "bold",
        textShadow: "0 2px 4px rgba(0,0,0,0.6)",
        pointerEvents: "none",
      }}
    >
      {`${(percent * 100).toFixed(1)}%`}
    </text>
  );
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
        showError("فشل تحميل الإحصائيات");
      }
    } catch (error) {
      console.error("Error loading employee statistics:", error);
      showError("فشل تحميل الإحصائيات");
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

  const {
    overview,
    gender,
    salary,
    jobTitles,
    contractTypes,
    maritalStatus,
    nationalities,
    nationalityGender,
    educationalQualifications,
    specializations,
    status,
    ageGroups,
    experienceLevels,
    branches,
    idTypes,
    headcountTrend,
    companyExperience,
    salaryByBranch,
    salaryMedianByBranch,
    religions,
    salaryByContractType,
    genderByBranch,
    topPaidEmployees,
    salaryByQualification,
    salaryByNationality,
    totalSalaryByNationality,
    salaryBreakdown,
    totalSalaryByGender,
    contractExpiration,
    incompleteData,
    salaryPercentiles,
    genderByJobTitle,
    idExpiration,
  } = statistics;

  // Chart colors - vibrant gradients
  const chartColors = [
    "#667eea",
    "#f093fb",
    "#4facfe",
    "#fa709a",
    "#30cfd0",
    "#a8edea",
    "#ff9a9e",
    "#ffecd2",
    "#43e97b",
    "#38f9d7",
    "#667eea",
    "#764ba2",
    "#f5576c",
    "#00f2fe",
    "#fee140",
    "#330867",
  ];

  const genderColors = {
    male: "#4facfe",
    female: "#fa709a",
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

      {/* Statistics Cards */}
      <div className="stats-cards-grid">
        <div className="stat-card stat-card-primary">
          <div className="stat-card-icon">👥</div>
          <div className="stat-card-content">
            <div className="stat-card-label">إجمالي الموظفين</div>
            <div className="stat-card-value">
              {formatNumber(overview?.total || 0)}
            </div>
          </div>
        </div>

        <div className="stat-card stat-card-male">
          <div className="stat-card-icon">👨</div>
          <div className="stat-card-content">
            <div className="stat-card-label">ذكور</div>
            <div className="stat-card-value">
              {formatNumber(overview?.male || 0)}
            </div>
            <div className="stat-card-sub">
              {formatPercentage(overview?.male || 0, total)}%
            </div>
          </div>
        </div>

        <div className="stat-card stat-card-female">
          <div className="stat-card-icon">👩</div>
          <div className="stat-card-content">
            <div className="stat-card-label">إناث</div>
            <div className="stat-card-value">
              {formatNumber(overview?.female || 0)}
            </div>
            <div className="stat-card-sub">
              {formatPercentage(overview?.female || 0, total)}%
            </div>
          </div>
        </div>

        <div className="stat-card stat-card-salary">
          <div className="stat-card-icon">💰</div>
          <div className="stat-card-content">
            <div className="stat-card-label">متوسط الراتب</div>
            <div className="stat-card-value">
              {formatCurrency(overview?.avgSalary || 0)}
            </div>
            <div className="stat-card-sub">ريال</div>
          </div>
        </div>

        <div className="stat-card stat-card-budget">
          <div className="stat-card-icon">📊</div>
          <div className="stat-card-content">
            <div className="stat-card-label">إجمالي الرواتب</div>
            <div className="stat-card-value">
              {formatCurrency(overview?.totalSalaryBudget || 0)}
            </div>
            <div className="stat-card-sub">ريال</div>
          </div>
        </div>

        <div className="stat-card stat-card-completion">
          <div className="stat-card-icon">✅</div>
          <div className="stat-card-content">
            <div className="stat-card-label">نسبة الإكمال</div>
            <div className="stat-card-value">
              {formatNumber(overview?.completionRate || 0)}%
            </div>
          </div>
        </div>

        {salary && (
          <>
            <div className="stat-card stat-card-min">
              <div className="stat-card-icon">📉</div>
              <div className="stat-card-content">
                <div className="stat-card-label">أقل راتب</div>
                <div className="stat-card-value">
                  {formatCurrency(salary.min || 0)}
                </div>
                <div className="stat-card-sub">ريال</div>
              </div>
            </div>

            <div className="stat-card stat-card-max">
              <div className="stat-card-icon">📈</div>
              <div className="stat-card-content">
                <div className="stat-card-label">أعلى راتب</div>
                <div className="stat-card-value">
                  {formatCurrency(salary.max || 0)}
                </div>
                <div className="stat-card-sub">ريال</div>
              </div>
            </div>
          </>
        )}

        <div className="stat-card stat-card-active">
          <div className="stat-card-icon">✓</div>
          <div className="stat-card-content">
            <div className="stat-card-label">نشط</div>
            <div className="stat-card-value">
              {formatNumber(overview?.active || 0)}
            </div>
            <div className="stat-card-sub">
              {formatPercentage(overview?.active || 0, total)}%
            </div>
          </div>
        </div>

        <div className="stat-card stat-card-pending">
          <div className="stat-card-icon">⏳</div>
          <div className="stat-card-content">
            <div className="stat-card-label">قيد الانتظار</div>
            <div className="stat-card-value">
              {formatNumber(overview?.pending || 0)}
            </div>
            <div className="stat-card-sub">
              {formatPercentage(overview?.pending || 0, total)}%
            </div>
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
              <ResponsiveContainer width="100%" height={450}>
                <PieChart>
                  <Pie
                    data={gender.map((item) => ({
                      name: item.gender === "male" ? "ذكور" : "إناث",
                      value: item.count,
                      percentage: item.percentage,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={160}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {gender.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={genderColors[entry.gender]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value, entry) =>
                      `${value}: ${formatNumber(entry.payload.value)}`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}


        {/* Salary Ranges */}
        {salary?.ranges && salary.ranges.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">توزيع الرواتب حسب الفئات</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={450}>
                <PieChart>
                  <Pie
                    data={salary.ranges.map((item) => ({
                      name: `${item.range} ريال`,
                      value: item.count,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={160}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {salary.ranges.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={60}
                    formatter={(value, entry) =>
                      `${value}: ${formatNumber(entry.payload.value)}`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Job Titles Distribution */}
        {jobTitles && jobTitles.length > 0 && (
          <div className="chart-section chart-section-large">
            <h3 className="chart-title">
              توزيع الموظفين حسب المسمى الوظيفي
              <span className="chart-subtitle">
                (
                {formatNumber(
                  jobTitles.reduce((sum, item) => sum + item.count, 0),
                )}{" "}
                من {formatNumber(total)} موظف)
              </span>
            </h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={500}>
                <PieChart>
                  <Pie
                    data={jobTitles.slice(0, 10).map((item) => ({
                      name: item.job_title,
                      value: item.count,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={180}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {jobTitles.slice(0, 10).map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={80}
                    formatter={(value, entry) =>
                      `${value}: ${formatNumber(entry.payload.value)}`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Contract Types */}
        {contractTypes && contractTypes.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">توزيع الموظفين حسب نوع العقد</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={450}>
                <PieChart>
                  <Pie
                    data={contractTypes.map((item) => ({
                      name: item.contract_type,
                      value: item.count,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={160}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {contractTypes.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={60}
                    formatter={(value, entry) =>
                      `${value}: ${formatNumber(entry.payload.value)}`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Marital Status */}
        {maritalStatus && maritalStatus.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">
              توزيع الموظفين حسب الحالة الاجتماعية
            </h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={450}>
                <PieChart>
                  <Pie
                    data={maritalStatus.map((item) => {
                      const maritalLabels = {
                        single: "أعزب",
                        married: "متزوج",
                        divorced: "مطلق",
                        widowed: "أرمل",
                        "غير محدد": "غير محدد",
                      };
                      return {
                        name: maritalLabels[item.status] || item.status,
                        value: item.count,
                      };
                    })}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={160}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {maritalStatus.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={60}
                    formatter={(value, entry) =>
                      `${value}: ${formatNumber(entry.payload.value)}`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Nationalities */}
        {nationalities && nationalities.length > 0 && (
          <div className="chart-section chart-section-large">
            <h3 className="chart-title">توزيع الموظفين حسب الجنسية</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={500}>
                <PieChart>
                  <Pie
                    data={nationalities.slice(0, 10).map((item) => ({
                      name: item.nationality,
                      value: item.count,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={180}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {nationalities.slice(0, 10).map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={80}
                    formatter={(value, entry) =>
                      `${value}: ${formatNumber(entry.payload.value)}`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Nationality by Gender (Top 10) */}
        {nationalityGender && nationalityGender.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">توزيع الجنس حسب الجنسية (أعلى 10)</h3>
            <div className="chart-table">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>الجنسية</th>
                    <th>ذكور</th>
                    <th>إناث</th>
                    <th>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {nationalityGender.map((row, idx) => (
                    <tr key={`nat-gen-${idx}`}>
                      <td>{row.nationality}</td>
                      <td className="male-value">{formatNumber(row.male_count)}</td>
                      <td className="female-value">{formatNumber(row.female_count)}</td>
                      <td>{formatNumber((row.male_count || 0) + (row.female_count || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Educational Qualifications */}
        {educationalQualifications && educationalQualifications.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">توزيع الموظفين حسب المؤهل التعليمي</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={450}>
                <PieChart>
                  <Pie
                    data={educationalQualifications.map((item) => ({
                      name: item.qualification,
                      value: item.count,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={160}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {educationalQualifications.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={60}
                    formatter={(value, entry) =>
                      `${value}: ${formatNumber(entry.payload.value)}`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}



        {/* Branch Distribution - Main Manager Only */}
        {isMainManager() && branches && branches.length > 0 && (
          <div className="chart-section chart-section-large">
            <h3 className="chart-title">توزيع الموظفين حسب الفروع</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={500}>
                <PieChart>
                  <Pie
                    data={branches.map((item) => ({
                      name: item.branch_name,
                      value: item.count,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={180}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {branches.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={80}
                    formatter={(value, entry) =>
                      `${value}: ${formatNumber(entry.payload.value)}`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Total Salaries by Branch - Main Manager Only */}
        {isMainManager() && salaryByBranch && salaryByBranch.length > 0 && (
          <div className="chart-section chart-section-large">
            <h3 className="chart-title">إجمالي الرواتب حسب الفروع</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={500}>
                <PieChart>
                  <Pie
                    data={salaryByBranch.map((item) => ({
                      name: item.branch_name,
                      value: (item.average_salary || 0) * (item.count || 0),
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={180}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {salaryByBranch.map((entry, index) => (
                      <Cell
                        key={`cell-total-salary-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomCurrencyTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={80}
                    formatter={(value, entry) =>
                      `${value}: ${formatCurrency(entry.payload.value)} ريال`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Average Salary by Branch - Main Manager Only */}
        {isMainManager() && salaryByBranch && salaryByBranch.length > 0 && (
          <div className="chart-section chart-section-large">
            <h3 className="chart-title">متوسط الرواتب حسب الفروع</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={500}>
                <PieChart>
                  <Pie
                    data={salaryByBranch.map((item) => ({
                      name: item.branch_name,
                      value: item.average_salary || 0,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={180}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {salaryByBranch.map((entry, index) => (
                      <Cell
                        key={`cell-avg-salary-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomCurrencyTooltip labelPrefix="متوسط: " />} />
                  <Legend
                    verticalAlign="bottom"
                    height={80}
                    formatter={(value, entry) =>
                      `${value}: ${formatCurrency(entry.payload.value)} ريال`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Median Salary by Branch - Main Manager Only */}
        {isMainManager() && salaryMedianByBranch && salaryMedianByBranch.length > 0 && (
          <div className="chart-section chart-section-large">
            <h3 className="chart-title">الوسيط للرواتب حسب الفروع</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={500}>
                <PieChart>
                  <Pie
                    data={salaryMedianByBranch.map((item) => ({
                      name: item.branch_name,
                      value: item.median_salary || 0,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={180}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {salaryMedianByBranch.map((entry, index) => (
                      <Cell
                        key={`cell-median-salary-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomCurrencyTooltip labelPrefix="الوسيط: " />} />
                  <Legend
                    verticalAlign="bottom"
                    height={80}
                    formatter={(value, entry) =>
                      `${value}: ${formatCurrency(entry.payload.value)} ريال`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Age Groups */}
        {ageGroups && ageGroups.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">توزيع الموظفين حسب الفئة العمرية</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={450}>
                <PieChart>
                  <Pie
                    data={ageGroups.map((item) => ({
                      name: `${item.age_group} سنة`,
                      value: item.count,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={160}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {ageGroups.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={60}
                    formatter={(value, entry) =>
                      `${value}: ${formatNumber(entry.payload.value)}`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Experience Levels */}
        {experienceLevels && experienceLevels.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">توزيع الموظفين حسب سنوات الخبرة</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={450}>
                <PieChart>
                  <Pie
                    data={experienceLevels.map((item) => ({
                      name: `${item.experience_range} سنة`,
                      value: item.count,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={160}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {experienceLevels.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={60}
                    formatter={(value, entry) =>
                      `${value}: ${formatNumber(entry.payload.value)}`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ID Type Distribution */}
        {idTypes && idTypes.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">توزيع الموظفين حسب نوع الهوية</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={450}>
                <PieChart>
                  <Pie
                    data={idTypes.map((item) => {
                      const idTypeLabels = {
                        citizen: "مواطن",
                        resident: "مقيم",
                        "غير محدد": "غير محدد",
                      };
                      return {
                        name: idTypeLabels[item.id_type] || item.id_type,
                        value: item.count,
                      };
                    })}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={160}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {idTypes.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={60}
                    formatter={(value, entry) =>
                      `${value}: ${formatNumber(entry.payload.value)}`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}


        {/* Religious Distribution */}
        {religions && religions.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">توزيع الموظفين حسب الديانة</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={450}>
                <PieChart>
                  <Pie
                    data={religions.map((item) => ({
                      name: item.religion,
                      value: item.count,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={160}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {religions.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={60}
                    formatter={(value, entry) =>
                      `${value}: ${formatNumber(entry.payload.value)}`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Salary by Contract Type */}
        {salaryByContractType && salaryByContractType.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">متوسط الرواتب حسب نوع العقد</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={450}>
                <PieChart>
                  <Pie
                    data={salaryByContractType.map((item) => ({
                      name: item.contract_type,
                      value: item.average_salary || 0,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={160}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {salaryByContractType.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomCurrencyTooltip labelPrefix="متوسط: " />} />
                  <Legend
                    verticalAlign="bottom"
                    height={60}
                    formatter={(value, entry) =>
                      `${value}: ${formatCurrency(entry.payload.value)} ريال`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Salary by Educational Qualification */}
        {salaryByQualification && salaryByQualification.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">متوسط الرواتب حسب المؤهل التعليمي</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={450}>
                <PieChart>
                  <Pie
                    data={salaryByQualification.map((item) => ({
                      name: item.qualification,
                      value: item.average_salary || 0,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={160}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {salaryByQualification.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomCurrencyTooltip labelPrefix="متوسط: " />} />
                  <Legend
                    verticalAlign="bottom"
                    height={60}
                    formatter={(value, entry) =>
                      `${value}: ${formatCurrency(entry.payload.value)} ريال`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        {/* Gender Distribution by Branch - Main Manager Only */}
        {isMainManager() && genderByBranch && genderByBranch.length > 0 && (
          <div className="chart-section chart-section-large">
            <h3 className="chart-title">توزيع الجنس حسب الفروع</h3>
            <div className="chart-container">
              <div className="table-wrapper" style={{ maxHeight: "500px", overflowY: "auto" }}>
                <table className="stats-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, background: "white", zIndex: 1 }}>
                    <tr>
                      <th style={{ padding: "12px", textAlign: "right", borderBottom: "2px solid #e2e8f0" }}>الفرع</th>
                      <th style={{ padding: "12px", textAlign: "center", borderBottom: "2px solid #e2e8f0" }}>ذكور</th>
                      <th style={{ padding: "12px", textAlign: "center", borderBottom: "2px solid #e2e8f0" }}>إناث</th>
                      <th style={{ padding: "12px", textAlign: "center", borderBottom: "2px solid #e2e8f0" }}>الإجمالي</th>
                      <th style={{ padding: "12px", textAlign: "center", borderBottom: "2px solid #e2e8f0" }}>نسبة الذكور</th>
                    </tr>
                  </thead>
                  <tbody>
                    {genderByBranch.map((item, index) => {
                      const maleCount = item.male_count || 0;
                      const femaleCount = item.female_count || 0;
                      const totalCount = maleCount + femaleCount;
                      const malePercentage = totalCount > 0 ? ((maleCount / totalCount) * 100).toFixed(1) : 0;
                      return (
                        <tr key={item.branch_name} style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "10px", textAlign: "right" }}>{item.branch_name}</td>
                          <td style={{ padding: "10px", textAlign: "center", color: genderColors.male, fontWeight: "600" }}>
                            {formatNumber(maleCount)}
                          </td>
                          <td style={{ padding: "10px", textAlign: "center", color: genderColors.female, fontWeight: "600" }}>
                            {formatNumber(femaleCount)}
                          </td>
                          <td style={{ padding: "10px", textAlign: "center", fontWeight: "600" }}>
                            {formatNumber(totalCount)}
                          </td>
                          <td style={{ padding: "10px", textAlign: "center" }}>
                            {malePercentage}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Top 10 Highest Paid Employees - Main Manager Only */}
        {isMainManager() && topPaidEmployees && topPaidEmployees.length > 0 && (
          <div className="chart-section chart-section-large">
            <h3 className="chart-title">أعلى 10 رواتب</h3>
            <div className="chart-container">
              <div className="table-wrapper" style={{ maxHeight: "500px", overflowY: "auto" }}>
                <table className="stats-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, background: "white", zIndex: 1 }}>
                    <tr>
                      <th style={{ padding: "12px", textAlign: "right", borderBottom: "2px solid #e2e8f0" }}>#</th>
                      <th style={{ padding: "12px", textAlign: "right", borderBottom: "2px solid #e2e8f0" }}>الاسم</th>
                      <th style={{ padding: "12px", textAlign: "center", borderBottom: "2px solid #e2e8f0" }}>المسمى الوظيفي</th>
                      <th style={{ padding: "12px", textAlign: "center", borderBottom: "2px solid #e2e8f0" }}>الفرع</th>
                      <th style={{ padding: "12px", textAlign: "center", borderBottom: "2px solid #e2e8f0" }}>الراتب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topPaidEmployees.map((item, index) => (
                      <tr key={item.name} style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <td style={{ padding: "10px", textAlign: "right", fontWeight: "600" }}>{index + 1}</td>
                        <td style={{ padding: "10px", textAlign: "right" }}>{item.name}</td>
                        <td style={{ padding: "10px", textAlign: "center" }}>{item.job_title || "غير محدد"}</td>
                        <td style={{ padding: "10px", textAlign: "center" }}>{item.branch_name}</td>
                        <td style={{ padding: "10px", textAlign: "center", fontWeight: "600", color: "#10b981", direction: "ltr" }}>
                          {formatCurrency(item.salary)} ريال
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Average Salary by Nationality (Top 10) */}
        {salaryByNationality && salaryByNationality.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">متوسط الرواتب حسب الجنسية (أعلى 10)</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={450}>
                <PieChart>
                  <Pie
                    data={salaryByNationality.map((item) => ({
                      name: item.nationality,
                      value: item.average_salary || 0,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={160}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {salaryByNationality.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomCurrencyTooltip labelPrefix="متوسط: " />} />
                  <Legend
                    verticalAlign="bottom"
                    height={80}
                    formatter={(value, entry) =>
                      `${value}: ${formatCurrency(entry.payload.value)} ريال`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Total Salary by Nationality (Top 10) */}
        {totalSalaryByNationality && totalSalaryByNationality.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">إجمالي الرواتب حسب الجنسية (أعلى 10)</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={450}>
                <PieChart>
                  <Pie
                    data={totalSalaryByNationality.map((item) => ({
                      name: item.nationality,
                      value: item.total_salary || 0,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={160}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {totalSalaryByNationality.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomCurrencyTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={80}
                    formatter={(value, entry) =>
                      `${value}: ${formatCurrency(entry.payload.value)} ريال`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Total Salary Budget by Gender */}
        {totalSalaryByGender && totalSalaryByGender.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">إجمالي الرواتب حسب الجنس</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={450}>
                <PieChart>
                  <Pie
                    data={totalSalaryByGender.map((item) => ({
                      name: item.gender === "male" ? "ذكور" : "إناث",
                      value: item.total_salary || 0,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={160}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {totalSalaryByGender.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.gender === "male" ? genderColors.male : genderColors.female}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomCurrencyTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={60}
                    formatter={(value, entry) =>
                      `${value}: ${formatCurrency(entry.payload.value)} ريال`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Salary Breakdown by Allowances */}
        {salaryBreakdown && (
          <div className="chart-section">
            <h3 className="chart-title">متوسط مكونات الراتب</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={450}>
                <PieChart>
                  <Pie
                    data={[
                      {
                        name: `الراتب الأساسي (${formatNumber(salaryBreakdown.base_salary_count)})`,
                        value: salaryBreakdown.avg_base_salary || 0
                      },
                      {
                        name: `بدل السكن (${formatNumber(salaryBreakdown.housing_allowance_count)})`,
                        value: salaryBreakdown.avg_housing_allowance || 0
                      },
                      {
                        name: `بدل النقل (${formatNumber(salaryBreakdown.transportation_allowance_count)})`,
                        value: salaryBreakdown.avg_transportation_allowance || 0
                      },
                      {
                        name: `بدلات أخرى (${formatNumber(salaryBreakdown.other_allowances_count)})`,
                        value: salaryBreakdown.avg_other_allowances || 0
                      },
                    ].filter(item => item.value > 0)}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={160}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {[...Array(4)].map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomCurrencyTooltip labelPrefix="متوسط: " />} />
                  <Legend
                    verticalAlign="bottom"
                    height={80}
                    formatter={(value, entry) =>
                      `${value}: ${formatCurrency(entry.payload.value)} ريال`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Contract Expiration Timeline */}
        {contractExpiration && contractExpiration.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">جدول انتهاء العقود</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={450}>
                <PieChart>
                  <Pie
                    data={contractExpiration.map((item) => ({
                      name: item.period,
                      value: item.count,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={160}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {contractExpiration.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={60}
                    formatter={(value, entry) =>
                      `${value}: ${formatNumber(entry.payload.value)}`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ID Expiration Warnings */}
        {idExpiration && idExpiration.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">جدول انتهاء الهويات</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={450}>
                <PieChart>
                  <Pie
                    data={idExpiration.map((item) => ({
                      name: item.period,
                      value: item.count,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={160}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {idExpiration.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={60}
                    formatter={(value, entry) =>
                      `${value}: ${formatNumber(entry.payload.value)}`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Incomplete Data Breakdown */}
        {incompleteData && (
          <div className="chart-section chart-section-large">
            <h3 className="chart-title">البيانات الناقصة حسب الحقل</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={450}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "رقم الجوال", value: incompleteData.missing_phone },
                      { name: "البريد الإلكتروني", value: incompleteData.missing_email },
                      { name: "رقم الآيبان", value: incompleteData.missing_iban },
                      { name: "المؤهل التعليمي", value: incompleteData.missing_qualification },
                      { name: "التخصص", value: incompleteData.missing_specialization },
                      { name: "العنوان الوطني", value: incompleteData.missing_address },
                      { name: "تاريخ الميلاد", value: incompleteData.missing_birthdate },
                      { name: "الراتب", value: incompleteData.missing_salary },
                      { name: "بداية العقد", value: incompleteData.missing_contract_start },
                      { name: "نهاية العقد", value: incompleteData.missing_contract_end },
                    ].filter(item => item.value > 0)}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={160}
                    label={renderCustomLabel}
                    labelLine={false}
                  >
                    {[...Array(10)].map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={80}
                    formatter={(value, entry) =>
                      `${value}: ${formatNumber(entry.payload.value)}`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Salary Percentiles */}
        {salaryPercentiles && (
          <div className="chart-section">
            <h3 className="chart-title">النسب المئوية للرواتب</h3>
            <div className="chart-container">
              <div style={{ padding: "20px", textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: "20px" }}>
                  <div className="stat-card stat-card-primary" style={{ flex: "1", minWidth: "200px" }}>
                    <div className="stat-card-icon">📊</div>
                    <div className="stat-card-content">
                      <div className="stat-card-label">الربع الأول (25%)</div>
                      <div className="stat-card-value" style={{ direction: "ltr" }}>
                        {formatCurrency(salaryPercentiles.p25)}
                      </div>
                      <div className="stat-card-sub">ريال</div>
                    </div>
                  </div>
                  <div className="stat-card stat-card-salary" style={{ flex: "1", minWidth: "200px" }}>
                    <div className="stat-card-icon">📈</div>
                    <div className="stat-card-content">
                      <div className="stat-card-label">الوسيط (50%)</div>
                      <div className="stat-card-value" style={{ direction: "ltr" }}>
                        {formatCurrency(salaryPercentiles.p50)}
                      </div>
                      <div className="stat-card-sub">ريال</div>
                    </div>
                  </div>
                  <div className="stat-card stat-card-max" style={{ flex: "1", minWidth: "200px" }}>
                    <div className="stat-card-icon">📊</div>
                    <div className="stat-card-content">
                      <div className="stat-card-label">الربع الثالث (75%)</div>
                      <div className="stat-card-value" style={{ direction: "ltr" }}>
                        {formatCurrency(salaryPercentiles.p75)}
                      </div>
                      <div className="stat-card-sub">ريال</div>
                    </div>
                  </div>
                </div>
                <p style={{ marginTop: "20px", color: "#64748b", fontSize: "14px" }}>
                  25% من الموظفين يتقاضون أقل من {formatCurrency(salaryPercentiles.p25)} ريال،
                  50% أقل من {formatCurrency(salaryPercentiles.p50)} ريال،
                  و 75% أقل من {formatCurrency(salaryPercentiles.p75)} ريال
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Gender Distribution in Top 5 Job Titles */}
        {genderByJobTitle && genderByJobTitle.length > 0 && (
          <div className="chart-section chart-section-large">
            <h3 className="chart-title">توزيع الجنس في أعلى 5 وظائف</h3>
            <div className="chart-container">
              <div className="table-wrapper" style={{ maxHeight: "500px", overflowY: "auto" }}>
                <table className="stats-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, background: "white", zIndex: 1 }}>
                    <tr>
                      <th style={{ padding: "12px", textAlign: "right", borderBottom: "2px solid #e2e8f0" }}>المسمى الوظيفي</th>
                      <th style={{ padding: "12px", textAlign: "center", borderBottom: "2px solid #e2e8f0" }}>ذكور</th>
                      <th style={{ padding: "12px", textAlign: "center", borderBottom: "2px solid #e2e8f0" }}>إناث</th>
                      <th style={{ padding: "12px", textAlign: "center", borderBottom: "2px solid #e2e8f0" }}>الإجمالي</th>
                      <th style={{ padding: "12px", textAlign: "center", borderBottom: "2px solid #e2e8f0" }}>نسبة الذكور</th>
                    </tr>
                  </thead>
                  <tbody>
                    {genderByJobTitle.map((item, index) => {
                      const maleCount = item.male_count || 0;
                      const femaleCount = item.female_count || 0;
                      const totalCount = maleCount + femaleCount;
                      const malePercentage = totalCount > 0 ? ((maleCount / totalCount) * 100).toFixed(1) : 0;
                      return (
                        <tr key={item.job_title} style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "10px", textAlign: "center", color: genderColors.male, fontWeight: "600" }}>
                            {formatNumber(maleCount)}
                          </td>
                          <td style={{ padding: "10px", textAlign: "center", color: genderColors.female, fontWeight: "600" }}>
                            {formatNumber(femaleCount)}
                          </td>
                          <td style={{ padding: "10px", textAlign: "center", fontWeight: "600" }}>
                            {formatNumber(totalCount)}
                          </td>
                          <td style={{ padding: "10px", textAlign: "center" }}>
                            {malePercentage}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeStatistics;
