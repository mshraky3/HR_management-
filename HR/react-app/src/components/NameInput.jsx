/**
 * Name Input Component
 * Single field for all 4 names, automatically splits them
 */

import { useState, useEffect } from 'react';
import './NameInput.css';

const NameInput = ({ 
  label = "الاسم الكامل (4 أسماء مطلوبة)", 
  value = { first: '', second: '', third: '', fourth: '' },
  onChange,
  required = false
}) => {
  const [fullName, setFullName] = useState('');
  const [names, setNames] = useState(['', '', '', '']);
  const [error, setError] = useState('');

  // Initialize from value prop
  useEffect(() => {
    if (value && (value.first || value.second || value.third || value.fourth)) {
      const nameArray = [value.first || '', value.second || '', value.third || '', value.fourth || ''];
      setNames(nameArray);
      setFullName(nameArray.filter(n => n).join(' '));
    }
  }, []);

  const handleChange = (e) => {
    const input = e.target.value;
    setFullName(input);
    
    // Split by spaces
    const nameParts = input.trim().split(/\s+/).filter(part => part.length > 0);
    
    // Fill names array
    const newNames = ['', '', '', ''];
    nameParts.forEach((part, index) => {
      if (index < 4) {
        newNames[index] = part;
      }
    });
    
    setNames(newNames);
    
    // Validate
    if (required && nameParts.length < 4) {
      setError(`الرجاء إدخال جميع الأسماء الأربعة (${nameParts.length}/4 تم إدخالها)`);
    } else {
      setError('');
    }
    
    // Call onChange with object
    onChange({
      first: newNames[0] || '',
      second: newNames[1] || '',
      third: newNames[2] || '',
      fourth: newNames[3] || ''
    });
  };

  return (
    <div className="form-group name-input-group">
      <label>
        {label} {required && <span className="required">*</span>}
      </label>
      <input
        type="text"
        value={fullName}
        onChange={handleChange}
        placeholder="أدخل جميع الأسماء الأربعة مفصولة بمسافات"
        required={required}
        className={error ? 'error' : ''}
      />
      {error && <div className="name-error">{error}</div>}
      {!error && names.filter(n => n).length > 0 && (
        <div className="name-preview">
          <div className="name-parts">
            <span className="name-part">
              <strong>الأول:</strong> {names[0] || <em>ناقص</em>}
            </span>
            <span className="name-part">
              <strong>الثاني:</strong> {names[1] || <em>ناقص</em>}
            </span>
            <span className="name-part">
              <strong>الثالث:</strong> {names[2] || <em>ناقص</em>}
            </span>
            <span className="name-part">
              <strong>الرابع:</strong> {names[3] || <em>ناقص</em>}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default NameInput;

