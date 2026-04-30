/**
 * Task Prioritizer Utility
 * Calculates and prioritizes tasks for branch managers
 */

/**
 * Check if a bus is complete
 * A bus is considered complete when all required fields are filled
 */
const isBusComplete = (bus) => {
  // Basic info required
  if (!bus.plate_number || !bus.term_id || !bus.branch_id) {
    return false;
  }

  // Registration data required
  if (!bus.registration_number || !bus.chassis_number || !bus.vehicle_model || !bus.registration_expiry) {
    return false;
  }

  // Driver info required
  if (!bus.driver_full_name || !bus.driver_id_number || !bus.license_number || !bus.license_expiry) {
    return false;
  }

  // Details required
  if (!bus.number_of_seats || !bus.ownership_type) {
    return false;
  }

  // Student count must be set (can be 0)
  if (bus.student_count === null || bus.student_count === undefined) {
    return false;
  }

  // Documents required
  if (!bus.registration_document_url || !bus.license_document_url) {
    return false;
  }

  // If leased, lease contract document required
  if (bus.ownership_type === 'leased' && !bus.lease_contract_document_url) {
    return false;
  }

  return true;
};

/**
 * Check if a bus needs completion (shows "إكمال" button)
 * This matches the criteria used in BusTransportation.jsx
 */
const busNeedsCompletion = (bus) => {
  // Missing student count (0 is also considered incomplete for operations)
  const studentCount = parseInt(bus.student_count, 10);
  const missingStudents = studentCount === 0 ||
    isNaN(studentCount) ||
    bus.student_count === null ||
    bus.student_count === undefined;

  // Missing documents
  const missingRegDoc = !bus.registration_document_url;
  const missingDriverDoc = !bus.license_document_url;
  const missingDocs = missingRegDoc || missingDriverDoc;

  return missingDocs || missingStudents;
};

/**
 * Calculate bus transportation tasks
 */
