/**
 * Salary Review Section Component
 * Displays employees with salary issues (low or high salary)
 */

import { useNavigate } from 'react-router-dom';
import './SalaryReviewSection.css';

const SalaryReviewSection = ({ employeeList = [], onComplete }) => {
  const navigate = useNavigate();
  if (!employeeList || employeeList.length === 0) {
    return null;
  }

  // Separate employees by issue type
  const lowSalaryEmployees = employeeList.filter(item => item.issueType === 'low');
  const highSalaryEmployees = employeeList.filter(item => item.issueType === 'high');

  // Format salary with commas and "ريال"
  const formatSalary = (amount) => {
    return `${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال`;
  };

  return (
    <div className="salary-review-card">
      <h2>مراجعة رواتب الموظفين</h2>
      <p className="helper-text">
        الموظفون التاليون يحتاجون مراجعة رواتبهم. يمكنك النقر على "تعديل" للانتقال إلى صفحة تعديل الموظف وتعديل الراتب.
      </p>

      {/* Low Salary Section */}
      {lowSalaryEmployees.length > 0 && (
        <div className="salary-group-section">
          <h3 className="salary-group-title low-salary">
            <span className="group-icon">⚠️</span>
            رواتب منخفضة (0 أو أقل من 1000 ريال)
            <span className="group-count">({lowSalaryEmployees.length})</span>
          </h3>
          <div className="salary-table-wrapper">
            <table className="salary-review-table">
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>إجمالي الراتب</th>
                  <th>الحالة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {lowSalaryEmployees.map((item) => (
                  <tr key={item.employee.id}>
                    <td data-label="الموظف">{item.employeeName}</td>
                    <td data-label="إجمالي الراتب" className="salary-amount">{formatSalary(item.totalSalary)}</td>
                    <td data-label="الحالة">
                      <span className="badge badge-warning">راتب منخفض</span>
                    </td>
                    <td data-label="إجراءات">
                      <button
                        onClick={() => navigate('/employees', { state: { editEmployeeId: item.employee.id } })}
                        className="btn btn-primary btn-sm"
                      >
                        تعديل
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* High Salary Section */}
      {highSalaryEmployees.length > 0 && (
        <div className="salary-group-section">
          <h3 className="salary-group-title high-salary">
            <span className="group-icon">💰</span>
            رواتب مرتفعة (13000 ريال أو أكثر)
            <span className="group-count">({highSalaryEmployees.length})</span>
          </h3>
          <div className="salary-table-wrapper">
            <table className="salary-review-table">
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>إجمالي الراتب</th>
                  <th>الحالة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {highSalaryEmployees.map((item) => (
                  <tr key={item.employee.id}>
                    <td data-label="الموظف">{item.employeeName}</td>
                    <td data-label="إجمالي الراتب" className="salary-amount">{formatSalary(item.totalSalary)}</td>
                    <td data-label="الحالة">
                      <span className="badge badge-info">راتب مرتفع</span>
                    </td>
                    <td data-label="إجراءات">
                      <button
                        onClick={() => navigate('/employees', { state: { editEmployeeId: item.employee.id } })}
                        className="btn btn-primary btn-sm"
                      >
                        تعديل
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="salary-review-actions">
        <button
          onClick={() => navigate('/employees')}
          className="btn btn-secondary"
        >
          عرض جميع الموظفين
        </button>
      </div>
    </div>
  );
};

export default SalaryReviewSection;
