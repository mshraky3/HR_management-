import { DATA_COMPLETION_STATUS } from '../../../utils/employeeConstants';

const getInitials = (firstName, secondName) => {
  const first = firstName?.charAt(0) || '';
  const second = secondName?.charAt(0) || '';
  return (first + second).toUpperCase() || '?';
};

const getStatusBadgeClass = (status) => {
  const statusMap = {
    active: 'badge-success',
    pending: 'badge-warning',
    terminated_article_80: 'badge-danger',
    terminated_article_77: 'badge-danger',
    resigned: 'badge-danger',
    contract_ended: 'badge-secondary',
    non_renewal: 'badge-secondary',
    other: 'badge-secondary',
  };
  return statusMap[status] || 'badge-secondary';
};

const getStatusLabel = (status) => {
  const statusLabels = {
    active: 'نشط',
    pending: 'قيد الانتظار',
    terminated_article_80: 'فصل حسب المادة 80',
    terminated_article_77: 'فصل حسب المادة 77',
    resigned: 'استقال',
    contract_ended: 'انتهى العقد',
    non_renewal: 'عدم التجديد',
    other: 'أخرى',
  };
  return statusLabels[status] || status;
};

const EmployeeProfileCard = ({
  employee,
  missingData,
  hasMissingFields,
  onOpenEdit,
  children,
}) => {
  const branches = Array.isArray(employee.branches) ? employee.branches : [];
  const isMultiBranch = branches.length > 1;

  return (
    <div className="employee-profile-card">
      <div className="employee-profile-header">
        <div className="employee-avatar">
          {getInitials(employee.first_name, employee.second_name)}
        </div>
        <div className="employee-name-section">
          <h2>
            {employee.first_name} {employee.second_name} {employee.third_name} {employee.fourth_name}
          </h2>
          <div className="employee-id">رقم الموظف: {employee.employee_id_number}</div>
          <span className={`employee-status-badge ${getStatusBadgeClass(employee.status || 'active')}`}>
            {getStatusLabel(employee.status || 'active')}
          </span>
          {branches.length > 0 && (
            <div className="employee-branches">
              <span className="badge badge-info" style={{ marginLeft: '8px' }}>
                {isMultiBranch ? 'يعمل في عدة فروع' : 'فرع واحد'}
              </span>
              <div className="branches-list">
                {branches.map((b) => (
                  <span key={b.branch_id} className="branch-chip">
                    {b.branch_name || `فرع ${b.branch_id}`}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {(employee.data_completion_status === DATA_COMPLETION_STATUS.INCOMPLETE || !employee.data_completion_status) && (
        <div className="alert-card alert-warning">
          <h2>
            <img
              src="https://img.icons8.com/material-rounded/24/error.png"
              alt="تحذير"
              style={{ width: '24px', height: '24px', marginLeft: '8px' }}
            />
            البيانات الناقصة
          </h2>
          <p>هذا الموظف يحتاج إلى إكمال البيانات التالية:</p>
          {missingData?.missingFields && missingData.missingFields.length > 0 ? (
            <ul>
              {missingData.missingFields.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          ) : (
            <div>
              <p style={{ fontStyle: 'italic', marginBottom: '10px' }}>جاري تحميل قائمة البيانات الناقصة...</p>
              <p style={{ fontSize: '13px' }}>
                قد تشمل البيانات الناقصة: المعلومات الشخصية، المستندات المطلوبة، أو البيانات الخاصة بالمهنة أو نوع الفرع.
              </p>
            </div>
          )}
          <div style={{ marginTop: '15px' }}>
            <button
              onClick={onOpenEdit}
              className="btn btn-warning btn-md"
              disabled={!hasMissingFields}
            >
              إكمال البيانات الآن
            </button>
          </div>
        </div>
      )}

      {children}
    </div>
  );
};

export default EmployeeProfileCard;
