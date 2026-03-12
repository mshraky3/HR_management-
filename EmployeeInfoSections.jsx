import { isSaudi } from "../../../utils/employeeHelpers";
import { formatDate } from "../../../utils/dateConverters";

// Religion translation mapping
const getReligionLabel = (religion) => {
  const religionMap = {
    Islam: "الإسلام",
    Christianity: "المسيحية",
    Judaism: "اليهودية",
    Others: "أخرى",
  };
  return religionMap[religion] || religion || "-";
};

// Marital status translation mapping
const getMaritalStatusLabel = (maritalStatus) => {
  const maritalStatusMap = {
    Single: "أعزب",
    Married: "متزوج",
    Divorced: "مطلق",
    Widowed: "أرمل",
  };
  return maritalStatusMap[maritalStatus] || maritalStatus || "-";
};

const EmployeeInfoSections = ({ employee, branches }) => (
  <>
    <div className="employee-info-section">
      <h2 className="section-title">القسم الأول: المعلومات الأساسية</h2>
      <table className="employee-info-table">
        <tbody>
          <tr>
            <th>المهنة</th>
            <td>{employee.occupation || "-"}</td>
            <th>الجنسية</th>
            <td>{employee.nationality || "-"}</td>
          </tr>
          <tr>
            <th>الفرع</th>
            <td>
              {branches.find((b) => b.id === employee.branch_id)?.branch_name ||
                employee.branch_id ||
                "-"}
            </td>
            <th>الجنس</th>
            <td>
              {employee.gender === "male"
                ? "ذكر"
                : employee.gender === "female"
                  ? "أنثى"
                  : "-"}
            </td>
          </tr>
          <tr>
            <th>نوع الهوية</th>
            <td>
              {employee.id_type === "citizen"
                ? "مواطن"
                : employee.id_type === "resident"
                  ? "مقيم"
                  : "-"}
            </td>
            <th>رقم الهوية/الإقامة</th>
            <td>{employee.id_or_residency_number || "-"}</td>
          </tr>
          {employee.date_of_birth_hijri && isSaudi(employee.nationality) && (
            <tr>
              <th>تاريخ الميلاد</th>
              <td colSpan="3">{employee.date_of_birth_hijri}</td>
            </tr>
          )}
          {!employee.date_of_birth_hijri &&
            employee.date_of_birth_gregorian &&
            isSaudi(employee.nationality) && (
              <tr>
                <th>تاريخ الميلاد</th>
                <td colSpan="3">-</td>
              </tr>
            )}
          {employee.date_of_birth_gregorian &&
            !isSaudi(employee.nationality) && (
              <tr>
                <th>تاريخ الميلاد</th>
                <td colSpan="3">
                  {formatDate(employee.date_of_birth_gregorian)}
                </td>
              </tr>
            )}
          {(employee.id_expiry_date_hijri ||
            employee.id_expiry_date_gregorian) && (
              <tr>
                {employee.id_expiry_date_hijri && (
                  <>
                    <th>انتهاء الهوية (هجري)</th>
                    <td>{employee.id_expiry_date_hijri}</td>
                  </>
                )}
                {employee.id_expiry_date_gregorian && (
                  <>
                    <th>انتهاء الهوية (ميلادي)</th>
                    <td>{formatDate(employee.id_expiry_date_gregorian)}</td>
                  </>
                )}
              </tr>
            )}
          {(employee.religion || employee.marital_status) && (
            <tr>
              {employee.religion && (
                <>
                  <th>الديانة</th>
                  <td>{getReligionLabel(employee.religion)}</td>
                </>
              )}
              {employee.marital_status && (
                <>
                  <th>الحالة الاجتماعية</th>
                  <td>{getMaritalStatusLabel(employee.marital_status)}</td>
                </>
              )}
            </tr>
          )}
          {(employee.educational_qualification || employee.specialization) && (
            <tr>
              {employee.educational_qualification && (
                <>
                  <th>المؤهل التعليمي</th>
                  <td>{employee.educational_qualification}</td>
                </>
              )}
              {employee.specialization && (
                <>
                  <th>التخصص</th>
                  <td>{employee.specialization}</td>
                </>
              )}
            </tr>
          )}
          {employee.national_address && (
            <tr>
              <th>العنوان الوطني</th>
              <td colSpan="3">{employee.national_address}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>

    {(employee.email || employee.phone_number) && (
      <div className="employee-info-section">
        <h2 className="section-title">القسم الثاني: معلومات الاتصال</h2>
        <table className="employee-info-table">
          <tbody>
            {employee.email && (
              <tr>
                <th>البريد الإلكتروني</th>
                <td colSpan="3">{employee.email}</td>
              </tr>
            )}
            {employee.phone_number && (
              <tr>
                <th>رقم الهاتف</th>
                <td colSpan="3">{employee.phone_number}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    )}

    {(employee.contract_type ||
      (employee.years_of_experience_in_same_institution !== undefined &&
        employee.years_of_experience_in_same_institution !== null) ||
      employee.job_title) && (
        <div className="employee-info-section">
          <h2 className="section-title">القسم الثالث: معلومات العمل</h2>
          <table className="employee-info-table">
            <tbody>
              {employee.job_title && (
                <tr>
                  <th>المسمى الوظيفي</th>
                  <td colSpan="3">{employee.job_title}</td>
                </tr>
              )}
              {employee.contract_type && (
                <tr>
                  <th>نوع العقد</th>
                  <td colSpan="3">{employee.contract_type}</td>
                </tr>
              )}
              {(employee.contract_start_date_gregorian ||
                employee.contract_end_date_gregorian) && (
                  <tr>
                    {employee.contract_start_date_gregorian && (
                      <>
                        <th>تاريخ بداية العقد</th>
                        <td>
                          {formatDate(employee.contract_start_date_gregorian)}
                        </td>
                      </>
                    )}
                    {employee.contract_end_date_gregorian && (
                      <>
                        <th>تاريخ نهاية العقد</th>
                        <td>{formatDate(employee.contract_end_date_gregorian)}</td>
                      </>
                    )}
                  </tr>
                )}
              {employee.years_of_experience_in_same_institution !== undefined &&
                employee.years_of_experience_in_same_institution !== null && (
                  <tr>
                    <th>سنوات الخبرة في نفس المؤسسة</th>
                    <td>
                      {employee.years_of_experience_in_same_institution} سنة
                    </td>
                    {employee.years_of_experience_in_company !== undefined &&
                      employee.years_of_experience_in_company !== null && (
                        <>
                          <th>سنوات الخبرة في الشركة</th>
                          <td>{employee.years_of_experience_in_company} سنة</td>
                        </>
                      )}
                  </tr>
                )}
              {!(
                employee.years_of_experience_in_same_institution !== undefined &&
                employee.years_of_experience_in_same_institution !== null
              ) &&
                employee.years_of_experience_in_company !== undefined &&
                employee.years_of_experience_in_company !== null && (
                  <tr>
                    <th>سنوات الخبرة في الشركة</th>
                    <td colSpan="3">
                      {employee.years_of_experience_in_company} سنة
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      )}

    {(employee.bank_name || employee.bank_iban) && (
      <div className="employee-info-section">
        <h2 className="section-title">القسم الرابع: المعلومات المالية</h2>
        <table className="employee-info-table">
          <tbody>
            {employee.bank_name && (
              <tr>
                <th>البنك</th>
                <td>{employee.bank_name}</td>
                {employee.bank_iban && (
                  <>
                    <th>رقم الآيبان</th>
                    <td>{employee.bank_iban}</td>
                  </>
                )}
              </tr>
            )}
            {!employee.bank_name && employee.bank_iban && (
              <tr>
                <th>رقم الآيبان</th>
                <td colSpan="3">{employee.bank_iban}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    )}

    {((employee.base_salary || 0) !== 0 ||
      (employee.housing_allowance || 0) !== 0 ||
      (employee.transportation_allowance || 0) !== 0 ||
      (employee.end_of_service_allowance || 0) !== 0 ||
      (employee.annual_leave_allowance || 0) !== 0 ||
      (employee.other_allowances || 0) !== 0) && (
        <div className="employee-info-section">
          <h2 className="section-title">القسم الخامس: الراتب والبدلات</h2>
          <table className="employee-info-table">
            <tbody>
              {(employee.base_salary || 0) !== 0 && (
                <tr>
                  <th>الراتب الأساسي</th>
                  <td>
                    {(employee.base_salary || 0).toLocaleString("en-US")} ريال
                  </td>
                  {(employee.housing_allowance || 0) !== 0 && (
                    <>
                      <th>بدل السكن</th>
                      <td>
                        {(employee.housing_allowance || 0).toLocaleString(
                          "en-US",
                        )}{" "}
                        ريال
                      </td>
                    </>
                  )}
                </tr>
              )}
              {(employee.base_salary || 0) === 0 &&
                (employee.housing_allowance || 0) !== 0 && (
                  <tr>
                    <th>بدل السكن</th>
                    <td colSpan="3">
                      {(employee.housing_allowance || 0).toLocaleString("en-US")}{" "}
                      ريال
                    </td>
                  </tr>
                )}
              {((employee.transportation_allowance || 0) !== 0 ||
                (employee.end_of_service_allowance || 0) !== 0) && (
                  <tr>
                    {(employee.transportation_allowance || 0) !== 0 && (
                      <>
                        <th>بدل النقل</th>
                        <td>
                          {(employee.transportation_allowance || 0).toLocaleString(
                            "en-US",
                          )}{" "}
                          ريال
                        </td>
                      </>
                    )}
                    {(employee.end_of_service_allowance || 0) !== 0 && (
                      <>
                        <th>بدل نهاية الخدمة</th>
                        <td>
                          {(employee.end_of_service_allowance || 0).toLocaleString(
                            "en-US",
                          )}{" "}
                          ريال
                        </td>
                      </>
                    )}
                  </tr>
                )}
              {((employee.annual_leave_allowance || 0) !== 0 ||
                (employee.other_allowances || 0) !== 0) && (
                  <tr>
                    {(employee.annual_leave_allowance || 0) !== 0 && (
                      <>
                        <th>بدل الإجازة السنوية</th>
                        <td>
                          {(employee.annual_leave_allowance || 0).toLocaleString(
                            "en-US",
                          )}{" "}
                          ريال
                        </td>
                      </>
                    )}
                    {(employee.other_allowances || 0) !== 0 && (
                      <>
                        <th>بدلات أخرى</th>
                        <td>
                          {(employee.other_allowances || 0).toLocaleString("en-US")}{" "}
                          ريال
                        </td>
                      </>
                    )}
                  </tr>
                )}
              <tr className="salary-total-row">
                <th>إجمالي الراتب والبدلات</th>
                <td
                  colSpan="3"
                  style={{ fontWeight: "bold", color: "var(--primary)" }}
                >
                  {(
                    parseFloat(employee.base_salary || 0) +
                    parseFloat(employee.housing_allowance || 0) +
                    parseFloat(employee.transportation_allowance || 0) +
                    parseFloat(employee.end_of_service_allowance || 0) +
                    parseFloat(employee.annual_leave_allowance || 0) +
                    parseFloat(employee.other_allowances || 0)
                  ).toLocaleString("en-US")}{" "}
                  ريال
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
  </>
);

export default EmployeeInfoSections;