const calculateBusTasks = (buses, branchId) => {
  const tasks = [];

  // Filter buses for this branch
  const branchBuses = buses.filter(bus => bus.branch_id === branchId);

  // Task 1: No buses at all
  if (branchBuses.length === 0) {
    tasks.push({
      id: 'bus-no-buses',
      type: 'bus',
      category: 'transportation',
      priority: 'must_do',
      title: 'إضافة حافلة واحدة على الأقل',
      description: 'يجب إضافة حافلة واحدة على الأقل للفرع',
      totalItems: 1,
      completedItems: 0,
      remainingItems: 1,
      progress: 0,
      actionUrl: '/bus-transportation',
      actionLabel: 'إضافة حافلة',
      urgency: 'no_deadline',
      estimatedTime: '15 min',
      dependencies: []
    });
    return tasks; // Return early if no buses
  }

  // Task 2: Buses needing completion (matching "إكمال" button criteria)
  // This is the main task for incomplete buses
  const busesNeedingCompletion = branchBuses.filter(bus => busNeedsCompletion(bus));

  if (busesNeedingCompletion.length > 0) {
    // Build detailed list of buses and their missing items
    const busList = busesNeedingCompletion.map(bus => {
      const missing = [];
      const studentCount = parseInt(bus.student_count, 10);
      if (studentCount === 0 || isNaN(studentCount) || bus.student_count === null || bus.student_count === undefined) {
        missing.push('عدد الطلاب');
      }
      if (!bus.registration_document_url) {
        missing.push('مستند التسجيل');
      }
      if (!bus.license_document_url) {
        missing.push('مستند رخصة السائق');
      }
      return {
        bus,
        busNumber: bus.bus_number || bus.primary_plate || `حافلة #${bus.id}`,
        missing
      };
    });

    const completedBuses = branchBuses.length - busesNeedingCompletion.length;

    tasks.push({
      id: 'bus-needs-completion',
      type: 'bus_completion',
      category: 'transportation',
      priority: 'must_do',
      title: 'إكمال بيانات الحافلات',
      description: `${busesNeedingCompletion.length} حافلة تحتاج إكمال البيانات`,
      totalItems: branchBuses.length,
      completedItems: completedBuses,
      remainingItems: busesNeedingCompletion.length,
      progress: (completedBuses / branchBuses.length) * 100,
      actionUrl: '/bus-transportation',
      actionLabel: 'إكمال بيانات الحافلات',
      urgency: 'no_deadline',
      estimatedTime: `${busesNeedingCompletion.length * 5} min`,
      dependencies: [],
      busList // Include detailed list for display
    });
  }

  // Task 3: Check for incomplete buses based on full completion criteria
  const incompleteBuses = branchBuses.filter(bus => !isBusComplete(bus));

  if (incompleteBuses.length > 0) {
    // Check specific missing fields
    const missingStudentCount = incompleteBuses.filter(bus => {
      const studentCount = parseInt(bus.student_count, 10);
      return studentCount === 0 || isNaN(studentCount) || bus.student_count === null || bus.student_count === undefined;
    });

    const missingRegistration = incompleteBuses.filter(bus =>
      !bus.registration_number || !bus.registration_document_url
    );

    const missingDriver = incompleteBuses.filter(bus =>
      !bus.driver_full_name || !bus.license_document_url
    );

    const missingDocuments = incompleteBuses.filter(bus =>
      !bus.registration_document_url || !bus.license_document_url ||
      (bus.ownership_type === 'leased' && !bus.lease_contract_document_url)
    );

    // Priority: student count is most critical for operations
    if (missingStudentCount.length > 0) {
      tasks.push({
        id: 'bus-missing-student-count',
        type: 'bus',
        category: 'transportation',
        priority: 'must_do',
        title: 'إضافة عدد الطلاب للحافلات',
        description: `${missingStudentCount.length} حافلة بدون عدد الطلاب`,
        totalItems: missingStudentCount.length,
        completedItems: 0,
        remainingItems: missingStudentCount.length,
        progress: 0,
        actionUrl: '/bus-transportation',
        actionLabel: 'إكمال بيانات الحافلات',
        urgency: 'no_deadline',
        estimatedTime: '10 min',
        dependencies: []
      });
    }

    // Registration is legal requirement
    if (missingRegistration.length > 0) {
      tasks.push({
        id: 'bus-missing-registration',
        type: 'bus',
        category: 'transportation',
        priority: 'must_do',
        title: 'إكمال بيانات تسجيل الحافلات',
        description: `${missingRegistration.length} حافلة بدون بيانات التسجيل الكاملة`,
        totalItems: missingRegistration.length,
        completedItems: 0,
        remainingItems: missingRegistration.length,
        progress: 0,
        actionUrl: '/bus-transportation',
        actionLabel: 'إكمال التسجيل',
        urgency: 'no_deadline',
        estimatedTime: '15 min',
        dependencies: []
      });
    }

    // Driver info is legal requirement
    if (missingDriver.length > 0) {
      tasks.push({
        id: 'bus-missing-driver',
        type: 'bus',
        category: 'transportation',
        priority: 'must_do',
        title: 'إضافة معلومات السائق',
        description: `${missingDriver.length} حافلة بدون معلومات السائق الكاملة`,
        totalItems: missingDriver.length,
        completedItems: 0,
        remainingItems: missingDriver.length,
        progress: 0,
        actionUrl: '/bus-transportation',
        actionLabel: 'إكمال معلومات السائق',
        urgency: 'no_deadline',
        estimatedTime: '10 min',
        dependencies: []
      });
    }

    // Documents are compliance requirement
    if (missingDocuments.length > 0) {
      tasks.push({
        id: 'bus-missing-documents',
        type: 'bus',
        category: 'transportation',
        priority: 'should_do',
        title: 'رفع مستندات الحافلات',
        description: `${missingDocuments.length} حافلة بدون مستندات مطلوبة`,
        totalItems: missingDocuments.length,
        completedItems: 0,
        remainingItems: missingDocuments.length,
        progress: 0,
        actionUrl: '/bus-transportation',
        actionLabel: 'رفع المستندات',
        urgency: 'no_deadline',
        estimatedTime: '5 min',
        dependencies: []
      });
    }
  }

  return tasks;
};

/**
 * Calculate branch info task
 */
