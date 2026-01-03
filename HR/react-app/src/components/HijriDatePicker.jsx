/**
 * Hijri Date Picker Component
 * Allows choosing between Hijri and Gregorian calendar
 * Supports dual input with auto-conversion
 */

import { useState, useEffect } from 'react';
import { gregorianToHijri, hijriToGregorian, formatHijriToString, parseHijriString, formatDate } from '../utils/dateConverters';
import './HijriDatePicker.css';

const HijriDatePicker = ({ 
  label, 
  hijriValue,
  gregorianValue,
  onChange, // (hijriDateString, gregorianDateString) => void
  required = false,
  defaultCalendarType = 'gregorian'
}) => {
  const [activeCalendar, setActiveCalendar] = useState(defaultCalendarType);
  const [hijriParts, setHijriParts] = useState({ day: '', month: '', year: '' });
  const [gregorianParts, setGregorianParts] = useState({ day: '', month: '', year: '' });
  
  // Sync internal state when external values change
  useEffect(() => {
    if (hijriValue) {
      const parts = parseHijriString(hijriValue);
      if (parts) {
        setHijriParts({
          day: parts.day.toString(),
          month: parts.month.toString(),
          year: parts.year.toString()
        });
      }
    } else if (!hijriValue && !gregorianValue) {
      setHijriParts({ day: '', month: '', year: '' });
    }
    
    // Sync Gregorian parts when gregorianValue changes
    if (gregorianValue) {
      const date = new Date(gregorianValue);
      if (!isNaN(date.getTime())) {
        setGregorianParts({
          day: date.getDate().toString().padStart(2, '0'),
          month: (date.getMonth() + 1).toString().padStart(2, '0'),
          year: date.getFullYear().toString()
        });
      }
    } else if (!gregorianValue && !hijriValue) {
      setGregorianParts({ day: '', month: '', year: '' });
    }
  }, [hijriValue, gregorianValue]);

  const handleCalendarTypeChange = (type) => {
    setActiveCalendar(type);
  };

  const handleHijriChange = (field, val) => {
    const newParts = { ...hijriParts, [field]: val };
    setHijriParts(newParts);

    // If we have a complete Hijri date, convert and notify parent
    if (newParts.day && newParts.month && newParts.year && 
        newParts.year.length === 4) {
      
      const hijriStr = formatHijriToString({
        day: parseInt(newParts.day),
        month: parseInt(newParts.month),
        year: parseInt(newParts.year)
      });
      
      const gregorianStr = hijriToGregorian(newParts.day, newParts.month, newParts.year);
      
      onChange(hijriStr, gregorianStr);
    } else {
      // Incomplete date? Should we clear the parent?
      // Maybe not clear, just update what we have if the parent stores raw logic.
      // But parent expects valid date strings usually.
      // For now, only trigger change if valid, or maybe trigger partial?
      // Standard practice: if invalid, send empty string or handle validity.
      // Let's send empty if incomplete to be safe, or just don't fire.
      // Better: send empty so validation triggers if required.
      if (!val) onChange('', ''); 
    }
  };

  const handleGregorianChange = (field, val) => {
    const newParts = { ...gregorianParts, [field]: val };
    setGregorianParts(newParts);

    // If we have a complete Gregorian date, convert and notify parent
    if (newParts.day && newParts.month && newParts.year && 
        newParts.year.length === 4) {
      
      // Format as YYYY-MM-DD for storage
      const day = parseInt(newParts.day);
      const month = parseInt(newParts.month);
      const year = parseInt(newParts.year);
      
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1000 && year <= 2500) {
        const gregorianStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        const hijriDate = gregorianToHijri(gregorianStr);
        const hijriStr = hijriDate ? formatHijriToString(hijriDate) : '';
        
        onChange(hijriStr, gregorianStr);
      }
    } else {
      if (!val) onChange('', ''); 
    }
  };

  return (
    <div className="form-group hijri-date-picker">
      <label>
        {label} {required && <span className="required">*</span>}
      </label>
      
      {/* توضيح: يمكن إدخال التاريخ بأي من التقويمين */}
      <div className="date-picker-info">
        <small className="info-text">
          💡 يمكنك إدخال التاريخ بالتقويم الهجري أو الميلادي - سيتم التحويل تلقائياً وحفظ كلا التاريخين
        </small>
      </div>
      
      <div className="calendar-type-selector">
        <button
          type="button"
          className={`calendar-type-btn ${activeCalendar === 'hijri' ? 'active' : ''}`}
          onClick={() => handleCalendarTypeChange('hijri')}
        >
          هجري
        </button>
        <button
          type="button"
          className={`calendar-type-btn ${activeCalendar === 'gregorian' ? 'active' : ''}`}
          onClick={() => handleCalendarTypeChange('gregorian')}
        >
          ميلادي
        </button>
      </div>
      
      {activeCalendar === 'hijri' && (
        <div className="hijri-inputs">
          <input
            type="number"
            placeholder="اليوم"
            min="1"
            max="30"
            value={hijriParts.day}
            onChange={(e) => handleHijriChange('day', e.target.value)}
            required={required && activeCalendar === 'hijri'}
            className="hijri-day"
          />
          <span>/</span>
          <input
            type="number"
            placeholder="الشهر"
            min="1"
            max="12"
            value={hijriParts.month}
            onChange={(e) => handleHijriChange('month', e.target.value)}
            required={required && activeCalendar === 'hijri'}
            className="hijri-month"
          />
          <span>/</span>
          <input
            type="number"
            placeholder="السنة"
            min="1300"
            max="1500"
            value={hijriParts.year}
            onChange={(e) => handleHijriChange('year', e.target.value)}
            required={required && activeCalendar === 'hijri'}
            className="hijri-year"
          />
        </div>
      )}
      
      {activeCalendar === 'gregorian' && (
        <div className="gregorian-inputs">
          <input
            type="number"
            placeholder="اليوم"
            min="1"
            max="31"
            value={gregorianParts.day}
            onChange={(e) => handleGregorianChange('day', e.target.value)}
            required={required && activeCalendar === 'gregorian'}
            className="gregorian-day"
          />
          <span>/</span>
          <input
            type="number"
            placeholder="الشهر"
            min="1"
            max="12"
            value={gregorianParts.month}
            onChange={(e) => handleGregorianChange('month', e.target.value)}
            required={required && activeCalendar === 'gregorian'}
            className="gregorian-month"
          />
          <span>/</span>
          <input
            type="number"
            placeholder="السنة"
            min="1000"
            max="2500"
            value={gregorianParts.year}
            onChange={(e) => handleGregorianChange('year', e.target.value)}
            required={required && activeCalendar === 'gregorian'}
            className="gregorian-year"
          />
        </div>
      )}

      {/* Display the converted value for reference */}
      <div className="converted-date-display">
        {activeCalendar === 'hijri' && gregorianValue && (
          <span className="converted-date">
            <strong>الموافق ميلادي:</strong> {formatDate(gregorianValue)}
          </span>
        )}
        {activeCalendar === 'gregorian' && hijriValue && (
          <span className="converted-date">
            <strong>الموافق هجري:</strong> {hijriValue}
          </span>
        )}
        {((activeCalendar === 'hijri' && !gregorianValue) || (activeCalendar === 'gregorian' && !hijriValue)) && (
          <span className="converted-date-placeholder">
            سيتم عرض التاريخ المحول تلقائياً بعد إدخال التاريخ
          </span>
        )}
      </div>
    </div>
  );
};

export default HijriDatePicker;

