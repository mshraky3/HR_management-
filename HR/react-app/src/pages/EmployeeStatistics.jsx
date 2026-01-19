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
    educationalQualifications,
    status,
    ageGroups,
    experienceLevels,
    branches,
    idTypes,
    companyExperience,
    salaryByBranch,
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
                    data={maritalStatus.map((item) => ({
                      name: item.status,
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

        {/* Status Distribution */}
        {status && status.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">توزيع الموظفين حسب الحالة</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={450}>
                <PieChart>
                  <Pie
                    data={status.map((item) => {
                      const statusLabels = {
                        active: "نشط",
                        pending: "قيد الانتظار",
                        terminated: "منتهي",
                        resigned: "استقال",
                        contract_ended: "انتهى العقد",
                        non_renewal: "عدم التجديد",
                        other: "أخرى",
                      };
                      return {
                        name: statusLabels[item.status] || item.status,
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
                    {status.map((entry, index) => (
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

        {/* Company Experience */}
        {companyExperience && companyExperience.length > 0 && (
          <div className="chart-section">
            <h3 className="chart-title">
              توزيع الموظفين حسب سنوات الخبرة في الشركة
            </h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={450}>
                <PieChart>
                  <Pie
                    data={companyExperience.map((item) => ({
                      name: item.experience_range,
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
                    {companyExperience.map((entry, index) => (
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
      </div>
    </div>
  );
};

export default EmployeeStatistics;