const calculateBranchInfoTask = (branchInfo) => {
  if (!branchInfo) return null;

  const missing = [];
  if (!branchInfo.phone_number) missing.push('رقم الجوال');
  if (!branchInfo.email) missing.push('الإيميل');

  if (missing.length === 0) return null;

  return {
    id: 'branch-info',
    type: 'branch_info',
    category: 'setup',
    priority: 'critical',
    title: 'إكمال معلومات الفرع',
    description: `معلومات مفقودة: ${missing.join('، ')}`,
    totalItems: 2,
    completedItems: 2 - missing.length,
    remainingItems: missing.length,
    progress: ((2 - missing.length) / 2) * 100,
    actionUrl: '/branch-info',
    actionLabel: 'تحديث المعلومات',
    urgency: 'no_deadline',
    estimatedTime: '5 min',
    dependencies: []
  };
};

/**
 * Calculate document tasks
 */
const calculateDocumentTasks = (documents, branches, branchId, monthlyAlerts, missingAlerts, expiringDocs) => {
  const tasks = [];

  // Get branch
  const branch = branches.find(b => b.id === branchId);
  if (!branch) return tasks;

  // Critical: Expired documents
  const expiredDocs = expiringDocs.filter(doc => doc.isExpired);
  if (expiredDocs.length > 0) {
    tasks.push({
      id: 'documents-expired',
      type: 'document',
      category: 'documents',
      priority: 'critical',
      title: 'مستندات منتهية الصلاحية',
      description: `${expiredDocs.length} مستند منتهي الصلاحية`,
      totalItems: expiredDocs.length,
      completedItems: 0,
      remainingItems: expiredDocs.length,
      progress: 0,
      actionUrl: '/branch-documents',
      actionLabel: 'تجديد المستندات',
      urgency: 'expired',
      estimatedTime: '10 min',
      dependencies: []
    });
  }

  // Must Do: Combined missing and monthly documents
  const missingRequired = missingAlerts.filter(alert => alert.branchId === branchId);
  const monthlyDue = monthlyAlerts.filter(alert =>
    alert.branchId === branchId &&
    (alert.status === 'critical' || alert.status === 'must_do')
  );

  const totalDocuments = missingRequired.length + monthlyDue.length;

  if (totalDocuments > 0) {
    // Determine priority: critical if any monthly is critical, otherwise must_do
    const hasCriticalMonthly = monthlyDue.some(a => a.status === 'critical');
    const priority = hasCriticalMonthly ? 'critical' : 'must_do';

    // Determine urgency: due_soon if any monthly is critical, otherwise no_deadline
    const urgency = hasCriticalMonthly ? 'due_soon' : 'no_deadline';

    // Build human-friendly description showing missing document names in Arabic
    const docLabels = [...missingRequired, ...monthlyDue]
      .map(a => a.documentLabel)
      .filter(Boolean);

    const uniqueLabels = Array.from(new Set(docLabels));

    let description = `${totalDocuments} مستند`;
    if (uniqueLabels.length > 0) {
      const preview = uniqueLabels.slice(0, 3).join('، ');
      const extraCount = Math.max(0, uniqueLabels.length - 3);
      description = extraCount > 0
        ? `${preview} ... (${extraCount} مستند إضافي)`
        : preview;
    }

    tasks.push({
      id: 'documents-branch',
      type: 'document',
      category: 'documents',
      priority: priority,
      title: 'مستندات الفرع',
      description: description,
      totalItems: totalDocuments,
      completedItems: 0,
      remainingItems: totalDocuments,
      progress: 0,
      actionUrl: '/branch-documents',
      actionLabel: 'رفع المستندات',
      urgency: urgency,
      estimatedTime: '15 min',
      dependencies: []
    });
  }

  // Should Do: Documents expiring soon
  const expiringSoon = expiringDocs.filter(doc =>
    !doc.isExpired && doc.daysUntilExpiry <= 30
  );
  if (expiringSoon.length > 0) {
    tasks.push({
      id: 'documents-expiring',
      type: 'document',
      category: 'documents',
      priority: 'should_do',
      title: 'مستندات تنتهي قريباً',
      description: `${expiringSoon.length} مستند سينتهي خلال 30 يوم`,
      totalItems: expiringSoon.length,
      completedItems: 0,
      remainingItems: expiringSoon.length,
      progress: 0,
      actionUrl: '/branch-documents',
      actionLabel: 'تجديد المستندات',
      urgency: 'due_soon',
      estimatedTime: '15 min',
      dependencies: []
    });
  }

  return tasks;
};

