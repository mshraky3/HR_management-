/**
 * Employees Page
 * Manage employees
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { employeesAPI, branchesAPI, documentsAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import HijriDatePicker from '../components/HijriDatePicker';
import NameInput from '../components/NameInput';
import NationalitySelect from '../components/NationalitySelect';
import ReligionSelect from '../components/ReligionSelect';
import MaritalStatusSelect from '../components/MaritalStatusSelect';
import BankSelect from '../components/BankSelect';
import './TablePage.css';

const Employees = () => {
  const navigate = useNavigate();
  const { isMainManager, user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [formStep, setFormStep] = useState(1); // 1: branch type selection, 2: employee form
  const [selectedBranchType, setSelectedBranchType] = useState(null); // 'healthcare_center' or 'school'
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
    educational_qualification: '',
    specialization: '',
    bank_iban: '',
    bank_name: '',
    email: '',
    phone_number: '',
    contract_type: '',
    salary: '',
  });
  
  const [dateOfBirthCalendarType, setDateOfBirthCalendarType] = useState(null);
  const [idExpiryCalendarType, setIdExpiryCalendarType] = useState(null);
  
  // Document uploads state
  const [documents, setDocuments] = useState({
    id_or_residency: null,
    employment_letter: null,
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
  });

  useEffect(() => {
    loadBranches();
    loadEmployees();
  }, []);

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
      
      // Branch managers only see their branch employees
      if (!isMainManager() && user?.branch_id) {
        filters.branch_id = user.branch_id;
      }
      
      const response = await employeesAPI.getAll(filters);
      if (response.data.success) {
        setEmployees(response.data.data);
      }
    } catch (error) {
      console.error('Error loading employees:', error);
      alert('فشل تحميل الموظفين');
    } finally {
      setLoading(false);
    }
  };

  // Check if nationality is Saudi
  const isSaudi = () => {
    return formData.nationality === 'Saudi Arabia' || 
           formData.nationality === 'المملكة العربية السعودية' ||
           formData.nationality?.toLowerCase().includes('saudi') ||
           formData.nationality?.toLowerCase().includes('سعودي');
  };

  // Handle nationality change - auto-set ID type and calendar types
  const handleNationalityChange = (nationality) => {
    const isSaudiNationality = nationality === 'Saudi Arabia' || 
                                nationality === 'المملكة العربية السعودية' ||
                                nationality?.toLowerCase().includes('saudi') ||
                                nationality?.toLowerCase().includes('سعودي');
    
    setFormData(prev => {
      const newData = { ...prev, nationality };
      
      // Auto-set ID type based on nationality
      if (isSaudiNationality) {
        newData.id_type = 'citizen';
      } else {
        newData.id_type = 'resident';
      }
      
      return newData;
    });
    
    // Auto-set calendar types based on nationality
    if (isSaudiNationality) {
      // Saudi: Force Hijri calendar
      setDateOfBirthCalendarType('hijri');
      setIdExpiryCalendarType('hijri');
      // Clear Gregorian dates
      setFormData(prev => ({
        ...prev,
        date_of_birth_gregorian: '',
        id_expiry_date_gregorian: ''
      }));
    } else {
      // Non-Saudi: Force Gregorian calendar
      setDateOfBirthCalendarType('gregorian');
      setIdExpiryCalendarType('gregorian');
      // Clear Hijri dates
      setFormData(prev => ({
        ...prev,
        date_of_birth_hijri: '',
        id_expiry_date_hijri: ''
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate nationality is selected first
    if (!formData.nationality) {
      alert('الرجاء اختيار الجنسية أولاً');
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
      alert('الرجاء اختيار نوع الفرع أولاً');
      return;
    }
    
    // Validate that all 4 names are provided
    if (!formData.first_name || !formData.second_name || !formData.third_name || !formData.fourth_name) {
      alert('الرجاء إدخال جميع الأسماء الأربعة');
      return;
    }
    
    // Validate date of birth is provided
    if (!dateOfBirthCalendarType) {
      alert('الرجاء إدخال تاريخ الميلاد');
      return;
    }
    
    // Validate calendar type matches nationality
    const isSaudiNationality = isSaudi();
    if (isSaudiNationality && dateOfBirthCalendarType !== 'hijri') {
      alert('السعوديون يجب أن يستخدموا التقويم الهجري فقط');
      return;
    }
    if (!isSaudiNationality && dateOfBirthCalendarType !== 'gregorian') {
      alert('غير السعوديين يجب أن يستخدموا التقويم الميلادي فقط');
      return;
    }
    
    // Validate ID expiry calendar type matches nationality
    if (formData.id_expiry_date_hijri || formData.id_expiry_date_gregorian) {
      if (isSaudiNationality && idExpiryCalendarType !== 'hijri') {
        alert('تاريخ انتهاء الهوية للسعوديين يجب أن يكون هجرياً');
        return;
      }
      if (!isSaudiNationality && idExpiryCalendarType !== 'gregorian') {
        alert('تاريخ انتهاء الإقامة لغير السعوديين يجب أن يكون ميلادياً');
        return;
      }
    }

    // Validate school-specific requirements
    if (currentBranchType === 'school' && !editingEmployee && !documents.professional_license) {
      alert('الترخيص المهني مطلوب للمدارس');
      return;
    }
    
    // Validate IBAN and bank name match if provided
    if (formData.bank_iban || formData.bank_name) {
      if (formData.bank_iban && !formData.bank_name) {
        alert('الرجاء اختيار اسم البنك');
        return;
      }
      if (formData.bank_name && !formData.bank_iban) {
        alert('الرجاء إدخال رقم الآيبان البنكي');
        return;
      }
      
      // Validate IBAN format and bank match
      if (formData.bank_iban && formData.bank_name) {
        const cleanIban = formData.bank_iban.replace(/\s/g, '').toUpperCase();
        if (cleanIban.length !== 24 || !cleanIban.startsWith('SA')) {
          alert('صيغة IBAN غير صحيحة. يجب أن يكون بالشكل: SAXX XXXX XXXX XXXX XXXX XXXX');
          return;
        }
        
        // Extract bank code from correct position (indices 4-5, not 2-3)
        // Structure: SA(0-1) Check(2-3) BankCode(4-5) Account(6-23)
        const bankCode = cleanIban.substring(4, 6);
        const banks = [
          { code: '10', nameAr: 'البنك الأهلي السعودي (SNB)', alternativeCodes: [] },
          { code: '80', nameAr: 'مصرف الراجحي', alternativeCodes: ['82'] },
          { code: '05', nameAr: 'مصرف الإنماء', alternativeCodes: [] },
          { code: '20', nameAr: 'بنك الرياض', alternativeCodes: [] },
          { code: '50', nameAr: 'البنك السعودي الأول (ساب)', alternativeCodes: [] },
          { code: '15', nameAr: 'بنك البلاد', alternativeCodes: [] },
          { code: '30', nameAr: 'البنك العربي الوطني', alternativeCodes: [] },
          { code: '45', nameAr: 'البنك السعودي الفرنسي', alternativeCodes: [] },
          { code: '60', nameAr: 'بنك الجزيرة', alternativeCodes: [] },
          { code: '55', nameAr: 'البنك السعودي للاستثمار', alternativeCodes: [] },
          { code: '90', nameAr: 'بنك الخليج الدولي (ميم)', alternativeCodes: [] },
          { code: '95', nameAr: 'بنك الإمارات دبي الوطني', alternativeCodes: [] },
          { code: '76', nameAr: 'بنك مسقط', alternativeCodes: [] },
          { code: '31', nameAr: 'بنك الكويت الوطني', alternativeCodes: [] },
        ];
        
        // Helper function to check if bank code matches (including alternative codes)
        const bankCodeMatches = (bank, code) => {
          if (bank.code === code) return true;
          if (bank.alternativeCodes && bank.alternativeCodes.includes(code)) return true;
          return false;
        };
        
        const ibanBank = banks.find(b => bankCodeMatches(b, bankCode));
        if (!ibanBank) {
          alert('كود البنك في IBAN غير معروف');
          return;
        }
        
        if (ibanBank.nameAr !== formData.bank_name) {
          alert(`IBAN لا يطابق البنك المختار. IBAN يخص: ${ibanBank.nameAr}`);
          return;
        }
      }
    }
    
    // Validate all required fields before sending
    const requiredFields = {
      'branch_id': 'الفرع',
      'first_name': 'الاسم الأول',
      'second_name': 'الاسم الثاني',
      'third_name': 'الاسم الثالث',
      'fourth_name': 'الاسم الرابع',
      'occupation': 'المهنة',
      'nationality': 'الجنسية',
      'id_or_residency_number': 'رقم الهوية أو الإقامة',
      'id_type': 'نوع الهوية',
      'gender': 'الجنس'
    };
    
    // Check required fields
    for (const [field, label] of Object.entries(requiredFields)) {
      if (!formData[field] || formData[field].toString().trim() === '') {
        alert(`الحقل "${label}" مطلوب`);
        return;
      }
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
      'contract_type': { max: 100, label: 'نوع العقد' },
      'id_or_residency_number': { max: 100, label: 'رقم الهوية أو الإقامة' }
    };
    
    for (const [field, { max, label }] of Object.entries(fieldLengths)) {
      if (formData[field] && typeof formData[field] === 'string' && formData[field].length > max) {
        alert(`الحقل "${label}" أطول من المسموح (${max} حرف)`);
        return;
      }
    }
    
    // Validate date of birth based on nationality
    const isSaudiNationalityCheck = isSaudi();
    if (isSaudiNationalityCheck) {
      if (!formData.date_of_birth_hijri || formData.date_of_birth_hijri.trim() === '') {
        alert('تاريخ الميلاد (هجري) مطلوب للسعوديين');
        return;
      }
    } else {
      if (!formData.date_of_birth_gregorian || formData.date_of_birth_gregorian.trim() === '') {
        alert('تاريخ الميلاد (ميلادي) مطلوب لغير السعوديين');
        return;
      }
    }
    
    try {
      const data = { ...formData };
      
      // Remove empty strings and convert to null for optional fields
      const optionalFields = [
        'date_of_birth_hijri', 'date_of_birth_gregorian',
        'id_expiry_date_hijri', 'id_expiry_date_gregorian',
        'religion', 'marital_status', 'educational_qualification', 'specialization',
        'bank_iban', 'bank_name', 'email', 'phone_number', 'contract_type', 'salary'
      ];
      
      optionalFields.forEach(field => {
        if (data[field] === '' || data[field] === null || data[field] === undefined) {
          delete data[field]; // Remove field instead of setting to null
        } else if (typeof data[field] === 'string' && data[field].trim() === '') {
          delete data[field];
        }
      });
      
      // Parse salary if provided
      if (data.salary && data.salary !== '' && data.salary !== null) {
        const salaryValue = parseFloat(data.salary);
        if (isNaN(salaryValue)) {
          delete data.salary;
        } else {
          data.salary = salaryValue;
        }
      } else {
        delete data.salary;
      }
      
      // Set employee_id_number automatically from id_or_residency_number
      data.employee_id_number = data.id_or_residency_number;
      
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
        await employeesAPI.update(editingEmployee.id, data);
        employee = { id: editingEmployee.id };
        
        // Upload documents if any were provided during edit
        const documentEntries = Object.entries(documents).filter(([_, file]) => file !== null);
        
        if (documentEntries.length > 0) {
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
        }
      } else {
        // Create employee first
        const createResponse = await employeesAPI.create(data);
        employee = createResponse.data.data;
        
        // Upload documents if any were provided
        const documentEntries = Object.entries(documents).filter(([_, file]) => file !== null);
        
        if (documentEntries.length > 0) {
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
        }
      }
      
      setShowForm(false);
      setEditingEmployee(null);
      resetForm();
      resetDocuments();
      loadEmployees();
      alert(editingEmployee ? 'تم تحديث الموظف بنجاح' : 'تم إضافة الموظف بنجاح');
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
      alert(`❌ خطأ في حفظ الموظف\n\n${errorMessage}\n\nالرجاء التحقق من البيانات المدخلة والمحاولة مرة أخرى.`);
    }
  };
  
  const resetDocuments = () => {
    setDocuments({
      id_or_residency: null,
      employment_letter: null,
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
    });
  };
  
  const handleDocumentChange = (documentType, file) => {
    setDocuments(prev => ({
      ...prev,
      [documentType]: file
    }));
  };

  const handleEdit = (employee) => {
    setEditingEmployee(employee);
    // Find branch type from branches list
    const branch = branches.find(b => b.id === employee.branch_id);
    if (branch) {
      setSelectedBranchType(branch.branch_type);
    }
    
    // Check if employee is Saudi based on nationality
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
      contract_type: employee.contract_type || '',
      salary: employee.salary || '',
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
      alert('فشل حذف الموظف');
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
      educational_qualification: '',
      specialization: '',
      bank_iban: '',
      bank_name: '',
      email: '',
      phone_number: '',
      contract_type: '',
      salary: '',
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

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>رقم الهوية/الإقامة</th>
                  <th>الاسم</th>
                  <th>المهنة</th>
                  <th>الجنسية</th>
                  {isMainManager() && <th>الفرع</th>}
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={isMainManager() ? "7" : "6"} style={{ textAlign: 'center' }}>لا يوجد موظفون</td>
                  </tr>
                ) : (
                  employees.map((employee) => {
                    const branch = branches.find(b => b.id === employee.branch_id);
                    return (
                    <tr key={employee.id}>
                      <td>{employee.id_or_residency_number}</td>
                      <td>{employee.first_name} {employee.second_name} {employee.third_name} {employee.fourth_name}</td>
                      <td>{employee.occupation}</td>
                      <td>{employee.nationality}</td>
                      {isMainManager() && <td>{branch ? branch.branch_name : employee.branch_id}</td>}
                      <td>
                        <span className={`badge ${employee.is_active ? 'badge-success' : 'badge-danger'}`}>
                          {employee.is_active ? 'نشط' : 'غير نشط'}
                        </span>
                      </td>
                      <td>
                        <button onClick={() => handleViewDetails(employee)} className="btn-sm" style={{ backgroundColor: '#2196F3', color: 'white', marginLeft: '5px' }}>عرض التفاصيل</button>
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
                    {currentBranchType === 'healthcare_center' ? 'مركز رعاية صحية' : currentBranchType === 'school' ? 'مدرسة' : 'غير محدد'}
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
                
                <h3 className="col-12">المعلومات الأساسية</h3>
                
                {/* الجنسية أولاً - مهم جداً */}
                <div className="form-group col-12" style={{ padding: '6px', background: '#e8f5e9', borderRadius: '3px', border: '1px solid #4caf50' }}>
                  <NationalitySelect
                    label="الجنسية *"
                    value={formData.nationality}
                    onChange={handleNationalityChange}
                    required
                  />
                  {formData.nationality && (
                    <div style={{ marginTop: '2px', fontSize: '10px', color: '#2e7d32', fontWeight: '600' }}>
                      {isSaudi() ? '✓ هجري/مواطن' : '✓ ميلادي/مقيم'}
                </div>
                  )}
                </div>
                
                {isMainManager() && (
                  <div className="form-group col-3">
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
                  <div className="form-group col-3">
                    <label>الفرع</label>
                  <input
                    type="text"
                      value={branches.find(b => b.id === user.branch_id)?.branch_name || 'فرعك'}
                      disabled
                      style={{ background: '#f0f0f0', cursor: 'not-allowed' }}
                  />
                </div>
                )}
              
                <h3 className="col-12">الاسم</h3>
                <div className="form-group col-12">
                  <NameInput
                    label="الاسم الكامل (4 أسماء)"
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

                <h3 className="col-12">المعلومات الشخصية</h3>
                <div className="form-group col-3">
                  <label>المهنة *</label>
                  <input
                    type="text"
                    value={formData.occupation}
                    onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group col-3">
                  <HijriDatePicker
                    label={isSaudi() ? "تاريخ الميلاد *" : "تاريخ الميلاد *"}
                    value={dateOfBirthCalendarType === 'hijri' ? formData.date_of_birth_hijri : (dateOfBirthCalendarType === 'gregorian' ? formData.date_of_birth_gregorian : '')}
                    onChange={(value, type) => handleDateOfBirthChange(value, type)}
                    calendarType={dateOfBirthCalendarType}
                    required
                    forceCalendarType={formData.nationality ? (isSaudi() ? 'hijri' : 'gregorian') : null}
                  />
                </div>
                <div className="form-group col-3">
                  <label>{isSaudi() ? "رقم الهوية *" : "رقم الإقامة *"}</label>
                  <input
                    type="text"
                    value={formData.id_or_residency_number}
                    onChange={(e) => setFormData({ ...formData, id_or_residency_number: e.target.value })}
                    required
                    placeholder={isSaudi() ? "رقم الهوية" : "رقم الإقامة"}
                  />
                </div>
                <div className="form-group col-3">
                  <HijriDatePicker
                    label={isSaudi() ? "انتهاء الهوية" : "انتهاء الإقامة"}
                    value={idExpiryCalendarType === 'hijri' ? formData.id_expiry_date_hijri : (idExpiryCalendarType === 'gregorian' ? formData.id_expiry_date_gregorian : '')}
                    onChange={(value, type) => handleIdExpiryChange(value, type)}
                    calendarType={idExpiryCalendarType}
                    forceCalendarType={formData.nationality ? (isSaudi() ? 'hijri' : 'gregorian') : null}
                  />
                </div>
                <div className="form-group col-2">
                  <label>نوع الهوية *</label>
                  <select
                    value={formData.id_type}
                    onChange={(e) => setFormData({ ...formData, id_type: e.target.value })}
                    required
                    disabled={!!formData.nationality}
                    style={formData.nationality ? { background: '#f0f0f0', cursor: 'not-allowed' } : {}}
                  >
                    <option value="citizen">مواطن</option>
                    <option value="resident">مقيم</option>
                  </select>
                </div>
                <div className="form-group col-2">
                  <label>الجنس *</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    required
                  >
                    <option value="male">ذكر</option>
                    <option value="female">أنثى</option>
                  </select>
                </div>
                <div className="form-group col-2">
                  <ReligionSelect
                    label="الدين"
                    value={formData.religion}
                    onChange={(value) => setFormData({ ...formData, religion: value })}
                  />
                </div>
                <div className="form-group col-2">
                  <MaritalStatusSelect
                    label="الحالة الاجتماعية"
                    value={formData.marital_status}
                    onChange={(value) => setFormData({ ...formData, marital_status: value })}
                  />
                </div>
                <div className="form-group col-3">
                  <label>المؤهل التعليمي</label>
                  <input
                    type="text"
                    value={formData.educational_qualification}
                    onChange={(e) => setFormData({ ...formData, educational_qualification: e.target.value })}
                  />
                </div>
                <div className="form-group col-3">
                  <label>التخصص</label>
                  <input
                    type="text"
                    value={formData.specialization}
                    onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                  />
                </div>
                <div className="form-group col-2">
                  <label>نوع العقد</label>
                  <input
                    type="text"
                    value={formData.contract_type}
                    onChange={(e) => setFormData({ ...formData, contract_type: e.target.value })}
                  />
                </div>
                <div className="form-group col-2">
                  <label>الراتب</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.salary}
                    onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                  />
                </div>
                <div className="form-group col-3">
                  <label>البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="form-group col-3">
                  <label>رقم الهاتف</label>
                  <input
                    type="text"
                    value={formData.phone_number}
                    onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  />
                </div>
              
                <div className="form-group col-12">
                  <BankSelect
                    label="البنك"
                  value={formData.bank_name}
                    onChange={(value) => setFormData(prev => ({ ...prev, bank_name: value }))}
                    ibanValue={formData.bank_iban}
                    onIbanChange={(value) => setFormData(prev => ({ ...prev, bank_iban: value }))}
                />
              </div>

              <h3 className="col-12">{editingEmployee ? 'تحديث المستندات (اختياري)' : 'المستندات المطلوبة'}</h3>
              <div className="documents-section col-12">
                    {/* Common documents for all types */}
                    <div className="form-group col-3">
                      <label>الهوية/الإقامة {!editingEmployee && '*'}</label>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleDocumentChange('id_or_residency', e.target.files[0] || null)}
                        required={!editingEmployee}
                      />
                      {documents.id_or_residency && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.id_or_residency.name}</span>}
                    </div>
                    <div className="form-group col-3">
                      <label>خطاب التوظيف</label>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleDocumentChange('employment_letter', e.target.files[0] || null)}
                      />
                      {documents.employment_letter && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.employment_letter.name}</span>}
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
                    {!isSaudi() && (
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
                    {currentBranchType === 'school' && (
                      <>
                        <div className="form-group col-3">
                          <label>الترخيص المهني {!editingEmployee && '*'}</label>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => handleDocumentChange('professional_license', e.target.files[0] || null)}
                            required={!editingEmployee}
                          />
                          {documents.professional_license && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.professional_license.name}</span>}
                        </div>
                        <div className="form-group col-3">
                          <label>شهادة الخبرة</label>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => handleDocumentChange('experience_certificate', e.target.files[0] || null)}
                          />
                          {documents.experience_certificate && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.experience_certificate.name}</span>}
                        </div>
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
                    
                    {/* Healthcare-specific documents */}
                    {currentBranchType === 'healthcare_center' && (
                      <>
                        <div className="form-group col-3">
                          <label>شهادة التصنيف</label>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => handleDocumentChange('classification', e.target.files[0] || null)}
                          />
                          {documents.classification && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.classification.name}</span>}
                        </div>
                        <div className="form-group col-3">
                          <label>شهادة الخبرة</label>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => handleDocumentChange('experience_certificate', e.target.files[0] || null)}
                          />
                          {documents.experience_certificate && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.experience_certificate.name}</span>}
                        </div>
                        <div className="form-group col-3">
                          <label>دورة علاج النطق</label>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => handleDocumentChange('speech_therapy_course', e.target.files[0] || null)}
                          />
                          {documents.speech_therapy_course && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.speech_therapy_course.name}</span>}
                        </div>
                        <div className="form-group col-3">
                          <label>دورة العلاج الطبيعي</label>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => handleDocumentChange('physical_therapy_course', e.target.files[0] || null)}
                          />
                          {documents.physical_therapy_course && <span className="file-name" style={{fontSize: '10px'}}>✓ {documents.physical_therapy_course.name}</span>}
                        </div>
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
                <button type="submit" className="btn-primary">حفظ</button>
                <button type="button" onClick={() => { setShowForm(false); resetForm(); setEditingEmployee(null); }} className="btn-secondary">
                  إلغاء
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Employees;

