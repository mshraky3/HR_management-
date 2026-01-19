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

  // Task 2: Check for incomplete buses
  const incompleteBuses = branchBuses.filter(bus => !isBusComplete(bus));
  
  if (incompleteBuses.length > 0) {
    // Check specific missing fields
    const missingStudentCount = incompleteBuses.filter(bus => 
      bus.student_count === null || bus.student_count === undefined
    );
    
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
  
  // Debug logging to diagnose document count issue
  if (missingRequired.length > 0 || monthlyDue.length > 0) {
    console.log('[taskPrioritizer] Document tasks calculation:', {
      branchId,
      missingAlertsTotal: missingAlerts.length,
      missingRequired: missingRequired.length,
      missingRequiredDetails: missingRequired.map(a => ({ 
        branchId: a.branchId, 
        type: a.documentType, 
        label: a.documentLabel,
        message: a.message
      })),
      monthlyAlertsTotal: monthlyAlerts.length,
      monthlyDue: monthlyDue.length,
      monthlyDueDetails: monthlyDue.map(a => ({ 
        branchId: a.branchId,
        type: a.documentType, 
        label: a.documentLabel, 
        status: a.status,
        message: a.message
      })),
      availableDocuments: documents.filter(d => d.branch_id === branchId).map(d => ({
        id: d.id,
        type: d.document_type,
        is_active: d.is_active,
        has_file_url: !!d.file_url,
        has_blob_url: !!d.blob_url
      }))
    });
  }
  
  const totalDocuments = missingRequired.length + monthlyDue.length;
  
  if (totalDocuments > 0) {
    // Determine priority: critical if any monthly is critical, otherwise must_do
    const hasCriticalMonthly = monthlyDue.some(a => a.status === 'critical');
    const priority = hasCriticalMonthly ? 'critical' : 'must_do';
    
    // Determine urgency: due_soon if any monthly is critical, otherwise no_deadline
    const urgency = hasCriticalMonthly ? 'due_soon' : 'no_deadline';
    
    // Build description - simplified: just show total count
    const description = `${totalDocuments} مستند`;
    
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
 */
const calculateTotalSalary = (employee) => {
  const baseSalary = parseFloat(employee.base_salary || 0);
  const housingAllowance = parseFloat(employee.housing_allowance || 0);
  const transportationAllowance = parseFloat(employee.transportation_allowance || 0);
  const endOfServiceAllowance = parseFloat(employee.end_of_service_allowance || 0);
  const annualLeaveAllowance = parseFloat(employee.annual_leave_allowance || 0);
  const otherAllowances = parseFloat(employee.other_allowances || 0);
  const deductions = parseFloat(employee.deductions || 0);
  
  return baseSalary + housingAllowance + transportationAllowance + 
         endOfServiceAllowance + annualLeaveAllowance + otherAllowances - deductions;
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
    
    // Check for low salary (<= 0 or < 1000)
    if (totalSalary <= 0 || totalSalary < 1000) {
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
    description = `${lowSalaryCount} موظف براتب منخفض (0 أو أقل من 1000 ريال)، ${highSalaryCount} موظف براتب مرتفع (13000 ريال أو أكثر)`;
  } else if (lowSalaryCount > 0) {
    description = `${lowSalaryCount} موظف براتب منخفض (0 أو أقل من 1000 ريال) يحتاج إضافة راتب`;
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
 * Calculate payroll absence task
 */
const calculatePayrollAbsenceTask = (payrollAbsenceState) => {
  if (!payrollAbsenceState) {
    return null;
  }

  const { state, target_open_at, days_until_open } = payrollAbsenceState;

  // If already submitted or closed, no task needed
  if (state === 'view_only' || state === 'closed') {
    return null;
  }

  // Format date helper
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const isEntryOpen = state === 'entry_open';
  const isCountdown = state === 'countdown' || state === 'countdown_next';
  const isWaiting = !isEntryOpen; // Waiting for entry to open

  // If waiting, don't create a task (treat as done until it opens)
  if (isWaiting) {
    return null;
  }

  return {
    id: 'payroll-absence',
    type: 'payroll_absence',
    category: 'payroll',
    priority: 'must_do', // Only shown when entry is open
    title: 'تسجيل غياب الموظفين',
    description: 'يجب تسجيل غياب الموظفين لهذا الشهر',
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
    daysUntilDeadline: days_until_open || 0
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

  // Special cases for payroll absence:
  // 1. When entry_open: gets higher priority (between employees and transportation)
  // 2. When waiting/countdown: gets LOWEST priority (after notifications)
  if (task.type === 'payroll_absence') {
    if (task.urgency === 'due_soon') {
      // Entry is open - high priority
      score += 8000; // Between employees (9000) and transportation (7000)
    } else if (task.isWaiting || task.urgency === 'no_deadline' || task.urgency === 'due_later') {
      // Waiting for entry to open - lowest priority (even lower than notifications)
      score += 500; // Very low priority, below notifications (1000)
    } else {
      score += categoryOrder[task.category] || 0;
    }
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
  employees = []
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

  // 3. Employees (Must Do) - Employee related, comes before bus
  const employeeTasks = calculateEmployeeTasks(incompleteEmployees);
  tasks.push(...employeeTasks);

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