/**
 * Calculate employee tasks
 */
const calculateEmployeeTasks = (incompleteEmployees) => {
  const tasks = [];

  if (incompleteEmployees.length === 0) return tasks;

  tasks.push({
    id: 'employees-incomplete',
    type: 'employee',
    category: 'employees',
    priority: 'must_do',
    title: 'إكمال بيانات الموظفين',
    description: `${incompleteEmployees.length} موظف يحتاج إكمال بياناته`,
    totalItems: incompleteEmployees.length,
    completedItems: 0,
    remainingItems: incompleteEmployees.length,
    progress: 0,
    actionUrl: '/employees',
    actionLabel: 'إكمال البيانات',
    urgency: 'no_deadline',
    estimatedTime: '5 min لكل موظف',
    dependencies: []
  });

  return tasks;
};

/**
 * Calculate notification tasks
 */
const calculateNotificationTasks = (notifications) => {
  const tasks = [];

  const unresponded = notifications.filter(notif => !notif.response_status);

  if (unresponded.length === 0) return tasks;

  tasks.push({
    id: 'notifications-unresponded',
    type: 'notification',
    category: 'responses',
    priority: 'should_do',
    title: 'ردود على الإشعارات',
    description: `${unresponded.length} إشعار يحتاج رد`,
    totalItems: unresponded.length,
    completedItems: 0,
    remainingItems: unresponded.length,
    progress: 0,
    actionUrl: '#notifications', // Scroll to notifications section
    actionLabel: 'الرد على الإشعارات',
    urgency: 'no_deadline',
    estimatedTime: '2 min لكل إشعار',
    dependencies: []
  });

  return tasks;
};

/**
 * Calculate employee contract data task
 */
const calculateEmployeeContractDataTask = (missingEmployeeContractData) => {
  if (!missingEmployeeContractData || missingEmployeeContractData.length === 0) {
    return null;
  }

  return {
    id: 'employee-contract-data',
    type: 'employee_contract_data',
    category: 'employees',
    priority: 'critical',
    title: 'استكمال بيانات عقود الموظفين',
    description: `${missingEmployeeContractData.length} موظف يحتاج إدخال تواريخ العقد والمؤهل الأساسي`,
    totalItems: missingEmployeeContractData.length,
    completedItems: 0,
    remainingItems: missingEmployeeContractData.length,
    progress: 0,
    actionUrl: '#employee-contract-data',
    actionLabel: 'استكمال البيانات',
    urgency: 'no_deadline',
    estimatedTime: '10 min',
    dependencies: [],
    hasInlineEditor: true
  };
};

/**
 * Calculate total salary for an employee
 * Uses computed total_salary column if available, otherwise calculates manually
 */
const calculateTotalSalary = (employee) => {
  // Use computed total_salary column if available
  if (employee.total_salary != null) {
    return parseFloat(employee.total_salary);
  }

  // Fallback: calculate manually
  const baseSalary = parseFloat(employee.base_salary || 0);
  const housingAllowance = parseFloat(employee.housing_allowance || 0);
  const transportationAllowance = parseFloat(employee.transportation_allowance || 0);
  const endOfServiceAllowance = parseFloat(employee.end_of_service_allowance || 0);
  const annualLeaveAllowance = parseFloat(employee.annual_leave_allowance || 0);
  const otherAllowances = parseFloat(employee.other_allowances || 0);

  return baseSalary + housingAllowance + transportationAllowance +
    endOfServiceAllowance + annualLeaveAllowance + otherAllowances;
};

/**
 * Get employee full name
 */
const getEmployeeFullName = (employee) => {
  return `${employee.first_name || ''} ${employee.second_name || ''} ${employee.third_name || ''} ${employee.fourth_name || ''}`.trim();
};

/**
 * Calculate add employee task (when branch info employee count doesn't match records)
 */
