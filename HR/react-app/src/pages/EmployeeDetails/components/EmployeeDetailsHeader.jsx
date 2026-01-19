const EmployeeDetailsHeader = ({ onBack }) => {
  return (
    <div className="employee-details-header">
      <h1>تفاصيل الموظف</h1>
      <div className="employee-details-header-actions">
        <button onClick={onBack} className="btn btn-secondary btn-md">
          ← العودة للقائمة
        </button>
      </div>
    </div>
  );
};

export default EmployeeDetailsHeader;
