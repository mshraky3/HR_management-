/**
 * Experience Certificate Page
 * Generate experience certificates for employees
 * Main Manager only
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { employeesAPI, notificationsAPI } from "../utils/api";
import { downloadFile } from '../utils/downloadFile';
import { useAuth } from "../contexts/AuthContext";
import { useNotification } from "../contexts/NotificationContext";
import { formatDate } from "../utils/dateConverters";
import { useBranches } from "../hooks/useBranches";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
// TablePage.css is now loaded in App.jsx to prevent FOUC
import "./ExperienceCertificate.css";

const ExperienceCertificate = () => {
  const { isMainManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const [employees, setEmployees] = useState([]);
  const { branches: rawBranches } = useBranches();
  const branches = useMemo(
    () => [...rawBranches].sort((a, b) => (a.branch_name || "").localeCompare(b.branch_name || "", "ar")),
    [rawBranches]
  );
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [certificateType, setCertificateType] = useState("experience"); // Default to experience certificate
  const [searchFilters, setSearchFilters] = useState({
    search_name: "",
    search_id: "",
    search_phone: "",
    branch_id: "",
  });
  const [hasSearched, setHasSearched] = useState(false);
  const [branchSearchTerm, setBranchSearchTerm] = useState("");
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [generatedPdfBlob, setGeneratedPdfBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [sendingNotification, setSendingNotification] = useState(false);
  const [certificateData, setCertificateData] = useState({
    full_name: "",
    id_number: "",
    nationality: "",
    job_title: "",
    contract_start_date: "",
    contract_start_date_gregorian: "",
    contract_end_date: "",
    contract_end_date_gregorian: "",
    salary: "",
    basic_salary: "",
    housing_allowance: "",
    transportation_allowance: "",
    annual_leave_allowance: "",
    end_of_service_allowance: "",
    other_allowances: "",
    recipient: "الي من يهمه الامر",
    employer: "شركة الرعاية المتناهية",
    custom_title: "",
  });

  // Helper to calculate total salary from all 6 components
  const calcSalaryTotal = (data) => {
    const total =
      (parseFloat(data.basic_salary) || 0) +
      (parseFloat(data.housing_allowance) || 0) +
      (parseFloat(data.transportation_allowance) || 0) +
      (parseFloat(data.annual_leave_allowance) || 0) +
      (parseFloat(data.end_of_service_allowance) || 0) +
      (parseFloat(data.other_allowances) || 0);
    return total > 0 ? total.toString() : "";
  };

  // Refs to maintain focus on search inputs
  const searchNameRef = useRef(null);
  const searchIdRef = useRef(null);
  const searchPhoneRef = useRef(null);

  // Certificate types (extensible for future certificate types)
  const certificateTypes = [
    { value: "experience", label: "شهادة الخبرة" },
    { value: "salary", label: "تعريف الراتب" },
    { value: "specialties", label: "تعريف هيئة التخصصات" },
  ];

  // Redirect if not main manager
  useEffect(() => {
    if (!isMainManager()) {
      window.location.href = "/dashboard";
    }
  }, [isMainManager]);

  // Load branches and sort alphabetically
  const loadEmployees = async () => {
    // Check if at least one search filter is filled
    const hasSearchCriteria =
      searchFilters.search_name.trim() ||
      searchFilters.search_id.trim() ||
      searchFilters.search_phone.trim() ||
      searchFilters.branch_id;

    if (!hasSearchCriteria) {
      setEmployees([]);
      setHasSearched(false);
      return;
    }

    try {
      setLoading(true);
      setHasSearched(true);
      const filters = { is_active: true };

      // Add search filters
      if (searchFilters.search_name.trim()) {
        filters.search_name = searchFilters.search_name.trim();
      }
      if (searchFilters.search_id.trim()) {
        filters.search_id = searchFilters.search_id.trim();
      }
      if (searchFilters.search_phone.trim()) {
        filters.search_phone = searchFilters.search_phone.trim();
      }
      if (searchFilters.branch_id) {
        filters.branch_id = parseInt(searchFilters.branch_id);
      }

      const response = await employeesAPI.getAll(filters);
      if (response.data.success) {
        setEmployees(response.data.data || []);
      }
    } catch (error) {
      console.error("Error loading employees:", error);
      showError("فشل تحميل الموظفين");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    if (e) {
      e.preventDefault();
    }
    loadEmployees();
  };

  const handleClearSearch = () => {
    setSearchFilters({
      search_name: "",
      search_id: "",
      search_phone: "",
      branch_id: "",
    });
    setEmployees([]);
    setHasSearched(false);
    setSelectedEmployeeId(null);
    setSelectedEmployee(null);
    setBranchSearchTerm("");
  };

  const handleEmployeeClick = (employee) => {
    setSelectedEmployeeId(employee.id);
    setSelectedEmployee(employee);
  };

  const getFullName = (employee) => {
    return `${employee.first_name || ""} ${employee.second_name || ""} ${employee.third_name || ""} ${employee.fourth_name || ""}`.trim();
  };

  // Initialize certificate data when employee is selected
  useEffect(() => {
    if (selectedEmployee) {
      const baseSal = selectedEmployee.base_salary || "";
      const housingSal = selectedEmployee.housing_allowance || "";
      const transSal = selectedEmployee.transportation_allowance || "";
      const annualLeaveSal = selectedEmployee.annual_leave_allowance || "";
      const endOfServiceSal = selectedEmployee.end_of_service_allowance || "";
      const otherSal = selectedEmployee.other_allowances || "";
      const total =
        (parseFloat(baseSal) || 0) +
        (parseFloat(housingSal) || 0) +
        (parseFloat(transSal) || 0) +
        (parseFloat(annualLeaveSal) || 0) +
        (parseFloat(endOfServiceSal) || 0) +
        (parseFloat(otherSal) || 0);
      setCertificateData((prev) => ({
        full_name: getFullName(selectedEmployee),
        id_number: selectedEmployee.id_or_residency_number || "",
        nationality: selectedEmployee.nationality || "",
        job_title:
          selectedEmployee.job_title || selectedEmployee.occupation || "",
        contract_start_date: selectedEmployee.contract_start_date_hijri || "",
        contract_start_date_gregorian:
          selectedEmployee.contract_start_date_gregorian || "",
        contract_end_date: selectedEmployee.contract_end_date_hijri || "",
        contract_end_date_gregorian:
          selectedEmployee.contract_end_date_gregorian || "",
        basic_salary: baseSal ? String(baseSal) : "",
        housing_allowance: housingSal ? String(housingSal) : "",
        transportation_allowance: transSal ? String(transSal) : "",
        annual_leave_allowance: annualLeaveSal ? String(annualLeaveSal) : "",
        end_of_service_allowance: endOfServiceSal ? String(endOfServiceSal) : "",
        other_allowances: otherSal ? String(otherSal) : "",
        salary: total > 0 ? total.toString() : "",
        recipient: prev.recipient || "الي من يهمه الامر",
        employer: prev.employer || "شركة الرعاية المتناهية",
        custom_title: prev.custom_title || "",
      }));
    }
  }, [selectedEmployee]);

  // Check for missing data
  const checkMissingData = (employee, data = null) => {
    const dataToCheck = data || certificateData;
    const missingFields = [];

    // Check full name - check if employee has all 4 parts OR if certificateData has full_name
    const employeeHasFullName =
      employee &&
      employee.first_name &&
      employee.second_name &&
      employee.third_name &&
      employee.fourth_name;
    if (
      !employeeHasFullName &&
      (!dataToCheck.full_name || dataToCheck.full_name.trim() === "")
    ) {
      missingFields.push("الاسم الكامل");
    }

    // Check ID number
    if (!dataToCheck.id_number || dataToCheck.id_number.trim() === "") {
      missingFields.push("رقم الهوية/الإقامة");
    }

    // Check nationality
    if (!dataToCheck.nationality || dataToCheck.nationality.trim() === "") {
      missingFields.push("الجنسية");
    }

    // Check job title
    if (!dataToCheck.job_title || dataToCheck.job_title.trim() === "") {
      missingFields.push("المسمى الوظيفي");
    }

    // Check contract start date
    if (
      !dataToCheck.contract_start_date_gregorian ||
      dataToCheck.contract_start_date_gregorian.trim() === ""
    ) {
      missingFields.push("تاريخ بداية العقد");
    }

    // Check contract end date
    if (
      !dataToCheck.contract_end_date_gregorian ||
      dataToCheck.contract_end_date_gregorian.trim() === ""
    ) {
      missingFields.push("تاريخ نهاية العقد");
    }

    return missingFields;
  };

  const missingFields = selectedEmployee
    ? checkMissingData(selectedEmployee)
    : [];
  const hasMissingData = missingFields.length > 0;

  // Send notification for missing data
  const handleSendMissingDataNotification = async () => {
    if (!selectedEmployee || !hasMissingData) return;

    try {
      setSendingNotification(true);
      const employeeName = getFullName(selectedEmployee);
      const missingFieldsText = missingFields.join("، ");

      const certificateTypeName =
        certificateType === "salary" ? "تعريف الراتب" : "شهادة الخبرة";
      const notificationData = {
        message: `يرجى إكمال بيانات الموظف ${employeeName} لإصدار ${certificateTypeName}. البيانات المطلوبة: ${missingFieldsText}`,
        importance_level: 2,
        branch_ids: [selectedEmployee.branch_id],
        duration_days: 7,
      };

      await notificationsAPI.create(notificationData);
      showSuccess("تم إرسال الإشعار للفرع بنجاح");
    } catch (error) {
      console.error("Error sending notification:", error);
      showError(error.response?.data?.message || "فشل إرسال الإشعار");
    } finally {
      setSendingNotification(false);
    }
  };

  // Send certificate to branch
  const handleSendToBranch = async () => {
    if (!selectedEmployee || !generatedPdfBlob) return;

    try {
      setSendingNotification(true);
      const employeeName =
        certificateData.full_name || getFullName(selectedEmployee);

      const certificateTypeName =
        certificateType === "salary" ? "تعريف الراتب" : "شهادة الخبرة";
      const fileName =
        certificateType === "salary"
          ? `تعريف_راتب_${employeeName}.pdf`
          : `شهادة_خبرة_${employeeName}.pdf`;

      const formData = new FormData();
      formData.append(
        "message",
        `تم إنشاء ${certificateTypeName} للموظف ${employeeName}. المرفق: ${certificateTypeName}`,
      );
      formData.append("importance_level", "2");
      formData.append(
        "branch_ids",
        JSON.stringify([selectedEmployee.branch_id]),
      );
      formData.append("duration_days", "7");
      formData.append("file", generatedPdfBlob, fileName);

      await notificationsAPI.create(formData);
      showSuccess(`تم إرسال ${certificateTypeName} للفرع بنجاح`);
      setShowPreview(false);
    } catch (error) {
      console.error("Error sending certificate to branch:", error);
      showError(error.response?.data?.message || "فشل إرسال الشهادة");
    } finally {
      setSendingNotification(false);
    }
  };

  const handleEditData = () => {
    setShowEditModal(true);
  };

  const handleCloseModal = () => {
    setShowEditModal(false);
  };

  const handleGenerateCertificate = async (certData = null) => {
    if (!selectedEmployeeId) {
      showWarning("الرجاء اختيار موظف");
      return;
    }

    if (!certificateType) {
      showWarning("الرجاء اختيار نوع الشهادة");
      return;
    }

    try {
      setGenerating(true);

      const dataToSend = certData || certificateData;

      // Prepare data for backend (convert to format expected by backend)
      const certificateDataForBackend = {
        full_name: dataToSend.full_name,
        id_number: dataToSend.id_number,
        nationality: dataToSend.nationality,
        job_title: dataToSend.job_title,
        contract_start_date:
          dataToSend.contract_start_date_gregorian ||
          dataToSend.contract_start_date,
        contract_end_date:
          dataToSend.contract_end_date_gregorian ||
          dataToSend.contract_end_date,
        salary: dataToSend.salary,
        basic_salary: dataToSend.basic_salary,
        housing_allowance: dataToSend.housing_allowance,
        transportation_allowance: dataToSend.transportation_allowance,
        annual_leave_allowance: dataToSend.annual_leave_allowance,
        end_of_service_allowance: dataToSend.end_of_service_allowance,
        other_allowances: dataToSend.other_allowances,
        recipient: dataToSend.recipient,
        employer: dataToSend.employer,
        custom_title: dataToSend.custom_title || "",
      };

      const response = await employeesAPI.generateCertificate(
        {
          employee_id: selectedEmployeeId,
          certificate_type: certificateType,
          certificate_data: certificateDataForBackend,
        },
        {
          responseType: "blob",
        },
      );

      // Create blob URL for preview
      const blob =
        response.data instanceof Blob
          ? response.data
          : new Blob([response.data], { type: "application/pdf" });

      // Store blob for preview and sending
      setGeneratedPdfBlob(blob);

      // Create preview URL
      const previewUrl = window.URL.createObjectURL(blob);
      setPreviewUrl(previewUrl);

      // Show preview modal instead of auto-downloading
      setShowPreview(true);
      setShowEditModal(false);

      showSuccess("تم إنشاء الشهادة بنجاح");
    } catch (error) {
      console.error("Error generating certificate:", error);
      const errorMessage =
        error.response?.data?.message || error.message || "فشل إنشاء الشهادة";
      showError(errorMessage);
    } finally {
      setGenerating(false);
    }
  };

  // Download certificate
  const handleDownloadCertificate = () => {
    if (!generatedPdfBlob) return;

    const employeeName =
      certificateData.full_name ||
      (selectedEmployee ? getFullName(selectedEmployee) : "موظف");
    const fileName =
      certificateType === "salary"
        ? `تعريف_راتب_${employeeName}.pdf`
        : `شهادة_خبرة_${employeeName}.pdf`;
    downloadFile(generatedPdfBlob, fileName);
  };

  if (!isMainManager()) {
    return null;
  }

  return (
    <div className="table-page">
      <div className="page-header">
        <h1>الشهادات والتعاريف</h1>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleEditData();
        }}
        className="experience-certificate-form"
      >
        {/* Search Filters */}
        <div className="form-section">
          <h2>البحث عن الموظف</h2>
          <div className="search-form">
            <div className="search-filters">
              <div className="form-group">
                <label>البحث بالاسم:</label>
                <input
                  ref={searchNameRef}
                  type="text"
                  value={searchFilters.search_name}
                  onChange={(e) =>
                    setSearchFilters((prev) => ({
                      ...prev,
                      search_name: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSearch(e);
                    }
                  }}
                  placeholder="ابحث بالاسم..."
                  className="form-control"
                />
              </div>
              <div className="form-group">
                <label>البحث برقم الهوية/الإقامة:</label>
                <input
                  ref={searchIdRef}
                  type="text"
                  value={searchFilters.search_id}
                  onChange={(e) =>
                    setSearchFilters((prev) => ({
                      ...prev,
                      search_id: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSearch(e);
                    }
                  }}
                  placeholder="ابحث برقم الهوية..."
                  className="form-control"
                />
              </div>
              <div className="form-group">
                <label>البحث برقم الهاتف:</label>
                <input
                  ref={searchPhoneRef}
                  type="text"
                  value={searchFilters.search_phone}
                  onChange={(e) =>
                    setSearchFilters((prev) => ({
                      ...prev,
                      search_phone: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSearch(e);
                    }
                  }}
                  placeholder="ابحث برقم الهاتف..."
                  className="form-control"
                />
              </div>
              <div className="form-group" style={{ position: "relative" }}>
                <label>البحث بالفرع:</label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    value={
                      searchFilters.branch_id
                        ? branches.find(
                          (b) => b.id === parseInt(searchFilters.branch_id),
                        )?.branch_name || ""
                        : branchSearchTerm
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      setBranchSearchTerm(value);
                      setIsBranchDropdownOpen(true);
                      if (
                        value !==
                        branches.find(
                          (b) => b.id === parseInt(searchFilters.branch_id),
                        )?.branch_name
                      ) {
                        setSearchFilters((prev) => ({
                          ...prev,
                          branch_id: "",
                        }));
                      }
                    }}
                    onFocus={() => {
                      setIsBranchDropdownOpen(true);
                      if (searchFilters.branch_id) {
                        const selectedBranch = branches.find(
                          (b) => b.id === parseInt(searchFilters.branch_id),
                        );
                        if (selectedBranch) {
                          setBranchSearchTerm(selectedBranch.branch_name);
                        }
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        setIsBranchDropdownOpen(false);
                        if (!searchFilters.branch_id) {
                          const matchingBranch = branches.find(
                            (b) =>
                              b.branch_name.toLowerCase() ===
                              branchSearchTerm.toLowerCase(),
                          );
                          if (!matchingBranch) {
                            setBranchSearchTerm("");
                          }
                        }
                      }, 200);
                    }}
                    placeholder="ابحث واختر فرع..."
                    className="form-control"
                  />
                  {isBranchDropdownOpen && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        zIndex: 1000,
                        backgroundColor: "white",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-md)",
                        maxHeight: "300px",
                        overflowY: "auto",
                        boxShadow: "var(--shadow-lg)",
                        marginTop: "4px",
                      }}
                    >
                      <div
                        style={{
                          padding: "8px 12px",
                          cursor: "pointer",
                          borderBottom: "1px solid var(--border-light)",
                          backgroundColor:
                            searchFilters.branch_id === ""
                              ? "var(--primary-light)"
                              : "transparent",
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSearchFilters((prev) => ({
                            ...prev,
                            branch_id: "",
                          }));
                          setBranchSearchTerm("");
                          setIsBranchDropdownOpen(false);
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor =
                            "var(--bg-hover)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor =
                            searchFilters.branch_id === ""
                              ? "var(--primary-light)"
                              : "transparent";
                        }}
                      >
                        جميع الفروع
                      </div>
                      {branches
                        .filter(
                          (branch) =>
                            !branchSearchTerm ||
                            (branch.branch_name || "")
                              .toLowerCase()
                              .includes(branchSearchTerm.toLowerCase()),
                        )
                        .map((branch) => (
                          <div
                            key={branch.id}
                            style={{
                              padding: "8px 12px",
                              cursor: "pointer",
                              borderBottom: "1px solid var(--border-light)",
                              backgroundColor:
                                searchFilters.branch_id === branch.id.toString()
                                  ? "var(--primary-light)"
                                  : "transparent",
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSearchFilters((prev) => ({
                                ...prev,
                                branch_id: branch.id.toString(),
                              }));
                              setBranchSearchTerm("");
                              setIsBranchDropdownOpen(false);
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor =
                                "var(--bg-hover)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor =
                                searchFilters.branch_id === branch.id.toString()
                                  ? "var(--primary-light)"
                                  : "transparent";
                            }}
                          >
                            {branch.branch_name}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="search-actions">
              <button
                type="button"
                onClick={handleSearch}
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? "جاري البحث..." : "بحث"}
              </button>
              {(hasSearched || employees.length > 0) && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="btn btn-secondary"
                >
                  مسح البحث
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Employee Selection */}
        {hasSearched && (
          <div className="form-section">
            <h2>نتائج البحث</h2>
            {loading ? (
              <div className="loading">جاري التحميل...</div>
            ) : employees.length === 0 ? (
              <div className="no-data">لا توجد موظفين ينطبق عليهم البحث</div>
            ) : (
              <div className="employees-list">
                {employees.map((employee) => (
                  <div
                    key={employee.id}
                    className={`employee-item ${selectedEmployeeId === employee.id ? "selected" : ""}`}
                    onClick={() => handleEmployeeClick(employee)}
                  >
                    <div className="employee-info">
                      <div className="employee-name">
                        {getFullName(employee)}
                      </div>
                      <div className="employee-details">
                        {employee.employee_id_number && (
                          <span className="employee-detail">
                            رقم الموظف: {employee.employee_id_number}
                          </span>
                        )}
                        {employee.id_or_residency_number && (
                          <span className="employee-detail">
                            رقم الهوية: {employee.id_or_residency_number}
                          </span>
                        )}
                        {employee.phone_number && (
                          <span className="employee-detail">
                            الهاتف: {employee.phone_number}
                          </span>
                        )}
                      </div>
                    </div>
                    {selectedEmployeeId === employee.id && (
                      <div className="selected-indicator">✓</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Certificate Type Selection */}
        {selectedEmployeeId && (
          <div className="form-section">
            <h2>نوع الشهادة</h2>
            <div className="certificate-type-selection">
              {certificateTypes.map((type) => (
                <label key={type.value} className="certificate-type-option">
                  <input
                    type="radio"
                    name="certificateType"
                    value={type.value}
                    checked={certificateType === type.value}
                    onChange={(e) => setCertificateType(e.target.value)}
                  />
                  <span>{type.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Data Review Section */}
        {selectedEmployeeId && selectedEmployee && (
          <div className="form-section">
            <h2>مراجعة بيانات الشهادة</h2>

            {hasMissingData && (
              <div className="missing-data-warning">
                <div className="warning-icon">⚠️</div>
                <div className="warning-content">
                  <p className="warning-title">البيانات التالية ناقصة:</p>
                  <ul className="missing-fields-list">
                    {missingFields.map((field, index) => (
                      <li key={index}>{field}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={handleSendMissingDataNotification}
                    className="btn btn-warning"
                    disabled={sendingNotification}
                  >
                    {sendingNotification
                      ? "جاري الإرسال..."
                      : "إرسال إشعار للفرع لإكمال البيانات"}
                  </button>
                </div>
              </div>
            )}

            <div className="data-review-table-container">
              <table className="certificate-data-table">
                <tbody>
                  <tr>
                    <td>
                      <label>عنوان الشهادة:</label>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={certificateData.custom_title}
                        onChange={(e) =>
                          setCertificateData({
                            ...certificateData,
                            custom_title: e.target.value,
                          })
                        }
                        className="form-control"
                        placeholder={
                          certificateType === "salary"
                            ? "خطاب تعريف راتب"
                            : certificateType === "specialties"
                              ? "تعريف هيئة التخصصات"
                              : "شهادة خبرة"
                        }
                      />
                    </td>
                  </tr>
                  <tr
                    className={
                      !certificateData.full_name ? "missing-field" : ""
                    }
                  >
                    <td>
                      <label>الاسم الكامل:</label>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={certificateData.full_name}
                        onChange={(e) =>
                          setCertificateData({
                            ...certificateData,
                            full_name: e.target.value,
                          })
                        }
                        className="form-control"
                        placeholder="أدخل الاسم الكامل"
                      />
                    </td>
                  </tr>
                  <tr
                    className={
                      !certificateData.id_number ? "missing-field" : ""
                    }
                  >
                    <td>
                      <label>رقم الهوية/الإقامة:</label>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={certificateData.id_number}
                        onChange={(e) =>
                          setCertificateData({
                            ...certificateData,
                            id_number: e.target.value,
                          })
                        }
                        className="form-control"
                        placeholder="أدخل رقم الهوية/الإقامة"
                      />
                    </td>
                  </tr>
                  <tr
                    className={
                      !certificateData.nationality ? "missing-field" : ""
                    }
                  >
                    <td>
                      <label>الجنسية:</label>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={certificateData.nationality}
                        onChange={(e) =>
                          setCertificateData({
                            ...certificateData,
                            nationality: e.target.value,
                          })
                        }
                        className="form-control"
                        placeholder="أدخل الجنسية"
                      />
                    </td>
                  </tr>
                  <tr
                    className={
                      !certificateData.job_title ? "missing-field" : ""
                    }
                  >
                    <td>
                      <label>المسمى الوظيفي:</label>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={certificateData.job_title}
                        onChange={(e) =>
                          setCertificateData({
                            ...certificateData,
                            job_title: e.target.value,
                          })
                        }
                        className="form-control"
                        placeholder="أدخل المسمى الوظيفي"
                      />
                    </td>
                  </tr>
                  <tr
                    className={
                      !certificateData.contract_start_date_gregorian
                        ? "missing-field"
                        : ""
                    }
                  >
                    <td>
                      <label>تاريخ بداية العقد:</label>
                    </td>
                    <td>
                      <UnifiedDatePicker
                        label=""
                        hijriValue={certificateData.contract_start_date || ""}
                        gregorianValue={
                          certificateData.contract_start_date_gregorian || ""
                        }
                        onChange={(hijri, gregorian) => {
                          setCertificateData({
                            ...certificateData,
                            contract_start_date: hijri,
                            contract_start_date_gregorian: gregorian,
                          });
                        }}
                        dateType="general"
                      />
                    </td>
                  </tr>
                  <tr
                    className={
                      !certificateData.contract_end_date_gregorian
                        ? "missing-field"
                        : ""
                    }
                  >
                    <td>
                      <label>تاريخ نهاية العقد:</label>
                    </td>
                    <td>
                      <UnifiedDatePicker
                        label=""
                        hijriValue={certificateData.contract_end_date || ""}
                        gregorianValue={
                          certificateData.contract_end_date_gregorian || ""
                        }
                        onChange={(hijri, gregorian) => {
                          setCertificateData({
                            ...certificateData,
                            contract_end_date: hijri,
                            contract_end_date_gregorian: gregorian,
                          });
                        }}
                        dateType="general"
                      />
                    </td>
                  </tr>
                  {certificateType === "salary" && (
                    <>
                      <tr>
                        <td>
                          <label>الراتب الأساسي:</label>
                        </td>
                        <td>
                          <input
                            type="number"
                            value={certificateData.basic_salary}
                            onChange={(e) => {
                              const newData = {
                                ...certificateData,
                                basic_salary: e.target.value,
                              };
                              newData.salary = calcSalaryTotal(newData);
                              setCertificateData(newData);
                            }}
                            className="form-control"
                            placeholder="أدخل الراتب الأساسي"
                          />
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <label>بدل السكن:</label>
                        </td>
                        <td>
                          <input
                            type="number"
                            value={certificateData.housing_allowance}
                            onChange={(e) => {
                              const newData = {
                                ...certificateData,
                                housing_allowance: e.target.value,
                              };
                              newData.salary = calcSalaryTotal(newData);
                              setCertificateData(newData);
                            }}
                            className="form-control"
                            placeholder="أدخل بدل السكن"
                          />
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <label>بدل النقل:</label>
                        </td>
                        <td>
                          <input
                            type="number"
                            value={certificateData.transportation_allowance}
                            onChange={(e) => {
                              const newData = {
                                ...certificateData,
                                transportation_allowance: e.target.value,
                              };
                              newData.salary = calcSalaryTotal(newData);
                              setCertificateData(newData);
                            }}
                            className="form-control"
                            placeholder="أدخل بدل النقل"
                          />
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <label>بدل الإجازة السنوية:</label>
                        </td>
                        <td>
                          <input
                            type="number"
                            value={certificateData.annual_leave_allowance}
                            onChange={(e) => {
                              const newData = {
                                ...certificateData,
                                annual_leave_allowance: e.target.value,
                              };
                              newData.salary = calcSalaryTotal(newData);
                              setCertificateData(newData);
                            }}
                            className="form-control"
                            placeholder="أدخل بدل الإجازة السنوية"
                          />
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <label>بدل نهاية الخدمة:</label>
                        </td>
                        <td>
                          <input
                            type="number"
                            value={certificateData.end_of_service_allowance}
                            onChange={(e) => {
                              const newData = {
                                ...certificateData,
                                end_of_service_allowance: e.target.value,
                              };
                              newData.salary = calcSalaryTotal(newData);
                              setCertificateData(newData);
                            }}
                            className="form-control"
                            placeholder="أدخل بدل نهاية الخدمة"
                          />
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <label>بدلات أخرى:</label>
                        </td>
                        <td>
                          <input
                            type="number"
                            value={certificateData.other_allowances}
                            onChange={(e) => {
                              const newData = {
                                ...certificateData,
                                other_allowances: e.target.value,
                              };
                              newData.salary = calcSalaryTotal(newData);
                              setCertificateData(newData);
                            }}
                            className="form-control"
                            placeholder="أدخل البدلات الأخرى"
                          />
                        </td>
                      </tr>
                      <tr style={{ backgroundColor: "#f0f9ff" }}>
                        <td>
                          <label style={{ fontWeight: "bold" }}>
                            الراتب الإجمالي:
                          </label>
                        </td>
                        <td>
                          <input
                            type="text"
                            value={certificateData.salary}
                            onChange={(e) =>
                              setCertificateData({
                                ...certificateData,
                                salary: e.target.value,
                              })
                            }
                            className="form-control"
                            placeholder="يتم الحساب تلقائياً"
                            style={{ fontWeight: "bold" }}
                            readOnly
                          />
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <label>إلى:</label>
                        </td>
                        <td>
                          <input
                            type="text"
                            value={certificateData.recipient}
                            onChange={(e) =>
                              setCertificateData({
                                ...certificateData,
                                recipient: e.target.value,
                              })
                            }
                            className="form-control"
                            placeholder="الي من يهمه الامر"
                          />
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <label>جهة العمل:</label>
                        </td>
                        <td>
                          <input
                            type="text"
                            value={certificateData.employer}
                            onChange={(e) =>
                              setCertificateData({
                                ...certificateData,
                                employer: e.target.value,
                              })
                            }
                            className="form-control"
                            placeholder="شركة الرعاية المتناهية"
                          />
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>

            <div className="data-review-actions">
              <button
                type="button"
                onClick={handleEditData}
                className="btn btn-secondary"
              >
                تعديل البيانات
              </button>
            </div>
          </div>
        )}

        {/* Generate Button */}
        {selectedEmployeeId && (
          <div className="form-section">
            <button
              type="button"
              onClick={() => handleGenerateCertificate(certificateData)}
              className="btn btn-primary btn-lg"
              disabled={generating || !certificateType}
            >
              {generating ? "جاري إنشاء الشهادة..." : "إنشاء الشهادة"}
            </button>
          </div>
        )}
      </form>

      {/* Edit Certificate Data Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div
            className="modal-content certificate-edit-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>تحرير بيانات الشهادة</h2>
              <button className="modal-close" onClick={handleCloseModal}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <table className="certificate-edit-table">
                <tbody>
                  <tr>
                    <td>
                      <label>عنوان الشهادة:</label>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={certificateData.custom_title}
                        onChange={(e) =>
                          setCertificateData({
                            ...certificateData,
                            custom_title: e.target.value,
                          })
                        }
                        className="form-control"
                        placeholder={
                          certificateType === "salary"
                            ? "خطاب تعريف راتب"
                            : certificateType === "specialties"
                              ? "تعريف هيئة التخصصات"
                              : "شهادة خبرة"
                        }
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <label>الاسم الكامل:</label>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={certificateData.full_name}
                        onChange={(e) =>
                          setCertificateData({
                            ...certificateData,
                            full_name: e.target.value,
                          })
                        }
                        className="form-control"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <label>رقم الهوية/الإقامة:</label>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={certificateData.id_number}
                        onChange={(e) =>
                          setCertificateData({
                            ...certificateData,
                            id_number: e.target.value,
                          })
                        }
                        className="form-control"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <label>الجنسية:</label>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={certificateData.nationality}
                        onChange={(e) =>
                          setCertificateData({
                            ...certificateData,
                            nationality: e.target.value,
                          })
                        }
                        className="form-control"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <label>المسمى الوظيفي:</label>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={certificateData.job_title}
                        onChange={(e) =>
                          setCertificateData({
                            ...certificateData,
                            job_title: e.target.value,
                          })
                        }
                        className="form-control"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <label>تاريخ بداية العقد:</label>
                    </td>
                    <td>
                      <UnifiedDatePicker
                        label=""
                        hijriValue={certificateData.contract_start_date || ""}
                        gregorianValue={
                          certificateData.contract_start_date_gregorian || ""
                        }
                        onChange={(hijri, gregorian) => {
                          setCertificateData({
                            ...certificateData,
                            contract_start_date: hijri,
                            contract_start_date_gregorian: gregorian,
                          });
                        }}
                        dateType="general"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <label>تاريخ نهاية العقد:</label>
                    </td>
                    <td>
                      <UnifiedDatePicker
                        label=""
                        hijriValue={certificateData.contract_end_date || ""}
                        gregorianValue={
                          certificateData.contract_end_date_gregorian || ""
                        }
                        onChange={(hijri, gregorian) => {
                          setCertificateData({
                            ...certificateData,
                            contract_end_date: hijri,
                            contract_end_date_gregorian: gregorian,
                          });
                        }}
                        dateType="general"
                      />
                    </td>
                  </tr>
                  {certificateType === "salary" && (
                    <>
                      <tr>
                        <td>
                          <label>الراتب الأساسي:</label>
                        </td>
                        <td>
                          <input
                            type="number"
                            value={certificateData.basic_salary}
                            onChange={(e) => {
                              const newData = {
                                ...certificateData,
                                basic_salary: e.target.value,
                              };
                              newData.salary = calcSalaryTotal(newData);
                              setCertificateData(newData);
                            }}
                            className="form-control"
                          />
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <label>بدل السكن:</label>
                        </td>
                        <td>
                          <input
                            type="number"
                            value={certificateData.housing_allowance}
                            onChange={(e) => {
                              const newData = {
                                ...certificateData,
                                housing_allowance: e.target.value,
                              };
                              newData.salary = calcSalaryTotal(newData);
                              setCertificateData(newData);
                            }}
                            className="form-control"
                          />
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <label>بدل النقل:</label>
                        </td>
                        <td>
                          <input
                            type="number"
                            value={certificateData.transportation_allowance}
                            onChange={(e) => {
                              const newData = {
                                ...certificateData,
                                transportation_allowance: e.target.value,
                              };
                              newData.salary = calcSalaryTotal(newData);
                              setCertificateData(newData);
                            }}
                            className="form-control"
                          />
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <label>بدل الإجازة السنوية:</label>
                        </td>
                        <td>
                          <input
                            type="number"
                            value={certificateData.annual_leave_allowance}
                            onChange={(e) => {
                              const newData = {
                                ...certificateData,
                                annual_leave_allowance: e.target.value,
                              };
                              newData.salary = calcSalaryTotal(newData);
                              setCertificateData(newData);
                            }}
                            className="form-control"
                          />
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <label>بدل نهاية الخدمة:</label>
                        </td>
                        <td>
                          <input
                            type="number"
                            value={certificateData.end_of_service_allowance}
                            onChange={(e) => {
                              const newData = {
                                ...certificateData,
                                end_of_service_allowance: e.target.value,
                              };
                              newData.salary = calcSalaryTotal(newData);
                              setCertificateData(newData);
                            }}
                            className="form-control"
                          />
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <label>بدلات أخرى:</label>
                        </td>
                        <td>
                          <input
                            type="number"
                            value={certificateData.other_allowances}
                            onChange={(e) => {
                              const newData = {
                                ...certificateData,
                                other_allowances: e.target.value,
                              };
                              newData.salary = calcSalaryTotal(newData);
                              setCertificateData(newData);
                            }}
                            className="form-control"
                          />
                        </td>
                      </tr>
                      <tr style={{ backgroundColor: "#f0f9ff" }}>
                        <td>
                          <label style={{ fontWeight: "bold" }}>
                            الراتب الإجمالي:
                          </label>
                        </td>
                        <td>
                          <input
                            type="text"
                            value={certificateData.salary}
                            onChange={(e) =>
                              setCertificateData({
                                ...certificateData,
                                salary: e.target.value,
                              })
                            }
                            className="form-control"
                            style={{ fontWeight: "bold" }}
                          />
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <label>إلى:</label>
                        </td>
                        <td>
                          <input
                            type="text"
                            value={certificateData.recipient}
                            onChange={(e) =>
                              setCertificateData({
                                ...certificateData,
                                recipient: e.target.value,
                              })
                            }
                            className="form-control"
                          />
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <label>جهة العمل:</label>
                        </td>
                        <td>
                          <input
                            type="text"
                            value={certificateData.employer}
                            onChange={(e) =>
                              setCertificateData({
                                ...certificateData,
                                employer: e.target.value,
                              })
                            }
                            className="form-control"
                          />
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                onClick={handleCloseModal}
                className="btn btn-secondary"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleGenerateCertificate(certificateData)}
                className="btn btn-primary"
                disabled={generating}
              >
                {generating ? "جاري الإنشاء..." : "إنشاء الشهادة"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Certificate Preview Modal */}
      {showPreview && generatedPdfBlob && previewUrl && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowPreview(false);
            if (previewUrl) {
              window.URL.revokeObjectURL(previewUrl);
              setPreviewUrl(null);
            }
          }}
        >
          <div
            className="modal-content preview-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>معاينة الشهادة</h2>
              <button
                className="modal-close"
                onClick={() => {
                  setShowPreview(false);
                  if (previewUrl) {
                    window.URL.revokeObjectURL(previewUrl);
                    setPreviewUrl(null);
                  }
                }}
              >
                ×
              </button>
            </div>
            <div className="modal-body preview-body">
              <iframe
                src={previewUrl}
                style={{ width: "100%", height: "600px", border: "none" }}
                title="Certificate Preview"
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                onClick={handleDownloadCertificate}
                className="btn btn-primary"
              >
                تحميل
              </button>
              <button
                type="button"
                onClick={handleSendToBranch}
                className="btn btn-success"
                disabled={sendingNotification}
              >
                {sendingNotification
                  ? "جاري الإرسال..."
                  : "إرسال الشهادة للفرع"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPreview(false);
                  if (previewUrl) {
                    window.URL.revokeObjectURL(previewUrl);
                    setPreviewUrl(null);
                  }
                }}
                className="btn btn-secondary"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExperienceCertificate;
