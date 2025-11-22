/**
 * Hijri Date Picker Component
 * Allows choosing between Hijri and Gregorian calendar
 * Stores Hijri dates as dd/mm/yyyy text format
 */

import { useState, useEffect } from 'react';
import './HijriDatePicker.css';

const HijriDatePicker = ({ 
  label, 
  value, 
  onChange, 
  required = false,
  calendarType: propCalendarType = null, // 'hijri' or 'gregorian' or null for optional
  forceCalendarType = null // Force a specific calendar type (disables selector)
}) => {
  const [calendarType, setCalendarType] = useState(propCalendarType || forceCalendarType || '');
  const [hijriDate, setHijriDate] = useState({ day: '', month: '', year: '' });
  const [gregorianDate, setGregorianDate] = useState('');

  // Sync with prop calendarType or forceCalendarType
  useEffect(() => {
    if (forceCalendarType) {
      if (forceCalendarType !== calendarType) {
        setCalendarType(forceCalendarType);
      }
    } else if (propCalendarType !== null && propCalendarType !== calendarType) {
      setCalendarType(propCalendarType);
    }
  }, [propCalendarType, forceCalendarType]);

  // Initialize from value prop
  useEffect(() => {
    if (value) {
      // Check if it's a Hijri date (contains /)
      if (typeof value === 'string' && value.includes('/')) {
        // Remove extra spaces and split by /
        const cleaned = value.trim().replace(/\s+/g, '');
        const parts = cleaned.split('/');
        if (parts.length === 3) {
          // Check if first part is 4 digits (year) - it's yyyy/mm/dd format
          if (parts[0].length === 4 && /^\d{4}$/.test(parts[0])) {
            // Convert from yyyy/mm/dd to dd/mm/yyyy
            if (calendarType !== 'hijri') setCalendarType('hijri');
            setHijriDate({
              day: parts[2].replace(/^0+/, '') || '',
              month: parts[1].replace(/^0+/, '') || '',
              year: parts[0].trim() || ''
            });
            return;
          } else {
            // It's dd/mm/yyyy format
            if (calendarType !== 'hijri') setCalendarType('hijri');
            setHijriDate({
              day: parts[0].replace(/^0+/, '') || '',
              month: parts[1].replace(/^0+/, '') || '',
              year: parts[2].trim() || ''
            });
            return;
          }
        }
      }
      // Otherwise it's a Gregorian date (YYYY-MM-DD format)
      if (typeof value === 'string' && value.includes('-')) {
        if (calendarType !== 'gregorian') setCalendarType('gregorian');
        setGregorianDate(value.trim());
        return;
      }
    } else {
      // Reset if value is empty
      setHijriDate({ day: '', month: '', year: '' });
      setGregorianDate('');
    }
  }, [value]);

  const handleCalendarTypeChange = (type) => {
    setCalendarType(type);
    if (type === 'hijri') {
      setGregorianDate('');
      onChange('', 'hijri');
    } else if (type === 'gregorian') {
      setHijriDate({ day: '', month: '', year: '' });
      onChange('', 'gregorian');
    } else {
      onChange('', null);
    }
  };

  const handleHijriChange = (field, val) => {
    const newHijri = { ...hijriDate, [field]: val };
    setHijriDate(newHijri);
    
    // Format as dd/mm/yyyy
    if (newHijri.day && newHijri.month && newHijri.year) {
      const formatted = `${newHijri.day.padStart(2, '0')}/${newHijri.month.padStart(2, '0')}/${newHijri.year}`;
      onChange(formatted, 'hijri');
    } else {
      onChange('', 'hijri');
    }
  };

  const handleGregorianChange = (val) => {
    setGregorianDate(val);
    onChange(val, 'gregorian');
  };

  return (
    <div className="form-group hijri-date-picker">
      <label>
        {label} {required && <span className="required">*</span>}
      </label>
      {!forceCalendarType && (
        <div className="calendar-type-selector">
          <button
            type="button"
            className={`calendar-type-btn ${calendarType === 'hijri' ? 'active' : ''}`}
            onClick={() => handleCalendarTypeChange('hijri')}
          >
            هجري
          </button>
          <button
            type="button"
            className={`calendar-type-btn ${calendarType === 'gregorian' ? 'active' : ''}`}
            onClick={() => handleCalendarTypeChange('gregorian')}
          >
            ميلادي
          </button>
        </div>
      )}
      {forceCalendarType && (
        <div style={{ padding: '8px', background: '#e3f2fd', borderRadius: '4px', marginBottom: '8px', fontSize: '14px', color: '#1976d2' }}>
          {forceCalendarType === 'hijri' ? 'تقويم هجري (محدد تلقائياً)' : 'تقويم ميلادي (محدد تلقائياً)'}
        </div>
      )}
      
      {calendarType === 'hijri' && (
        <div className="hijri-inputs">
          <input
            type="number"
            placeholder="اليوم"
            min="1"
            max="30"
            value={hijriDate.day}
            onChange={(e) => handleHijriChange('day', e.target.value)}
            required={required && calendarType === 'hijri'}
            className="hijri-day"
          />
          <span>/</span>
          <input
            type="number"
            placeholder="الشهر"
            min="1"
            max="12"
            value={hijriDate.month}
            onChange={(e) => handleHijriChange('month', e.target.value)}
            required={required && calendarType === 'hijri'}
            className="hijri-month"
          />
          <span>/</span>
          <input
            type="number"
            placeholder="السنة"
            min="1300"
            max="1500"
            value={hijriDate.year}
            onChange={(e) => handleHijriChange('year', e.target.value)}
            required={required && calendarType === 'hijri'}
            className="hijri-year"
          />
        </div>
      )}
      
      {calendarType === 'gregorian' && (
        <input
          type="date"
          value={gregorianDate}
          onChange={(e) => handleGregorianChange(e.target.value)}
          required={required && calendarType === 'gregorian'}
        />
      )}
      
      {!calendarType && (
        <div className="calendar-placeholder">
          اختر نوع التقويم أعلاه
        </div>
      )}
    </div>
  );
};

export default HijriDatePicker;

