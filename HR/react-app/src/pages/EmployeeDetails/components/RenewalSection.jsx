const RenewalSection = ({
  processingRenewal,
  onRenew,
  showNonRenewalForm,
  onStartNonRenewal,
  nonRenewalData,
  onChangeNonRenewalField,
  onSubmitNonRenewal,
  onCancelNonRenewal,
  employeeGender,
}) => (
  <div className="renewal-section">
    <h2>
      <img
        src="https://img.icons8.com/material-rounded/24/dots-loading.png"
        alt="تحميل"
        className="icon-lg"
        style={{ width: '24px', height: '24px' }}
      />
      قرار التجديد - نهاية السنة الدراسية
    </h2>
    <p>هذا الموظف في حالة انتظار قرار التجديد. يجب تحديث المستندات المطلوبة ثم اختيار أحد الخيارات:</p>

    {!showNonRenewalForm ? (
      <div className="renewal-actions">
        <button onClick={onRenew} disabled={processingRenewal} className="btn btn-success btn-md">
          {processingRenewal ? (
            'جاري المعالجة...'
          ) : (
            <>
              <img
                src="https://img.icons8.com/material-rounded/24/check-mark.png"
                alt="نجاح"
                style={{ width: '16px', height: '16px', verticalAlign: 'middle', marginLeft: '5px' }}
              />
              تجديد العقد
            </>
          )}
        </button>
        <button onClick={onStartNonRenewal} className="btn btn-danger btn-md">
          <img
            src="https://img.icons8.com/material-rounded/24/cancel.png"
            alt="إلغاء"
            style={{ width: '16px', height: '16px', verticalAlign: 'middle', marginLeft: '5px' }}
          />
          عدم التجديد
        </button>
      </div>
    ) : (
      <div style={{ marginTop: '15px' }}>
        <div className="alert-form-group">
          <label>سبب عدم التجديد *</label>
          <select
            value={nonRenewalData.status}
            onChange={(e) => onChangeNonRenewalField('status', e.target.value)}
          >
            <option value="">اختر السبب</option>
            <option value="non_renewal">عدم تجديد العقد</option>
            <option value="terminated_article_80">فصل حسب المادة 80</option>
            <option value="terminated_article_77">فصل حسب المادة 77</option>
            <option value="resigned">استقالة</option>
            <option value="contract_ended">انتهاء العقد</option>
            <option value="other">أخرى</option>
          </select>
        </div>
        <div className="alert-form-group">
          <label>تفاصيل إضافية (اختياري)</label>
          <textarea
            value={nonRenewalData.reason}
            onChange={(e) => onChangeNonRenewalField('reason', e.target.value)}
            placeholder="أضف تفاصيل إضافية عن سبب عدم التجديد..."
            rows="3"
          />
        </div>
        <div className="alert-form-actions">
          <button onClick={onSubmitNonRenewal} className="btn btn-danger btn-md">
            تأكيد عدم التجديد
          </button>
          <button onClick={onCancelNonRenewal} className="btn btn-secondary btn-md">
            إلغاء
          </button>
        </div>
      </div>
    )}

    <div className="renewal-note">
      <p>
        <strong>ملاحظة:</strong> لتجديد العقد، يجب تحديث المستندات التالية:
      </p>
      <ul>
        <li>عقد العمل (employment_contract)</li>
        <li>خطاب بدء العمل (employment_letter)</li>
        {employeeGender === 'female' && <li>الفحص الطبي (medical_examination) - مطلوب للإناث</li>}
      </ul>
      <p style={{ margin: '10px 0 0 0', fontSize: '12px', fontStyle: 'italic' }}>
        يجب أن تكون المستندات محدثة (تم رفعها خلال آخر 90 يوم)
      </p>
    </div>
  </div>
);

export default RenewalSection;
