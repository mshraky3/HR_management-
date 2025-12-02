/**
 * Religion Select Component
 * Dropdown with 4 options only: Islam, Christianity, Judaism, Others
 */

import './ReligionSelect.css';

const RELIGIONS = [
  { value: 'Islam', label: 'الإسلام' },
  { value: 'Christianity', label: 'المسيحية' },
  { value: 'Judaism', label: 'اليهودية' },
  { value: 'Others', label: 'أخرى' }
];

const ReligionSelect = ({ 
  label = "الدين", 
  value, 
  onChange, 
  required = false 
}) => {
  return (
    <div className="form-group religion-select">
      <label>
        {label} {required && <span className="required">*</span>}
      </label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      >
        <option value="">اختر الدين</option>
        {RELIGIONS.map((religion) => (
          <option key={religion.value} value={religion.value}>
            {religion.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default ReligionSelect;

