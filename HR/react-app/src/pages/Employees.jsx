/**
 * Employees Page
 * Manage employees
 */

import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import {
  employeesAPI,
  branchesAPI,
  documentsAPI,
  clearCache,
} from "../utils/api";
import { useAuth } from "../contexts/AuthContext";
import { useNotification } from "../contexts/NotificationContext";
import { useConfirm, Button, Alert, Icon, Spinner } from '../ui';
import { DEFAULT_BANK_PLACEHOLDER } from "../components/BankSelect";
import {
  isSaudi as isSaudiHelper,
  isNonSaudi,
  getIdTypeFromNationality,
  getDateOfBirthCalendarType,
  getIdExpiryCalendarType,
  isSchool,
  isHealthcareCenter,
  requiresExperienceCertificate,
  requiresClassificationDocument,
  requiresExperienceCertificateDocument,
  requiresTherapy40HoursDocument,
  validateDocumentType,
} from "../utils/employeeHelpers";
import {
  getJobTitlesByBranchType,
  DOCUMENT_TYPE_LABELS,
} from "../utils/employeeConstants";
import {
  MAX_UPLOAD_BYTES,
  fileTooLargeMessage,
  uploadErrorMessage,
} from "../utils/uploadLimits";
import {
  gregorianToHijri,
  formatDate,
  hijriToGregorian,
  formatHijriToString,
} from "../utils/dateConverters";
// TablePage.css is now loaded in App.jsx to prevent FOUC
// import './TablePage.css';
import "./Employees.css";
import './EmployeeForm.css';
import NationalitySelect from "../components/NationalitySelect.jsx";
import NameInput from "../components/NameInput.jsx";
import UnifiedDatePicker from "../components/UnifiedDatePicker.jsx";
import BankSelect from "../components/BankSelect.jsx";
import ReligionSelect from "../components/ReligionSelect.jsx";
import MaritalStatusSelect from "../components/MaritalStatusSelect.jsx";
import EmployeeYearReview from "./EmployeeYearReview.jsx";
import EmployeesView from "./employees/EmployeesView.jsx";
import { employeeStatusLabel } from "../ui";

