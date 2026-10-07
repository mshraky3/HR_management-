/**
 * Employee Statistics Page
 * Display comprehensive employee analytics with circle/pie charts and data visualizations
 */

import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNotification } from "../contexts/NotificationContext";
import { employeesAPI } from "../utils/api";
import { Page, PageHeader, StatCard, Card, Checkbox, Alert, Skeleton } from "../ui";


import "./EmployeeStatistics.css";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

// Custom Tooltip Component
const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div className="es-tip">
        <p className="es-tip-title">
          {data.name}
        </p>
        <p className="es-tip-text">
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
      <div className="es-tip">
        <p className="es-tip-title">
          {data.name}
        </p>
        <p className="es-tip-text">
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
  _name,
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
        textShadow: "0 1px 3px rgba(0,0,0,0.5)",
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
      <Page>
        <PageHeader title="إحصائيات الموظفين" />
        <Card><Skeleton lines={6} height={18} /></Card>
      </Page>
    );
  }

  if (!statistics) {
    return (
      <Page>
        <PageHeader title="إحصائيات الموظفين" />
        <Alert tone="warning">لا توجد بيانات متاحة</Alert>
      </Page>
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
    _specializations,
    _status,
    ageGroups,
    experienceLevels,
    branches,
    idTypes,
    _headcountTrend,
    _companyExperience,
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
    "#215f9a", "#2b9a8f", "#d97706", "#7c5cbf", "#c2410c", "#3b82a6", "#15803d", "#b91c1c",
    "#64748b", "#0e7490", "#a16207", "#6d28d9", "#be185d", "#4d7c0f", "#334155", "#0369a1",
  ];

  const genderColors = {
    male: "#215f9a",
    female: "#be185d",
  };

  const total = overview?.total || 0;

  return (
    <Page>
      <PageHeader
        title="إحصائيات الموظفين"
        subtitle="نظرة شاملة على الموظفين والرواتب والعقود"
        actions={<Checkbox checked={showPercentages} onChange={(e) => setShowPercentages(e.target.checked)} label="عرض النسب المئوية" />}
      />

      <div className="ui-grid-stats">
        <StatCard label="إجمالي الموظفين" value={formatNumber(overview?.total || 0)} icon="users" tone="primary" />
        <StatCard label={`ذكور · ${formatPercentage(overview?.male || 0, total)}%`} value={formatNumber(overview?.male || 0)} icon="user" tone="primary" />
        <StatCard label={`إناث · ${formatPercentage(overview?.female || 0, total)}%`} value={formatNumber(overview?.female || 0)} icon="user" tone="danger" />
        <StatCard label="متوسط الراتب (ريال)" value={formatCurrency(overview?.avgSalary || 0)} icon="wallet" tone="success" />
        <StatCard label="إجمالي الرواتب (ريال)" value={formatCurrency(overview?.totalSalaryBudget || 0)} icon="chart" tone="warning" />
        <StatCard label="نسبة الإكمال" value={`${formatNumber(overview?.completionRate || 0)}%`} icon="check-circle" tone="success" />
        {salary && <StatCard label="أقل راتب (ريال)" value={formatCurrency(salary.min || 0)} icon="wallet" tone="neutral" />}
        {salary && <StatCard label="أعلى راتب (ريال)" value={formatCurrency(salary.max || 0)} icon="wallet" tone="neutral" />}
        <StatCard label={`نشط · ${formatPercentage(overview?.active || 0, total)}%`} value={formatNumber(overview?.active || 0)} icon="user-check" tone="success" />
        <StatCard label={`قيد الانتظار · ${formatPercentage(overview?.pending || 0, total)}%`} value={formatNumber(overview?.pending || 0)} icon="clock" tone="warning" />
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
              <table className="es-table">
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
              <div className="es-table-wrap">
                <table className="es-table">
                  <thead>
                    <tr>
                      <th>الفرع</th>
                      <th>ذكور</th>
                      <th>إناث</th>
                      <th>الإجمالي</th>
                      <th>نسبة الذكور</th>
                    </tr>
                  </thead>
                  <tbody>
                    {genderByBranch.map((item, _index) => {
                      const maleCount = item.male_count || 0;
                      const femaleCount = item.female_count || 0;
                      const totalCount = maleCount + femaleCount;
                      const malePercentage = totalCount > 0 ? ((maleCount / totalCount) * 100).toFixed(1) : 0;
                      return (
                        <tr key={item.branch_name}>
                          <td>{item.branch_name}</td>
                          <td className="es-male">
                            {formatNumber(maleCount)}
                          </td>
                          <td className="es-female">
                            {formatNumber(femaleCount)}
                          </td>
                          <td>
                            {formatNumber(totalCount)}
                          </td>
                          <td>
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
              <div className="es-table-wrap">
                <table className="es-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>الاسم</th>
                      <th>المسمى الوظيفي</th>
                      <th>الفرع</th>
                      <th>الراتب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topPaidEmployees.map((item, index) => (
                      <tr key={item.name}>
                        <td>{index + 1}</td>
                        <td>{item.name}</td>
                        <td>{item.job_title || "غير محدد"}</td>
                        <td>{item.branch_name}</td>
                        <td>
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
                <p style={{ marginTop: "20px", color: "var(--text-muted)", fontSize: "14px" }}>
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
              <div className="es-table-wrap">
                <table className="es-table">
                  <thead>
                    <tr>
                      <th>المسمى الوظيفي</th>
                      <th>ذكور</th>
                      <th>إناث</th>
                      <th>الإجمالي</th>
                      <th>نسبة الذكور</th>
                    </tr>
                  </thead>
                  <tbody>
                    {genderByJobTitle.map((item, _index) => {
                      const maleCount = item.male_count || 0;
                      const femaleCount = item.female_count || 0;
                      const totalCount = maleCount + femaleCount;
                      const malePercentage = totalCount > 0 ? ((maleCount / totalCount) * 100).toFixed(1) : 0;
                      return (
                        <tr key={item.job_title}>
                          <td className="es-male">
                            {formatNumber(maleCount)}
                          </td>
                          <td className="es-female">
                            {formatNumber(femaleCount)}
                          </td>
                          <td>
                            {formatNumber(totalCount)}
                          </td>
                          <td>
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
    </Page>
  );
};

export default EmployeeStatistics;