const calculateAddEmployeeTask = (branchInfo, employees = []) => {
  if (!branchInfo || !branchInfo.number_of_employees) {
    return null;
  }

  // Count only active employees (status is null or 'active')
  const activeEmployees = employees.filter(emp =>
    !emp.status || emp.status === 'active'
  );
  const activeCount = activeEmployees.length;
  const expectedCount = branchInfo.number_of_employees;

  // Only create task if expected count is greater than active count
  if (expectedCount <= activeCount) {
    return null;
  }

  const missingCount = expectedCount - activeCount;

  return {
    id: 'employee-add-mismatch',
    type: 'employee_add',
    category: 'employees',
    priority: 'should_do',
    title: 'عدد الموظفين في معلومات الفرع لا يتطابق مع السجلات',
    description: `عدد الموظفين المحدد في معلومات الفرع: ${expectedCount}، عدد السجلات الفعلية: ${activeCount}، المطلوب إضافة: ${missingCount} موظف`,
    totalItems: expectedCount,
    completedItems: activeCount,
    remainingItems: missingCount,
    progress: (activeCount / expectedCount) * 100,
    actionUrl: '/employees',
    actionLabel: 'إضافة موظف',
    urgency: 'no_deadline',
    estimatedTime: '10 min لكل موظف',
    dependencies: []
  };
};

/**
 * Calculate salary review task (employees with salary issues)
 */
const calculateSalaryReviewTask = (employees = []) => {
  if (!employees || employees.length === 0) {
    return null;
  }

  // Filter to only active employees
  const activeEmployees = employees.filter(emp =>
    !emp.status || emp.status === 'active'
  );

  if (activeEmployees.length === 0) {
    return null;
  }

  // Calculate total salary for each employee and identify issues
  const employeeList = [];

  activeEmployees.forEach(employee => {
    const totalSalary = calculateTotalSalary(employee);
    let issueType = null;

    // Check for low salary (<= 0 or < 500)
    if (totalSalary <= 0 || totalSalary < 500) {
      issueType = 'low';
    }
    // Check for high salary (>= 13000)
    else if (totalSalary >= 13000) {
      issueType = 'high';
    }

    if (issueType) {
      employeeList.push({
        employee,
        totalSalary,
        issueType,
        employeeName: getEmployeeFullName(employee)
      });
    }
  });

  // Only create task if there are employees with salary issues
  if (employeeList.length === 0) {
    return null;
  }

  const lowSalaryCount = employeeList.filter(item => item.issueType === 'low').length;
  const highSalaryCount = employeeList.filter(item => item.issueType === 'high').length;

  // Build description
  let description = '';
  if (lowSalaryCount > 0 && highSalaryCount > 0) {
    description = `${lowSalaryCount} موظف براتب منخفض (0 أو أقل من 500 ريال)، ${highSalaryCount} موظف براتب مرتفع (13000 ريال أو أكثر)`;
  } else if (lowSalaryCount > 0) {
    description = `${lowSalaryCount} موظف براتب منخفض (0 أو أقل من 500 ريال) يحتاج إضافة راتب`;
  } else {
    description = `${highSalaryCount} موظف براتب مرتفع (13000 ريال أو أكثر) يحتاج مراجعة`;
  }

  return {
    id: 'employee-salary-review',
    type: 'salary_review',
    category: 'employees',
    priority: 'should_do',
    title: 'مراجعة رواتب الموظفين',
    description: description,
    totalItems: employeeList.length,
    completedItems: 0,
    remainingItems: employeeList.length,
    progress: 0,
    actionUrl: '/employees',
    actionLabel: 'عرض الموظفين',
    urgency: 'no_deadline',
    estimatedTime: '5 min',
    dependencies: [],
    hasInlineEditor: true,
    employeeList: employeeList
  };
};

/**
 * Validate IBAN format (SA + 22 digits)
 */
const validateIBAN = (iban) => {
  if (!iban || typeof iban !== 'string') {
    return { valid: false, issueType: 'missing' };
  }

  // Remove spaces and convert to uppercase
  const cleanIBAN = iban.replace(/\s/g, '').toUpperCase();

  // Check if starts with SA
  if (!cleanIBAN.startsWith('SA')) {
    return { valid: false, issueType: 'invalid_format' };
  }

  // Check total length (SA + 22 digits = 24 characters)
  if (cleanIBAN.length !== 24) {
    return { valid: false, issueType: 'short' };
  }

  // Check if the remaining 22 characters are all digits
  const numbers = cleanIBAN.substring(2);
  if (!/^\d{22}$/.test(numbers)) {
    return { valid: false, issueType: 'invalid_format' };
  }

  return { valid: true };
};

