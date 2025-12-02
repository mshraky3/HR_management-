/**
 * Bank Select Component
 * Dropdown for bank selection with IBAN validation
 */

import { useState, useEffect } from 'react';
import './BankSelect.css';

// List of Saudi banks with codes and Arabic names
// Some banks may have multiple codes (alternativeCodes array)
const BANKS = [
  { code: '10', nameAr: 'البنك الأهلي السعودي (SNB)', nameEn: 'Saudi National Bank' },
  { code: '80', nameAr: 'مصرف الراجحي', nameEn: 'Al Rajhi Bank', alternativeCodes: ['82'] },
  { code: '05', nameAr: 'مصرف الإنماء', nameEn: 'Alinma Bank' },
  { code: '20', nameAr: 'بنك الرياض', nameEn: 'Riyad Bank' },
  { code: '50', nameAr: 'البنك السعودي الأول (ساب)', nameEn: 'SAB' },
  { code: '15', nameAr: 'بنك البلاد', nameEn: 'Bank Albilad' },
  { code: '30', nameAr: 'البنك العربي الوطني', nameEn: 'Arab National Bank (ANB)' },
  { code: '45', nameAr: 'البنك السعودي الفرنسي', nameEn: 'Banque Saudi Fransi' },
  { code: '60', nameAr: 'بنك الجزيرة', nameEn: 'Bank AlJazira' },
  { code: '55', nameAr: 'البنك السعودي للاستثمار', nameEn: 'The Saudi Investment Bank' },
  { code: '90', nameAr: 'بنك الخليج الدولي (ميم)', nameEn: 'Gulf International Bank (GIB)' },
  { code: '95', nameAr: 'بنك الإمارات دبي الوطني', nameEn: 'Emirates NBD' },
  { code: '76', nameAr: 'بنك مسقط', nameEn: 'Bank Muscat' },
  { code: '31', nameAr: 'بنك الكويت الوطني', nameEn: 'National Bank of Kuwait' },
];

// Helper function to check if a bank code matches a bank (including alternative codes)
const bankCodeMatches = (bank, bankCode) => {
  if (bank.code === bankCode) return true;
  if (bank.alternativeCodes && bank.alternativeCodes.includes(bankCode)) return true;
  return false;
};

// Helper to calculate Mod97 for large numbers string (IBAN checksum validation)
// This implements the Mod-97-10 algorithm for IBAN validation
const mod97 = (numericString) => {
  let checksum = numericString.slice(0, 9);
  let fragment;
  
  for (let offset = 9; offset < numericString.length; offset += 7) {
    fragment = checksum + numericString.substring(offset, offset + 7);
    checksum = (parseInt(fragment, 10) % 97).toString();
  }
  
  return parseInt(checksum, 10) % 97;
};

// Validate IBAN format and extract bank code
const validateIBAN = (iban) => {
  if (!iban) return { valid: false, bankCode: null };
  
  // Remove spaces and convert to uppercase
  const cleanIban = iban.replace(/\s/g, '').toUpperCase();
  
  // 1. Check Length & Pattern
  // Saudi IBAN is 24 chars: SA(0-1) Check(2-3) BankCode(4-5) Account(6-23)
  if (cleanIban.length !== 24) {
    return { valid: false, bankCode: null };
  }
  
  // Check if starts with SA
  if (!cleanIban.startsWith('SA')) {
    return { valid: false, bankCode: null };
  }
  
  // Basic format validation: SA + 22 digits
  const ibanRegex = /^SA\d{22}$/;
  if (!ibanRegex.test(cleanIban)) {
    return { valid: false, bankCode: null };
  }
  
  // 2. Extract Bank Code (CORRECTED: Indices 4-6, which are positions 4-5)
  // Structure: SA(0-1) Check(2-3) BankCode(4-5) Account(6-23)
  const bankCode = cleanIban.substring(4, 6);
  
  // Check if bank code is valid (2 digits)
  if (!/^\d{2}$/.test(bankCode)) {
    return { valid: false, bankCode: null };
  }
  
  // 3. Mathematical Validation (Mod-97 Algorithm)
  // Move first 4 chars (SAxx) to the end
  const rearranged = cleanIban.substring(4) + cleanIban.substring(0, 4);
  // Replace letters with numbers (A=10, B=11... S=28, A=10)
  const numericIban = rearranged.replace(/[A-Z]/g, char => char.charCodeAt(0) - 55);
  
  // Check if remainder is 1 (valid IBAN checksum)
  if (mod97(numericIban) !== 1) {
    return { valid: false, bankCode: null }; // Invalid Checksum
  }
    
  // IBAN format and checksum are valid, return bank code (even if not in our list)
  return { valid: true, bankCode: bankCode };
};