const Employees = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isMainManager, user } = useAuth();
  const { showError, showSuccess, showWarning, _showInfo } = useNotification();
  const { confirm } = useConfirm();
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingDocuments, setUploadingDocuments] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [formStep, setFormStep] = useState(1); // 1: branch type selection, 2: employee form
  const [selectedBranchType, setSelectedBranchType] = useState(null); // 'healthcare_center' or 'school'
  const [filterIncomplete, setFilterIncomplete] = useState(false); // Filter for incomplete employees
  const [focusEmployee, setFocusEmployee] = useState(null); // Employee to highlight when navigated from other pages
  const [pendingEditEmployee, setPendingEditEmployee] = useState(null);

  // New-year employee review tab. Branch managers only see it once their
  // branch's review is active; main managers always have access to the
  // per-branch overview.
  const [activeMainTab, setActiveMainTab] = useState("list");
  const [yearReviewActive, setYearReviewActive] = useState(false);
  const [formData, setFormData] = useState({
    employee_id_number: "",
    branch_id: user?.branch_id || "",
    first_name: "",
    second_name: "",
    third_name: "",
    fourth_name: "",
    occupation: "",
    nationality: "",
    date_of_birth_hijri: "",
    date_of_birth_gregorian: "",
    id_or_residency_number: "",
    id_type: "citizen",
    gender: "male",
    id_expiry_date_hijri: "",
    id_expiry_date_gregorian: "",
    religion: "",
    marital_status: "",
    status: "active",
    educational_qualification: "",
    specialization: "",
    bank_iban: "",
    bank_name: DEFAULT_BANK_PLACEHOLDER,
    email: "",
    phone_number: "",
    national_address: "",
    contract_type: "",
    contract_start_date: "",
    contract_end_date: "",
    work_start_date: "",
    base_salary: "",
    housing_allowance: "",
    transportation_allowance: "",
    end_of_service_allowance: "",
    annual_leave_allowance: "",
    other_allowances: "",
    years_of_experience_in_same_institution: "",
    graduation_year: "",
    university_gpa: "",
    passport_number: "",
    passport_issue_date: "",
    passport_expiry_date: "",
    passport_issue_place: "",
    residency_issue_date: "",
    job_title: "",
  });

  const [dateOfBirthCalendarType, setDateOfBirthCalendarType] = useState(null);
  const [_idExpiryCalendarType, setIdExpiryCalendarType] = useState(null);

  // Check if selected educational qualification is basic education (doesn't require specialization, graduation year, or GPA)
  const isBasicEducation = () => {
    const basicEducationLevels = ["ابتدائي", "متوسط", "ثانوي", "غير متعلم"];
    return (
      formData.educational_qualification &&
      basicEducationLevels.includes(formData.educational_qualification)
    );
  };
  const requiresPrimaryQualificationDoc = () => !isBasicEducation();
  const requiresMedicalInsuranceDoc = () => formData.contract_type !== "ورقي";

  // Document uploads state
  const [documents, setDocuments] = useState({
    id_or_residency: null,
    direct_letter: null,
    bank_iban: null,
    primary_qualification: null,
    employment_contract: null,
    additional_courses: [],
    passport: null,
    professional_license: null,
    experience_certificate: [],
    classification: null,
    speech_therapy_course: null,
    physical_therapy_course: null,
    medical_disclosure_form: null,
    speech_therapy_70_hours_course: null,
    therapy_40_hours_course: null,
    medical_insurance: null,
  });

  // Existing documents state (documents already uploaded)
  const [existingDocuments, setExistingDocuments] = useState({});

  useEffect(() => {
    loadBranches();

    // Check if we need to edit an employee from location state
    if (location.state?.editEmployeeId) {
      const editId = location.state.editEmployeeId;
      // Find the employee and open edit form
      employeesAPI
        .getById(editId)
        .then((response) => {
          if (response.data.success) {
            // handleEdit needs the branches (job titles depend on the branch type),
            // which may not have arrived yet: wait for them, see the effect below.
            setPendingEditEmployee(response.data.data);
          }
        })
        .catch((error) => {
          console.error("Error loading employee for edit:", error);
        });
      // Clear the state
      window.history.replaceState({}, document.title);
    }

    // Check if we need to focus (highlight) an employee from location state
    if (location.state?.focusEmployeeId) {
      const focusId = location.state.focusEmployeeId;
      employeesAPI
        .getById(focusId)
        .then((response) => {
          if (response.data.success) {
            setFocusEmployee(response.data.data);
          }
        })
        .catch((error) => {
          console.error("Error loading employee for focus:", error);
        });
      // Clear the state so repeated navigation doesn't re-trigger
      window.history.replaceState({}, document.title);
    }
  }, []);

  // Tab visibility: branch managers only see the year-review tab once their
  // own branch's review is active; main managers get it unconditionally (it
  // opens the per-branch overview instead of one branch's queue).
  useEffect(() => {
    if (isMainManager()) {
      setYearReviewActive(true);
      return;
    }
    employeesAPI
      .getYearReviewStatus()
      .then((res) => {
        const data = res.data?.data;
        setYearReviewActive(Boolean(data?.is_active));
        // Quick access: branch managers land straight on the review when
        // there's pending work, instead of the plain employee list —
        // matches the beneficiary rollover's landing behavior.
        const counts = data?.counts || {};
        if (data?.is_active && (counts.undecided > 0 || counts.pending_review > 0)) {
          setActiveMainTab("year-review");
        }
      })
      .catch(() => setYearReviewActive(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Check URL params for filter on mount
    const statusFilter = searchParams.get("data_completion_status");
    if (statusFilter === "incomplete" && !filterIncomplete) {
      setFilterIncomplete(true);
    }
  }, [searchParams]);

  // Quick access from the dashboard task: ?tab=year-review jumps straight
  // into the guided review instead of landing on the plain employee list.
  useEffect(() => {
    if (searchParams.get("tab") === "year-review") {
      setActiveMainTab("year-review");
    }
  }, [searchParams]);

  useEffect(() => {
    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBranches = async () => {
    try {
      // Load ALL branches (active and inactive) to ensure we can resolve branch details
      // for all employees, especially for Branch Managers in inactive branches.
      // The local UI dropdown for filtering branches will still only show active ones.
      const response = await branchesAPI.getAll({});
      if (response.data.success) {
        setBranches(response.data.data || []);
      }
    } catch (error) {
      console.error("Error loading branches:", error);
    }
  };

  const loadEmployees = async () => {
    try {
      // Use tableLoading for subsequent loads, initialLoading for first load
      if (initialLoading) {
        setLoading(true);
      } else {
        setTableLoading(true);
      }

      // Clear cache to ensure fresh data (especially completion status)
      // This ensures we always get the latest data from the backend without using cached responses
      clearCache("/api/employees");

      const filters = { is_active: true };

      // Only show active or pending employees (archived employees should only appear in archive)
      // We'll filter by status on the frontend, but also add it to backend filter for efficiency

      // Branch managers only see their branch employees
      if (!isMainManager() && user?.branch_id) {
        filters.branch_id = user.branch_id;
      }

      // Search / status / completeness filtering happens in EmployeesView (instant, same for every role).

      const response = await employeesAPI.getAll(filters);
      if (response.data.success) {
        // Filter out archived employees (only show active or pending)
        const filteredEmployees = response.data.data.filter(
          (emp) =>
            !emp.status || emp.status === "active" || emp.status === "pending",
        );
        setEmployees(filteredEmployees);
      }
    } catch (error) {
      console.error("Error loading employees:", error);
      showError("فشل تحميل الموظفين");
    } finally {
      if (initialLoading) {
        setLoading(false);
        setInitialLoading(false);
      } else {
        setTableLoading(false);
      }
    }
  };

  // Memoize branches map for faster lookups (performance optimization)
  const branchesMap = useMemo(() => {
    const map = new Map();
    branches.forEach((branch) => {
      map.set(branch.id, branch);
    });
    return map;
  }, [branches]);

  // Check if nationality is Saudi (using centralized helper)
  const isSaudi = useCallback(() => {
    return isSaudiHelper(formData.nationality);
  }, [formData.nationality]);

  // Check if form data is valid for saving
  const _isFormValid = () => {
    // Check nationality is selected
    if (!formData.nationality) return false;

    // Check branch type is selected (for main managers)
    if (isMainManager() && !selectedBranchType && !editingEmployee)
      return false;

    // Check all 4 names are provided
    if (
      !formData.first_name ||
      !formData.second_name ||
      !formData.third_name ||
      !formData.fourth_name
    )
      return false;

    // Check id_or_residency_number is provided
    if (
      !formData.id_or_residency_number ||
      formData.id_or_residency_number.trim() === ""
    )
      return false;

    // Check required fields
    const requiredFields = {
      email: formData.email,
      phone_number: formData.phone_number,
      bank_name: formData.bank_name,
      bank_iban: formData.bank_iban,
      national_address: formData.national_address,
      religion: formData.religion,
      marital_status: formData.marital_status,
      contract_type: formData.contract_type,
      gender: formData.gender,
    };

    for (const [field, value] of Object.entries(requiredFields)) {
      if (!value || value.toString().trim() === "") return false;
      // Special check for bank_name: must not be default placeholder
      if (field === "bank_name" && value === DEFAULT_BANK_PLACEHOLDER)
        return false;
    }

    // Check date of birth for all employees (required)
    const isSaudiNationality = isSaudi();
    if (isSaudiNationality) {
      // Saudi employees: Hijri date required
      if (
        !formData.date_of_birth_hijri ||
        formData.date_of_birth_hijri.trim() === ""
      )
        return false;
    } else {
      // Non-Saudi employees: Gregorian date required
      if (
        !formData.date_of_birth_gregorian ||
        formData.date_of_birth_gregorian.trim() === ""
      )
        return false;
      // Check passport fields for non-Saudis
      if (!formData.passport_number || formData.passport_number.trim() === "")
        return false;
      if (
        !formData.passport_issue_date ||
        formData.passport_issue_date.trim() === ""
      )
        return false;
      if (
        !formData.passport_expiry_date ||
        formData.passport_expiry_date.trim() === ""
      )
        return false;
      if (
        !formData.passport_issue_place ||
        formData.passport_issue_place.trim() === ""
      )
        return false;
      if (
        !formData.residency_issue_date ||
        formData.residency_issue_date.trim() === ""
      )
        return false;
    }

    // Check occupation or job_title
    if (!formData.occupation || formData.occupation.trim() === "") {
      if (!formData.job_title || formData.job_title.trim() === "") return false;
    }

    return true;
  };

  // Handle nationality change - auto-set ID type and calendar types
  const handleNationalityChange = useCallback((nationality) => {
    const isSaudiNationality = isSaudiHelper(nationality);

    setFormData((prev) => {
      const newData = { ...prev, nationality };

      // Auto-set ID type based on nationality (using centralized helper)
      newData.id_type = getIdTypeFromNationality(nationality);

      return newData;
    });

    // Auto-set calendar types based on nationality (using centralized helpers)
    const dobCalendarType = getDateOfBirthCalendarType(nationality);
    const idExpiryCalendarType = getIdExpiryCalendarType(nationality);

    setDateOfBirthCalendarType(dobCalendarType);
    setIdExpiryCalendarType(idExpiryCalendarType);

    // Clear dates based on nationality
    if (isSaudiNationality) {
      // Saudi: Clear Gregorian dates
      setFormData((prev) => ({
        ...prev,
        date_of_birth_gregorian: "",
        id_expiry_date_gregorian: "",
      }));
    } else {
      // Non-Saudi: Clear Hijri dates
      setFormData((prev) => ({
        ...prev,
        date_of_birth_hijri: "",
        id_expiry_date_hijri: "",
      }));
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Set saving state at the start
    setSaving(true);
    // Document uploads run after the employee is saved; collect their failures
    // so the user is told instead of seeing a plain success message.
    const failedUploads = [];

    // Validate nationality is selected first
    if (!formData.nationality) {
      showWarning("⚠️ الجنسية مطلوبة\n\nيرجى اختيار الجنسية من القائمة المنسدلة في قسم البيانات الشخصية.\nالجنسية تحدد نوع الهوية والمستندات المطلوبة.");
      setSaving(false);
      return;
    }

    // For branch managers, auto-detect branch type from their branch
    let currentBranchType = selectedBranchType;
    if (!isMainManager() && user?.branch_id && !selectedBranchType) {
      const userBranch = branchesMap.get(user.branch_id);
      if (userBranch) {
        currentBranchType = userBranch.branch_type;
        setSelectedBranchType(userBranch.branch_type);
      }
    }

    // Only require branch type selection for main managers
    if (isMainManager() && !currentBranchType && !editingEmployee) {
      showWarning("⚠️ نوع الفرع مطلوب\n\nيرجى اختيار نوع الفرع (بنين/بنات) من الأزرار في أعلى النموذج قبل إضافة الموظف.");
      setSaving(false);
      return;
    }

    // Validate that all 4 names are provided (REQUIRED)
    if (
      !formData.first_name ||
      !formData.second_name ||
      !formData.third_name ||
      !formData.fourth_name
    ) {
      const missingNames = [];
      if (!formData.first_name) missingNames.push("الاسم الأول");
      if (!formData.second_name) missingNames.push("اسم الأب");
      if (!formData.third_name) missingNames.push("اسم الجد");
      if (!formData.fourth_name) missingNames.push("اسم العائلة");
      showWarning(`⚠️ الاسم الرباعي مطلوب\n\nالحقول الناقصة: ${missingNames.join(" - ")}\n\nيجب إدخال الاسم الرباعي كاملاً كما هو في الهوية.`);
      setSaving(false);
      return;
    }

    // Validate id_or_residency_number is provided (REQUIRED)
    if (
      !formData.id_or_residency_number ||
      formData.id_or_residency_number.trim() === ""
    ) {
      showWarning("⚠️ رقم الهوية/الإقامة مطلوب\n\nيرجى إدخال رقم الهوية الوطنية (للسعوديين) أو رقم الإقامة (لغير السعوديين).\n\n• رقم الهوية: 10 أرقام تبدأ بـ 1\n• رقم الإقامة: 10 أرقام تبدأ بـ 2");
      setSaving(false);
      return;
    }

    // Validate nationality is provided (REQUIRED)
    if (!formData.nationality || formData.nationality.trim() === "") {
      showWarning("الرجاء إدخال الجنسية");
      setSaving(false);
      return;
    }

    // Validate calendar type matches nationality (only if date is provided)
    const isSaudiNationality = isSaudi();
    if (dateOfBirthCalendarType) {
      if (isSaudiNationality && dateOfBirthCalendarType !== "hijri") {
        showWarning("⚠️ نوع التقويم غير صحيح\n\nالموظفون السعوديون يجب أن يستخدموا التقويم الهجري لتاريخ الميلاد.\n\nيرجى تغيير نوع التقويم إلى 'هجري' في حقل تاريخ الميلاد.");
        setSaving(false);
        return;
      }
    }
    // NOTE: validation for calendar type removed to allow dual input
    // The system now supports auto-conversion, so users can use either calendar
    // regardless of nationality, as long as the required date value (Hijri or Gregorian) is generated.

    // NOTE: All document validations removed - documents are now optional
    // The system will track incomplete employees and show them in Dashboard

    // Validate bank name is changed from default (for both new and editing)
    if (formData.bank_name === DEFAULT_BANK_PLACEHOLDER) {
      showWarning("⚠️ اسم البنك مطلوب\n\nيرجى اختيار البنك من القائمة المنسدلة في قسم البيانات البنكية.\n\nالبنك مطلوب لتحويل الراتب الشهري.");
      setSaving(false);
      return;
    }

    // Validate bank name and IBAN are both provided if one is provided
    if (formData.bank_iban || formData.bank_name) {
      if (formData.bank_iban && !formData.bank_name) {
        showWarning("⚠️ اسم البنك مطلوب\n\nتم إدخال رقم الآيبان لكن لم يتم اختيار البنك.\nيرجى اختيار البنك من القائمة.");
        setSaving(false);
        return;
      }
      if (formData.bank_name && !formData.bank_iban) {
        showWarning("⚠️ رقم الآيبان مطلوب\n\nتم اختيار البنك لكن لم يتم إدخال رقم الآيبان.\nيرجى إدخال رقم الآيبان (IBAN) الخاص بالموظف.");
        setSaving(false);
        return;
      }

      // Validate IBAN format (SA + 22 digits = 24 characters)
      if (formData.bank_iban) {
        const cleanIBAN = formData.bank_iban.replace(/\s/g, '').toUpperCase();

        if (!cleanIBAN.startsWith('SA')) {
          showWarning("⚠️ صيغة الآيبان غير صحيحة\n\nرقم الآيبان السعودي يجب أن يبدأ بـ SA\n\nمثال: SA0380000000608010167519");
          setSaving(false);
          return;
        }

        if (cleanIBAN.length !== 24) {
          showWarning(`⚠️ طول الآيبان غير صحيح\n\nالآيبان السعودي يجب أن يتكون من 24 حرفاً:\n• SA + 22 رقم\n\nالطول الحالي: ${cleanIBAN.length} حرف\nينقص: ${24 - cleanIBAN.length > 0 ? (24 - cleanIBAN.length) + ' حرف' : 'يوجد ' + (cleanIBAN.length - 24) + ' حرف زائد'}`);
          setSaving(false);
          return;
        }

        const numbers = cleanIBAN.substring(2);
        if (!/^\d{22}$/.test(numbers)) {
          showWarning("⚠️ الآيبان يحتوي على أحرف غير صحيحة\n\nبعد SA يجب أن تكون جميع الأحرف أرقاماً فقط (22 رقم).\n\nتأكد من عدم وجود مسافات أو أحرف بين الأرقام.");
          setSaving(false);
          return;
        }
      }
    }

    // Validate only truly required fields (name, ID, nationality, contact info, bank info, national address)
    // All other fields are optional and will be tracked for completion status
    const requiredFields = {
      first_name: "الاسم الأول",
      second_name: "الاسم الثاني",
      third_name: "الاسم الثالث",
      fourth_name: "الاسم الرابع",
      id_or_residency_number: "رقم الهوية أو الإقامة",
      nationality: "الجنسية",
      email: "البريد الإلكتروني",
      phone_number: "رقم الهاتف",
      bank_name: "اسم البنك",
      bank_iban: "رقم الآيبان البنكي",
      national_address: "العنوان الوطني الموحد",
    };

    // Check required fields
    for (const [field, label] of Object.entries(requiredFields)) {
      if (!formData[field] || formData[field].toString().trim() === "") {
        showWarning(`الحقل "${label}" مطلوب`);
        setSaving(false);
        return;
      }
      // Additional check for bank_name: must not be default placeholder
      if (
        field === "bank_name" &&
        formData[field] === DEFAULT_BANK_PLACEHOLDER
      ) {
        showWarning(`الحقل "${label}" مطلوب - يجب اختيار بنك من القائمة`);
        setSaving(false);
        return;
      }
    }

    // Validate date of birth for all employees (required)
    // Note: isSaudiNationality is already defined above
    if (isSaudiNationality) {
      // For Saudis, Hijri date is required
      if (
        !formData.date_of_birth_hijri ||
        formData.date_of_birth_hijri.trim() === ""
      ) {
        showWarning("⚠️ تاريخ الميلاد مطلوب\n\nللموظفين السعوديين: يجب إدخال تاريخ الميلاد بالتقويم الهجري.\n\nيرجى إدخال التاريخ كما هو في بطاقة الهوية الوطنية.");
        setSaving(false);
        return;
      }
    } else {
      // For non-Saudis, Gregorian date is required
      if (
        !formData.date_of_birth_gregorian ||
        formData.date_of_birth_gregorian.trim() === ""
      ) {
        showWarning("⚠️ تاريخ الميلاد مطلوب\n\nللموظفين غير السعوديين: يجب إدخال تاريخ الميلاد بالتقويم الميلادي.\n\nيرجى إدخال التاريخ كما هو في جواز السفر.");
        setSaving(false);
        return;
      }
    }

    // Validate Section 2 fields (required)
    if (!formData.religion || formData.religion.trim() === "") {
      showWarning("⚠️ الديانة مطلوبة\n\nيرجى اختيار الديانة من القائمة المنسدلة في قسم البيانات الشخصية.");
      setSaving(false);
      return;
    }

    if (!formData.marital_status || formData.marital_status.trim() === "") {
      showWarning("⚠️ الحالة الاجتماعية مطلوبة\n\nيرجى اختيار الحالة الاجتماعية (أعزب/متزوج/مطلق/أرمل) من القائمة.");
      setSaving(false);
      return;
    }

    if (!formData.contract_type || formData.contract_type.trim() === "") {
      showWarning("⚠️ نوع العقد مطلوب\n\nيرجى اختيار نوع العقد (رسمي/ورقي) من القائمة في قسم بيانات العقد.");
      setSaving(false);
      return;
    }

    // Validate passport fields for non-Saudis (required)
    if (!isSaudiNationality) {
      if (!formData.passport_number || formData.passport_number.trim() === "") {
        showWarning("⚠️ بيانات جواز السفر مطلوبة\n\nللموظفين غير السعوديين: يرجى إدخال رقم جواز السفر.\n\nالرقم موجود في الصفحة الأولى من الجواز.");
        setSaving(false);
        return;
      }
      if (
        !formData.passport_issue_date ||
        formData.passport_issue_date.trim() === ""
      ) {
        showWarning("⚠️ تاريخ إصدار الجواز مطلوب\n\nللموظفين غير السعوديين: يرجى إدخال تاريخ إصدار جواز السفر.");
        setSaving(false);
        return;
      }
      if (
        !formData.passport_expiry_date ||
        formData.passport_expiry_date.trim() === ""
      ) {
        showWarning("⚠️ تاريخ انتهاء الجواز مطلوب\n\nللموظفين غير السعوديين: يرجى إدخال تاريخ انتهاء صلاحية جواز السفر.");
        setSaving(false);
        return;
      }
      if (
        !formData.passport_issue_place ||
        formData.passport_issue_place.trim() === ""
      ) {
        showWarning("⚠️ مكان إصدار الجواز مطلوب\n\nللموظفين غير السعوديين: يرجى إدخال مكان/دولة إصدار الجواز.");
        setSaving(false);
        return;
      }
      if (
        !formData.residency_issue_date ||
        formData.residency_issue_date.trim() === ""
      ) {
        showWarning("⚠️ تاريخ إصدار الإقامة مطلوب\n\nللموظفين غير السعوديين: يرجى إدخال تاريخ إصدار الإقامة.");
        setSaving(false);
        return;
      }
    }

    // Validate database-required fields that have defaults but can be empty
    if (!formData.gender || formData.gender.trim() === "") {
      showWarning("⚠️ الجنس مطلوب\n\nيرجى اختيار الجنس (ذكر/أنثى) من القائمة.");
      setSaving(false);
      return;
    }

    // Validate salary - minimum 500
    // Total salary = all allowances (no deductions)
    const baseSalary = parseFloat(formData.base_salary || 0);
    const housingAllowance = parseFloat(formData.housing_allowance || 0);
    const transportationAllowance = parseFloat(formData.transportation_allowance || 0);
    const endOfServiceAllowance = parseFloat(formData.end_of_service_allowance || 0);
    const annualLeaveAllowance = parseFloat(formData.annual_leave_allowance || 0);
    const otherAllowances = parseFloat(formData.other_allowances || 0);
    const totalSalary = baseSalary + housingAllowance + transportationAllowance +
      endOfServiceAllowance + annualLeaveAllowance + otherAllowances;

    if (totalSalary > 0 && totalSalary < 500) {
      showWarning("⚠️ الراتب غير صحيح\n\nإجمالي الراتب المدخل (${totalSalary} ريال) أقل من الحد الأدنى (500 ريال).\n\nيرجى مراجعة قيم الراتب الأساسي والبدلات.");
      setSaving(false);
      return;
    }

    // id_type يتم تعيينه تلقائياً حسب الجنسية - لا حاجة للتحقق منه
    // لكن نضمن أنه محدد قبل الإرسال
    if (!formData.id_type || formData.id_type.trim() === "") {
      // Auto-set based on nationality
      formData.id_type = getIdTypeFromNationality(formData.nationality);
    }

    // Occupation is required by database - use job_title if available, otherwise require it
    if (!formData.occupation || formData.occupation.trim() === "") {
      if (formData.job_title && formData.job_title.trim() !== "") {
        // Use job_title as occupation if occupation is empty
        formData.occupation = formData.job_title;
      } else {
        showWarning("⚠️ المهنة أو المسمى الوظيفي مطلوب\n\nيرجى إدخال المهنة في حقل 'المهنة'\nأو اختيار المسمى الوظيفي من القائمة.");
        setSaving(false);
        return;
      }
    }

    // For branch managers, ensure branch_id is set
    if (!isMainManager() && user?.branch_id) {
      formData.branch_id = user.branch_id;
    }

    // Validate branch_id is set - تعيينه تلقائياً إذا لم يكن محدداً
    if (!formData.branch_id) {
      if (!isMainManager() && user?.branch_id) {
        formData.branch_id = user.branch_id;
      } else if (isMainManager() && selectedBranchType) {
        // للمدير الرئيسي: اختيار أول فرع من النوع المختار
        const firstBranch = branches.find(
          (b) => b.branch_type === selectedBranchType && b.is_active,
        );
        if (firstBranch) {
          formData.branch_id = firstBranch.id;
        } else {
          showWarning("لا يوجد فروع متاحة من النوع المختار");
          setSaving(false);
          return;
        }
      } else {
        showWarning("الرجاء اختيار نوع الفرع أولاً");
        setSaving(false);
        return;
      }
    }

    // Ensure branch_id is a number
    if (formData.branch_id) {
      formData.branch_id = parseInt(formData.branch_id);
      if (isNaN(formData.branch_id)) {
        showWarning("خطأ في تحديد الفرع");
        setSaving(false);
        return;
      }
    }

    // Validate field lengths
    const fieldLengths = {
      first_name: { max: 100, label: "الاسم الأول" },
      second_name: { max: 100, label: "الاسم الثاني" },
      third_name: { max: 100, label: "الاسم الثالث" },
      fourth_name: { max: 100, label: "الاسم الرابع" },
      occupation: { max: 100, label: "المهنة" },
      nationality: { max: 100, label: "الجنسية" },
      religion: { max: 100, label: "الديانة" },
      marital_status: { max: 50, label: "الحالة الاجتماعية" },
      educational_qualification: { max: 200, label: "المؤهل التعليمي" },
      specialization: { max: 200, label: "التخصص" },
      bank_name: { max: 200, label: "اسم البنك" },
      email: { max: 255, label: "البريد الإلكتروني" },
      phone_number: { max: 50, label: "رقم الهاتف" },
      national_address: { max: 8, label: "العنوان الوطني الموحد (المختصر)" },
      contract_type: { max: 100, label: "نوع العقد" },
      id_or_residency_number: { max: 100, label: "رقم الهوية أو الإقامة" },
    };

    for (const [field, { max, label }] of Object.entries(fieldLengths)) {
      if (formData[field] && typeof formData[field] === "string") {
        // Special validation for national_address - must be exactly 8 characters if provided
        if (
          field === "national_address" &&
          formData[field].trim() !== "" &&
          formData[field].length !== 8
        ) {
          showWarning(`الحقل "${label}" يجب أن يكون بالضبط 8 خانات`);
          setSaving(false);
          return;
        }
        // General validation for other fields
        if (formData[field].length > max) {
          showWarning(`الحقل "${label}" أطول من المسموح (${max} حرف)`);
          setSaving(false);
          return;
        }
      }
    }

    // Date of birth is required for all employees (validated above)
    // Saudi employees: Hijri date required
    // Non-Saudi employees: Gregorian date required

    try {
      const data = { ...formData };

      // Map contract date fields to Gregorian backend fields
      if (data.contract_start_date) {
        data.contract_start_date_gregorian = data.contract_start_date;
        delete data.contract_start_date;
      }
      if (data.contract_end_date) {
        data.contract_end_date_gregorian = data.contract_end_date;
        delete data.contract_end_date;
      }

      // Work start date (first day of work); null clears it
      data.work_start_date_gregorian = data.work_start_date || null;
      delete data.work_start_date;

      // Clear ID expiry dates for Saudi employees (their IDs don't expire)
      if (isSaudiNationality) {
        data.id_expiry_date_hijri = null;
        data.id_expiry_date_gregorian = null;
      }

      // Remove empty strings and convert to null for optional fields (non-numeric)
      // Note: date_of_birth fields are NOT in optionalFields - they are required
      const optionalFields = [
        "id_expiry_date_hijri",
        "id_expiry_date_gregorian",
        "religion",
        "marital_status",
        "educational_qualification",
        "specialization",
        "contract_type",
        "graduation_year",
        "university_gpa",
        "passport_number",
        "passport_issue_date",
        "passport_expiry_date",
        "passport_issue_place",
        "residency_issue_date",
      ];

      // job_title is required by backend - use occupation if not provided
      if (!data.job_title || data.job_title.trim() === "") {
        if (data.occupation && data.occupation.trim() !== "") {
          data.job_title = data.occupation;
        } else {
          data.job_title = "غير محدد"; // Fallback default
        }
      }

      optionalFields.forEach((field) => {
        const isEmpty =
          data[field] === "" ||
          data[field] === null ||
          data[field] === undefined ||
          (typeof data[field] === "string" && data[field].trim() === "");
        if (isEmpty) {
          // Editing: send null, otherwise a value the user cleared silently comes back.
          // Creating: leave the field out.
          if (editingEmployee) data[field] = null;
          else delete data[field];
        }
      });

      // Parse salary fields - set to 0 if empty instead of null
      const salaryFields = [
        "base_salary",
        "housing_allowance",
        "transportation_allowance",
        "end_of_service_allowance",
        "annual_leave_allowance",
        "other_allowances",
      ];

      salaryFields.forEach((field) => {
        if (
          data[field] === "" ||
          data[field] === null ||
          data[field] === undefined
        ) {
          data[field] = 0; // Set to 0 instead of deleting
        } else if (
          typeof data[field] === "string" &&
          data[field].trim() === ""
        ) {
          data[field] = 0;
        } else {
          const value = parseFloat(data[field]);
          if (isNaN(value)) {
            data[field] = 0; // Set to 0 if invalid number
          } else {
            data[field] = value;
          }
        }
      });

      // Parse years_of_experience_in_same_institution - set to 0 if empty
      if (
        data.years_of_experience_in_same_institution === "" ||
        data.years_of_experience_in_same_institution === null ||
        data.years_of_experience_in_same_institution === undefined
      ) {
        data.years_of_experience_in_same_institution = 0;
      } else if (
        typeof data.years_of_experience_in_same_institution === "string" &&
        data.years_of_experience_in_same_institution.trim() === ""
      ) {
        data.years_of_experience_in_same_institution = 0;
      } else {
        const value = parseInt(data.years_of_experience_in_same_institution);
        data.years_of_experience_in_same_institution = isNaN(value) ? 0 : value;
      }

      // Set years_of_experience_in_company to 0 (not used in form but required by database)
      if (!data.years_of_experience_in_company) {
        data.years_of_experience_in_company = 0;
      } else {
        const value = parseInt(data.years_of_experience_in_company);
        data.years_of_experience_in_company = isNaN(value) ? 0 : value;
      }

      // Set employee_id_number automatically from id_or_residency_number (if not provided)
      if (!data.employee_id_number) {
        data.employee_id_number = data.id_or_residency_number;
      }

      // Ensure occupation is set (required by database)
      // Use job_title if occupation is empty, or vice versa
      if (!data.occupation || data.occupation.trim() === "") {
        if (data.job_title && data.job_title.trim() !== "") {
          data.occupation = data.job_title;
        } else {
          data.occupation = "غير محدد"; // Fallback default
        }
      }

      // Ensure job_title is set (required by backend validation)
      // Use occupation if job_title is empty
      if (!data.job_title || data.job_title.trim() === "") {
        if (data.occupation && data.occupation.trim() !== "") {
          data.job_title = data.occupation;
        } else {
          data.job_title = "غير محدد"; // Fallback default
        }
      }

      // Ensure gender and id_type are set (required by database, should have defaults but double-check)
      if (!data.gender || data.gender.trim() === "") {
        data.gender = "male"; // Default fallback
      }
      if (!data.id_type || data.id_type.trim() === "") {
        // Auto-set based on nationality using helper function
        data.id_type = getIdTypeFromNationality(data.nationality);
      }

      // For branch managers, force branch_id to their branch (prevent manipulation)
      if (!isMainManager() && user?.branch_id) {
        data.branch_id = parseInt(user.branch_id);
      }

      // Ensure branch_id is an integer
      if (data.branch_id) {
        data.branch_id = parseInt(data.branch_id);
        if (isNaN(data.branch_id)) {
          showError("خطأ في تحديد الفرع");
          setSaving(false);
          return;
        }
      }

      // Ensure only one date type is sent based on selected calendar type
      // Set to null instead of deleting to ensure backend receives the field
      /*
       * LEGACY LOGIC REMOVED: We now support dual dates.
       * Both hijri and gregorian dates are sent if available.
       * Auto-conversion happens in frontend, so both should be populated.
       */

      // if (dateOfBirthCalendarType === 'hijri') {
      //   data.date_of_birth_gregorian = null;
      // } else if (dateOfBirthCalendarType === 'gregorian') {
      //   data.date_of_birth_hijri = null;
      // }

      // if (idExpiryCalendarType === 'hijri') {
      //   data.id_expiry_date_gregorian = null;
      // } else if (idExpiryCalendarType === 'gregorian') {
      //   data.id_expiry_date_hijri = null;
      // }

      // Convert remaining empty strings to null (don't delete required fields)
      Object.keys(data).forEach((key) => {
        if (
          data[key] === "" ||
          (typeof data[key] === "string" && data[key].trim() === "")
        ) {
          // Only convert optional fields to null, keep required fields
          if (optionalFields.includes(key)) {
            data[key] = null;
          }
        }
      });

      let employee;
      if (editingEmployee) {
        // Check if status changed (only for main manager)
        const originalStatus = editingEmployee.status || "active";
        const newStatus = formData.status || "active";
        const statusChanged = originalStatus !== newStatus;

        // Remove status from data - we'll handle status separately via updateStatus endpoint
        const statusToUpdate = data.status;
        delete data.status;

        const updateResponse = await employeesAPI.update(editingEmployee.id, {
          ...data,
          expected_updated_at: editingEmployee.updated_at,
        });
        employee = { id: editingEmployee.id };
        const ignored = updateResponse?.data?.ignored_fields || [];
        if (ignored.length > 0) {
          showWarning("رقم الهوية/الإقامة لا يغيّره إلا المدير الرئيسي، لذلك لم يتم تغييره.");
        }

        // Update status separately if it changed (only for main manager)
        if (isMainManager() && statusToUpdate) {
          if (statusChanged) {
            // Status changed, update it
            try {
              await employeesAPI.updateStatus(editingEmployee.id, {
                status: statusToUpdate,
                reason: `تم تغيير الحالة من ${employeeStatusLabel(originalStatus)} إلى ${employeeStatusLabel(newStatus)}`,
              });
            } catch (error) {
              console.error("Error updating employee status:", error);
              // The data was saved; only the status change failed. Say so instead of claiming full success.
              showWarning(
                error.response?.data?.message ||
                  "تم حفظ البيانات لكن تعذّر تغيير حالة الموظف.",
              );
            }
          } else if (!editingEmployee.status && statusToUpdate !== "active") {
            // Status was not set before, and user selected a non-default status
            try {
              await employeesAPI.updateStatus(editingEmployee.id, {
                status: statusToUpdate,
                reason: "تحديد الحالة الأولي",
              });
            } catch (error) {
              console.error("Error updating employee status:", error);
            }
          }
        }

        // Upload documents if any were provided during edit
        // Filter out documents that are not allowed for this employee
        let currentBranchTypeForValidation = selectedBranchType;
        if (!currentBranchTypeForValidation && editingEmployee?.branch_id) {
          const employeeBranch = branchesMap.get(editingEmployee.branch_id);
          if (employeeBranch) {
            currentBranchTypeForValidation = employeeBranch.branch_type;
          }
        }

        // Prepare uploads
        const uploadsToPerform = [];

        Object.entries(documents).forEach(([documentType, fileOrFiles]) => {
          if (!fileOrFiles) return;
          if (Array.isArray(fileOrFiles) && fileOrFiles.length === 0) return;

          // Validate document type before adding to upload list
          if (currentBranchTypeForValidation) {
            const validation = validateDocumentType(documentType, {
              nationality: data.nationality,
              job_title: data.job_title,
              branch_type: currentBranchTypeForValidation,
            });

            if (!validation.allowed) return;
          }

          if (Array.isArray(fileOrFiles)) {
            fileOrFiles.forEach((file) => {
              if (file) uploadsToPerform.push({ documentType, file });
            });
          } else {
            uploadsToPerform.push({ documentType, file: fileOrFiles });
          }
        });

        if (uploadsToPerform.length > 0) {
          setUploadingDocuments(true);
          const uploadPromises = uploadsToPerform.map(
            async ({ documentType, file }) => {
              const formData = new FormData();
              formData.append("file", file);
              formData.append("employee_id", editingEmployee.id);
              formData.append("document_type", documentType);

              try {
                await documentsAPI.upload(formData);
              } catch (error) {
                console.error(`Error uploading ${documentType}:`, error);
                failedUploads.push({ documentType, fileName: file.name, message: uploadErrorMessage(error) });
              }
            },
          );

          await Promise.all(uploadPromises);
          setUploadingDocuments(false);
        }

        // Update completion status after documents are uploaded
        try {
          await employeesAPI.updateCompletionStatus(editingEmployee.id);
        } catch (error) {
          console.error("Error updating completion status:", error);
        }
      } else {
        // Create employee first
        const createResponse = await employeesAPI.create(data);
        employee = createResponse.data.data;

        // Upload documents if any were provided
        // Filter out documents that are not allowed for this employee
        let currentBranchTypeForValidation = selectedBranchType;
        if (!currentBranchTypeForValidation && employee?.branch_id) {
          const employeeBranch = branchesMap.get(employee.branch_id);
          if (employeeBranch) {
            currentBranchTypeForValidation = employeeBranch.branch_type;
          }
        }

        // Prepare uploads
        const uploadsToPerform = [];

        Object.entries(documents).forEach(([documentType, fileOrFiles]) => {
          if (!fileOrFiles) return;
          if (Array.isArray(fileOrFiles) && fileOrFiles.length === 0) return;

          // Validate document type before adding to upload list
          if (currentBranchTypeForValidation) {
            const validation = validateDocumentType(documentType, {
              nationality: data.nationality,
              job_title: data.job_title,
              branch_type: currentBranchTypeForValidation,
            });

            if (!validation.allowed) return;
          }

          if (Array.isArray(fileOrFiles)) {
            fileOrFiles.forEach((file) => {
              if (file) uploadsToPerform.push({ documentType, file });
            });
          } else {
            uploadsToPerform.push({ documentType, file: fileOrFiles });
          }
        });

        if (uploadsToPerform.length > 0) {
          setUploadingDocuments(true);
          const uploadPromises = uploadsToPerform.map(
            async ({ documentType, file }) => {
              const formData = new FormData();
              formData.append("file", file);
              formData.append("employee_id", employee.id);
              formData.append("document_type", documentType);

              try {
                await documentsAPI.upload(formData);
              } catch (error) {
                console.error(`Error uploading ${documentType}:`, error);
                failedUploads.push({ documentType, fileName: file.name, message: uploadErrorMessage(error) });
              }
            },
          );

          await Promise.all(uploadPromises);
          setUploadingDocuments(false);
        }

        // Update completion status after documents are uploaded
        try {
          await employeesAPI.updateCompletionStatus(employee.id);
        } catch (error) {
          console.error("Error updating completion status:", error);
        }
      }

      setShowForm(false);
      setEditingEmployee(null);
      resetForm();
      resetDocuments();
      loadEmployees();
      const savedMessage = editingEmployee ? "تم تحديث بيانات الموظف" : "تم إضافة الموظف";
      if (failedUploads.length > 0) {
        showWarning(
          `${savedMessage}، لكن لم يتم رفع ${failedUploads.length === 1 ? "المستند التالي" : "المستندات التالية"}:\n\n` +
            failedUploads
              .map((f) => `• ${DOCUMENT_TYPE_LABELS[f.documentType] || f.documentType} (${f.fileName}): ${f.message}`)
              .join("\n") +
            `\n\nافتح الموظف من القائمة (تعديل) وارفع ${failedUploads.length === 1 ? "المستند" : "المستندات"} مرة أخرى.`,
        );
      } else {
        showSuccess(
          editingEmployee ? "تم تحديث الموظف بنجاح" : "تم إضافة الموظف بنجاح",
        );
      }
    } catch (error) {
      console.error("Error saving employee:", error);
      let errorMessage = "فشل حفظ الموظف";

      const responseData = error.response?.data;

      // Check if employee exists in another branch and can be linked
      if (responseData?.error === "EMPLOYEE_EXISTS_IN_OTHER_BRANCH" && responseData?.canLink) {
        const existingEmp = responseData.existingEmployee;

        // Ask user if they want to link the employee to their branch
        const confirmLink = await confirm({ message: `📋 الموظف موجود مسبقاً في فرع آخر\n\n` +
          `👤 الاسم: ${existingEmp.name}\n` +
          `🔢 رقم الهوية/الإقامة: ${existingEmp.id_or_residency_number}\n` +
          `🏢 الفروع الحالية: ${existingEmp.branches?.map(b => b.name).join('، ') || 'غير محدد'}\n\n` +
          `❓ هل تريد ربط هذا الموظف بفرعك أيضاً؟\n\n` +
          `اضغط "موافق" للربط أو "إلغاء" للإغاء` });

        if (confirmLink) {
          try {
            const linkResponse = await employeesAPI.linkToBranch({
              employee_id: existingEmp.id,
              id_or_residency_number: existingEmp.id_or_residency_number
            });

            if (linkResponse.data.success) {
              showSuccess(linkResponse.data.message || `تم ربط الموظف "${existingEmp.name}" بفرعك بنجاح`);
              setShowForm(false);
              setEditingEmployee(null);
              resetForm();
              resetDocuments();
              loadEmployees();
              return;
            }
          } catch (linkError) {
            console.error("Error linking employee:", linkError);
            showError(
              linkError.response?.data?.message ||
              "فشل ربط الموظف بالفرع. الرجاء المحاولة مرة أخرى."
            );
          }
        }
        setSaving(false);
        setUploadingDocuments(false);
        return;
      }

      // Archived employees cannot be re-added; only the main manager restores them.
      if (responseData?.error === "EMPLOYEE_ARCHIVED") {
        if (isMainManager()) {
          if (await confirm({ message: `${responseData.message}\n\nهل تريد فتح صفحة الأرشيف الآن؟` })) {
            navigate("/archive");
          }
        } else {
          showWarning(responseData.message);
        }
        setSaving(false);
        setUploadingDocuments(false);
        return;
      }

      // Check if employee is already in this branch
      if (responseData?.error === "EMPLOYEE_ALREADY_IN_BRANCH") {
        showWarning(
          `⚠️ الموظف مسجل بالفعل في هذا الفرع\n\n` +
          `الموظف: ${responseData.existingEmployee?.name || 'غير محدد'}\n` +
          `رقم الهوية/الإقامة: ${responseData.existingEmployee?.id_or_residency_number || 'غير محدد'}\n\n` +
          `يمكنك البحث عن الموظف في قائمة الموظفين لتعديل بياناته.`
        );
        setSaving(false);
        setUploadingDocuments(false);
        return;
      }

      if (responseData?.message) {
        errorMessage = responseData.message;
      } else if (responseData?.error) {
        errorMessage = responseData.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      // Show clear error message
      showError(
        `خطأ في حفظ الموظف\n\n${errorMessage}\n\nالرجاء التحقق من البيانات المدخلة والمحاولة مرة أخرى.`,
      );
    } finally {
      setSaving(false);
      setUploadingDocuments(false);
    }
  };

  const resetDocuments = () => {
    setDocuments({
      id_or_residency: null,
      direct_letter: null,
      bank_iban: null,
      primary_qualification: null,
      employment_contract: null,
      additional_courses: [],
      passport: null,
      professional_license: null,
      experience_certificate: [],
      classification: null,
      speech_therapy_course: null,
      physical_therapy_course: null,
      medical_disclosure_form: null,
      speech_therapy_70_hours_course: null,
      therapy_40_hours_course: null,
      medical_insurance: null,
    });
    setExistingDocuments({});
  };

  // Helper function to render existing documents info card
  const renderExistingDocumentsWarning = (documentType) => {
    const existing = existingDocuments[documentType];
    if (!existing || existing.length === 0) return null;

    return (
      <div className="doc-warning-card">
        <div className="doc-warning-header">
          <span>📋</span>
          <span>يوجد مستند مرفوع مسبقاً</span>
        </div>
        {existing.map((doc, idx) => (
          <div key={doc.id || idx} className="doc-warning-item">
            <div className="doc-warning-item-name">
              📄 {doc.filename || doc.file_name || "مستند"}
            </div>
            {doc.uploaded_at && (
              <span className="doc-warning-item-date">
                تم الرفع: {formatDate(doc.uploaded_at)}
              </span>
            )}
          </div>
        ))}
        <div className="doc-warning-note">
          ⚠️ رفع مستند جديد سيحذف المستند(ات) الموجودة
        </div>
      </div>
    );
  };

  // Helper function to render new file selected indicator
  const renderNewFileIndicator = (file) => {
    if (!file) return null;
    return (
      <div className="doc-new-file-indicator">
        <strong>✓ سيتم رفع:</strong>{" "}
        {file.name || (Array.isArray(file) ? `${file.length} ملف` : "مستند")}
      </div>
    );
  };

  const handleDocumentChange = async (documentType, fileOrFiles) => {
    let filesToCheck = [];
    let isEvent = false;
    let inputElement = null;

    // Check if argument is an event object
    if (fileOrFiles && fileOrFiles.target && fileOrFiles.target.files) {
      isEvent = true;
      inputElement = fileOrFiles.target;
      const file = inputElement.files[0];
      if (!file) {
        // Handle case where user cancels file selection (sets to empty)
        // For single files, we might want to clear the state
        // But let's assume this is a clear action
        setDocuments((prev) => ({
          ...prev,
          [documentType]: null,
        }));
        return;
      }
      filesToCheck = [file];
    } else if (fileOrFiles) {
      // Handle array of files or single file object
      filesToCheck = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
    }

    // Check if document already exists and show warning (only for single-file document types)
    const singleFileDocumentTypes = [
      "id_or_residency",
      "direct_letter",
      "bank_iban",
      "primary_qualification",
      "employment_contract",
      "passport",
      "professional_license",
      "classification",
      "speech_therapy_course",
      "physical_therapy_course",
      "medical_disclosure_form",
      "speech_therapy_70_hours_course",
      "therapy_40_hours_course",
      "medical_insurance",
    ];

    if (
      filesToCheck.length > 0 &&
      singleFileDocumentTypes.includes(documentType) &&
      existingDocuments[documentType] &&
      existingDocuments[documentType].length > 0
    ) {
      const existingCount = existingDocuments[documentType].length;
      const message =
        `يوجد ${existingCount} مستند ${existingCount > 1 ? "موجودة" : "موجود"} مسبقاً لهذا النوع.\n\n` +
        `رفع مستند جديد سيحذف المستند(ات) الموجودة.\n\n` +
        `هل تريد المتابعة؟`;
      if (!await confirm({ message })) {
        // Reset the file input
        if (inputElement) {
          inputElement.value = "";
        }
        return;
      }
    }

    // Silently validate document type before allowing upload
    // Don't show error messages - just prevent upload if not allowed
    if (filesToCheck.length > 0) {
      for (const file of filesToCheck) {
        if (!file) continue;

        // Only the types the server accepts (same list as the inputs' accept attribute)
        if (!/\.(pdf|jpe?g|png)$/i.test(file.name || "")) {
          showWarning(`نوع الملف "${file.name}" غير مدعوم. يُسمح فقط بملفات PDF و JPG و PNG.`);
          if (isEvent && inputElement) {
            inputElement.value = ""; // Clear the input
          }
          return;
        }

        // Validate file size (same limit as the server)
        if (file.size > MAX_UPLOAD_BYTES) {
          showWarning(fileTooLargeMessage(file.name));
          if (isEvent && inputElement) {
            inputElement.value = ""; // Clear the input
          }
          return;
        }
      }

      // Get current branch type
      let branchTypeForValidation = selectedBranchType;
      if (!branchTypeForValidation && formData.branch_id) {
        const branch = branchesMap.get(parseInt(formData.branch_id));
        if (branch) {
          branchTypeForValidation = branch.branch_type;
        }
      }
      if (!branchTypeForValidation && !isMainManager() && user?.branch_id) {
        const userBranch = branchesMap.get(user.branch_id);
        if (userBranch) {
          branchTypeForValidation = userBranch.branch_type;
        }
      }

      if (branchTypeForValidation) {
        const validation = validateDocumentType(documentType, {
          nationality: formData.nationality,
          job_title: formData.job_title,
          branch_type: branchTypeForValidation,
        });

        // Silently reject if not allowed (don't set the file)
        if (!validation.allowed) {
          if (isEvent && inputElement) {
            inputElement.value = ""; // Clear the input
          }
          return; // Don't set the file, effectively preventing upload
        }
      }
    }

    // Special handling for multiple file fields
    if (
      documentType === "experience_certificate" ||
      documentType === "additional_courses"
    ) {
      const fileToAdd = isEvent ? filesToCheck[0] : fileOrFiles;

      setDocuments((prev) => {
        const currentFiles = Array.isArray(prev[documentType])
          ? prev[documentType]
          : [];

        // If fileOrFiles is null, it might mean clearing - but for arrays we usually remove specific items
        // If we want to add a new file:
        if (fileToAdd && !Array.isArray(fileToAdd)) {
          // Check limit (max 5)
          if (currentFiles.length >= 5) {
            showWarning("لا يمكن إضافة أكثر من 5 ملفات");
            if (isEvent && inputElement) {
              inputElement.value = "";
            }
            return prev;
          }
          return {
            ...prev,
            [documentType]: [...currentFiles, fileToAdd],
          };
        }

        // If passed an array (bulk set) -> replace
        if (Array.isArray(fileToAdd)) {
          return {
            ...prev,
            [documentType]: fileToAdd,
          };
        }

        // If null/undefined -> do nothing or clear? Assuming we add via this function
        return prev;
      });
      return;
    }

    // Standard handling for single files
    setDocuments((prev) => ({
      ...prev,
      [documentType]: isEvent ? filesToCheck[0] : fileOrFiles,
    }));
  };

  const removeDocument = (documentType, index) => {
    setDocuments((prev) => {
      const currentFiles = Array.isArray(prev[documentType])
        ? prev[documentType]
        : [];
      const newFiles = [...currentFiles];
      newFiles.splice(index, 1);
      return {
        ...prev,
        [documentType]: newFiles,
      };
    });
  };

  const handleEdit = useCallback(
    (employee) => {
      setEditingEmployee(employee);
      const branch = branchesMap.get(employee.branch_id);
      if (branch) {
        setSelectedBranchType(branch.branch_type);
      }

      const isSaudiEmployee =
        employee.nationality === "Saudi Arabia" ||
        employee.nationality === "المملكة العربية السعودية" ||
        employee.nationality?.toLowerCase().includes("saudi") ||
        employee.nationality?.toLowerCase().includes("سعودي");

      // Helper to format date for input (YYYY-MM-DD)
      const toInputDate = (d) => {
        if (!d) return "";
        if (typeof d === "string") return d.split("T")[0];
        return "";
      };

      setFormData({
        employee_id_number: "", // Will be auto-set from id_or_residency_number
        branch_id: employee.branch_id,
        first_name: employee.first_name,
        second_name: employee.second_name,
        third_name: employee.third_name,
        fourth_name: employee.fourth_name,
        occupation: employee.occupation,
        job_title: employee.job_title || "",
        nationality: employee.nationality,
        // Calculate missing dates if needed (backfill for legacy data)
        date_of_birth_hijri: (() => {
          if (employee.date_of_birth_hijri) return employee.date_of_birth_hijri;
          if (employee.date_of_birth_gregorian) {
            const gregDate = toInputDate(employee.date_of_birth_gregorian);
            const hijri = gregorianToHijri(gregDate);
            return hijri ? formatHijriToString(hijri) : "";
          }
          return "";
        })(),
        date_of_birth_gregorian: (() => {
          const greg = toInputDate(employee.date_of_birth_gregorian);
          if (greg) return greg;
          if (employee.date_of_birth_hijri) {
            const [day, month, year] = employee.date_of_birth_hijri.split("/");
            return hijriToGregorian(day, month, year) || "";
          }
          return "";
        })(),
        id_or_residency_number: employee.id_or_residency_number,
        id_type: employee.id_type,
        gender: employee.gender,
        // ID expiry date: Only load for non-Saudi employees
        // Saudi employees' IDs don't expire, so clear this field
        id_expiry_date_hijri: isSaudiEmployee
          ? ""
          : (() => {
            if (employee.id_expiry_date_hijri)
              return employee.id_expiry_date_hijri;
            if (employee.id_expiry_date_gregorian) {
              const gregDate = toInputDate(employee.id_expiry_date_gregorian);
              const hijri = gregorianToHijri(gregDate);
              return hijri ? formatHijriToString(hijri) : "";
            }
            return "";
          })(),
        id_expiry_date_gregorian: isSaudiEmployee
          ? ""
          : (() => {
            const greg = toInputDate(employee.id_expiry_date_gregorian);
            if (greg) return greg;
            if (employee.id_expiry_date_hijri) {
              const [day, month, year] =
                employee.id_expiry_date_hijri.split("/");
              return hijriToGregorian(day, month, year) || "";
            }
            return "";
          })(),
        religion: employee.religion || "",
        marital_status: employee.marital_status || "",
        educational_qualification: employee.educational_qualification || "",
        specialization: (() => {
          // Clear specialization for basic education levels
          const basicEducationLevels = [
            "ابتدائي",
            "متوسط",
            "ثانوي",
            "غير متعلم",
          ];
          const qual = employee.educational_qualification || "";
          if (basicEducationLevels.includes(qual)) {
            return "";
          }
          return employee.specialization || "";
        })(),
        bank_iban: employee.bank_iban || "",
        bank_name: employee.bank_name || DEFAULT_BANK_PLACEHOLDER,
        email: employee.email || "",
        phone_number: employee.phone_number || "",
        national_address: employee.national_address || "",
        contract_type: employee.contract_type || "",
        contract_start_date: toInputDate(
          employee.contract_start_date_gregorian,
        ),
        contract_end_date: toInputDate(employee.contract_end_date_gregorian),
        work_start_date: toInputDate(employee.work_start_date_gregorian),
        base_salary: employee.base_salary || "",
        housing_allowance: employee.housing_allowance || "",
        transportation_allowance: employee.transportation_allowance || "",
        end_of_service_allowance: employee.end_of_service_allowance || "",
        annual_leave_allowance: employee.annual_leave_allowance || "",
        other_allowances: employee.other_allowances || "",
        years_of_experience_in_same_institution:
          employee.years_of_experience_in_same_institution || "",
        graduation_year: (() => {
          // Clear graduation_year for basic education levels
          const basicEducationLevels = [
            "ابتدائي",
            "متوسط",
            "ثانوي",
            "غير متعلم",
          ];
          const qual = employee.educational_qualification || "";
          if (basicEducationLevels.includes(qual)) {
            return "";
          }
          return employee.graduation_year || "";
        })(),
        university_gpa: (() => {
          // Clear university_gpa for basic education levels
          const basicEducationLevels = [
            "ابتدائي",
            "متوسط",
            "ثانوي",
            "غير متعلم",
          ];
          const qual = employee.educational_qualification || "";
          if (basicEducationLevels.includes(qual)) {
            return "";
          }
          return employee.university_gpa || "";
        })(),
        passport_number: employee.passport_number || "",
        passport_issue_date: toInputDate(employee.passport_issue_date),
        passport_expiry_date: toInputDate(employee.passport_expiry_date),
        passport_issue_place: employee.passport_issue_place || "",
        residency_issue_date: toInputDate(employee.residency_issue_date),
        status: employee.status || "active",
      });

      // Set calendar types based on nationality (not existing data)
      if (isSaudiEmployee) {
        setDateOfBirthCalendarType("hijri");
        setIdExpiryCalendarType("hijri");
      } else {
        setDateOfBirthCalendarType("gregorian");
        setIdExpiryCalendarType("gregorian");
      }

      setFormStep(2); // Skip branch type selection when editing
      setShowForm(true);

      // Load existing documents for this employee
      const loadExistingDocuments = async () => {
        try {
          const response = await documentsAPI.getByEmployeeId(employee.id);
          if (response.data.success) {
            const docs = response.data.data || [];
            // Group documents by document_type
            const groupedDocs = {};
            docs.forEach((doc) => {
              if (!groupedDocs[doc.document_type]) {
                groupedDocs[doc.document_type] = [];
              }
              groupedDocs[doc.document_type].push(doc);
            });
            setExistingDocuments(groupedDocs);
          }
        } catch (error) {
          console.error("Error loading existing documents:", error);
          setExistingDocuments({});
        }
      };

      loadExistingDocuments();
    },
    [branchesMap],
  );

  const handleViewDetails = useCallback(
    (employee) => {
      navigate(`/employees/${employee.id}`);
    },
    [navigate],
  );

  const resetForm = useCallback(() => {
    // Auto-set branch_id and branch type for branch managers
    const defaultBranchId =
      !isMainManager() && user?.branch_id ? user.branch_id : "";
    let defaultBranchType = null;

    if (!isMainManager() && user?.branch_id) {
      const userBranch = branchesMap.get(user.branch_id);
      if (userBranch) {
        defaultBranchType = userBranch.branch_type;
      }
    }

    setFormData({
      employee_id_number: "",
      branch_id: defaultBranchId,
      first_name: "",
      second_name: "",
      third_name: "",
      fourth_name: "",
      occupation: "",
      job_title: "",
      nationality: "",
      date_of_birth_hijri: "",
      date_of_birth_gregorian: "",
      id_or_residency_number: "",
      id_type: "",
      gender: "",
      id_expiry_date_hijri: "",
      id_expiry_date_gregorian: "",
      religion: "",
      marital_status: "",
      status: "active",
      educational_qualification: "",
      specialization: "",
      bank_iban: "",
      bank_name: DEFAULT_BANK_PLACEHOLDER,
      email: "",
      phone_number: "",
      contract_type: "",
      contract_start_date: "",
      contract_end_date: "",
      work_start_date: "",
      base_salary: "",
      housing_allowance: "",
      transportation_allowance: "",
      end_of_service_allowance: "",
      annual_leave_allowance: "",
      other_allowances: "",
      years_of_experience_in_same_institution: "",
      graduation_year: "",
      university_gpa: "",
      passport_number: "",
      passport_issue_date: "",
      passport_expiry_date: "",
      passport_issue_place: "",
      residency_issue_date: "",
    });
    // Branch managers skip step 1, go directly to step 2
    setFormStep(!isMainManager() && user?.branch_id ? 2 : 1);
    setSelectedBranchType(defaultBranchType);
    setDateOfBirthCalendarType(null);
    setIdExpiryCalendarType(null);
    resetDocuments();
  }, [isMainManager, user?.branch_id, branchesMap]);

  const handleNameChange = useCallback((names) => {
    setFormData((prev) => ({
      ...prev,
      first_name: names.first,
      second_name: names.second,
      third_name: names.third,
      fourth_name: names.fourth,
    }));
  }, []);

  const handleDateOfBirthChange = useCallback((hijriDate, gregorianDate) => {
    // التحويل التلقائي: عند إدخال تاريخ بأي من التقويمين، يتم تحويله تلقائياً وحفظ كلا التاريخين
    // Auto-conversion: When entering a date in either calendar, it's automatically converted and both dates are saved
    setFormData((prev) => ({
      ...prev,
      date_of_birth_hijri: hijriDate, // التاريخ الهجري (يتم تحويله تلقائياً من الميلادي)
      date_of_birth_gregorian: gregorianDate, // التاريخ الميلادي (يتم تحويله تلقائياً من الهجري)
    }));
  }, []);

  const handleIdExpiryChange = useCallback((hijriDate, gregorianDate) => {
    // accept both dates and update state
    setFormData((prev) => ({
      ...prev,
      id_expiry_date_hijri: hijriDate,
      id_expiry_date_gregorian: gregorianDate,
    }));
  }, []);

  // Determine current branch type: for branch managers, get from their branch; for main managers, use selectedBranchType
  // Memoize this calculation to avoid re-computing on every render
  // IMPORTANT: This must be before any conditional returns to follow React Hooks rules
  const currentBranchType = useMemo(() => {
    if (selectedBranchType) return selectedBranchType;
    if (!isMainManager() && user?.branch_id) {
      const userBranch = branchesMap.get(user.branch_id);
      if (userBranch) {
        return userBranch.branch_type;
      }
    }
    return null;
  }, [selectedBranchType, isMainManager, user?.branch_id, branchesMap]);

  // Open the edit form once both the employee (from another page) and the branches are loaded
  useEffect(() => {
    if (pendingEditEmployee && branches.length > 0) {
      handleEdit(pendingEditEmployee);
      setPendingEditEmployee(null);
    }
  }, [pendingEditEmployee, branches, handleEdit]);

  const openAddForm = () => {
    resetForm();
    // Auto-set branch_id and branch type for branch managers
    if (!isMainManager() && user?.branch_id) {
      const userBranch = branches.find(
        (b) => b.id === user.branch_id,
      );
      if (userBranch) {
        setFormData((prev) => ({
          ...prev,
          branch_id: user.branch_id,
        }));
        setSelectedBranchType(userBranch.branch_type);
        setFormStep(2); // Skip branch type selection, go directly to form
      }
    } else {
      setFormStep(1); // Main managers need to select branch type
    }
    setShowForm(true);
    setEditingEmployee(null);
  };

  // Year review "edit" opens the same form as the list (with document uploads).
  const openEditFormById = (employeeId) => {
    employeesAPI
      .getById(employeeId)
      .then((response) => {
        if (response.data.success) handleEdit(response.data.data);
        else showError("تعذر تحميل بيانات الموظف");
      })
      .catch((error) => {
        console.error("Error loading employee for edit:", error);
        showError(error.response?.data?.message || "تعذر تحميل بيانات الموظف");
      });
  };

  // Show full page loading only on initial load
  if (initialLoading && loading) {
    return <div className="loading">جاري تحميل الموظفين...</div>;
  }

  return (
    <div className={showForm ? "table-page" : undefined}>
      {!showForm ? (
        <EmployeesView
          employees={employees}
          branches={branches}
          loading={initialLoading || loading || tableLoading}
          isMain={isMainManager()}
          user={user}
          yearReviewActive={yearReviewActive}
          activeTab={activeMainTab}
          onTabChange={setActiveMainTab}
          yearReviewPanel={
            <EmployeeYearReview
              onAddEmployee={openAddForm}
              onEditEmployee={openEditFormById}
            />
          }
          focusEmployee={focusEmployee}
          onClearFocus={() => setFocusEmployee(null)}
          initialIncomplete={filterIncomplete}
          onAdd={openAddForm}
          onEdit={handleEdit}
          onView={handleViewDetails}
          onReload={loadEmployees}
        />
      ) : (
        <div className="employee-form-page">
          <div className="form-page-header">
            <h1>{editingEmployee ? "تعديل الموظف" : "إضافة موظف جديد"}</h1>
            <Button variant="secondary" icon="arrow-end" onClick={() => {
                setShowForm(false);
                resetForm();
                setEditingEmployee(null);
              }}>
              إلغاء والعودة للقائمة
            </Button>
          </div>

          <div className="employee-form-container">
            {formStep === 1 && !editingEmployee && isMainManager() && (
              <div className="ef-step">
                <h3 className="ef-step-title">اختر نوع الفرع للموظف الجديد</h3>
                <div className="ef-type-grid">
                  <button
                    type="button"
                    className="ef-type-card"
                    onClick={() => {
                      setSelectedBranchType("healthcare_center");
                      const firstBranch = branches.find((b) => b.branch_type === "healthcare_center" && b.is_active);
                      if (firstBranch) {
                        setFormData((prev) => ({ ...prev, branch_id: firstBranch.id }));
                      }
                      setFormStep(2);
                    }}
                  >
                    <span className="ef-type-icon"><Icon name="building" size={28} /></span>
                    <strong>مركز رعاية صحية</strong>
                    <span className="ef-muted">للموظفين في المراكز الصحية</span>
                  </button>
                  <button
                    type="button"
                    className="ef-type-card"
                    onClick={() => {
                      setSelectedBranchType("school");
                      const firstBranch = branches.find((b) => b.branch_type === "school" && b.is_active);
                      if (firstBranch) {
                        setFormData((prev) => ({ ...prev, branch_id: firstBranch.id }));
                      }
                      setFormStep(2);
                    }}
                  >
                    <span className="ef-type-icon"><Icon name="graduation-cap" size={28} /></span>
                    <strong>مدرسة</strong>
                    <span className="ef-muted">للموظفين في المدارس</span>
                  </button>
                </div>
                <div>
                  <Button variant="ghost" onClick={() => {
                setShowForm(false);
                resetForm();
                setEditingEmployee(null);
              }}>إلغاء والعودة</Button>
                </div>
              </div>
            )}

            {(formStep === 2 ||
              editingEmployee ||
              (!isMainManager() && user?.branch_id)) && (
                <form onSubmit={handleSubmit} className="employee-form">
                  {isMainManager() && (
                    <div className="col-12 ef-typebar">
                      <span>
                        <strong>نوع الفرع: </strong>
                        {currentBranchType
                          ? isHealthcareCenter(currentBranchType)
                            ? "مركز رعاية صحية"
                            : isSchool(currentBranchType)
                              ? "مدرسة"
                              : "غير محدد"
                          : "غير محدد"}
                      </span>
                      {!editingEmployee && (
                        <Button size="sm" variant="secondary" onClick={() => setFormStep(1)}>تغيير النوع</Button>
                      )}
                    </div>
                  )}

                  {/* ========== القسم الأول: المعلومات الأساسية المطلوبة ========== */}

                  {/* Help section for new employees */}
                  {!editingEmployee && (
                    <div className="col-12">
                      <Alert tone="info" title="إرشادات إضافة موظف جديد">
                        <ul className="ef-help">
                          <li>ابدأ باختيار <strong>الجنسية</strong> أولاً - ستظهر الحقول المناسبة تلقائياً</li>
                          <li>الحقول المميزة بـ <span className="ef-required">*</span> هي حقول إلزامية</li>
                          <li>يمكنك تعبئة الحقول الإضافية لاحقاً من خلال التعديل</li>
                          <li>المستندات يمكن رفعها في القسم الرابع أو لاحقاً</li>
                        </ul>
                      </Alert>
                    </div>
                  )}

                  {/* الجنسية أولاً - تظهر فقط في البداية */}
                  <div className="form-group col-12 nationality-highlight">
                    <NationalitySelect
                      label="الجنسية"
                      value={formData.nationality}
                      onChange={handleNationalityChange}
                      required
                    />
                    {formData.nationality && (
                      <p className="ef-nationality-note">
                        {isSaudi()
                          ? "مواطن سعودي - سيتم إظهار الحقول المطلوبة للمواطنين"
                          : "مقيم - سيتم إظهار الحقول المطلوبة للمقيمين"}
                      </p>
                    )}
                  </div>

                  {/* باقي الحقول تظهر فقط بعد اختيار الجنسية */}
                  {formData.nationality && (
                    <>
                      <h3 className="col-12 ef-section">القسم الأول: المعلومات الأساسية ومعلومات الإثبات الشخصي</h3>

                      <h4 className="col-12">الاسم الكامل</h4>
                      <div className="form-group col-12">
                        <NameInput
                          label="الاسم الكامل (4 أسماء)"
                          value={{
                            first: formData.first_name,
                            second: formData.second_name,
                            third: formData.third_name,
                            fourth: formData.fourth_name,
                          }}
                          onChange={handleNameChange}
                          required
                        />
                      </div>

                      <div className="form-group col-4">
                        <label>
                          {isSaudi() ? "رقم الهوية *" : "رقم الإقامة *"}
                        </label>
                        <input
                          type="text"
                          value={formData.id_or_residency_number}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              id_or_residency_number: e.target.value,
                            })
                          }
                          required
                          readOnly={Boolean(editingEmployee) && !isMainManager()}
                          title={editingEmployee && !isMainManager() ? "لا يغيّر رقم الهوية إلا المدير الرئيسي" : undefined}
                          placeholder={isSaudi() ? "رقم الهوية" : "رقم الإقامة"}
                        />
                      </div>

                      {/* تاريخ انتهاء الهوية/الإقامة - مطلوب فقط لغير السعوديين */}
                      {isNonSaudi(formData.nationality) && (
                        <div className="form-group col-3">
                          <UnifiedDatePicker
                            label="تاريخ انتهاء الهوية/الإقامة"
                            hijriValue={formData.id_expiry_date_hijri}
                            gregorianValue={formData.id_expiry_date_gregorian}
                            onChange={handleIdExpiryChange}
                            defaultCalendarType="gregorian"
                            dateType="general"
                            required={true}
                          />
                        </div>
                      )}

                      {/* نوع الهوية - مخفي لأنه يتم تعيينه تلقائياً حسب الجنسية */}
                      <input
                        type="hidden"
                        value={
                          formData.id_type ||
                          getIdTypeFromNationality(formData.nationality)
                        }
                      />

                      {/* تاريخ الميلاد - مطلوب للجميع */}
                      <div className="form-group col-3">
                        <UnifiedDatePicker
                          label="تاريخ الميلاد"
                          hijriValue={formData.date_of_birth_hijri}
                          gregorianValue={formData.date_of_birth_gregorian}
                          onChange={handleDateOfBirthChange}
                          defaultCalendarType={isSaudi() ? "hijri" : "gregorian"} // Set initial view preference
                          dateType="birth_date"
                          required
                        />
                      </div>

                      <div className="form-group col-2">
                        <label>الجنس *</label>
                        <select
                          value={formData.gender || ""}
                          onChange={(e) =>
                            setFormData({ ...formData, gender: e.target.value })
                          }
                          required
                        >
                          <option value="">اختر الجنس</option>
                          <option value="male">ذكر</option>
                          <option value="female">أنثى</option>
                        </select>
                      </div>

                      {/* حقل الفرع مخفي - يتم تعيينه تلقائياً */}
                      <input type="hidden" value={formData.branch_id} />

                      <div className="form-group col-4">
                        <label>المهنة *</label>
                        <input
                          type="text"
                          value={formData.occupation}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              occupation: e.target.value,
                            })
                          }
                          placeholder="المهنة"
                        />
                      </div>

                      <div className="form-group col-4">
                        <label>المسمى الوظيفي</label>
                        <select
                          value={formData.job_title}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              job_title: e.target.value,
                            })
                          }
                        >
                          <option value="">اختر المسمى الوظيفي</option>
                          {(() => {
                            // Get current branch type (use memoized currentBranchType from above)
                            // This avoids recalculating on every render
                            let branchTypeForJobTitles =
                              currentBranchType || selectedBranchType;
                            if (!branchTypeForJobTitles && editingEmployee) {
                              const empBranch = branchesMap.get(
                                editingEmployee.branch_id,
                              );
                              if (empBranch)
                                branchTypeForJobTitles = empBranch.branch_type;
                            }
                            if (!branchTypeForJobTitles && formData.branch_id) {
                              const formBranch = branchesMap.get(
                                parseInt(formData.branch_id),
                              );
                              if (formBranch)
                                branchTypeForJobTitles = formBranch.branch_type;
                            }

                            // Get job titles from constants based on branch type
                            const jobTitles = getJobTitlesByBranchType(
                              branchTypeForJobTitles,
                            );
                            return (
                              <>
                                {jobTitles.map((title) => (
                                  <option key={title} value={title}>
                                    {title}
                                  </option>
                                ))}
                              </>
                            );
                          })()}
                        </select>
                      </div>

                      {/* Status field - Only for main manager when editing */}
                      {isMainManager() && editingEmployee && (
                        <div className="form-group col-4">
                          <label>حالة الموظف</label>
                          <select
                            value={formData.status}
                            onChange={(e) =>
                              setFormData({ ...formData, status: e.target.value })
                            }
                          >
                            <option value="active">نشط</option>
                            <option value="pending">قيد الانتظار</option>
                            <option value="terminated_article_80">
                              فصل حسب المادة 80
                            </option>
                            <option value="terminated_article_77">
                              فصل حسب المادة 77
                            </option>
                            <option value="resigned">استقال</option>
                            <option value="contract_ended">انتهى العقد</option>
                            <option value="non_renewal">عدم التجديد</option>
                            <option value="other">أخرى</option>
                          </select>
                        </div>
                      )}

                      <div className="form-group col-4">
                        <label>البريد الإلكتروني *</label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) =>
                            setFormData({ ...formData, email: e.target.value })
                          }
                          placeholder="example@email.com"
                          required
                        />
                      </div>

                      <div className="form-group col-4">
                        <label>رقم الهاتف *</label>
                        <input
                          type="text"
                          value={formData.phone_number}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              phone_number: e.target.value,
                            })
                          }
                          placeholder="05xxxxxxxx"
                          required
                        />
                      </div>

                      <div className="form-group col-12">
                        <BankSelect
                          label="معلومات البنك"
                          value={formData.bank_name}
                          onChange={(value) =>
                            setFormData((prev) => ({ ...prev, bank_name: value }))
                          }
                          ibanValue={formData.bank_iban}
                          onIbanChange={(value) =>
                            setFormData((prev) => ({ ...prev, bank_iban: value }))
                          }
                          required
                        />
                      </div>

                      <div className="form-group col-4">
                        <label>العنوان الوطني الموحد (المختصر) *</label>
                        <input
                          type="text"
                          value={formData.national_address}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\s/g, ""); // Remove spaces
                            if (value.length <= 8) {
                              setFormData({
                                ...formData,
                                national_address: value,
                              });
                            }
                          }}
                          placeholder="8 خانات"
                          maxLength={8}
                          style={{
                            textAlign: "center",
                            fontFamily: "monospace",
                            letterSpacing: "2px",
                          }}
                          required
                        />
                      </div>

                      {/* معلومات الإثبات الشخصي - جزء من القسم الأول */}
                      <div className="form-group col-3">
                        <ReligionSelect
                          label="الديانة"
                          value={formData.religion}
                          onChange={(value) =>
                            setFormData({ ...formData, religion: value })
                          }
                          required
                        />
                      </div>

                      <div className="form-group col-3">
                        <MaritalStatusSelect
                          label="الحالة الاجتماعية"
                          value={formData.marital_status}
                          onChange={(value) =>
                            setFormData({ ...formData, marital_status: value })
                          }
                          required
                        />
                      </div>

                      {/* Passport fields - only for non-Saudis */}
                      {isNonSaudi(formData.nationality) && (
                        <>
                          <div className="form-group col-3">
                            <label>رقم جواز السفر *</label>
                            <input
                              type="text"
                              value={formData.passport_number}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  passport_number: e.target.value,
                                })
                              }
                              placeholder="رقم جواز السفر"
                              required
                            />
                          </div>
                          <div className="form-group col-3">
                            <label>تاريخ اصدار جواز السفر *</label>
                            <input
                              type="date"
                              value={formData.passport_issue_date}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  passport_issue_date: e.target.value,
                                })
                              }
                              required
                            />
                          </div>
                          <div className="form-group col-3">
                            <label>تاريخ انتهاء جواز السفر *</label>
                            <input
                              type="date"
                              value={formData.passport_expiry_date}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  passport_expiry_date: e.target.value,
                                })
                              }
                              required
                            />
                          </div>
                          <div className="form-group col-3">
                            <label>مكان إصدار جواز السفر *</label>
                            <input
                              type="text"
                              value={formData.passport_issue_place}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  passport_issue_place: e.target.value,
                                })
                              }
                              placeholder="مكان الإصدار"
                              required
                            />
                          </div>
                          <div className="form-group col-3">
                            <label>تاريخ اصدار الإقامة *</label>
                            <input
                              type="date"
                              value={formData.residency_issue_date}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  residency_issue_date: e.target.value,
                                })
                              }
                              required
                            />
                          </div>
                        </>
                      )}

                      <div className="form-group col-3">
                        <label>نوع العقد *</label>
                        <select
                          value={formData.contract_type}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              contract_type: e.target.value,
                            })
                          }
                          className="form-select"
                          required
                        >
                          <option value="">اختر نوع العقد</option>
                          <option value="ورقي">ورقي</option>
                          <option value="قوى">قوى</option>
                        </select>
                      </div>

                      <div className="form-group col-3">
                        <label>تاريخ بداية العقد</label>
                        <input
                          type="date"
                          value={formData.contract_start_date}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              contract_start_date: e.target.value,
                            })
                          }
                          placeholder="تاريخ بداية العقد"
                        />
                      </div>

                      <div className="form-group col-3">
                        <label>تاريخ نهاية العقد</label>
                        <input
                          type="date"
                          value={formData.contract_end_date}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              contract_end_date: e.target.value,
                            })
                          }
                          placeholder="تاريخ نهاية العقد"
                        />
                      </div>

                      <div className="form-group col-3">
                        <label>تاريخ مباشرة العمل</label>
                        <input
                          type="date"
                          value={formData.work_start_date}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              work_start_date: e.target.value,
                            })
                          }
                          placeholder="تاريخ مباشرة العمل"
                        />
                      </div>

                      <div className="form-group col-3">
                        <label>عدد سنين الخبرة داخل المؤسسة نفسها</label>
                        <input
                          type="number"
                          min="0"
                          value={formData.years_of_experience_in_same_institution}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              years_of_experience_in_same_institution:
                                e.target.value,
                            })
                          }
                        />
                      </div>

                      {/* ========== القسم الثاني: المعلومات التعليمية ========== */}
                      <h3 className="col-12 ef-section">القسم الثاني: المعلومات التعليمية</h3>

                      <div className="form-group col-4">
                        <label>المؤهل التعليمي</label>
                        <select
                          value={formData.educational_qualification}
                          onChange={(e) => {
                            const newQualification = e.target.value;
                            const basicEducationLevels = [
                              "ابتدائي",
                              "متوسط",
                              "ثانوي",
                              "غير متعلم",
                            ];
                            const isBasic =
                              basicEducationLevels.includes(newQualification);

                            // If switching to basic education, clear specialization, graduation_year, and university_gpa
                            if (isBasic) {
                              setFormData({
                                ...formData,
                                educational_qualification: newQualification,
                                specialization: "",
                                graduation_year: "",
                                university_gpa: "",
                              });
                            } else {
                              setFormData({
                                ...formData,
                                educational_qualification: newQualification,
                              });
                            }
                          }}
                        >
                          <option value="">اختر المؤهل التعليمي</option>
                          <option value="ابتدائي">ابتدائي</option>
                          <option value="متوسط">متوسط</option>
                          <option value="ثانوي">ثانوي</option>
                          <option value="غير متعلم">غير متعلم</option>
                          <option value="دبلوم">دبلوم</option>
                          <option value="بكالوريوس">بكالوريوس</option>
                          <option value="ماجستير">ماجستير</option>
                          <option value="دكتوراه">دكتوراه</option>
                        </select>
                      </div>

                      {!isBasicEducation() && (
                        <>
                          <div className="form-group col-4">
                            <label>التخصص</label>
                            <input
                              type="text"
                              value={formData.specialization}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  specialization: e.target.value,
                                })
                              }
                            />
                          </div>

                          <div className="form-group col-2">
                            <label>سنة التخرج</label>
                            <input
                              type="number"
                              min="1950"
                              max={new Date().getFullYear() + 5}
                              value={formData.graduation_year}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  graduation_year: e.target.value,
                                })
                              }
                              placeholder="مثال: 2020"
                            />
                          </div>

                          <div className="form-group col-2">
                            <label>المعدل الجامعي</label>
                            <input
                              type="text"
                              value={formData.university_gpa}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  university_gpa: e.target.value,
                                })
                              }
                              placeholder="مثال: 4.5 أو ممتاز"
                            />
                          </div>
                        </>
                      )}
                      {/* ========== القسم الثالث: الراتب والبدلات ========== */}
                      <h3 className="col-12 ef-section">القسم الثالث: الراتب والبدلات</h3>

                      <div className="form-group col-3">
                        <label>الراتب الأساسي</label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.base_salary}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              base_salary: e.target.value,
                            })
                          }
                          placeholder="0.00"
                        />
                      </div>

                      <div className="form-group col-3">
                        <label>بدل السكن</label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.housing_allowance}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              housing_allowance: e.target.value,
                            })
                          }
                          placeholder="0.00"
                        />
                      </div>

                      <div className="form-group col-3">
                        <label>بدل النقل</label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.transportation_allowance}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              transportation_allowance: e.target.value,
                            })
                          }
                          placeholder="0.00"
                        />
                      </div>

                      <div className="form-group col-3">
                        <label>بدل نهاية الخدمة</label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.end_of_service_allowance}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              end_of_service_allowance: e.target.value,
                            })
                          }
                          placeholder="0.00"
                        />
                      </div>

                      <div className="form-group col-3">
                        <label>بدل الإجازة السنوية</label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.annual_leave_allowance}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              annual_leave_allowance: e.target.value,
                            })
                          }
                          placeholder="0.00"
                        />
                      </div>

                      <div className="form-group col-3">
                        <label>بدلات أخرى</label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.other_allowances}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              other_allowances: e.target.value,
                            })
                          }
                          placeholder="0.00"
                        />
                      </div>


                      {/* ========== القسم الرابع: المستندات ========== */}
                      <h3 className="col-12 ef-section">القسم الرابع: المستندات</h3>

                      <div className="documents-section col-12">
                        {/* Common documents for all types */}
                        <div className="form-group col-3">
                          <label>الهوية/الإقامة</label>
                          {renderExistingDocumentsWarning("id_or_residency")}
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) =>
                              handleDocumentChange("id_or_residency", e)
                            }
                          />
                          {documents.id_or_residency && (
                            <div
                              style={{
                                marginTop: "6px",
                                padding: "6px 8px",
                                background: "var(--success-soft)",
                                border: "1px solid #28a745",
                                borderRadius: "4px",
                                fontSize: "11px",
                              }}
                            >
                              <strong>✓ سيتم رفع:</strong>{" "}
                              {documents.id_or_residency.name}
                            </div>
                          )}
                        </div>
                        <div className="form-group col-3">
                          <label>خطاب مباشرة</label>
                          {renderExistingDocumentsWarning("direct_letter")}
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) =>
                              handleDocumentChange("direct_letter", e)
                            }
                          />
                          {renderNewFileIndicator(documents.direct_letter)}
                        </div>
                        <div className="form-group col-3">
                          <label>مستند الآيبان</label>
                          {renderExistingDocumentsWarning("bank_iban")}
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => handleDocumentChange("bank_iban", e)}
                          />
                          {renderNewFileIndicator(documents.bank_iban)}
                        </div>
                        {requiresPrimaryQualificationDoc() && (
                          <div className="form-group col-3">
                            <label>المؤهل الأساسي</label>
                            {renderExistingDocumentsWarning(
                              "primary_qualification",
                            )}
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) =>
                                handleDocumentChange("primary_qualification", e)
                              }
                            />
                            {renderNewFileIndicator(
                              documents.primary_qualification,
                            )}
                          </div>
                        )}
                        <div className="form-group col-3">
                          <label>عقد العمل</label>
                          {renderExistingDocumentsWarning("employment_contract")}
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) =>
                              handleDocumentChange("employment_contract", e)
                            }
                          />
                          {renderNewFileIndicator(documents.employment_contract)}
                        </div>
                        {/* Medical disclosure form - optional */}
                        <div className="form-group col-3">
                          <label>نموذج افصاح طبي</label>
                          {renderExistingDocumentsWarning(
                            "medical_disclosure_form",
                          )}
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) =>
                              handleDocumentChange("medical_disclosure_form", e)
                            }
                          />
                          {renderNewFileIndicator(
                            documents.medical_disclosure_form,
                          )}
                        </div>
                        {/* Medical insurance - hide for paper contracts */}
                        {requiresMedicalInsuranceDoc() && (
                          <div className="form-group col-3">
                            <label>التأمين الطبي</label>
                            {renderExistingDocumentsWarning("medical_insurance")}
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) =>
                                handleDocumentChange("medical_insurance", e)
                              }
                            />
                            {renderNewFileIndicator(documents.medical_insurance)}
                          </div>
                        )}
                        {isNonSaudi(formData.nationality) && (
                          <div className="form-group col-3">
                            <label>جواز السفر</label>
                            {renderExistingDocumentsWarning("passport")}
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) =>
                                handleDocumentChange("passport", e)
                              }
                            />
                            {renderNewFileIndicator(documents.passport)}
                          </div>
                        )}

                        {/* School-specific documents */}
                        {isSchool(currentBranchType) && (
                          <>
                            <div className="form-group col-3">
                              <label>الترخيص المهني</label>
                              {renderExistingDocumentsWarning(
                                "professional_license",
                              )}
                              <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={(e) =>
                                  handleDocumentChange("professional_license", e)
                                }
                              />
                              {renderNewFileIndicator(
                                documents.professional_license,
                              )}
                            </div>
                            {/* Experience certificate - only for managers/supervisors */}
                            {requiresExperienceCertificate(
                              formData.job_title,
                              currentBranchType,
                            ) && (
                                <div className="form-group col-3">
                                  <label>
                                    شهادة الخبرة (يمكن إضافة حتى 5 ملفات)
                                  </label>
                                  {existingDocuments.experience_certificate &&
                                    existingDocuments.experience_certificate
                                      .length > 0 && (
                                      <div
                                        style={{
                                          marginBottom: "12px",
                                          padding: "12px 14px",
                                          background: "var(--primary-soft)",
                                          border: "1px solid #b3d9ff",
                                          borderRadius: "8px",
                                          fontSize: "13px",
                                          boxShadow: "0 1px 3px var(--border)",
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontWeight: "600",
                                            marginBottom: "8px",
                                            color: "var(--primary-dark)",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "6px",
                                          }}
                                        >
                                          <span></span>
                                          <span>
                                            يوجد{" "}
                                            {
                                              existingDocuments
                                                .experience_certificate.length
                                            }{" "}
                                            مستند مرفوع مسبقاً
                                          </span>
                                        </div>
                                        {existingDocuments.experience_certificate.map(
                                          (doc, idx) => (
                                            <div
                                              key={doc.id || idx}
                                              style={{
                                                marginTop: "6px",
                                                padding: "8px 10px",
                                                background: "var(--surface)",
                                                borderRadius: "6px",
                                                border: "1px solid #d1ecf1",
                                                fontSize: "12px",
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: "4px",
                                              }}
                                            >
                                              <div
                                                style={{
                                                  fontWeight: "500",
                                                  color: "var(--text)",
                                                }}
                                              >
                                                {" "}
                                                {doc.filename ||
                                                  doc.file_name ||
                                                  "مستند"}
                                              </div>
                                              {doc.uploaded_at && (
                                                <span
                                                  style={{
                                                    fontSize: "11px",
                                                    color: "var(--text-muted)",
                                                  }}
                                                >
                                                  تم الرفع:{" "}
                                                  {formatDate(doc.uploaded_at)}
                                                </span>
                                              )}
                                            </div>
                                          ),
                                        )}
                                        <div
                                          style={{
                                            marginTop: "8px",
                                            fontSize: "12px",
                                            color: "var(--primary-dark)",
                                            fontStyle: "italic",
                                          }}
                                        >
                                          إضافة ملفات جديدة لن تؤثر على الملفات
                                          الموجودة (يمكن إضافة حتى 5 ملفات)
                                        </div>
                                      </div>
                                    )}
                                  {documents.experience_certificate &&
                                    Array.isArray(
                                      documents.experience_certificate,
                                    ) &&
                                    documents.experience_certificate.map(
                                      (file, idx) => (
                                        <div
                                          key={idx}
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            fontSize: "12px",
                                            background: "var(--gray-100)",
                                            padding: "4px 8px",
                                            borderRadius: "4px",
                                            marginBottom: "4px",
                                          }}
                                        >
                                          <span
                                            style={{
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                              whiteSpace: "nowrap",
                                              maxWidth: "85%",
                                            }}
                                          >
                                            {file.name}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              removeDocument(
                                                "experience_certificate",
                                                idx,
                                              )
                                            }
                                            style={{
                                              color: "var(--danger)",
                                              border: "none",
                                              background: "none",
                                              cursor: "pointer",
                                              fontWeight: "bold",
                                            }}
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      ),
                                    )}
                                  {(!documents.experience_certificate ||
                                    documents.experience_certificate.length <
                                    5) && (
                                      <input
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        onChange={(e) => {
                                          if (e.target.files[0]) {
                                            handleDocumentChange(
                                              "experience_certificate",
                                              e.target.files[0],
                                            );
                                            e.target.value = "";
                                          }
                                        }}
                                      />
                                    )}
                                </div>
                              )}
                            <div className="form-group col-3">
                              <label>
                                الدورات الإضافية (يمكن إضافة حتى 5 ملفات)
                              </label>
                              {existingDocuments.additional_courses &&
                                existingDocuments.additional_courses.length >
                                0 && (
                                  <div
                                    style={{
                                      marginBottom: "12px",
                                      padding: "12px 14px",
                                      background: "var(--primary-soft)",
                                      border: "1px solid #b3d9ff",
                                      borderRadius: "8px",
                                      fontSize: "13px",
                                      boxShadow: "0 1px 3px var(--border)",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontWeight: "600",
                                        marginBottom: "8px",
                                        color: "var(--primary-dark)",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px",
                                      }}
                                    >
                                      <span></span>
                                      <span>
                                        يوجد{" "}
                                        {
                                          existingDocuments.additional_courses
                                            .length
                                        }{" "}
                                        مستند مرفوع مسبقاً
                                      </span>
                                    </div>
                                    {existingDocuments.additional_courses.map(
                                      (doc, idx) => (
                                        <div
                                          key={doc.id || idx}
                                          style={{
                                            marginTop: "6px",
                                            padding: "8px 10px",
                                            background: "var(--surface)",
                                            borderRadius: "6px",
                                            border: "1px solid #d1ecf1",
                                            fontSize: "12px",
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "4px",
                                          }}
                                        >
                                          <div
                                            style={{
                                              fontWeight: "500",
                                              color: "var(--text)",
                                            }}
                                          >
                                            {" "}
                                            {doc.filename ||
                                              doc.file_name ||
                                              "مستند"}
                                          </div>
                                          {doc.uploaded_at && (
                                            <span
                                              style={{
                                                fontSize: "11px",
                                                color: "var(--text-muted)",
                                              }}
                                            >
                                              تم الرفع:{" "}
                                              {formatDate(doc.uploaded_at)}
                                            </span>
                                          )}
                                        </div>
                                      ),
                                    )}
                                    <div
                                      style={{
                                        marginTop: "8px",
                                        fontSize: "12px",
                                        color: "var(--primary-dark)",
                                        fontStyle: "italic",
                                      }}
                                    >
                                      إضافة ملفات جديدة لن تؤثر على الملفات
                                      الموجودة (يمكن إضافة حتى 5 ملفات)
                                    </div>
                                  </div>
                                )}
                              {documents.additional_courses &&
                                Array.isArray(documents.additional_courses) &&
                                documents.additional_courses.map((file, idx) => (
                                  <div
                                    key={idx}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      fontSize: "12px",
                                      background: "var(--gray-100)",
                                      padding: "4px 8px",
                                      borderRadius: "4px",
                                      marginBottom: "4px",
                                    }}
                                  >
                                    <span
                                      style={{
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        maxWidth: "85%",
                                      }}
                                    >
                                      {file.name}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeDocument("additional_courses", idx)
                                      }
                                      style={{
                                        color: "var(--danger)",
                                        border: "none",
                                        background: "none",
                                        cursor: "pointer",
                                        fontWeight: "bold",
                                      }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                              {(!documents.additional_courses ||
                                documents.additional_courses.length < 5) && (
                                  <input
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) => {
                                      if (e.target.files[0]) {
                                        handleDocumentChange(
                                          "additional_courses",
                                          e.target.files[0],
                                        );
                                        e.target.value = "";
                                      }
                                    }}
                                  />
                                )}
                            </div>
                          </>
                        )}

                        {isHealthcareCenter(currentBranchType) && (
                          <>
                            {/* Classification certificate - only for specific job titles */}
                            {requiresClassificationDocument(
                              formData.job_title,
                            ) && (
                                <div className="form-group col-3">
                                  <label>شهادة التصنيف</label>
                                  {renderExistingDocumentsWarning("classification")}
                                  <input
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) =>
                                      handleDocumentChange("classification", e)
                                    }
                                  />
                                  {renderNewFileIndicator(documents.classification)}
                                </div>
                              )}
                            {/* Experience certificate - only for managers/supervisors */}
                            {requiresExperienceCertificateDocument(
                              formData.job_title,
                              currentBranchType,
                            ) && (
                                <div className="form-group col-3">
                                  <label>
                                    شهادة الخبرة (يمكن إضافة حتى 5 ملفات)
                                  </label>
                                  {existingDocuments.experience_certificate &&
                                    existingDocuments.experience_certificate
                                      .length > 0 && (
                                      <div
                                        style={{
                                          marginBottom: "12px",
                                          padding: "12px 14px",
                                          background: "var(--primary-soft)",
                                          border: "1px solid #b3d9ff",
                                          borderRadius: "8px",
                                          fontSize: "13px",
                                          boxShadow: "0 1px 3px var(--border)",
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontWeight: "600",
                                            marginBottom: "8px",
                                            color: "var(--primary-dark)",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "6px",
                                          }}
                                        >
                                          <span></span>
                                          <span>
                                            يوجد{" "}
                                            {
                                              existingDocuments
                                                .experience_certificate.length
                                            }{" "}
                                            مستند مرفوع مسبقاً
                                          </span>
                                        </div>
                                        {existingDocuments.experience_certificate.map(
                                          (doc, idx) => (
                                            <div
                                              key={doc.id || idx}
                                              style={{
                                                marginTop: "6px",
                                                padding: "8px 10px",
                                                background: "var(--surface)",
                                                borderRadius: "6px",
                                                border: "1px solid #d1ecf1",
                                                fontSize: "12px",
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: "4px",
                                              }}
                                            >
                                              <div
                                                style={{
                                                  fontWeight: "500",
                                                  color: "var(--text)",
                                                }}
                                              >
                                                {" "}
                                                {doc.filename ||
                                                  doc.file_name ||
                                                  "مستند"}
                                              </div>
                                              {doc.uploaded_at && (
                                                <span
                                                  style={{
                                                    fontSize: "11px",
                                                    color: "var(--text-muted)",
                                                  }}
                                                >
                                                  تم الرفع:{" "}
                                                  {formatDate(doc.uploaded_at)}
                                                </span>
                                              )}
                                            </div>
                                          ),
                                        )}
                                        <div
                                          style={{
                                            marginTop: "8px",
                                            fontSize: "12px",
                                            color: "var(--primary-dark)",
                                            fontStyle: "italic",
                                          }}
                                        >
                                          إضافة ملفات جديدة لن تؤثر على الملفات
                                          الموجودة (يمكن إضافة حتى 5 ملفات)
                                        </div>
                                      </div>
                                    )}
                                  {documents.experience_certificate &&
                                    Array.isArray(
                                      documents.experience_certificate,
                                    ) &&
                                    documents.experience_certificate.map(
                                      (file, idx) => (
                                        <div
                                          key={idx}
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            fontSize: "12px",
                                            background: "var(--gray-100)",
                                            padding: "4px 8px",
                                            borderRadius: "4px",
                                            marginBottom: "4px",
                                          }}
                                        >
                                          <span
                                            style={{
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                              whiteSpace: "nowrap",
                                              maxWidth: "85%",
                                            }}
                                          >
                                            {file.name}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              removeDocument(
                                                "experience_certificate",
                                                idx,
                                              )
                                            }
                                            style={{
                                              color: "var(--danger)",
                                              border: "none",
                                              background: "none",
                                              cursor: "pointer",
                                              fontWeight: "bold",
                                            }}
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      ),
                                    )}
                                  {(!documents.experience_certificate ||
                                    documents.experience_certificate.length <
                                    5) && (
                                      <input
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        onChange={(e) => {
                                          if (e.target.files[0]) {
                                            handleDocumentChange(
                                              "experience_certificate",
                                              e.target.files[0],
                                            );
                                            e.target.value = "";
                                          }
                                        }}
                                      />
                                    )}
                                </div>
                              )}
                            {/* Speech therapy course - only for speech therapists */}
                            {formData.job_title === "النطق و التخاطب" && (
                              <>
                                <div className="form-group col-3">
                                  <label>دورة علاج النطق</label>
                                  {renderExistingDocumentsWarning(
                                    "speech_therapy_course",
                                  )}
                                  <input
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) =>
                                      handleDocumentChange(
                                        "speech_therapy_course",
                                        e,
                                      )
                                    }
                                  />
                                  {renderNewFileIndicator(
                                    documents.speech_therapy_course,
                                  )}
                                </div>
                                {/* 70 hours speech therapy course - required for speech therapists */}
                                <div className="form-group col-3">
                                  <label>دورة 70 ساعة في التخاطب</label>
                                  {renderExistingDocumentsWarning(
                                    "speech_therapy_70_hours_course",
                                  )}
                                  <input
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) =>
                                      handleDocumentChange(
                                        "speech_therapy_70_hours_course",
                                        e,
                                      )
                                    }
                                  />
                                  {renderNewFileIndicator(
                                    documents.speech_therapy_70_hours_course,
                                  )}
                                </div>
                              </>
                            )}
                            {/* Physical therapy course - only for physical/occupational therapists */}
                            {(formData.job_title === "علاج طبيعي" ||
                              formData.job_title === "علاج وظيفي") && (
                                <div className="form-group col-3">
                                  <label>دورة العلاج الطبيعي</label>
                                  {renderExistingDocumentsWarning(
                                    "physical_therapy_course",
                                  )}
                                  <input
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) =>
                                      handleDocumentChange(
                                        "physical_therapy_course",
                                        e,
                                      )
                                    }
                                  />
                                  {renderNewFileIndicator(
                                    documents.physical_therapy_course,
                                  )}
                                </div>
                              )}
                            {/* 40 hours therapy course - optional */}
                            {requiresTherapy40HoursDocument(
                              formData.job_title,
                            ) && (
                                <div className="form-group col-3">
                                  <label>دورة 40 ساعة</label>
                                  {renderExistingDocumentsWarning(
                                    "therapy_40_hours_course",
                                  )}
                                  <input
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) =>
                                      handleDocumentChange(
                                        "therapy_40_hours_course",
                                        e,
                                      )
                                    }
                                  />
                                  {renderNewFileIndicator(
                                    documents.therapy_40_hours_course,
                                  )}
                                </div>
                              )}
                            <div className="form-group col-3">
                              <label>
                                الدورات الإضافية (يمكن إضافة حتى 5 ملفات)
                              </label>
                              {existingDocuments.additional_courses &&
                                existingDocuments.additional_courses.length >
                                0 && (
                                  <div
                                    style={{
                                      marginBottom: "12px",
                                      padding: "12px 14px",
                                      background: "var(--primary-soft)",
                                      border: "1px solid #b3d9ff",
                                      borderRadius: "8px",
                                      fontSize: "13px",
                                      boxShadow: "0 1px 3px var(--border)",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontWeight: "600",
                                        marginBottom: "8px",
                                        color: "var(--primary-dark)",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px",
                                      }}
                                    >
                                      <span></span>
                                      <span>
                                        يوجد{" "}
                                        {
                                          existingDocuments.additional_courses
                                            .length
                                        }{" "}
                                        مستند مرفوع مسبقاً
                                      </span>
                                    </div>
                                    {existingDocuments.additional_courses.map(
                                      (doc, idx) => (
                                        <div
                                          key={doc.id || idx}
                                          style={{
                                            marginTop: "6px",
                                            padding: "8px 10px",
                                            background: "var(--surface)",
                                            borderRadius: "6px",
                                            border: "1px solid #d1ecf1",
                                            fontSize: "12px",
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "4px",
                                          }}
                                        >
                                          <div
                                            style={{
                                              fontWeight: "500",
                                              color: "var(--text)",
                                            }}
                                          >
                                            {" "}
                                            {doc.filename ||
                                              doc.file_name ||
                                              "مستند"}
                                          </div>
                                          {doc.uploaded_at && (
                                            <span
                                              style={{
                                                fontSize: "11px",
                                                color: "var(--text-muted)",
                                              }}
                                            >
                                              تم الرفع:{" "}
                                              {formatDate(doc.uploaded_at)}
                                            </span>
                                          )}
                                        </div>
                                      ),
                                    )}
                                    <div
                                      style={{
                                        marginTop: "8px",
                                        fontSize: "12px",
                                        color: "var(--primary-dark)",
                                        fontStyle: "italic",
                                      }}
                                    >
                                      إضافة ملفات جديدة لن تؤثر على الملفات
                                      الموجودة (يمكن إضافة حتى 5 ملفات)
                                    </div>
                                  </div>
                                )}
                              {documents.additional_courses &&
                                Array.isArray(documents.additional_courses) &&
                                documents.additional_courses.map((file, idx) => (
                                  <div
                                    key={idx}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      fontSize: "12px",
                                      background: "var(--gray-100)",
                                      padding: "4px 8px",
                                      borderRadius: "4px",
                                      marginBottom: "4px",
                                    }}
                                  >
                                    <span
                                      style={{
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        maxWidth: "85%",
                                      }}
                                    >
                                      {file.name}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeDocument("additional_courses", idx)
                                      }
                                      style={{
                                        color: "var(--danger)",
                                        border: "none",
                                        background: "none",
                                        cursor: "pointer",
                                        fontWeight: "bold",
                                      }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                              {(!documents.additional_courses ||
                                documents.additional_courses.length < 5) && (
                                  <input
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) => {
                                      if (e.target.files[0]) {
                                        handleDocumentChange(
                                          "additional_courses",
                                          e.target.files[0],
                                        );
                                        e.target.value = "";
                                      }
                                    }}
                                  />
                                )}
                            </div>
                          </>
                        )}
                      </div>

                      <div className="form-actions ef-actions">
                        <Button
                          type="submit"
                          variant="primary"
                          size="lg"
                          icon="check"
                          loading={saving || uploadingDocuments}
                          disabled={!formData.nationality}
                        >
                          {saving ? "جاري الحفظ..." : uploadingDocuments ? "جاري رفع الملفات..." : editingEmployee ? "تحديث الموظف" : "حفظ الموظف"}
                        </Button>
                        <Button
                          variant="secondary"
                          size="lg"
                          disabled={saving || uploadingDocuments}
                          onClick={() => {
                setShowForm(false);
                resetForm();
                setEditingEmployee(null);
              }}
                        >
                          إلغاء
                        </Button>
                      </div>
                    </>
                  )}

                  {/* Loading Overlay */}
                  {(saving || uploadingDocuments) && (
                    <div className="ef-busy" role="status" aria-live="polite">
                      <Spinner size={40} />
                      <strong>{saving ? "جاري حفظ البيانات..." : "جاري رفع الملفات..."}</strong>
                      <span>الرجاء الانتظار ولا تغلق الصفحة</span>
                    </div>
                  )}
                </form>
              )}
          </div>
        </div>
      )}

    </div>
  );
};

// Memoize the component to prevent unnecessary re-renders
// This significantly improves performance when parent components re-render
export default memo(Employees);
