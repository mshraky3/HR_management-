/**
 * Employees Page
 * Manage employees
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { employeesAPI, branchesAPI, documentsAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import HijriDatePicker from '../components/HijriDatePicker';
import NameInput from '../components/NameInput';
import NationalitySelect from '../components/NationalitySelect';
import ReligionSelect from '../components/ReligionSelect';
import MaritalStatusSelect from '../components/MaritalStatusSelect';
import BankSelect from '../components/BankSelect';
import {
  isSaudi as isSaudiHelper,
  isNonSaudi,
  getIdTypeFromNationality,
  getDateOfBirthCalendarType,
  getIdExpiryCalendarType,
  isSchool,
  isHealthcareCenter,
  requiresClassification,
  requiresExperienceCertificate,
  requiresSpeechTherapy70Hours,
  requiresTherapy40Hours,
  requiresPassport,
  requiresProfessionalLicense,
  requiresClassificationDocument,
  requiresExperienceCertificateDocument,
  requiresSpeechTherapy70HoursDocument,
  requiresTherapy40HoursDocument,
  requiresPassportNumber,
  requiresIdExpiryDate,
  requiresDateOfBirthHijri,
  requiresDateOfBirthGregorian,
  validateDocumentType
} from '../utils/employeeHelpers';
import { 
  SCHOOL_JOB_TITLES, 
  HEALTHCARE_JOB_TITLES,
  getJobTitlesByBranchType 
} from '../utils/employeeConstants';
import './TablePage.css';

const Employees = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isMainManager, user } = useAuth();
  const { showError, showSuccess, showWarning, showInfo } = useNotification();
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingDocuments, setUploadingDocuments] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [formStep, setFormStep] = useState(1); // 1: branch type selection, 2: employee form
  const [selectedBranchType, setSelectedBranchType] = useState(null); // 'healthcare_center' or 'school'
  const [filterIncomplete, setFilterIncomplete] = useState(false); // Filter for incomplete employees
  const [searchFilters, setSearchFilters] = useState({
    search_name: '',
    search_id: '',
    search_phone: '',
    search_branch: ''
  });
  
  // Refs to maintain focus on search inputs
  const searchNameRef = useRef(null);
  const searchIdRef = useRef(null);
  const searchPhoneRef = useRef(null);
  
  // Ref to track which input was focused before update
  const focusedInputRef = useRef(null);
  const [formData, setFormData] = useState({
    employee_id_number: '',
    branch_id: user?.branch_id || '',
    first_name: '',
    second_name: '',
    third_name: '',
    fourth_name: '',
    occupation: '',
    nationality: '',
    date_of_birth_hijri: '',
    date_of_birth_gregorian: '',
    id_or_residency_number: '',
    id_type: 'citizen',
    gender: 'male',
    id_expiry_date_hijri: '',
    id_expiry_date_gregorian: '',
    religion: '',
    marital_status: '',
    status: 'active',
    educational_qualification: '',
    specialization: '',
    bank_iban: '',
    bank_name: '',
    email: '',
    phone_number: '',
    national_address: '',
    contract_type: '',
    salary: '',
    base_salary: '',
    housing_allowance: '',
    transportation_allowance: '',
    end_of_service_allowance: '',
    annual_leave_allowance: '',
    other_allowances: '',
    deductions: '',
    years_of_experience_in_same_institution: '',
    graduation_year: '',
    university_gpa: '',
    passport_number: '',
    passport_issue_date: '',
    passport_expiry_date: '',
    passport_issue_place: '',
    residency_issue_date: '',
    job_title: '',
  });
  
  const [dateOfBirthCalendarType, setDateOfBirthCalendarType] = useState(null);
  const [idExpiryCalendarType, setIdExpiryCalendarType] = useState(null);
  
  // Document uploads state
  const [documents, setDocuments] = useState({
    id_or_residency: null,
    direct_letter: null,
    bank_iban: null,
    primary_qualification: null,
    employment_contract: null,
    additional_courses: null,
    passport: null,
    professional_license: null,
    experience_certificate: null,
    classification: null,
    speech_therapy_course: null,
    physical_therapy_course: null,
    medical_disclosure_form: null,
    speech_therapy_70_hours_course: null,
    therapy_40_hours_course: null,
  });

  useEffect(() => {
    loadBranches();
    
    // Check if we need to edit an employee from location state
    if (location.state?.editEmployeeId) {
      const editId = location.state.editEmployeeId;
      // Find the employee and open edit form
      employeesAPI.getById(editId).then(response => {
        if (response.data.success) {
          handleEdit(response.data.data);
        }
      }).catch(error => {
        console.error('Error loading employee for edit:', error);
      });
      // Clear the state
      window.history.replaceState({}, document.title);
    }
  }, []);

  useEffect(() => {
    // Check URL params for filter on mount
    const statusFilter = searchParams.get('data_completion_status');
    if (statusFilter === 'incomplete' && !filterIncomplete) {
      setFilterIncomplete(true);
    }
  }, [searchParams]);

  useEffect(() => {
    loadEmployees();
  }, [filterIncomplete]);

  // Debounced search effect - wait for user to stop typing
  useEffect(() => {
    // Store which input had focus before the update
    const activeElement = document.activeElement;
    if (activeElement === searchNameRef.current) {
      focusedInputRef.current = 'name';
    } else if (activeElement === searchIdRef.current) {
      focusedInputRef.current = 'id';
    } else if (activeElement === searchPhoneRef.current) {
      focusedInputRef.current = 'phone';
    }
    
    const timeoutId = setTimeout(async () => {
      await loadEmployees();
      
      // Restore focus after loading completes
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          let inputToFocus = null;
          
          if (focusedInputRef.current === 'name' && searchNameRef.current) {
            inputToFocus = searchNameRef.current;
          } else if (focusedInputRef.current === 'id' && searchIdRef.current) {
            inputToFocus = searchIdRef.current;
          } else if (focusedInputRef.current === 'phone' && searchPhoneRef.current) {
            inputToFocus = searchPhoneRef.current;
          }
          
          if (inputToFocus) {
            inputToFocus.focus();
            // Move cursor to end of input
            const length = inputToFocus.value.length;
            inputToFocus.setSelectionRange(length, length);
          }
        });
      });
    }, 500); // Wait 500ms after user stops typing

    return () => clearTimeout(timeoutId);
  }, [searchFilters.search_name, searchFilters.search_id, searchFilters.search_phone]);

  // Immediate effect for branch filter (no debounce needed for select dropdown)
  useEffect(() => {
    if (isMainManager()) {
      loadEmployees();
    }
  }, [searchFilters.search_branch]);

  const loadBranches = async () => {
    try {
      const response = await branchesAPI.getAll({ is_active: true });
      if (response.data.success) {
        setBranches(response.data.data);
      }
    } catch (error) {
      console.error('Error loading branches:', error);
    }
  };

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const filters = { is_active: true };
      
      // Only show active or pending employees (archived employees should only appear in archive)
      // We'll filter by status on the frontend, but also add it to backend filter for efficiency
      
      // Branch managers only see their branch employees
      if (!isMainManager() && user?.branch_id) {
        filters.branch_id = user.branch_id;
      }
      
      // Filter incomplete employees if requested
      if (filterIncomplete) {
        filters.data_completion_status = 'incomplete';
      }
      
      // Add search filters (only for main manager)
      if (isMainManager()) {
        if (searchFilters.search_name.trim()) {
          filters.search_name = searchFilters.search_name.trim();
        }
        if (searchFilters.search_id.trim()) {
          filters.search_id = searchFilters.search_id.trim();
        }
        if (searchFilters.search_phone.trim()) {
          filters.search_phone = searchFilters.search_phone.trim();
        }
        if (searchFilters.search_branch) {
          filters.branch_id = parseInt(searchFilters.search_branch);
        }
      }
      
      const response = await employeesAPI.getAll(filters);
      if (response.data.success) {
        // Filter out archived employees (only show active or pending)
        const filteredEmployees = response.data.data.filter(emp => 
          !emp.status || emp.status === 'active' || emp.status === 'pending'
        );
        setEmployees(filteredEmployees);
      }
    } catch (error) {
      console.error('Error loading employees:', error);
      showError('فشل تحميل الموظفين');
    } finally {
      setLoading(false);
    }
  };

  // Check if nationality is Saudi (using centralized helper)
  const isSaudi = () => {
    return isSaudiHelper(formData.nationality);
  };

  // Handle nationality change - auto-set ID type and calendar types
  const handleNationalityChange = (nationality) => {
    const isSaudiNationality = isSaudiHelper(nationality);
    
    setFormData(prev => {
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
      setFormData(prev => ({
        ...prev,
        date_of_birth_gregorian: '',
        id_expiry_date_gregorian: ''
      }));
    } else {
      // Non-Saudi: Clear Hijri dates
      setFormData(prev => ({
        ...prev,
        date_of_birth_hijri: '',
        id_expiry_date_hijri: ''
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Set saving state at the start
    setSaving(true);
    
    // Validate nationality is selected first
    if (!formData.nationality) {
      showWarning('الرجاء اختيار الجنسية أولاً');
      setSaving(false);
      return;
    }
    
    // For branch managers, auto-detect branch type from their branch
    let currentBranchType = selectedBranchType;
    if (!isMainManager() && user?.branch_id && !selectedBranchType) {
      const userBranch = branches.find(b => b.id === user.branch_id);
      if (userBranch) {
        currentBranchType = userBranch.branch_type;
        setSelectedBranchType(userBranch.branch_type);
      }
    }
    
    // Only require branch type selection for main managers
    if (isMainManager() && !currentBranchType && !editingEmployee) {
      showWarning('الرجاء اختيار نوع الفرع أولاً');
      return;
    }
    
    // Validate that all 4 names are provided (REQUIRED)
    if (!formData.first_name || !formData.second_name || !formData.third_name || !formData.fourth_name) {
      showWarning('الرجاء إدخال جميع الأسماء الأربعة');
      return;
    }
    
    // Validate id_or_residency_number is provided (REQUIRED)
    if (!formData.id_or_residency_number || formData.id_or_residency_number.trim() === '') {
      showWarning('الرجاء إدخال رقم الهوية أو الإقامة');
      return;
    }
    
    // Validate nationality is provided (REQUIRED)
    if (!formData.nationality || formData.nationality.trim() === '') {
      showWarning('الرجاء إدخال الجنسية');
      return;
    }
    
    // Validate calendar type matches nationality (only if date is provided)
    const isSaudiNationality = isSaudi();
    if (dateOfBirthCalendarType) {
      if (isSaudiNationality && dateOfBirthCalendarType !== 'hijri') {
        showWarning('السعوديون يجب أن يستخدموا التقويم الهجري فقط');
        return;
      }
      if (!isSaudiNationality && dateOfBirthCalendarType !== 'gregorian') {
        showWarning('غير السعوديين يجب أن يستخدموا التقويم الميلادي فقط');
        return;
      }
    }
    
    // Validate ID expiry calendar type matches nationality (only for non-Saudis and if date is provided)
    if (!isSaudiNationality && idExpiryCalendarType && (formData.id_expiry_date_hijri || formData.id_expiry_date_gregorian)) {
      if (idExpiryCalendarType !== 'gregorian') {
        showWarning('تاريخ انتهاء الإقامة لغير السعوديين يجب أن يكون ميلادياً');
        return;
      }
    }
    
    // NOTE: All document validations removed - documents are now optional
    // The system will track incomplete employees and show them in Dashboard
    
    // Validate bank name and IBAN are both provided if one is provided
    if (formData.bank_iban || formData.bank_name) {
      if (formData.bank_iban && !formData.bank_name) {
        showWarning('الرجاء اختيار اسم البنك');
        return;
      }
      if (formData.bank_name && !formData.bank_iban) {
        showWarning('الرجاء إدخال رقم الآيبان البنكي');
        return;
      }
    }
    
    // Validate only truly required fields (name, ID, nationality, contact info, bank info, national address)
    // All other fields are optional and will be tracked for completion status
    const requiredFields = {
      'first_name': 'الاسم الأول',
      'second_name': 'الاسم الثاني',
      'third_name': 'الاسم الثالث',
      'fourth_name': 'الاسم الرابع',
      'id_or_residency_number': 'رقم الهوية أو الإقامة',
      'nationality': 'الجنسية',
      'email': 'البريد الإلكتروني',
      'phone_number': 'رقم الهاتف',
      'bank_name': 'اسم البنك',
      'bank_iban': 'رقم الآيبان البنكي',
      'national_address': 'العنوان الوطني الموحد'
    };
    
    // Check required fields
    for (const [field, label] of Object.entries(requiredFields)) {
      if (!formData[field] || formData[field].toString().trim() === '') {
        showWarning(`الحقل "${label}" مطلوب`);
        return;
      }
    }
    
    // Validate database-required fields that have defaults but can be empty
    if (!formData.gender || formData.gender.trim() === '') {
      showWarning('الرجاء اختيار الجنس');
      return;
    }
    
    if (!formData.id_type || formData.id_type.trim() === '') {
      showWarning('الرجاء اختيار نوع الهوية');
      return;
    }
    
    // Occupation is required by database - use job_title if available, otherwise require it
    if (!formData.occupation || formData.occupation.trim() === '') {
      if (formData.job_title && formData.job_title.trim() !== '') {
        // Use job_title as occupation if occupation is empty
        formData.occupation = formData.job_title;
      } else {
        showWarning('الرجاء إدخال المهنة أو اختيار المسمى الوظيفي');
        return;
      }
    }
    
    // For branch managers, ensure branch_id is set
    if (!isMainManager() && user?.branch_id) {
      formData.branch_id = user.branch_id;
    }
    
    // Validate branch_id is set
    if (!formData.branch_id) {
      showWarning('الرجاء اختيار الفرع');
      return;
    }
    
    // Validate field lengths
    const fieldLengths = {
      'first_name': { max: 100, label: 'الاسم الأول' },
      'second_name': { max: 100, label: 'الاسم الثاني' },
      'third_name': { max: 100, label: 'الاسم الثالث' },
      'fourth_name': { max: 100, label: 'الاسم الرابع' },
      'occupation': { max: 100, label: 'المهنة' },
      'nationality': { max: 100, label: 'الجنسية' },
      'religion': { max: 100, label: 'الدين' },
      'marital_status': { max: 50, label: 'الحالة الاجتماعية' },
      'educational_qualification': { max: 200, label: 'المؤهل التعليمي' },
      'specialization': { max: 200, label: 'التخصص' },
      'bank_name': { max: 200, label: 'اسم البنك' },
      'email': { max: 255, label: 'البريد الإلكتروني' },
      'phone_number': { max: 50, label: 'رقم الهاتف' },
      'national_address': { max: 8, label: 'العنوان الوطني الموحد (المختصر)' },
      'contract_type': { max: 100, label: 'نوع العقد' },
      'id_or_residency_number': { max: 100, label: 'رقم الهوية أو الإقامة' }
    };
    
    for (const [field, { max, label }] of Object.entries(fieldLengths)) {
      if (formData[field] && typeof formData[field] === 'string') {
        // Special validation for national_address - must be exactly 8 characters if provided
        if (field === 'national_address' && formData[field].trim() !== '' && formData[field].length !== 8) {
          showWarning(`الحقل "${label}" يجب أن يكون بالضبط 8 خانات`);
          return;
        }
        // General validation for other fields
        if (formData[field].length > max) {
          showWarning(`الحقل "${label}" أطول من المسموح (${max} حرف)`);
          return;
        }
      }
    }
    
    // Date of birth is now optional - no validation needed
    // If provided, it will be validated for format and calendar type above
    
    try {
      const data = { ...formData };
      
      // Remove empty strings and convert to null for optional fields (non-numeric)
      const optionalFields = [
        'date_of_birth_hijri', 'date_of_birth_gregorian',
        'id_expiry_date_hijri', 'id_expiry_date_gregorian',
        'religion', 'marital_status', 'educational_qualification', 'specialization',
        'bank_iban', 'bank_name', 'email', 'phone_number', 'national_address', 'contract_type',
        'graduation_year', 'university_gpa',
        'passport_number', 'passport_issue_date', 'passport_expiry_date', 'passport_issue_place', 'residency_issue_date',
        'job_title'
      ];
      
      optionalFields.forEach(field => {
        if (data[field] === '' || data[field] === null || data[field] === undefined) {
          delete data[field]; // Remove field instead of setting to null
        } else if (typeof data[field] === 'string' && data[field].trim() === '') {
          delete data[field];
        }
      });
      
      // Parse salary fields - set to 0 if empty instead of null
      const salaryFields = [
        'salary', 'base_salary', 'housing_allowance', 'transportation_allowance',
        'end_of_service_allowance', 'annual_leave_allowance', 'other_allowances',
        'deductions'
      ];
      
      salaryFields.forEach(field => {
        if (data[field] === '' || data[field] === null || data[field] === undefined) {
          data[field] = 0; // Set to 0 instead of deleting
        } else if (typeof data[field] === 'string' && data[field].trim() === '') {
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
      if (data.years_of_experience_in_same_institution === '' || data.years_of_experience_in_same_institution === null || data.years_of_experience_in_same_institution === undefined) {
        data.years_of_experience_in_same_institution = 0;
      } else if (typeof data.years_of_experience_in_same_institution === 'string' && data.years_of_experience_in_same_institution.trim() === '') {
        data.years_of_experience_in_same_institution = 0;
      } else {
        const value = parseInt(data.years_of_experience_in_same_institution);
        data.years_of_experience_in_same_institution = isNaN(value) ? 0 : value;
      }
      
      // Set employee_id_number automatically from id_or_residency_number (if not provided)
      if (!data.employee_id_number) {
        data.employee_id_number = data.id_or_residency_number;
      }
      
      // Ensure occupation is set (required by database)
      // Use job_title if occupation is empty
      if (!data.occupation || data.occupation.trim() === '') {
        if (data.job_title && data.job_title.trim() !== '') {
          data.occupation = data.job_title;
        } else {
          data.occupation = 'غير محدد'; // Fallback default
        }
      }
      
      // Ensure gender and id_type are set (required by database, should have defaults but double-check)
      if (!data.gender || data.gender.trim() === '') {
        data.gender = 'male'; // Default fallback
      }
      if (!data.id_type || data.id_type.trim() === '') {
        // Auto-set based on nationality if not set
        const isSaudiNationality = data.nationality === 'Saudi Arabia' || 
                                    data.nationality === 'المملكة العربية السعودية' ||
                                    data.nationality?.toLowerCase().includes('saudi') ||
                                    data.nationality?.toLowerCase().includes('سعودي');
        data.id_type = isSaudiNationality ? 'citizen' : 'resident';
      }
      
      // For branch managers, force branch_id to their branch (prevent manipulation)
      if (!isMainManager() && user?.branch_id) {
        data.branch_id = user.branch_id;
      }
      
      // Ensure only one date type is sent based on selected calendar type
      // Set to null instead of deleting to ensure backend receives the field
      if (dateOfBirthCalendarType === 'hijri') {
        data.date_of_birth_gregorian = null;
      } else if (dateOfBirthCalendarType === 'gregorian') {
        data.date_of_birth_hijri = null;
      }
      
      if (idExpiryCalendarType === 'hijri') {
        data.id_expiry_date_gregorian = null;
      } else if (idExpiryCalendarType === 'gregorian') {
        data.id_expiry_date_hijri = null;
      }
      
      // Convert remaining empty strings to null (don't delete required fields)
      Object.keys(data).forEach(key => {
        if (data[key] === '' || (typeof data[key] === 'string' && data[key].trim() === '')) {
          // Only convert optional fields to null, keep required fields
          if (optionalFields.includes(key)) {
            data[key] = null;
          }
        }
      });
      
      let employee;
      if (editingEmployee) {
        // Check if status changed (only for main manager)
        const originalStatus = editingEmployee.status || 'active';
        const newStatus = formData.status || 'active';
        const statusChanged = originalStatus !== newStatus;
        
        // Remove status from data - we'll handle status separately via updateStatus endpoint
        const statusToUpdate = data.status;
        delete data.status;
        
        await employeesAPI.update(editingEmployee.id, data);
        employee = { id: editingEmployee.id };
        
        // Update status separately if it changed (only for main manager)
        if (isMainManager() && statusToUpdate) {
          if (statusChanged) {
            // Status changed, update it
            try {
              await employeesAPI.updateStatus(editingEmployee.id, {
                status: statusToUpdate,
                reason: `تم تغيير الحالة من ${originalStatus} إلى ${newStatus}`
              });
            } catch (error) {
              console.error('Error updating employee status:', error);
              // Don't fail the whole update, just log the error
            }
          } else if (!editingEmployee.status && statusToUpdate !== 'active') {
            // Status was not set before, and user selected a non-default status
            try {
              await employeesAPI.updateStatus(editingEmployee.id, {
                status: statusToUpdate,
                reason: 'تحديد الحالة الأولي'
              });
            } catch (error) {
              console.error('Error updating employee status:', error);
            }
          }
        }
        
        // Upload documents if any were provided during edit
        // Filter out documents that are not allowed for this employee
        let currentBranchTypeForValidation = selectedBranchType;
        if (!currentBranchTypeForValidation && editingEmployee?.branch_id) {
          const employeeBranch = branches.find(b => b.id === editingEmployee.branch_id);
          if (employeeBranch) {
            currentBranchTypeForValidation = employeeBranch.branch_type;
          }
        }
        
        const documentEntries = Object.entries(documents).filter(([documentType, file]) => {
          if (!file) return false;
          
          // Validate document type before upload (silently filter out invalid ones)
          if (currentBranchTypeForValidation) {
            const validation = validateDocumentType(documentType, {
              nationality: data.nationality,
              job_title: data.job_title,
              branch_type: currentBranchTypeForValidation
            });
            
            // Only upload if allowed
            return validation.allowed;
          }
          
          return true; // If branch type unknown, allow (backward compatibility)
        });
        
        if (documentEntries.length > 0) {
          setUploadingDocuments(true);
          const uploadPromises = documentEntries.map(async ([documentType, file]) => {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('employee_id', editingEmployee.id);
            formData.append('document_type', documentType);
            
            try {
              await documentsAPI.upload(formData);
            } catch (error) {
              console.error(`Error uploading ${documentType}:`, error);
              // Continue with other uploads even if one fails
            }
          });
          
          await Promise.all(uploadPromises);
          setUploadingDocuments(false);
        }
        
        // Update completion status after documents are uploaded
        try {
          await employeesAPI.updateCompletionStatus(editingEmployee.id);
        } catch (error) {
          console.error('Error updating completion status:', error);
        }
      } else {
        // Create employee first
        const createResponse = await employeesAPI.create(data);
        employee = createResponse.data.data;
        
        // Upload documents if any were provided
        // Filter out documents that are not allowed for this employee
        let currentBranchTypeForValidation = selectedBranchType;
        if (!currentBranchTypeForValidation && employee?.branch_id) {
          const employeeBranch = branches.find(b => b.id === employee.branch_id);
          if (employeeBranch) {
            currentBranchTypeForValidation = employeeBranch.branch_type;
          }
        }
        
        const documentEntries = Object.entries(documents).filter(([documentType, file]) => {
          if (!file) return false;
          
          // Validate document type before upload (silently filter out invalid ones)
          if (currentBranchTypeForValidation) {
            const validation = validateDocumentType(documentType, {
              nationality: data.nationality,
              job_title: data.job_title,
              branch_type: currentBranchTypeForValidation
            });
            
            // Only upload if allowed
            return validation.allowed;
          }
          
          return true; // If branch type unknown, allow (backward compatibility)
        });
        
        if (documentEntries.length > 0) {
          setUploadingDocuments(true);
          const uploadPromises = documentEntries.map(async ([documentType, file]) => {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('employee_id', employee.id);
            formData.append('document_type', documentType);
            
            try {
              await documentsAPI.upload(formData);
            } catch (error) {
              console.error(`Error uploading ${documentType}:`, error);
              // Continue with other uploads even if one fails
            }
          });
          
          await Promise.all(uploadPromises);
          setUploadingDocuments(false);
        }
        
        // Update completion status after documents are uploaded
        try {
          await employeesAPI.updateCompletionStatus(employee.id);
        } catch (error) {
          console.error('Error updating completion status:', error);
        }
      }
      
      setShowForm(false);
      setEditingEmployee(null);
      resetForm();
      resetDocuments();
      loadEmployees();
      showSuccess(editingEmployee ? 'تم تحديث الموظف بنجاح' : 'تم إضافة الموظف بنجاح');
    } catch (error) {
      console.error('Error saving employee:', error);
      let errorMessage = 'فشل حفظ الموظف';
      
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      // Show clear error message
      showError(`❌ خطأ في حفظ الموظف\n\n${errorMessage}\n\nالرجاء التحقق من البيانات المدخلة والمحاولة مرة أخرى.`);
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
      additional_courses: null,
      passport: null,
      professional_license: null,
      experience_certificate: null,
      classification: null,
      speech_therapy_course: null,
      physical_therapy_course: null,
      medical_disclosure_form: null,
      speech_therapy_70_hours_course: null,
      therapy_40_hours_course: null,
    });
  };
  
  const handleDocumentChange = (documentType, file) => {
    // Silently validate document type before allowing upload
    // Don't show error messages - just prevent upload if not allowed
    if (file) {
      // Validate file size (1MB max)
      const maxSize = 1 * 1024 * 1024; // 1MB in bytes
      if (file.size > maxSize) {
        showWarning(`حجم الملف كبير جداً. الحد الأقصى لحجم الملف هو 1 ميجابايت.`);
        return;
      }
      
      // Get current branch type
      let branchTypeForValidation = selectedBranchType;
      if (!branchTypeForValidation && formData.branch_id) {
        const branch = branches.find(b => b.id === parseInt(formData.branch_id));
        if (branch) {
          branchTypeForValidation = branch.branch_type;
        }
      }
      if (!branchTypeForValidation && !isMainManager() && user?.branch_id) {
        const userBranch = branches.find(b => b.id === user.branch_id);
        if (userBranch) {
          branchTypeForValidation = userBranch.branch_type;
        }
      }
      
      if (branchTypeForValidation) {
        const validation = validateDocumentType(documentType, {
          nationality: formData.nationality,
          job_title: formData.job_title,
          branch_type: branchTypeForValidation
        });
        
        // Silently reject if not allowed (don't set the file)
        if (!validation.allowed) {
          return; // Don't set the file, effectively preventing upload
        }
      }
    }
    
    setDocuments(prev => ({
      ...prev,
      [documentType]: file
    }));
  };

  const handleEdit = (employee) => {
    setEditingEmployee(employee);
    const branch = branches.find(b => b.id === employee.branch_id);
    if (branch) {
      setSelectedBranchType(branch.branch_type);
    }
    
    const isSaudiEmployee = employee.nationality === 'Saudi Arabia' || 
                            employee.nationality === 'المملكة العربية السعودية' ||
                            employee.nationality?.toLowerCase().includes('saudi') ||
                            employee.nationality?.toLowerCase().includes('سعودي');
    
    setFormData({
      employee_id_number: '', // Will be auto-set from id_or_residency_number
      branch_id: employee.branch_id,
      first_name: employee.first_name,
      second_name: employee.second_name,
      third_name: employee.third_name,
      fourth_name: employee.fourth_name,
      occupation: employee.occupation,
      job_title: employee.job_title || '',
      nationality: employee.nationality,
      date_of_birth_hijri: employee.date_of_birth_hijri || '',
      date_of_birth_gregorian: employee.date_of_birth_gregorian || '',
      id_or_residency_number: employee.id_or_residency_number,
      id_type: employee.id_type,
      gender: employee.gender,
      id_expiry_date_hijri: employee.id_expiry_date_hijri || '',
      id_expiry_date_gregorian: employee.id_expiry_date_gregorian || '',
      religion: employee.religion || '',
      marital_status: employee.marital_status || '',
      educational_qualification: employee.educational_qualification || '',
      specialization: employee.specialization || '',
      bank_iban: employee.bank_iban || '',
      bank_name: employee.bank_name || '',
      email: employee.email || '',
      phone_number: employee.phone_number || '',
      national_address: employee.national_address || '',
      contract_type: employee.contract_type || '',
      salary: employee.salary || '',
      base_salary: employee.base_salary || '',
      housing_allowance: employee.housing_allowance || '',
      transportation_allowance: employee.transportation_allowance || '',
      end_of_service_allowance: employee.end_of_service_allowance || '',
      annual_leave_allowance: employee.annual_leave_allowance || '',
      other_allowances: employee.other_allowances || '',
      deductions: employee.deductions || '',
      years_of_experience_in_same_institution: employee.years_of_experience_in_same_institution || '',
      graduation_year: employee.graduation_year || '',
      university_gpa: employee.university_gpa || '',
      passport_number: employee.passport_number || '',
      passport_issue_date: employee.passport_issue_date || '',
      passport_expiry_date: employee.passport_expiry_date || '',
      passport_issue_place: employee.passport_issue_place || '',
      residency_issue_date: employee.residency_issue_date || '',
      status: employee.status || 'active',
    });
    
    // Set calendar types based on nationality (not existing data)
    if (isSaudiEmployee) {
      setDateOfBirthCalendarType('hijri');
      setIdExpiryCalendarType('hijri');
    } else {
      setDateOfBirthCalendarType('gregorian');
      setIdExpiryCalendarType('gregorian');
    }
    
    setFormStep(2); // Skip branch type selection when editing
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('هل أنت متأكد من رغبتك في إلغاء تفعيل هذا الموظف؟')) return;
    try {
      await employeesAPI.delete(id);
      loadEmployees();
    } catch (error) {
      showError('فشل حذف الموظف');
    }
  };

  const handleViewDetails = (employee) => {
    navigate(`/employees/${employee.id}`);
  };

  const resetForm = () => {
    // Auto-set branch_id and branch type for branch managers
    const defaultBranchId = (!isMainManager() && user?.branch_id) ? user.branch_id : '';
    let defaultBranchType = null;
    
    if (!isMainManager() && user?.branch_id) {
      const userBranch = branches.find(b => b.id === user.branch_id);
      if (userBranch) {
        defaultBranchType = userBranch.branch_type;
      }
    }
    
    setFormData({
      employee_id_number: '',
      branch_id: defaultBranchId,
      first_name: '',
      second_name: '',
      third_name: '',
      fourth_name: '',
      occupation: '',
      job_title: '',
      nationality: '',
      date_of_birth_hijri: '',
      date_of_birth_gregorian: '',
      id_or_residency_number: '',
      id_type: '',
      gender: '',
      id_expiry_date_hijri: '',
      id_expiry_date_gregorian: '',
      religion: '',
      marital_status: '',
      status: 'active',
      educational_qualification: '',
      specialization: '',
      bank_iban: '',
      bank_name: '',
      email: '',
      phone_number: '',
      contract_type: '',
      salary: '',
      base_salary: '',
      housing_allowance: '',
      transportation_allowance: '',
      end_of_service_allowance: '',
      annual_leave_allowance: '',
      other_allowances: '',
      years_of_experience_in_same_institution: '',
      graduation_year: '',
      university_gpa: '',
      passport_number: '',
      passport_issue_date: '',
      passport_expiry_date: '',
      passport_issue_place: '',
      residency_issue_date: '',
    });
    // Branch managers skip step 1, go directly to step 2
    setFormStep(!isMainManager() && user?.branch_id ? 2 : 1);
    setSelectedBranchType(defaultBranchType);
    setDateOfBirthCalendarType(null);
    setIdExpiryCalendarType(null);
    resetDocuments();
  };
  
  const handleNameChange = (names) => {
    setFormData({
      ...formData,
      first_name: names.first,
      second_name: names.second,
      third_name: names.third,
      fourth_name: names.fourth,
    });
  };
  
  const handleDateOfBirthChange = (value, calendarType) => {
    // Force calendar type based on nationality if set
    const forcedType = formData.nationality ? (isSaudi() ? 'hijri' : 'gregorian') : calendarType;
    
    if (forcedType === 'hijri') {
      setFormData({ ...formData, date_of_birth_hijri: value, date_of_birth_gregorian: '' });
      setDateOfBirthCalendarType('hijri');
    } else if (forcedType === 'gregorian') {
      setFormData({ ...formData, date_of_birth_gregorian: value, date_of_birth_hijri: '' });
      setDateOfBirthCalendarType('gregorian');
    } else {
      setFormData({ ...formData, date_of_birth_hijri: '', date_of_birth_gregorian: '' });
      setDateOfBirthCalendarType(null);
    }
  };

  const handleIdExpiryChange = (value, calendarType) => {
    // Force calendar type based on nationality if set
    const forcedType = formData.nationality ? (isSaudi() ? 'hijri' : 'gregorian') : calendarType;
    
    if (forcedType === 'hijri') {
      setFormData({ ...formData, id_expiry_date_hijri: value, id_expiry_date_gregorian: '' });
      setIdExpiryCalendarType('hijri');
    } else if (forcedType === 'gregorian') {
      setFormData({ ...formData, id_expiry_date_gregorian: value, id_expiry_date_hijri: '' });
      setIdExpiryCalendarType('gregorian');
    } else {
      setFormData({ ...formData, id_expiry_date_hijri: '', id_expiry_date_gregorian: '' });
      setIdExpiryCalendarType(null);
    }
  };

  if (loading) {
    return <div className="loading">جاري تحميل الموظفين...</div>;
  }

  // Determine current branch type: for branch managers, get from their branch; for main managers, use selectedBranchType
  let currentBranchType = selectedBranchType;
  if (!isMainManager() && user?.branch_id && !selectedBranchType) {
    const userBranch = branches.find(b => b.id === user.branch_id);
    if (userBranch) {
      currentBranchType = userBranch.branch_type;
    }
  }

  return (
    <div className="table-page">
      {!showForm ? (
        <>
      <div className="page-header">
            <h1>إدارة الموظفين</h1>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button 
                onClick={() => setFilterIncomplete(!filterIncomplete)}
                className={filterIncomplete ? 'btn-primary' : 'btn-secondary'}
                style={{ fontSize: '14px', padding: '8px 16px' }}
              >
                {filterIncomplete ? 'عرض الجميع' : 'عرض غير مكتملي البيانات'}
              </button>
              <button onClick={() => { 
                resetForm(); 
                // Auto-set branch_id and branch type for branch managers
                if (!isMainManager() && user?.branch_id) {
                  const userBranch = branches.find(b => b.id === user.branch_id);
                  if (userBranch) {
                    setFormData(prev => ({ ...prev, branch_id: user.branch_id }));
                    setSelectedBranchType(userBranch.branch_type);
                    setFormStep(2); // Skip branch type selection, go directly to form
                  }
                } else {
                  setFormStep(1); // Main managers need to select branch type
                }
                setShowForm(true); 
                setEditingEmployee(null); 
              }} className="btn-primary">
                إضافة موظف جديد
              </button>
            </div>
      </div>

      {isMainManager() && (
        <div style={{ 
          marginBottom: '20px', 
          padding: '15px', 
          backgroundColor: '#f5f5f5', 
          borderRadius: '8px',
          display: 'flex',
          gap: '15px',
          flexWrap: 'wrap',
          alignItems: 'flex-end'
        }}>
          <div style={{ flex: '1', minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>البحث بالاسم:</label>
            <input
              ref={searchNameRef}
              type="text"
              value={searchFilters.search_name}
              onChange={(e) => setSearchFilters({ ...searchFilters, search_name: e.target.value })}
              placeholder="أدخل جزء من الاسم (مثال: مح)"
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
            />
          </div>
          <div style={{ flex: '1', minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>البحث برقم الهوية/الإقامة:</label>
            <input
              ref={searchIdRef}
              type="text"
              value={searchFilters.search_id}
              onChange={(e) => setSearchFilters({ ...searchFilters, search_id: e.target.value })}
              placeholder="أدخل رقم الهوية أو الإقامة"
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
            />
          </div>
          <div style={{ flex: '1', minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>البحث برقم الهاتف:</label>
            <input
              ref={searchPhoneRef}
              type="text"
              value={searchFilters.search_phone}
              onChange={(e) => setSearchFilters({ ...searchFilters, search_phone: e.target.value })}
              placeholder="أدخل رقم الهاتف"
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
            />
          </div>
          <div style={{ flex: '1', minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>فلتر الفرع:</label>
            <select
              value={searchFilters.search_branch}
              onChange={(e) => setSearchFilters({ ...searchFilters, search_branch: e.target.value })}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', backgroundColor: 'white' }}
            >
              <option value="">جميع الفروع</option>
              {branches
                .filter(b => b.is_active)
                .map(branch => (
                  <option key={branch.id} value={branch.id}>
                    {branch.branch_name}
                  </option>
                ))}
            </select>
          </div>
          {(searchFilters.search_name || searchFilters.search_id || searchFilters.search_phone || searchFilters.search_branch) && (
            <button
              onClick={() => setSearchFilters({ search_name: '', search_id: '', search_phone: '', search_branch: '' })}
              className="btn-secondary"
              style={{ padding: '8px 16px' }}
            >
              مسح البحث
            </button>
          )}
        </div>
      )}

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>رقم الهوية/الإقامة</th>
                  <th>الاسم</th>
                  <th>المهنة</th>
                  <th>الجنسية</th>
                  {isMainManager() && <th>الفرع</th>}
                  <th>حالة البيانات</th>
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={isMainManager() ? "8" : "7"} style={{ textAlign: 'center' }}>لا يوجد موظفين</td>
                  </tr>
                ) : (
                  employees.map((employee) => {
                    const branch = branches.find(b => b.id === employee.branch_id);
                    const isComplete = employee.data_completion_status === 'complete';
                    return (
                    <tr key={employee.id}>
                      <td>{employee.id_or_residency_number}</td>
                      <td>{employee.first_name} {employee.second_name} {employee.third_name} {employee.fourth_name}</td>
                      <td>{employee.occupation || '-'}</td>
                      <td>{employee.nationality}</td>
                      {isMainManager() && <td>{branch ? branch.branch_name : employee.branch_id}</td>}
                      <td>
                        <span className={`badge ${isComplete ? 'badge-success' : 'badge-warning'}`}>
                          {isComplete ? 'مكتمل' : 'غير مكتمل'}
                        </span>
                      </td>
                      <td>
                        {(() => {
                          const status = employee.status || 'active';
                          const statusLabels = {
                            'active': { text: 'نشط', class: 'badge-success' },
                            'pending': { text: 'قيد الانتظار', class: 'badge-warning' },
                            'terminated_article_80': { text: 'فصل حسب المادة 80', class: 'badge-danger' },
                            'terminated_article_77': { text: 'فصل حسب المادة 77', class: 'badge-danger' },
                            'resigned': { text: 'استقال', class: 'badge-danger' },
                            'contract_ended': { text: 'انتهى العقد', class: 'badge-secondary' },
                            'non_renewal': { text: 'عدم التجديد', class: 'badge-secondary' },
                            'other': { text: 'أخرى', class: 'badge-secondary' }
                          };
                          const statusInfo = statusLabels[status] || { text: status, class: 'badge-secondary' };
                          return (
                            <span className={`badge ${statusInfo.class}`}>
                              {statusInfo.text}
                            </span>
                          );
                        })()}
                      </td>
                      <td>
                        <button onClick={() => handleViewDetails(employee)} className="btn btn-primary btn-sm">عرض التفاصيل</button>
                        <button onClick={() => handleEdit(employee)} className="btn-sm btn-edit">تعديل</button>
                        {isMainManager() && (
                          <button onClick={() => handleDelete(employee.id)} className="btn-sm btn-delete">حذف</button>
                        )}
                      </td>
                    </tr>
                  );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="employee-form-page">
          <div className="form-page-header">
            <h1>{editingEmployee ? 'تعديل الموظف' : 'إضافة موظف جديد'}</h1>
            <button onClick={() => { 
              setShowForm(false); 
              resetForm(); 
              setEditingEmployee(null); 
            }} className="btn-secondary">
              إلغاء والعودة للقائمة
            </button>
          </div>

          <div className="employee-form-container">
            {formStep === 1 && !editingEmployee && isMainManager() && (
              <div style={{ padding: 'var(--spacing-md)' }}>
                <h3 style={{ marginBottom: 'var(--spacing-md)', textAlign: 'center', fontSize: 'var(--font-size-lg)' }}>اختر نوع الفرع</h3>
                <div style={{ display: 'flex', gap: 'var(--spacing-md)', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBranchType('healthcare_center');
                      setFormStep(2);
                    }}
                    className="btn-primary"
                    style={{ padding: 'var(--spacing-md) var(--spacing-lg)', fontSize: 'var(--font-size-base)' }}
                  >
                    مركز رعاية صحية
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBranchType('school');
                      setFormStep(2);
                    }}
                    className="btn-primary"
                    style={{ padding: 'var(--spacing-md) var(--spacing-lg)', fontSize: 'var(--font-size-base)' }}
                  >
                    مدرسة
                  </button>
                </div>
                <div style={{ marginTop: 'var(--spacing-md)', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); resetForm(); setEditingEmployee(null); }}
                    className="btn-secondary"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}
            
            {(formStep === 2 || editingEmployee || (!isMainManager() && user?.branch_id)) && (
              <form onSubmit={handleSubmit} className="employee-form">
                {isMainManager() && (
                  <div style={{ marginBottom: 'var(--spacing-sm)', padding: 'var(--spacing-xs) var(--spacing-sm)', background: '#e3f2fd', borderRadius: 'var(--radius-sm)', textAlign: 'center', fontSize: 'var(--font-size-sm)' }}>
                    <strong>نوع الفرع: </strong>
                    {currentBranchType ? (isHealthcareCenter(currentBranchType) ? 'مركز رعاية صحية' : isSchool(currentBranchType) ? 'مدرسة' : 'غير محدد') : 'غير محدد'}
                    {!editingEmployee && (
                      <button
                        type="button"
                        onClick={() => setFormStep(1)}
                        className="btn-secondary"
                      >
                        تغيير النوع
                      </button>
                    )}
                  </div>
                )}
                
                {/* ========== القسم الأول: المعلومات الأساسية المطلوبة ========== */}
                <h3 className="col-12" style={{ marginTop: '20px', padding: '10px', background: '#e3f2fd', borderRadius: '6px', fontWeight: 'bold', fontSize: '16px' }}>
                  القسم الأول: المعلومات الأساسية المطلوبة *
                </h3>
                
                {/* الجنسية أولاً - مهم جداً */}
                <div className="form-group col-12" style={{ padding: '8px', background: '#e8f5e9', borderRadius: '4px', border: '2px solid #4caf50', marginBottom: '8px' }}>
                  <NationalitySelect
                    label="الجنسية *"
                    value={formData.nationality}
                    onChange={handleNationalityChange}
                    required
                  />
                  {formData.nationality && (
                    <div style={{ marginTop: '4px', fontSize: '12px', color: '#2e7d32', fontWeight: '600' }}>
                      {isSaudi() ? '✓ هجري/مواطن' : '✓ ميلادي/مقيم'}
                    </div>
                  )}
                </div>
              
                <h4 className="col-12" style={{ marginTop: '12px', marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: '#555' }}>الاسم الكامل</h4>
                <div className="form-group col-12">
                  <NameInput
                    label="الاسم الكامل (4 أسماء) *"
                    value={{
                      first: formData.first_name,
                      second: formData.second_name,
                      third: formData.third_name,
                      fourth: formData.fourth_name
                    }}
                    onChange={handleNameChange}
                    required
                  />
                </div>

                <div className="form-group col-4">
                  <label>{isSaudi() ? "رقم الهوية *" : "رقم الإقامة *"}</label>
                  <input
                    type="text"
                    value={formData.id_or_residency_number}
                    onChange={(e) => setFormData({ ...formData, id_or_residency_number: e.target.value })}
                    required
                    placeholder={isSaudi() ? "رقم الهوية" : "رقم الإقامة"}
                  />
                </div>
                
                <div className="form-group col-2">
                  <label>نوع الهوية *</label>
                  <select
                    value={formData.id_type || ''}
                    onChange={(e) => setFormData({ ...formData, id_type: e.target.value })}
                    disabled={!!formData.nationality}
                    style={formData.nationality ? { background: '#f0f0f0', cursor: 'not-allowed' } : {}}
                    required
                  >
                    <option value="">اختر النوع</option>
                    <option value="citizen">مواطن</option>
                    <option value="resident">مقيم</option>
                  </select>
                </div>
                
                <div className="form-group col-2">
                  <label>الجنس *</label>
                  <select
                    value={formData.gender || ''}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    required
                  >
                    <option value="">اختر الجنس</option>
                    <option value="male">ذكر</option>
                    <option value="female">أنثى</option>
                  </select>
                </div>
                
                {isMainManager() && (
                  <div className="form-group col-4">
                    <label>الفرع *</label>
                    <select
                      value={formData.branch_id}
                      onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                      required
                    >
                      <option value="">اختر الفرع</option>
                      {branches
                        .filter(b => !currentBranchType || b.branch_type === currentBranchType)
                        .map(b => (
                          <option key={b.id} value={b.id}>{b.branch_name}</option>
                        ))}
                    </select>
                  </div>
                )}
                
                {!isMainManager() && user?.branch_id && (
                  <div className="form-group col-4">
                    <label>الفرع</label>
                    <input
                      type="text"
                      value={branches.find(b => b.id === user.branch_id)?.branch_name || 'فرعك'}
                      disabled
                      style={{ background: '#f0f0f0', cursor: 'not-allowed' }}
                    />
                  </div>
                )}
                
                <div className="form-group col-4">
                  <label>المهنة *</label>
                  <input
                    type="text"
                    value={formData.occupation}
                    onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                    placeholder="المهنة"
                  />
                </div>
                
                <div className="form-group col-4">
                  <label>المسمى الوظيفي</label>
                  <select
                    value={formData.job_title}
                    onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                  >
                    <option value="">اختر المسمى الوظيفي</option>
                    {(() => {
                      // Get current branch type
                      let currentBranchType = selectedBranchType;
                      if (!isMainManager() && user?.branch_id && !selectedBranchType) {
                        const userBranch = branches.find(b => b.id === user.branch_id);
                        if (userBranch) {
                          currentBranchType = userBranch.branch_type;
                        }
                      }
                      if (isMainManager() && !currentBranchType && formData.branch_id) {
                        const selectedBranch = branches.find(b => b.id === parseInt(formData.branch_id));
                        if (selectedBranch) {
                          currentBranchType = selectedBranch.branch_type;
                        }
                      }
                      if (editingEmployee && !currentBranchType) {
                        const employeeBranch = branches.find(b => b.id === editingEmployee.branch_id);
                        if (employeeBranch) {
                          currentBranchType = employeeBranch.branch_type;
                        }
                      }

                      // Get job titles from constants based on branch type
                      const jobTitles = getJobTitlesByBranchType(currentBranchType);
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
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    >
                      <option value="active">نشط</option>
                      <option value="pending">قيد الانتظار</option>
                      <option value="terminated_article_80">فصل حسب المادة 80</option>
                      <option value="terminated_article_77">فصل حسب المادة 77</option>
                      <option value="resigned">استقال</option>
                      <option value="contract_ended">انتهى العقد</option>
                      <option value="non_renewal">عدم التجديد</option>
                      <option value="other">أخرى</option>
                    </select>
                  </div>
                )}
                
                <h4 className="col-12" style={{ marginTop: '16px', marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: '#555' }}>معلومات الاتصال والبنك</h4>
                
                <div className="form-group col-4">
                  <label>البريد الإلكتروني *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="example@email.com"
                    required
                  />
                </div>
                
                <div className="form-group col-4">
                  <label>رقم الهاتف *</label>
                  <input
                    type="text"
                    value={formData.phone_number}
                    onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                    placeholder="05xxxxxxxx"
                    required
                  />
                </div>
              
                <div className="form-group col-12">
                  <BankSelect
                    label="معلومات البنك *"
                    value={formData.bank_name}
                    onChange={(value) => setFormData(prev => ({ ...prev, bank_name: value }))}
                    ibanValue={formData.bank_iban}
                    onIbanChange={(value) => setFormData(prev => ({ ...prev, bank_iban: value }))}
                    required
                  />
                </div>
                
                <div className="form-group col-4">
                  <label>العنوان الوطني الموحد (المختصر) *</label>
                  <input
                    type="text"
                    value={formData.national_address}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\s/g, ''); // Remove spaces
                      if (value.length <= 8) {
                        setFormData({ ...formData, national_address: value });
                      }
                    }}
                    placeholder="8 خانات"
                    maxLength={8}
                    style={{ textAlign: 'center', fontFamily: 'monospace', letterSpacing: '2px' }}
                    required
                  />
                </div>

                {/* ========== القسم الثاني: معلومات الإثبات الشخصي ========== */}
                <h3 className="col-12" style={{ marginTop: '24px', padding: '10px', background: '#fff3e0', borderRadius: '6px', fontWeight: 'bold', fontSize: '16px' }}>
                  القسم الثاني: معلومات الإثبات الشخصي
                </h3>
                
                <div className="form-group col-3">
                  <HijriDatePicker
                    label="تاريخ الميلاد"
                    value={dateOfBirthCalendarType === 'hijri' ? formData.date_of_birth_hijri : (dateOfBirthCalendarType === 'gregorian' ? formData.date_of_birth_gregorian : '')}
                    onChange={(value, type) => handleDateOfBirthChange(value, type)}
                    calendarType={dateOfBirthCalendarType}
                    forceCalendarType={formData.nationality ? (isSaudi() ? 'hijri' : 'gregorian') : null}
                  />
                </div>
                
                {/* ID expiry date - only for non-Saudis */}
                {isNonSaudi(formData.nationality) && (
                  <div className="form-group col-3">
                    <HijriDatePicker
                      label="انتهاء الإقامة"
                      value={idExpiryCalendarType === 'gregorian' ? formData.id_expiry_date_gregorian : ''}
                      onChange={(value, type) => handleIdExpiryChange(value, type)}
                      calendarType={idExpiryCalendarType}
                      forceCalendarType={formData.nationality ? 'gregorian' : null}
                    />
                  </div>
                )}
                
                <div className="form-group col-3">
                  <ReligionSelect
                    label="الدين"
                    value={formData.religion}
                    onChange={(value) => setFormData({ ...formData, religion: value })}
                  />
                </div>
                
                <div className="form-group col-3">
                  <MaritalStatusSelect
                    label="الحالة الاجتماعية"
                    value={formData.marital_status}
                    onChange={(value) => setFormData({ ...formData, marital_status: value })}
                  />
                </div>
                
                {/* Passport fields - only for non-Saudis */}
                {isNonSaudi(formData.nationality) && (
                  <>
                    <h4 className="col-12" style={{ marginTop: '16px', marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: '#555' }}>معلومات جواز السفر</h4>
                    <div className="form-group col-3">
                      <label>رقم جواز السفر</label>
                      <input
                        type="text"
                        value={formData.passport_number}
                        onChange={(e) => setFormData({ ...formData, passport_number: e.target.value })}
                        placeholder="رقم جواز السفر"
                      />
                    </div>
                    <div className="form-group col-3">
                      <label>تاريخ اصدار جواز السفر</label>
                      <input
                        type="date"
                        value={formData.passport_issue_date}
                        onChange={(e) => setFormData({ ...formData, passport_issue_date: e.target.value })}
                      />
                    </div>
                    <div className="form-group col-3">
                      <label>تاريخ انتهاء جواز السفر</label>
                      <input
                        type="date"
                        value={formData.passport_expiry_date}
                        onChange={(e) => setFormData({ ...formData, passport_expiry_date: e.target.value })}
                      />
                    </div>
                    <div className="form-group col-3">
                      <label>مكان إصدار جواز السفر</label>
                      <input
                        type="text"
                        value={formData.passport_issue_place}
                        onChange={(e) => setFormData({ ...formData, passport_issue_place: e.target.value })}
                        placeholder="مكان الإصدار"
                      />
                    </div>
                    <div className="form-group col-3">
                      <label>تاريخ اصدار الإقامة</label>
                      <input
                        type="date"
                        value={formData.residency_issue_date}
                        onChange={(e) => setFormData({ ...formData, residency_issue_date: e.target.value })}
                      />
                    </div>
                  </>
                )}
                
                <div className="form-group col-3">
                  <label>نوع العقد</label>
                  <select
                    value={formData.contract_type}
                    onChange={(e) => setFormData({ ...formData, contract_type: e.target.value })}
                    className="form-select"
                  >
                    <option value="">اختر نوع العقد</option>
                    <option value="ورقي">ورقي</option>
                    <option value="قوى">قوى</option>
                  </select>
                </div>
                
                <div className="form-group col-3">
                  <label>عدد سنين الخبرة داخل المؤسسة نفسها</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.years_of_experience_in_same_institution}
                    onChange={(e) => setFormData({ ...formData, years_of_experience_in_same_institution: e.target.value })}
                  />
                </div>

                {/* ========== القسم الثالث: المعلومات التعليمية ========== */}
                <h3 className="col-12" style={{ marginTop: '24px', padding: '10px', background: '#f3e5f5', borderRadius: '6px', fontWeight: 'bold', fontSize: '16px' }}>
                  القسم الثالث: المعلومات التعليمية
                </h3>
                
                <div className="form-group col-4">
                  <label>المؤهل التعليمي</label>
                  <input
                    type="text"
                    value={formData.educational_qualification}
                    onChange={(e) => setFormData({ ...formData, educational_qualification: e.target.value })}
                  />
                </div>
                
                <div className="form-group col-4">
                  <label>التخصص</label>
                  <input
                    type="text"
                    value={formData.specialization}
                    onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                  />
                </div>
                
                <div className="form-group col-2">
                  <label>سنة التخرج</label>
                  <input
                    type="number"
                    min="1950"
                    max={new Date().getFullYear() + 5}
                    value={formData.graduation_year}
                    onChange={(e) => setFormData({ ...formData, graduation_year: e.target.value })}
                    placeholder="مثال: 2020"
                  />
                </div>
                
                <div className="form-group col-2">
                  <label>المعدل الجامعي</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="5"
                    value={formData.university_gpa}
                    onChange={(e) => setFormData({ ...formData, university_gpa: e.target.value })}
                    placeholder="مثال: 4.5"
                  />
                </div>
                <div className="form-group col-2">
                  <label>نوع العقد</label>
                  <select
                    value={formData.contract_type}
                    onChange={(e) => setFormData({ ...formData, contract_type: e.target.value })}
                    className="form-select"
                  >
                    <option value="">اختر نوع العقد</option>
                    <option value="ورقي">ورقي</option>
                    <option value="قوى">قوى</option>
                  </select>
                </div>
                <div className="form-group col-2">
                  <label>عدد سنين الخبرة داخل المؤسسة نفسها</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.years_of_experience_in_same_institution}
                    onChange={(e) => setFormData({ ...formData, years_of_experience_in_same_institution: e.target.value })}
                  />
                </div>
                {/* ========== القسم الرابع: الراتب والبدلات ========== */}
                <h3 className="col-12" style={{ marginTop: '24px', padding: '10px', background: '#e8f5e9', borderRadius: '6px', fontWeight: 'bold', fontSize: '16px' }}>
                  القسم الرابع: الراتب والبدلات
                </h3>
                
                <div className="form-group col-3">
                  <label>الراتب الأساسي</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.base_salary}
                    onChange={(e) => setFormData({ ...formData, base_salary: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                
                <div className="form-group col-3">
                  <label>بدل السكن</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.housing_allowance}
                    onChange={(e) => setFormData({ ...formData, housing_allowance: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                
                <div className="form-group col-3">
                  <label>بدل النقل</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.transportation_allowance}
                    onChange={(e) => setFormData({ ...formData, transportation_allowance: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                
                <div className="form-group col-3">
                  <label>بدل نهاية الخدمة</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.end_of_service_allowance}
                    onChange={(e) => setFormData({ ...formData, end_of_service_allowance: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                
                <div className="form-group col-3">
                  <label>بدل الإجازة السنوية</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.annual_leave_allowance}
                    onChange={(e) => setFormData({ ...formData, annual_leave_allowance: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                
                <div className="form-group col-3">
                  <label>بدلات أخرى</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.other_allowances}
                    onChange={(e) => setFormData({ ...formData, other_allowances: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                
                <div className="form-group col-3">
                  <label>الاستقطاعات (خصومات، سلف، إلخ)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.deductions}
                    onChange={(e) => setFormData({ ...formData, deductions: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                
                <div className="form-group col-3">
                  <label>الراتب الإجمالي (قديم - للتوافق)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.salary}
                    onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                    style={{ background: '#f0f0f0', opacity: 0.7 }}
                    title="هذا الحقل للتوافق مع البيانات القديمة فقط"
                    placeholder="0.00"
                  />
                </div>

                {/* ========== القسم الخامس: معلومات إضافية ========== */}
                {/* تم نقل العنوان الوطني إلى القسم الأول */}


              {/* ========== القسم الخامس: المستندات ========== */}
              <h3 className="col-12" style={{ marginTop: '24px', padding: '10px', background: '#fff9c4', borderRadius: '6px', fontWeight: 'bold', fontSize: '16px' }}>
                القسم الخامس: المستندات
              </h3>
              
              <div className="documents-section col-12">
                    {/* Common documents for all types */}
                    <div className="form-group col-3">
                      <label>الهوية/الإقامة</label>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleDocumentChange('id_or_residency', e.target.files[0] || null)}
                      />
                      {documents.id_or_residency && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.id_or_residency.name}</span>}
                    </div>
                    <div className="form-group col-3">
                      <label>خطاب مباشرة</label>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleDocumentChange('direct_letter', e.target.files[0] || null)}
                      />
                      {documents.direct_letter && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.direct_letter.name}</span>}
                    </div>
                    <div className="form-group col-3">
                      <label>مستند الآيبان</label>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleDocumentChange('bank_iban', e.target.files[0] || null)}
                      />
                      {documents.bank_iban && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.bank_iban.name}</span>}
                    </div>
                    <div className="form-group col-3">
                      <label>المؤهل الأساسي</label>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleDocumentChange('primary_qualification', e.target.files[0] || null)}
                      />
                      {documents.primary_qualification && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.primary_qualification.name}</span>}
                    </div>
                    <div className="form-group col-3">
                      <label>عقد العمل</label>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleDocumentChange('employment_contract', e.target.files[0] || null)}
                      />
                      {documents.employment_contract && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.employment_contract.name}</span>}
                    </div>
                    {/* Medical disclosure form - optional */}
                    <div className="form-group col-3">
                      <label>نموذج افصاح طبي</label>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleDocumentChange('medical_disclosure_form', e.target.files[0] || null)}
                      />
                      {documents.medical_disclosure_form && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.medical_disclosure_form.name}</span>}
                    </div>
                    {isNonSaudi(formData.nationality) && (
                      <div className="form-group col-3">
                        <label>جواز السفر</label>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => handleDocumentChange('passport', e.target.files[0] || null)}
                        />
                        {documents.passport && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.passport.name}</span>}
                      </div>
                    )}
                    
                    {/* School-specific documents */}
                    {isSchool(currentBranchType) && (
                      <>
                        <div className="form-group col-3">
                          <label>الترخيص المهني</label>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => handleDocumentChange('professional_license', e.target.files[0] || null)}
                          />
                          {documents.professional_license && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.professional_license.name}</span>}
                        </div>
                        {/* Experience certificate - only for managers/supervisors */}
                        {requiresExperienceCertificate(formData.job_title, currentBranchType) && (
                          <div className="form-group col-3">
                            <label>شهادة الخبرة</label>
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) => handleDocumentChange('experience_certificate', e.target.files[0] || null)}
                            />
                            {documents.experience_certificate && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.experience_certificate.name}</span>}
                          </div>
                        )}
                        <div className="form-group col-3">
                          <label>الدورات الإضافية</label>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => handleDocumentChange('additional_courses', e.target.files[0] || null)}
                          />
                          {documents.additional_courses && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.additional_courses.name}</span>}
                        </div>
                      </>
                    )}
  
                    {isHealthcareCenter(currentBranchType) && (
                      <>
                        {/* Classification certificate - only for specific job titles */}
                        {requiresClassificationDocument(formData.job_title) && (
                          <div className="form-group col-3">
                            <label>شهادة التصنيف</label>
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) => handleDocumentChange('classification', e.target.files[0] || null)}
                            />
                            {documents.classification && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.classification.name}</span>}
                          </div>
                        )}
                        {/* Experience certificate - only for managers/supervisors */}
                        {requiresExperienceCertificateDocument(formData.job_title, currentBranchType) && (
                          <div className="form-group col-3">
                            <label>شهادة الخبرة</label>
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) => handleDocumentChange('experience_certificate', e.target.files[0] || null)}
                            />
                            {documents.experience_certificate && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.experience_certificate.name}</span>}
                          </div>
                        )}
                        {/* Speech therapy course - only for speech therapists */}
                        {formData.job_title === 'النطق و التخاطب' && (
                          <>
                            <div className="form-group col-3">
                              <label>دورة علاج النطق</label>
                              <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={(e) => handleDocumentChange('speech_therapy_course', e.target.files[0] || null)}
                              />
                              {documents.speech_therapy_course && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.speech_therapy_course.name}</span>}
                            </div>
                            {/* 70 hours speech therapy course - required for speech therapists */}
                            <div className="form-group col-3">
                              <label>دورة 70 ساعة في التخاطب</label>
                              <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={(e) => handleDocumentChange('speech_therapy_70_hours_course', e.target.files[0] || null)}
                              />
                              {documents.speech_therapy_70_hours_course && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.speech_therapy_70_hours_course.name}</span>}
                            </div>
                          </>
                        )}
                        {/* Physical therapy course - only for physical/occupational therapists */}
                        {(formData.job_title === 'علاج طبيعي' || formData.job_title === 'علاج وظيفي') && (
                          <div className="form-group col-3">
                            <label>دورة العلاج الطبيعي</label>
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) => handleDocumentChange('physical_therapy_course', e.target.files[0] || null)}
                            />
                            {documents.physical_therapy_course && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.physical_therapy_course.name}</span>}
                          </div>
                        )}
                        {/* 40 hours therapy course - optional */}
                        {requiresTherapy40HoursDocument(formData.job_title) && (
                          <div className="form-group col-3">
                            <label>دورة 40 ساعة</label>
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) => handleDocumentChange('therapy_40_hours_course', e.target.files[0] || null)}
                            />
                            {documents.therapy_40_hours_course && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.therapy_40_hours_course.name}</span>}
                          </div>
                        )}
                        <div className="form-group col-3">
                          <label>الدورات الإضافية</label>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => handleDocumentChange('additional_courses', e.target.files[0] || null)}
                          />
                          {documents.additional_courses && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.additional_courses.name}</span>}
                        </div>
                      </>
                    )}
                  </div>

              <div className="form-actions">
                <button 
                  type="submit" 
                  className="btn-primary" 
                  disabled={saving || uploadingDocuments}
                >
                  {saving ? (
                    <>
                      <span className="spinner" style={{ display: 'inline-block', marginLeft: '8px' }}></span>
                      جاري الحفظ...
                    </>
                  ) : uploadingDocuments ? (
                    <>
                      <span className="spinner" style={{ display: 'inline-block', marginLeft: '8px' }}></span>
                      جاري رفع الملفات...
                    </>
                  ) : 'حفظ'}
                </button>
                <button 
                  type="button" 
                  onClick={() => { setShowForm(false); resetForm(); setEditingEmployee(null); }} 
                  className="btn-secondary"
                  disabled={saving || uploadingDocuments}
                >
                  إلغاء
                </button>
              </div>
              
              {/* Loading Overlay */}
              {(saving || uploadingDocuments) && (
                <div style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  zIndex: 9999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: '20px'
                }}>
                  <div className="spinner-large"></div>
                  <div style={{ color: 'white', fontSize: '18px', fontWeight: 'bold' }}>
                    {saving ? 'جاري حفظ البيانات...' : 'جاري رفع الملفات...'}
                  </div>
                  <div style={{ color: 'white', fontSize: '14px' }}>
                    الرجاء الانتظار ولا تغلق الصفحة
                  </div>
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

export default Employees;

