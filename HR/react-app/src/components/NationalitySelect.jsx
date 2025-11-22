/**
 * Nationality Select Component
 * Searchable dropdown for nationality selection
 */

import { useState, useEffect, useRef } from 'react';
import './NationalitySelect.css';

// List of countries/nationalities with Arabic names
const NATIONALITIES = [
  { en: 'Saudi Arabia', ar: 'السعودية' },
  { en: 'United Arab Emirates', ar: 'الإمارات العربية المتحدة' },
  { en: 'Kuwait', ar: 'الكويت' },
  { en: 'Qatar', ar: 'قطر' },
  { en: 'Bahrain', ar: 'البحرين' },
  { en: 'Oman', ar: 'عُمان' },
  { en: 'Yemen', ar: 'اليمن' },
  { en: 'Egypt', ar: 'مصر' },
  { en: 'Jordan', ar: 'الأردن' },
  { en: 'Lebanon', ar: 'لبنان' },
  { en: 'Syria', ar: 'سوريا' },
  { en: 'Iraq', ar: 'العراق' },
  { en: 'Palestine', ar: 'فلسطين' },
  { en: 'Sudan', ar: 'السودان' },
  { en: 'Libya', ar: 'ليبيا' },
  { en: 'Tunisia', ar: 'تونس' },
  { en: 'Algeria', ar: 'الجزائر' },
  { en: 'Morocco', ar: 'المغرب' },
  { en: 'Turkey', ar: 'تركيا' },
  { en: 'Iran', ar: 'إيران' },
  { en: 'Pakistan', ar: 'باكستان' },
  { en: 'Afghanistan', ar: 'أفغانستان' },
  { en: 'Bangladesh', ar: 'بنغلاديش' },
  { en: 'India', ar: 'الهند' },
  { en: 'Sri Lanka', ar: 'سريلانكا' },
  { en: 'Nepal', ar: 'نيبال' },
  { en: 'Philippines', ar: 'الفلبين' },
  { en: 'Indonesia', ar: 'إندونيسيا' },
  { en: 'Malaysia', ar: 'ماليزيا' },
  { en: 'Thailand', ar: 'تايلاند' },
  { en: 'Vietnam', ar: 'فيتنام' },
  { en: 'Myanmar', ar: 'ميانمار' },
  { en: 'United States', ar: 'الولايات المتحدة' },
  { en: 'Canada', ar: 'كندا' },
  { en: 'United Kingdom', ar: 'المملكة المتحدة' },
  { en: 'France', ar: 'فرنسا' },
  { en: 'Germany', ar: 'ألمانيا' },
  { en: 'Italy', ar: 'إيطاليا' },
  { en: 'Spain', ar: 'إسبانيا' },
  { en: 'Netherlands', ar: 'هولندا' },
  { en: 'Belgium', ar: 'بلجيكا' },
  { en: 'Switzerland', ar: 'سويسرا' },
  { en: 'Australia', ar: 'أستراليا' },
  { en: 'New Zealand', ar: 'نيوزيلندا' },
  { en: 'South Africa', ar: 'جنوب أفريقيا' },
  { en: 'Nigeria', ar: 'نيجيريا' },
  { en: 'Kenya', ar: 'كينيا' },
  { en: 'Ethiopia', ar: 'إثيوبيا' },
  { en: 'Brazil', ar: 'البرازيل' },
  { en: 'Argentina', ar: 'الأرجنتين' },
  { en: 'Mexico', ar: 'المكسيك' },
  { en: 'Chile', ar: 'تشيلي' },
  { en: 'Colombia', ar: 'كولومبيا' },
  { en: 'Peru', ar: 'بيرو' },
  { en: 'China', ar: 'الصين' },
  { en: 'Japan', ar: 'اليابان' },
  { en: 'South Korea', ar: 'كوريا الجنوبية' },
  { en: 'Russia', ar: 'روسيا' },
  { en: 'Ukraine', ar: 'أوكرانيا' },
  { en: 'Poland', ar: 'بولندا' },
  { en: 'Romania', ar: 'رومانيا' },
  { en: 'Bulgaria', ar: 'بلغاريا' },
  { en: 'Other', ar: 'أخرى' }
];

const NationalitySelect = ({ 
  label = "الجنسية", 
  value, 
  onChange, 
  required = false 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [filteredNationalities, setFilteredNationalities] = useState(NATIONALITIES);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (value) {
      setSearchTerm(value);
    }
  }, [value]);

  useEffect(() => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const filtered = NATIONALITIES.filter(nat =>
        nat.en.toLowerCase().includes(term) ||
        nat.ar.includes(term) ||
        nat.ar.includes(searchTerm) // Support Arabic search
      );
      setFilteredNationalities(filtered);
    } else {
      setFilteredNationalities(NATIONALITIES);
    }
  }, [searchTerm]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (nationality) => {
    // Store Arabic name as value
    setSearchTerm(nationality.ar);
    onChange(nationality.ar);
    setIsOpen(false);
  };

  const handleInputChange = (e) => {
    const term = e.target.value;
    setSearchTerm(term);
    setIsOpen(true);
    
    // If user types something not in the list, still allow it but mark as custom
    const found = NATIONALITIES.find(nat => nat.ar === term || nat.en === term);
    if (term && !found) {
      onChange(term);
    } else if (found) {
      onChange(found.ar);
    }
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  return (
    <div className="form-group nationality-select" ref={wrapperRef}>
      <label>
        {label} {required && <span className="required">*</span>}
      </label>
      <div className="nationality-input-wrapper">
        <input
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder="ابحث أو اختر الجنسية"
          required={required}
          autoComplete="off"
        />
        {isOpen && (
          <div className="nationality-dropdown">
            {filteredNationalities.length > 0 ? (
              filteredNationalities.map((nationality) => (
                <div
                  key={nationality.en}
                  className={`nationality-option ${value === nationality.ar ? 'selected' : ''}`}
                  onClick={() => handleSelect(nationality)}
                >
                  {nationality.ar}
                </div>
              ))
            ) : (
              <div className="nationality-option no-results">
                لم يتم العثور على نتائج. اكتب لإضافة جنسية مخصصة.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NationalitySelect;