const BankSelect = ({
  label = "اسم البنك",
  value,
  onChange,
  ibanValue = '',
  onIbanChange,
  required = false
}) => {
  const [selectedBank, setSelectedBank] = useState(value || '');
  const [ibanError, setIbanError] = useState('');
  const [bankMismatchError, setBankMismatchError] = useState('');

  useEffect(() => {
    // Always sync selectedBank with value prop
    setSelectedBank(value || '');
  }, [value]);

  useEffect(() => {
    const cleanIban = ibanValue ? ibanValue.replace(/\s/g, '') : '';
    if (cleanIban && selectedBank) {
      validateIBANAndBank(cleanIban, selectedBank);
    } else if (cleanIban && !selectedBank) {
      // If IBAN is entered but no bank selected, try to auto-detect bank
      // Only validate when IBAN is complete (24 characters)
      if (cleanIban.length === 24) {
        const validation = validateIBAN(cleanIban);
        if (validation.valid && validation.bankCode) {
          const detectedBank = BANKS.find(b => bankCodeMatches(b, validation.bankCode));
          if (detectedBank) {
            // Update both local state and parent component
            setSelectedBank(detectedBank.nameAr);
            onChange(detectedBank.nameAr);
          } else {
            // IBAN format is valid but bank code not in our list - clear error
            setIbanError('');
          }
        } else if (cleanIban.length === 24) {
          // IBAN format is invalid only if it's complete (24 chars)
          setIbanError('صيغة IBAN غير صحيحة. يجب أن يكون بالشكل: SAXX XXXX XXXX XXXX XXXX XXXX');
        }
      } else if (cleanIban.length > 24) {
        // IBAN is too long
        setIbanError('صيغة IBAN غير صحيحة. يجب أن يكون بالشكل: SAXX XXXX XXXX XXXX XXXX XXXX');
      } else {
        // Still typing, clear any errors
        setIbanError('');
      }
    } else if (!cleanIban) {
      setIbanError('');
      setBankMismatchError('');
    }
  }, [ibanValue, selectedBank]);

  const validateIBANAndBank = (iban, bankName) => {
    const validation = validateIBAN(iban);
    
    if (!iban) {
      setIbanError('');
      setBankMismatchError('');
      return;
    }
    
    if (!validation.valid) {
      setIbanError('صيغة IBAN غير صحيحة. يجب أن يكون بالشكل: SAXX XXXX XXXX XXXX XXXX XXXX');
      setBankMismatchError('');
      return;
    }
    
    setIbanError('');
    
    // Find selected bank
    const selectedBankObj = BANKS.find(b => b.nameAr === bankName);
    
    // Only validate bank match if bank is selected and exists in our list
    if (selectedBankObj && !bankCodeMatches(selectedBankObj, validation.bankCode)) {
      const ibanBank = BANKS.find(b => bankCodeMatches(b, validation.bankCode));
      if (ibanBank) {
        setBankMismatchError(`IBAN لا يطابق البنك المختار. IBAN يخص: ${ibanBank.nameAr}`);
      } else {
        // Bank code exists but not in our list - just warn but don't block
        setBankMismatchError(`كود البنك في IBAN (${validation.bankCode}) لا يطابق البنك المختار`);
      }
      return;
    }
    
    setBankMismatchError('');
  };

  const handleBankChange = (e) => {
    const bankName = e.target.value;
    setSelectedBank(bankName);
    onChange(bankName);
    
    // Re-validate IBAN if exists
    if (ibanValue) {
      const cleanIban = ibanValue.replace(/\s/g, '');
      validateIBANAndBank(cleanIban, bankName);
    }
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
    
    // Always update IBAN first to ensure it's preserved
    onIbanChange(iban);
    
    // Validate IBAN and bank match
    if (cleanIban && selectedBank) {
      // Always validate when bank is selected
      validateIBANAndBank(cleanIban, selectedBank);
    } else if (cleanIban && !selectedBank) {
      // Only validate format when IBAN is complete (24 characters)
      if (cleanIban.length === 24) {
        const validation = validateIBAN(cleanIban);
        if (validation.valid && validation.bankCode) {
          setIbanError('');
          // Try to auto-detect bank if format is valid and bank code exists in our list
          const detectedBank = BANKS.find(b => bankCodeMatches(b, validation.bankCode));
          if (detectedBank) {
            // Update bank selection
            setSelectedBank(detectedBank.nameAr);
            onChange(detectedBank.nameAr);
          }
          // If bank code not in list, IBAN is still valid format-wise, so no error
        } else {
          // IBAN format is invalid
          setIbanError('صيغة IBAN غير صحيحة. يجب أن يكون بالشكل: SAXX XXXX XXXX XXXX XXXX XXXX');
        }
      } else if (cleanIban.length > 24) {
        // IBAN is too long
        setIbanError('صيغة IBAN غير صحيحة. يجب أن يكون بالشكل: SAXX XXXX XXXX XXXX XXXX XXXX');
      } else {
        // Still typing, clear any errors
        setIbanError('');
      }
    } else {
      setIbanError('');
    }
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
            className={bankMismatchError ? 'error' : ''}
          >
            <option value="">اختر البنك</option>
            {BANKS.map((bank) => (
              <option key={bank.code} value={bank.nameAr}>
                {bank.nameAr}
              </option>
            ))}
          </select>
          {bankMismatchError && (
            <div className="bank-error" style={{ color: '#ef4444', fontSize: '12px', marginTop: '5px' }}>
              {bankMismatchError}
            </div>
          )}
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
            required={required}
            className={`iban-input ${ibanError || bankMismatchError ? 'error' : ''}`}
            style={{ textTransform: 'uppercase' }}
            maxLength={29}
            dir="ltr"
          />
          {ibanError && (
            <div className="iban-error" style={{ color: '#ef4444', fontSize: '12px', marginTop: '5px' }}>
              {ibanError}
            </div>
          )}
          {!ibanError && !bankMismatchError && ibanValue && selectedBank && (
            <div className="iban-success" style={{ color: '#10b981', fontSize: '12px', marginTop: '5px' }}>
              ✓ IBAN صحيح ومطابق للبنك المختار
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BankSelect;