/**
 * Calculate IBAN review task (employees with invalid IBAN numbers)
 */
const calculateIBANReviewTask = (employees = []) => {
  if (!employees || employees.length === 0) {
    return null;
  }

  // Filter to only active employees
  const activeEmployees = employees.filter(emp =>
    !emp.status || emp.status === 'active'
  );

  if (activeEmployees.length === 0) {
    return null;
  }

  // Find employees with invalid IBANs
  const employeeList = [];

  activeEmployees.forEach(employee => {
    const validation = validateIBAN(employee.bank_iban);

    if (!validation.valid) {
      employeeList.push({
        employee,
        iban: employee.bank_iban || '',
        issueType: validation.issueType,
        employeeName: getEmployeeFullName(employee)
      });
    }
  });

  // Only create task if there are employees with IBAN issues
  if (employeeList.length === 0) {
    return null;
  }

  const missingCount = employeeList.filter(item => item.issueType === 'missing').length;
  const invalidCount = employeeList.filter(item => item.issueType !== 'missing').length;

  // Build description
  let description = '';
  if (missingCount > 0 && invalidCount > 0) {
    description = `${missingCount} موظف بدون آيبان، ${invalidCount} موظف بآيبان غير صحيح`;
  } else if (missingCount > 0) {
    description = `${missingCount} موظف بحاجة إلى إضافة رقم الآيبان`;
  } else {
    description = `${invalidCount} موظف بآيبان غير صحيح يحتاج تصحيح`;
  }

  return {
    id: 'employee-iban-review',
    type: 'iban_review',
    category: 'employees',
    priority: 'should_do',
    title: 'مراجعة أرقام الآيبان',
    description: description,
    totalItems: employeeList.length,
    completedItems: 0,
    remainingItems: employeeList.length,
    progress: 0,
    actionUrl: '/employees',
    actionLabel: 'عرض الموظفين',
    urgency: 'no_deadline',
    estimatedTime: '5 min',
    dependencies: [],
    hasInlineEditor: true,
    employeeList: employeeList
  };
};

/**
 * Calculate beneficiary registration task (healthcare centers only)
 */
const calculateBeneficiaryTask = (branchType, beneficiaryCount) => {
  // Only for healthcare center branches
  if (branchType !== 'healthcare_center') return null;

  // If beneficiaries are already entered, no task needed
  if (beneficiaryCount > 0) return null;

  return {
    id: 'beneficiary-registration',
    type: 'beneficiary',
    category: 'employees',
    priority: 'must_do',
    title: 'تسجيل بيانات المستفيدين',
    description: 'لم يتم تسجيل أي مستفيد للفصل الحالي. يجب إدخال بيانات المستفيدين',
    totalItems: 1,
    completedItems: 0,
    remainingItems: 1,
    progress: 0,
    actionUrl: '/beneficiaries',
    actionLabel: 'تسجيل المستفيدين',
    urgency: 'no_deadline',
    estimatedTime: '30 min',
    dependencies: []
  };
};

/**
 * Calculate payroll absence task
 */
const calculatePayrollAbsenceTask = (payrollAbsenceState) => {
  if (!payrollAbsenceState) {
    return null;
  }

  const { state, target_open_at, days_until_open } = payrollAbsenceState;

  // Only show as a task when entry is actually open — not during countdown
  if (state !== 'entry_open') {
    return null;
  }

  return {
    id: 'payroll-absence',
    type: 'payroll_absence',
    category: 'payroll',
    priority: 'critical',
    title: 'تسجيل غياب الموظفين',
    description: 'التسجيل مفتوح الآن! يجب تسجيل غياب الموظفين لهذا الشهر',
    totalItems: 1,
    completedItems: 0,
    remainingItems: 1,
    progress: 0,
    actionUrl: '#payroll-absence',
    actionLabel: 'تسجيل الغياب',
    urgency: 'due_soon',
    estimatedTime: '15 min',
    dependencies: [],
    hasInlineEditor: true,
    deadline: target_open_at,
    daysUntilDeadline: days_until_open || 0,
    isWaiting: false,
    isEntryOpen: true
  };
};

