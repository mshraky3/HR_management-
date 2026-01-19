/**
 * Bank Select Component
 * Simple dropdown for bank selection and IBAN input
 */

import { useState, useEffect } from 'react';
import './BankSelect.css';

// Default placeholder value for bank selection
export const DEFAULT_BANK_PLACEHOLDER = 'اختر البنك';

// List of Saudi banks with Arabic names
const BANKS = [
  { nameAr: 'البنك الأهلي السعودي (SNB)' },
  { nameAr: 'مصرف الراجحي' },
  { nameAr: 'مصرف الإنماء' },
  { nameAr: 'بنك الرياض' },
  { nameAr: 'البنك السعودي الأول (ساب)' },
  { nameAr: 'بنك البلاد' },
  { nameAr: 'البنك العربي الوطني' },
  { nameAr: 'البنك السعودي الفرنسي' },
  { nameAr: 'بنك الجزيرة' },
  { nameAr: 'البنك السعودي للاستثمار' },
  { nameAr: 'بنك الخليج الدولي (ميم)' },
  { nameAr: 'بنك الإمارات دبي الوطني' },
  { nameAr: 'بنك مسقط' },
  { nameAr: 'بنك الكويت الوطني' },
];

const BankSelect = ({
  label = "اسم البنك",
  value,
  onChange,
  ibanValue = '',
  onIbanChange,
  required = false
}) => {
  const [selectedBank, setSelectedBank] = useState(value || '');

  useEffect(() => {
    // Always sync selectedBank with value prop
    setSelectedBank(value || '');
  }, [value]);

  const handleBankChange = (e) => {
    const bankName = e.target.value;
    setSelectedBank(bankName);
    onChange(bankName);
  };

  const handleIbanChange = (e) => {
    let iban = e.target.value;
    // Auto-format: add spaces every 4 characters and convert to uppercase
    const cleanIban = iban.replace(/\s/g, '').toUpperCase();
    if (cleanIban.length > 0) {
      // Format as SAXX XXXX XXXX XXXX XXXX XXXX
      const formatted = cleanIban.match(/.{1,4}/g)?.join(' ') || cleanIban;
      iban = formatted;
    }
    
    // Update IBAN value
    onIbanChange(iban);
  };

  return (
    <div className="form-group bank-select-group">
      <div className="form-row">
        <div className="form-group" style={{ flex: 1 }}>
          <label>
            {label} {required && <span className="required">*</span>}
          </label>
          <select
            value={selectedBank}
            onChange={handleBankChange}
            required={required}
          >
            <option value={DEFAULT_BANK_PLACEHOLDER}>{DEFAULT_BANK_PLACEHOLDER}</option>
            {BANKS.map((bank, index) => (
              <option key={index} value={bank.nameAr}>
                {bank.nameAr}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label>
            رقم الآيبان البنكي {required && <span className="required">*</span>}
          </label>
          <input
            type="text"
            value={ibanValue}
            onChange={handleIbanChange}
            placeholder="SAXX XXXX XXXX XXXX XXXX XXXX"
            className="iban-input"
            style={{ textTransform: 'uppercase' }}
            maxLength={29}
            dir="ltr"
          />
        </div>
      </div>
    </div>
  );
};

export default BankSelect;

