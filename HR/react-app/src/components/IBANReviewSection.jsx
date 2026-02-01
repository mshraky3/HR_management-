/**
 * IBAN Review Section Component
 * Displays employees with invalid IBAN numbers
 */

import { useNavigate } from 'react-router-dom';
import './SalaryReviewSection.css'; // Reuse same styles

const IBANReviewSection = ({ employeeList = [], onComplete }) => {
    const navigate = useNavigate();

    if (!employeeList || employeeList.length === 0) {
        return null;
    }

    // Format IBAN for display (add space after SA for readability)
    const formatIBAN = (iban) => {
        if (!iban) return 'غير موجود';
        return iban.replace(/^(SA)(\d+)/, '$1 $2');
    };

    // Get issue description
    const getIssueDescription = (issueType, iban) => {
        if (issueType === 'missing') {
            return 'رقم الآيبان غير موجود';
        } else if (issueType === 'invalid_format') {
            return 'صيغة غير صحيحة';
        } else if (issueType === 'short') {
            const currentLength = iban ? iban.replace(/\s/g, '').length : 0;
            return `قصير جداً (${currentLength} حرف بدلاً من 24)`;
        }
        return 'يحتاج مراجعة';
    };

    return (
        <div className="salary-review-card">
            <h2>مراجعة أرقام الآيبان</h2>
            <p className="helper-text">
                الموظفون التاليون لديهم أرقام آيبان غير صحيحة. الصيغة الصحيحة: SA متبوعة بـ 22 رقم (إجمالي 24 حرف).
            </p>

            <div className="salary-group-section">
                <h3 className="salary-group-title low-salary">
                    <span className="group-icon">🏦</span>
                    أرقام آيبان تحتاج مراجعة
                    <span className="group-count">({employeeList.length})</span>
                </h3>
                <div className="salary-table-wrapper">
                    <table className="salary-review-table">
                        <thead>
                            <tr>
                                <th>الموظف</th>
                                <th>رقم الآيبان الحالي</th>
                                <th>المشكلة</th>
                                <th>إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {employeeList.map((item) => (
                                <tr key={item.employee.id}>
                                    <td data-label="الموظف">{item.employeeName}</td>
                                    <td data-label="رقم الآيبان" className="iban-value" dir="ltr" style={{ textAlign: 'left', fontFamily: 'monospace' }}>
                                        {formatIBAN(item.iban)}
                                    </td>
                                    <td data-label="المشكلة">
                                        <span className="badge badge-warning">
                                            {getIssueDescription(item.issueType, item.iban)}
                                        </span>
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

export default IBANReviewSection;