/**
 * Calculate priority score for sorting
 */
const calculatePriorityScore = (task) => {
  let score = 0;

  // Category order weight (highest = first)
  // This ensures proper ordering: setup → employees → transportation → documents → payroll → responses
  const categoryOrder = {
    setup: 10000,          // Branch info - always first
    employees: 9000,       // Employee-related tasks - second
    transportation: 7000,  // Bus transportation - third
    documents: 5000,       // Documents - fourth
    payroll: 3000,         // Payroll - last (except when entry_open)
    responses: 1000        // Notifications - very last
  };

  // Special case for payroll absence:
  // When entry_open: gets ABSOLUTE HIGHEST priority (above everything - temporary and most important)
  if (task.type === 'payroll_absence' && task.isEntryOpen) {
    score += 50000; // Way above everything - this is the most critical task when open
  } else {
    score += categoryOrder[task.category] || 0;
  }

  // Priority weight (within category)
  const priorityWeights = {
    critical: 1000,
    must_do: 500,
    should_do: 200,
    nice_to_have: 50
  };
  score += priorityWeights[task.priority] || 0;

  // Urgency weight
  const urgencyWeights = {
    expired: 500,
    due_soon: 200,
    due_later: 100,
    no_deadline: 0
  };
  score += urgencyWeights[task.urgency] || 0;

  // Impact weight (more items = higher impact)
  score += Math.min(task.remainingItems * 10, 200);

  // Progress weight (less progress = higher priority)
  score += (100 - task.progress) * 2;

  return score;
};

/**
 * Calculate employee expiry tasks from summary data
 */
const calculateEmployeeExpiryTasks = (expirySummary) => {
  const tasks = [];
  if (!expirySummary?.totals) return tasks;

  const { expired, within_30_days } = expirySummary.totals;

  if (expired > 0) {
    tasks.push({
      id: 'employee-expiry-expired',
      type: 'employee',
      category: 'employees',
      priority: 'critical',
      title: 'تواريخ موظفين منتهية',
      description: `${expired} تاريخ منتهي (هوية/عقد/جواز/مستند)`,
      totalItems: expired,
      completedItems: 0,
      remainingItems: expired,
      progress: 0,
      actionUrl: '/employee-expiry',
      actionLabel: 'مراجعة التواريخ',
      urgency: 'expired',
      estimatedTime: '15 min',
      dependencies: []
    });
  }

  if (within_30_days > 0) {
    tasks.push({
      id: 'employee-expiry-soon',
      type: 'employee',
      category: 'employees',
      priority: 'should_do',
      title: 'تواريخ موظفين قريبة الانتهاء',
      description: `${within_30_days} تاريخ ينتهي خلال 30 يوم`,
      totalItems: within_30_days,
      completedItems: 0,
      remainingItems: within_30_days,
      progress: 0,
      actionUrl: '/employee-expiry',
      actionLabel: 'مراجعة التواريخ',
      urgency: 'warning',
      estimatedTime: '10 min',
      dependencies: []
    });
  }

  return tasks;
};

/**
 * Main function to calculate all tasks
 */
