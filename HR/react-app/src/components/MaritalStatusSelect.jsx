/**
 * Marital Status Select Component
 * Dropdown with 4 options only: Single, Married, Divorced, Widowed
 */

import './MaritalStatusSelect.css';

const MARITAL_STATUSES = [
  { value: 'Single', label: 'أعزب' },
  { value: 'Married', label: 'متزوج' },
  { value: 'Divorced', label: 'مطلق' },
  { value: 'Widowed', label: 'أرمل' }
];

const MaritalStatusSelect = ({ 
  label = "الحالة الاجتماعية", 
  value, 
  onChange, 
  required = false 
}) => {
  return (
    <div className="form-group marital-status-select">
      <label>
        {label} {required && <span className="required">*</span>}
      </label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      >
        <option value="">اختر الحالة الاجتماعية</option>
        {MARITAL_STATUSES.map((status) => (
          <option key={status.value} value={status.value}>
            {status.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default MaritalStatusSelect;

