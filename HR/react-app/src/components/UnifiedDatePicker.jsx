/**
 * Unified Date Picker Component
 * Calendar UI supporting both Hijri and Gregorian calendars
 * All date inputs use this component for consistency
 */

import { useState, useEffect, useRef } from 'react';
import { utilsAPI } from '../utils/api.js';
import { formatDate, formatHijriToString, parseHijriString, hijriToGregorian, gregorianToHijri } from '../utils/dateConverters.js';
import './UnifiedDatePicker.css';

const UnifiedDatePicker = ({ 
  label, 
  hijriValue,
  gregorianValue,
  onChange, // (hijriDateString, gregorianDateString) => void
  required = false,
  dateType = 'general', // 'birth_date' | 'general'
  defaultCalendarType = 'gregorian'
}) => {
  const [activeCalendar, setActiveCalendar] = useState(defaultCalendarType);
  const [selectedDate, setSelectedDate] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [currentHijriMonth, setCurrentHijriMonth] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [loading, setLoading] = useState(false);
  const calendarRef = useRef(null);

  // Initialize current month based on existing values
  useEffect(() => {
    if (activeCalendar === 'gregorian' && gregorianValue) {
      const date = new Date(gregorianValue);
      if (!isNaN(date.getTime())) {
        setSelectedDate(new Date(date));
        setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
      }
    } else if (activeCalendar === 'hijri') {
      if (hijriValue) {
        const parts = parseHijriString(hijriValue);
        if (parts) {
          setCurrentHijriMonth({ month: parts.month, year: parts.year });
        }
      } else {
        // Initialize to current Hijri date
        const today = new Date();
        const todayHijri = gregorianToHijri(today.toISOString().split('T')[0]);
        if (todayHijri) {
          setCurrentHijriMonth({ month: todayHijri.month, year: todayHijri.year });
        }
      }
    }
  }, [hijriValue, gregorianValue, activeCalendar]);

  // Close calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setCalendarOpen(false);
      }
    };

    if (calendarOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [calendarOpen]);

  // Get days in month for Gregorian calendar
  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  // Get first day of month (0 = Sunday, 1 = Monday, etc.)
  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  // Generate calendar days for Gregorian
  const generateGregorianDays = () => {
    const days = [];
    const daysInMonth = getDaysInMonth(currentMonth);
    const firstDay = getFirstDayOfMonth(currentMonth);
    
    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    
    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    
    return days;
  };

  // Get Hijri month length (29 or 30 days)
  const getHijriMonthLength = (month, year) => {
    // Determine if it's a leap year (11 leap years in 30-year cycle: 2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29)
    const cycleYear = (year - 1) % 30;
    const leapYears = [2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29];
    const isLeapYear = leapYears.includes(cycleYear);
    
    // Hijri month lengths (standard pattern: 30, 29, 30, 29...)
    const monthLengths = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29];
    if (isLeapYear) {
      monthLengths[11] = 30; // Last month (Dhu al-Hijjah) is 30 days in leap year
    }
    
    return monthLengths[month - 1];
  };

  // Get first day of Hijri month (0 = Sunday, 1 = Monday, etc.)
  const getFirstDayOfHijriMonth = (month, year) => {
    // Convert first day of Hijri month to Gregorian to find day of week
    const gregorianDate = hijriToGregorian(1, month, year);
    if (!gregorianDate) return 0;
    
    const date = new Date(gregorianDate);
    return date.getDay();
  };

  // Generate calendar days for Hijri
  const generateHijriDays = () => {
    if (!currentHijriMonth) return [];
    
    const { month, year } = currentHijriMonth;
    const days = [];
    const daysInMonth = getHijriMonthLength(month, year);
    const firstDay = getFirstDayOfHijriMonth(month, year);
    
    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    
    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    
    return days;
  };

  // Navigate Hijri months
  const navigateHijriMonth = (direction) => {
    if (!currentHijriMonth) {
      // Initialize if not set
      const today = new Date();
      const todayHijri = gregorianToHijri(today.toISOString().split('T')[0]);
      if (todayHijri) {
        setCurrentHijriMonth({ month: todayHijri.month, year: todayHijri.year });
      }
      return;
    }

    let { month, year } = currentHijriMonth;
    
    month += direction;
    
    if (month < 1) {
      month = 12;
      year -= 1;
    } else if (month > 12) {
      month = 1;
      year += 1;
    }
    
    setCurrentHijriMonth({ month, year });
  };

  // Handle date selection
  const handleDateSelect = async (day) => {
    if (!day) return;

    setLoading(true);
    setValidationError(null);

    try {
      let dateString;
      if (activeCalendar === 'gregorian') {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth() + 1;
        dateString = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      } else {
        // For Hijri, use current Hijri month/year
        if (!currentHijriMonth) {
          setLoading(false);
          return;
        }
        dateString = formatHijriToString({ 
          day, 
          month: currentHijriMonth.month, 
          year: currentHijriMonth.year 
        });
      }

      // Call conversion API
      const response = await utilsAPI.convertDate(dateString, activeCalendar, dateType);
      
      if (response.data.success && response.data.data.valid) {
        const { hijri, gregorian } = response.data.data;
        onChange(hijri, gregorian);
        setSelectedDate(new Date(gregorian));
        setCalendarOpen(false);
      } else {
        setValidationError(response.data.data.errors?.[0] || 'Invalid date');
      }
    } catch (error) {
      console.error('Error converting date:', error);
      setValidationError(error.response?.data?.message || 'Failed to convert date');
    } finally {
      setLoading(false);
    }
  };

  // Navigate Gregorian months
  const navigateMonth = (direction) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + direction, 1));
  };

  // Navigate Gregorian years
  const navigateYear = (direction) => {
    setCurrentMonth(new Date(currentMonth.getFullYear() + direction, currentMonth.getMonth(), 1));
  };

  // Change Gregorian month/year directly (dropdowns)
  const setGregorianMonth = (monthIndex) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), monthIndex, 1));
  };

  const setGregorianYear = (year) => {
    setCurrentMonth(new Date(year, currentMonth.getMonth(), 1));
  };

  // Navigate Hijri years
  const navigateHijriYear = (direction) => {
    if (!currentHijriMonth) return;
    setCurrentHijriMonth({ month: currentHijriMonth.month, year: currentHijriMonth.year + direction });
  };

  const setHijriMonth = (month) => {
    if (!currentHijriMonth) return;
    setCurrentHijriMonth({ month, year: currentHijriMonth.year });
  };

  const setHijriYear = (year) => {
    if (!currentHijriMonth) return;
    setCurrentHijriMonth({ month: currentHijriMonth.month, year });
  };

  // Get display value
  const getDisplayValue = () => {
    if (activeCalendar === 'hijri' && hijriValue) {
      return hijriValue;
    } else if (activeCalendar === 'gregorian' && gregorianValue) {
      return formatDate(gregorianValue);
    }
    return '';
  };

  const gregorianDays = generateGregorianDays();
  const hijriDays = generateHijriDays();
  
  const arabicDayNames = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
  const arabicMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                       'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  
  // Arabic Hijri month names
  const hijriMonthNames = [
    'محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني', 'جمادى الأولى', 'جمادى الثانية',
    'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'
  ];

  const currentGregorianYear = currentMonth.getFullYear();
  const minGregorianYear = 1950;
  const maxGregorianYear = Math.max(currentGregorianYear + 10, 2050);
  const gregorianYearOptions = Array.from(
    { length: maxGregorianYear - minGregorianYear + 1 },
    (_, i) => minGregorianYear + i
  );
  const hijriYearOptions = currentHijriMonth
    ? Array.from({ length: 101 }, (_, i) => currentHijriMonth.year - 50 + i)
    : [];

  return (
    <div className="form-group unified-date-picker" ref={calendarRef}>
      {label && (
        <label>
          {label}
          {required && <span className="required"> *</span>}
        </label>
      )}
      
      <div className="date-input-container">
        <button
          type="button"
          className="date-input-button"
          onClick={() => setCalendarOpen(!calendarOpen)}
        >
          <span className="date-display">
            {getDisplayValue() || 'اختر التاريخ'}
          </span>
          <span className="calendar-icon">📅</span>
        </button>

        {/* Calendar Type Toggle */}
        <div className="calendar-type-toggle">
          <button
            type="button"
            className={activeCalendar === 'hijri' ? 'active' : ''}
            onClick={() => {
              setActiveCalendar('hijri');
              // Initialize Hijri month if not set
              if (!currentHijriMonth) {
                if (hijriValue) {
                  const parts = parseHijriString(hijriValue);
                  if (parts) {
                    setCurrentHijriMonth({ month: parts.month, year: parts.year });
                  }
                } else {
                  const today = new Date();
                  const todayHijri = gregorianToHijri(today.toISOString().split('T')[0]);
                  if (todayHijri) {
                    setCurrentHijriMonth({ month: todayHijri.month, year: todayHijri.year });
                  }
                }
              }
            }}
          >
            هجري
          </button>
          <button
            type="button"
            className={activeCalendar === 'gregorian' ? 'active' : ''}
            onClick={() => setActiveCalendar('gregorian')}
          >
            ميلادي
          </button>
        </div>
      </div>

      {/* Calendar Popup */}
      {calendarOpen && (
        <div className="calendar-popup">
          {activeCalendar === 'gregorian' ? (
            <div className="calendar-grid">
              <div className="calendar-header">
                <button type="button" onClick={() => navigateMonth(-1)} aria-label="الشهر السابق">‹</button>

                <div className="calendar-header-controls" aria-label="اختيار الشهر والسنة">
                  <select
                    className="calendar-month-select"
                    value={currentMonth.getMonth()}
                    onChange={(e) => setGregorianMonth(parseInt(e.target.value, 10))}
                    aria-label="الشهر"
                  >
                    {arabicMonths.map((_, idx) => (
                      <option key={idx} value={idx}>
                        {String(idx + 1).padStart(2, '0')}
                      </option>
                    ))}
                  </select>

                  <div className="calendar-year-control">
                    <button type="button" onClick={() => navigateYear(-1)} className="calendar-year-nav" aria-label="السنة السابقة">«</button>
                    <select
                      className="calendar-year-select"
                      value={currentMonth.getFullYear()}
                      onChange={(e) => setGregorianYear(parseInt(e.target.value, 10))}
                      aria-label="السنة"
                    >
                      {gregorianYearOptions.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => navigateYear(1)} className="calendar-year-nav" aria-label="السنة التالية">»</button>
                  </div>
                </div>

                <button type="button" onClick={() => navigateMonth(1)} aria-label="الشهر التالي">›</button>
              </div>
              
              <div className="calendar-days">
                {gregorianDays.map((day, index) => {
                  const isSelected = day && selectedDate && 
                    selectedDate.getDate() === day &&
                    selectedDate.getMonth() === currentMonth.getMonth() &&
                    selectedDate.getFullYear() === currentMonth.getFullYear();
                  
                  return (
                    <button
                      key={index}
                      type="button"
                      className={`calendar-day ${!day ? 'empty' : ''} ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleDateSelect(day)}
                      disabled={!day || loading}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            currentHijriMonth ? (
              <div className="calendar-grid hijri-calendar">
                <div className="calendar-header">
                  <button type="button" onClick={() => navigateHijriMonth(-1)} aria-label="الشهر السابق">‹</button>

                  <div className="calendar-header-controls" aria-label="اختيار الشهر والسنة">
                    <select
                      className="calendar-month-select"
                      value={currentHijriMonth.month}
                      onChange={(e) => setHijriMonth(parseInt(e.target.value, 10))}
                      aria-label="الشهر"
                    >
                      {hijriMonthNames.map((_, idx) => (
                        <option key={idx + 1} value={idx + 1}>
                          {String(idx + 1).padStart(2, '0')}
                        </option>
                      ))}
                    </select>

                    <div className="calendar-year-control">
                      <button type="button" onClick={() => navigateHijriYear(-1)} className="calendar-year-nav" aria-label="السنة السابقة">«</button>
                      <select
                        className="calendar-year-select"
                        value={currentHijriMonth.year}
                        onChange={(e) => setHijriYear(parseInt(e.target.value, 10))}
                        aria-label="السنة"
                      >
                        {hijriYearOptions.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => navigateHijriYear(1)} className="calendar-year-nav" aria-label="السنة التالية">»</button>
                    </div>
                  </div>

                  <button type="button" onClick={() => navigateHijriMonth(1)} aria-label="الشهر التالي">›</button>
                </div>
                
                <div className="calendar-days">
                  {hijriDays.map((day, index) => {
                    const isSelected = day && hijriValue && 
                      (() => {
                        const parts = parseHijriString(hijriValue);
                        return parts && 
                          parts.day === day &&
                          parts.month === currentHijriMonth.month &&
                          parts.year === currentHijriMonth.year;
                      })();
                    
                    return (
                      <button
                        key={index}
                        type="button"
                        className={`calendar-day ${!day ? 'empty' : ''} ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleDateSelect(day)}
                        disabled={!day || loading}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="calendar-grid hijri-calendar">
                <div className="calendar-header">
                  <span>تقويم هجري</span>
                </div>
                <div className="hijri-calendar-placeholder">
                  <p>جاري التحميل...</p>
                </div>
              </div>
            )
          )}
          
          {validationError && (
            <div className="validation-error">{validationError}</div>
          )}
        </div>
      )}

      {/* Show converted date */}
      {hijriValue && gregorianValue && (
        <div className="converted-date-display">
          <span className="converted-date">
            {activeCalendar === 'hijri' 
              ? `الموافق ميلادي: ${formatDate(gregorianValue)}`
              : `الموافق هجري: ${hijriValue}`
            }
          </span>
        </div>
      )}
    </div>
  );
};

export default UnifiedDatePicker;