export const calculateTasks = ({
  branchInfo,
  branches,
  documents,
  incompleteEmployees,
  notifications,
  monthlyDocumentAlerts,
  missingBranchDocumentAlerts,
  documentsWithExpiry,
  buses = [],
  missingEmployeeContractData = [],
  payrollAbsenceState = null,
  employees = [],
  beneficiaryCount = 0,
  employeeExpirySummary = null
}) => {
  const branchId = branchInfo?.id;
  if (!branchId) return [];

  const tasks = [];

  // 1. Branch Info (Critical) - Always first
  const branchInfoTask = calculateBranchInfoTask(branchInfo);
  if (branchInfoTask) tasks.push(branchInfoTask);

  // 2. Employee Contract Data (Critical) - Employee related, comes before bus
  const employeeContractDataTask = calculateEmployeeContractDataTask(missingEmployeeContractData);
  if (employeeContractDataTask) tasks.push(employeeContractDataTask);

  // 2.5. Add Employee Task - When branch info employee count doesn't match records
  const addEmployeeTask = calculateAddEmployeeTask(branchInfo, employees);
  if (addEmployeeTask) tasks.push(addEmployeeTask);

  // 2.6. Salary Review Task - Employees with salary issues
  const salaryReviewTask = calculateSalaryReviewTask(employees);
  if (salaryReviewTask) tasks.push(salaryReviewTask);

  // 2.7. IBAN Review Task - Employees with invalid IBAN numbers
  const ibanReviewTask = calculateIBANReviewTask(employees);
  if (ibanReviewTask) tasks.push(ibanReviewTask);

  // 2.8. Beneficiary Registration Task (healthcare centers only)
  const beneficiaryTask = calculateBeneficiaryTask(branchInfo?.branch_type, beneficiaryCount);
  if (beneficiaryTask) tasks.push(beneficiaryTask);

  // 3. Employees (Must Do) - Employee related, comes before bus
  const employeeTasks = calculateEmployeeTasks(incompleteEmployees);
  tasks.push(...employeeTasks);

  // 3.5. Employee Expiry Dates
  const expiryTasks = calculateEmployeeExpiryTasks(employeeExpirySummary);
  tasks.push(...expiryTasks);

  // 4. Payroll Absence (exception: if entry_open, it goes between employees and bus)
  const payrollAbsenceTask = calculatePayrollAbsenceTask(payrollAbsenceState);
  if (payrollAbsenceTask) tasks.push(payrollAbsenceTask);

  // 5. Bus Transportation - After all employee related tasks
  const busTasks = calculateBusTasks(buses, branchId);
  tasks.push(...busTasks);

  // 6. Documents - After bus
  const documentTasks = calculateDocumentTasks(
    documents,
    branches,
    branchId,
    monthlyDocumentAlerts,
    missingBranchDocumentAlerts,
    documentsWithExpiry
  );
  tasks.push(...documentTasks);

  // 7. Notifications - Last
  const notificationTasks = calculateNotificationTasks(notifications);
  tasks.push(...notificationTasks);

  // Sort by priority score (highest first)
  // Category weights ensure: setup → employees → payroll (if entry_open) → transportation → documents → responses
  tasks.sort((a, b) => calculatePriorityScore(b) - calculatePriorityScore(a));

  return tasks;
};

/**
 * Calculate category progress
 */
export const calculateCategoryProgress = (tasks) => {
  const categories = {
    setup: { total: 0, completed: 0 },
    documents: { total: 0, completed: 0 },
    transportation: { total: 0, completed: 0 },
    employees: { total: 0, completed: 0 },
    payroll: { total: 0, completed: 0 },
    responses: { total: 0, completed: 0 }
  };

  tasks.forEach(task => {
    if (categories[task.category]) {
      categories[task.category].total += task.totalItems;
      categories[task.category].completed += task.completedItems;
    }
  });

  // Calculate percentages (inverted: 0% = all done, 100% = nothing done)
  const result = {};
  Object.keys(categories).forEach(category => {
    const { total, completed } = categories[category];
    const remaining = total - completed;
    result[category] = {
      total,
      completed,
      remaining: remaining,
      progress: total > 0 ? Math.round((remaining / total) * 100) : 0
    };
  });

  // Calculate overall progress (inverted: 0% = all done, 100% = nothing done)
  const overallTotal = Object.values(categories).reduce((sum, cat) => sum + cat.total, 0);
  const overallCompleted = Object.values(categories).reduce((sum, cat) => sum + cat.completed, 0);
  const overallRemaining = overallTotal - overallCompleted;
  result.overall = {
    total: overallTotal,
    completed: overallCompleted,
    remaining: overallRemaining,
    progress: overallTotal > 0 ? Math.round((overallRemaining / overallTotal) * 100) : 0
  };

  return result;
};

/**
 * Get category label in Arabic
 */
export const getCategoryLabel = (category) => {
  const labels = {
    setup: 'إعداد الفرع',
    documents: 'المستندات',
    transportation: 'النقل',
    employees: 'الموظفين',
    payroll: 'مسيرات الرواتب',
    responses: 'الردود'
  };
  return labels[category] || category;
};

/**
 * Export IBAN validation function for reuse
 */
export { validateIBAN };
