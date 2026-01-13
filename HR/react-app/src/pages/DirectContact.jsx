/**
 * Direct Contact Page
 * Main manager can view all branches contact information and contact them via WhatsApp
 */

import { useState, useEffect } from 'react';
import { branchesAPI } from '../utils/api';
import BranchBadge from '../components/BranchBadge';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import './DirectContact.css';

const DirectContact = () => {
  const { isMainManager } = useAuth();
  const { showError } = useNotification();
  const [branches, setBranches] = useState([]);
  const [filteredBranches, setFilteredBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isMainManager()) {
      loadBranches();
    }
  }, [isMainManager]);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredBranches(branches);
    } else {
      const filtered = branches.filter(branch =>
        branch.branch_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (branch.phone_number && branch.phone_number.includes(searchTerm)) ||
        (branch.email && branch.email.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      setFilteredBranches(filtered);
    }
  }, [searchTerm, branches]);

  const loadBranches = async () => {
    try {
      setLoading(true);
      const response = await branchesAPI.getAll({ is_active: true });
      if (response.data.success) {
        const branchesData = response.data.data || [];
        // Sort branches alphabetically
        const sorted = branchesData.sort((a, b) => 
          (a.branch_name || '').localeCompare(b.branch_name || '', 'ar')
        );
        setBranches(sorted);
        setFilteredBranches(sorted);
      }
    } catch (error) {
      console.error('Error loading branches:', error);
      showError('فشل تحميل الفروع');
    } finally {
      setLoading(false);
    }
  };

  const formatPhoneNumber = (phoneNumber) => {
    if (!phoneNumber) return null;
    // Remove leading 0 and add country code 966
    const cleaned = phoneNumber.startsWith('0')
      ? phoneNumber.substring(1)
      : phoneNumber;
    // Remove any non-digit characters
    const digitsOnly = cleaned.replace(/\D/g, '');
    return digitsOnly;
  };

  const handleWhatsAppContact = (branchName, phoneNumber) => {
    if (!phoneNumber) return;

    // Format message with branch name
    const message = encodeURIComponent(`مرحباً، أود التواصل مع فرع ${branchName}`);
    const formattedNumber = formatPhoneNumber(phoneNumber);
    if (!formattedNumber) return;

    const whatsappUrl = `https://wa.me/966${formattedNumber}?text=${message}`;
    window.open(whatsappUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="direct-contact-container">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="direct-contact-container">
      <div className="direct-contact-header">
        <div className="header-content">
          <div className="header-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" fill="currentColor"/>
            </svg>
          </div>
          <div>
            <h1>التواصل المباشر</h1>
            <p className="page-description">تواصل مباشر مع جميع الفروع عبر الواتساب</p>
          </div>
        </div>
      </div>

      {branches.length > 0 && (
        <div className="search-section">
          <div className="search-box">
            <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <input
              type="text"
              placeholder="ابحث عن فرع، رقم هاتف، أو بريد إلكتروني..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button
                className="clear-search"
                onClick={() => setSearchTerm('')}
                aria-label="مسح البحث"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>
          {searchTerm && (
            <div className="search-results-count">
              {filteredBranches.length} فرع من {branches.length}
            </div>
          )}
        </div>
      )}

      <div className="branches-contact-list">
        {branches.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p>لا توجد فروع متاحة</p>
          </div>
        ) : filteredBranches.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p>لا توجد نتائج للبحث</p>
          </div>
        ) : (
          <div className="branches-grid">
            {filteredBranches.map((branch) => {
              const hasPhoneNumber = branch.phone_number && branch.phone_number.trim() !== '';
              return (
                <div key={branch.id} className="branch-contact-card">
                  <div className="card-header">
                    <div className="branch-badge-wrapper">
                      <BranchBadge branch={branch} />
                    </div>
                    <h3 className="branch-name">{branch.branch_name}</h3>
                  </div>
                  
                  <div className="contact-details">
                    <div className={`contact-item ${!hasPhoneNumber ? 'unavailable' : ''}`}>
                      <div className="contact-icon phone-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="contact-info">
                        <span className="contact-label">رقم التواصل</span>
                        <span className="contact-value">
                          {hasPhoneNumber ? branch.phone_number : 'غير متوفر'}
                        </span>
                      </div>
                    </div>
                    
                    {branch.email && (
                      <div className="contact-item">
                        <div className="contact-icon email-icon">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <polyline points="22,6 12,13 2,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <div className="contact-info">
                          <span className="contact-label">البريد الإلكتروني</span>
                          <span className="contact-value">{branch.email}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    className={`whatsapp-button ${!hasPhoneNumber ? 'disabled' : ''}`}
                    onClick={() => handleWhatsAppContact(branch.branch_name, branch.phone_number)}
                    disabled={!hasPhoneNumber}
                    title={hasPhoneNumber ? 'تواصل عبر الواتساب' : 'الرقم غير متوفر'}
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"
                        fill="currentColor"
                      />
                    </svg>
                    <span>{hasPhoneNumber ? 'تواصل على الواتساب' : 'الرقم غير متوفر'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DirectContact;
