/**
 * Experience Certificate Page
 * Generate experience certificates for employees
 * Main Manager only
 */

import { useState, useEffect, useRef } from 'react';
import { employeesAPI, branchesAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { formatDate } from '../utils/dateConverters';
// TablePage.css is now loaded in App.jsx to prevent FOUC
import './ExperienceCertificate.css';

const ExperienceCertificate = () => {
  const { isMainManager } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [certificateType, setCertificateType] = useState('experience'); // Default to experience certificate
  const [searchFilters, setSearchFilters] = useState({
    search_name: '',
    search_id: '',
    search_phone: '',
    branch_id: ''
  });
  const [hasSearched, setHasSearched] = useState(false);
  const [branchSearchTerm, setBranchSearchTerm] = useState('');
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDevelopmentPopup, setShowDevelopmentPopup] = useState(true);
  const [certificateData, setCertificateData] = useState({
    full_name: '',
    id_number: '',
    nationality: '',
    job_title: '',
    contract_start_date: '',
    contract_end_date: ''
  });
  
  // Refs to maintain focus on search inputs
  const searchNameRef = useRef(null);
  const searchIdRef = useRef(null);
  const searchPhoneRef = useRef(null);

  // Show development popup for 10 seconds on page load
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowDevelopmentPopup(false);
    }, 10000); // 10 seconds

    return () => clearTimeout(timer);
  }, []);

  // Certificate types (extensible for future certificate types)
  const certificateTypes = [
    { value: 'experience', label: 'شهادة الخبرة' }
    // Can add more certificate types in the future
  ];

  // Redirect if not main manager
  useEffect(() => {
    if (!isMainManager()) {
      window.location.href = '/dashboard';
    }
  }, [isMainManager]);

  // Load branches and sort alphabetically
  useEffect(() => {
    const loadBranches = async () => {
      try {
        const response = await branchesAPI.getAll({ is_active: true });
        if (response.data.success) {
          const sortedBranches = (response.data.data || []).sort((a, b) => {
            return (a.branch_name || '').localeCompare(b.branch_name || '', 'ar');
          });
          setBranches(sortedBranches);
        }
      } catch (error) {
        console.error('Error loading branches:', error);
      }
    };
    loadBranches();
  }, []);

  const loadEmployees = async () => {
    // Check if at least one search filter is filled
    const hasSearchCriteria = 
      searchFilters.search_name.trim() ||
      searchFilters.search_id.trim() ||
      searchFilters.search_phone.trim() ||
      searchFilters.branch_id;
    
    if (!hasSearchCriteria) {
      setEmployees([]);
      setHasSearched(false);
      return;
    }
    
    try {
      setLoading(true);
      setHasSearched(true);
      const filters = { is_active: true };
      
      // Add search filters
      if (searchFilters.search_name.trim()) {
        filters.search_name = searchFilters.search_name.trim();
      }
      if (searchFilters.search_id.trim()) {
        filters.search_id = searchFilters.search_id.trim();
      }
      if (searchFilters.search_phone.trim()) {
        filters.search_phone = searchFilters.search_phone.trim();
      }
      if (searchFilters.branch_id) {
        filters.branch_id = parseInt(searchFilters.branch_id);
      }
      
      const response = await employeesAPI.getAll(filters);
      if (response.data.success) {
        setEmployees(response.data.data);
      }
    } catch (error) {
      console.error('Error loading employees:', error);
      showError('فشل تحميل الموظفين');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    if (e) {
      e.preventDefault();
    }
    loadEmployees();
  };

  const handleClearSearch = () => {
    setSearchFilters({
      search_name: '',
      search_id: '',
      search_phone: '',
      branch_id: ''
    });
    setEmployees([]);
    setHasSearched(false);
    setSelectedEmployeeId(null);
    setSelectedEmployee(null);
    setBranchSearchTerm('');
  };

  const handleEmployeeClick = (employee) => {
    setSelectedEmployeeId(employee.id);
    setSelectedEmployee(employee);
  };

  const getFullName = (employee) => {
    return `${employee.first_name || ''} ${employee.second_name || ''} ${employee.third_name || ''} ${employee.fourth_name || ''}`.trim();
  };

  // Initialize certificate data when employee is selected
  useEffect(() => {
    if (selectedEmployee) {
      setCertificateData({
        full_name: getFullName(selectedEmployee),
        id_number: selectedEmployee.id_or_residency_number || '',
        nationality: selectedEmployee.nationality || '',
        job_title: selectedEmployee.job_title || selectedEmployee.occupation || '',
        contract_start_date: selectedEmployee.contract_start_date_gregorian 
          ? formatDate(selectedEmployee.contract_start_date_gregorian) 
          : '',
        contract_end_date: selectedEmployee.contract_end_date_gregorian 
          ? formatDate(selectedEmployee.contract_end_date_gregorian) 
          : ''
      });
    }
  }, [selectedEmployee]);

  const handleEditData = () => {
    setShowEditModal(true);
  };

  const handleCloseModal = () => {
    setShowEditModal(false);
  };

  const handleGenerateCertificate = async (certData = null) => {
    if (!selectedEmployeeId) {
      showWarning('الرجاء اختيار موظف');
      return;
    }
    
    if (!certificateType) {
      showWarning('الرجاء اختيار نوع الشهادة');
      return;
    }
    
    try {
      setGenerating(true);
      
      const dataToSend = certData || certificateData;
      
      const response = await employeesAPI.generateCertificate({
        employee_id: selectedEmployeeId,
        certificate_type: certificateType,
        certificate_data: dataToSend
      }, {
        responseType: 'blob'
      });
      
      // Create blob URL and download
      const blob = response.data instanceof Blob 
        ? response.data 
        : new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const employeeName = dataToSend.full_name || (selectedEmployee ? getFullName(selectedEmployee) : 'موظف');
      link.download = `شهادة_خبرة_${employeeName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      showSuccess('تم إنشاء الشهادة بنجاح');
      setShowEditModal(false);
      
    } catch (error) {
      console.error('Error generating certificate:', error);
      const errorMessage = error.response?.data?.message || error.message || 'فشل إنشاء الشهادة';
      showError(errorMessage);
    } finally {
      setGenerating(false);
    }
  };

  if (!isMainManager()) {
    return null;
  }

  return (
    <div className="table-page">
      {/* Development Popup */}
      {showDevelopmentPopup && (
        <div className="development-popup-overlay">
          <div className="development-popup-content">
            <div className="development-popup-icon">⚠️</div>
            <div className="development-popup-message">
              الصفحة مازالت تحت التطوير الرجاء عدم الاستخدام
            </div>
          </div>
        </div>
      )}

      <div className="page-header">
        <h1>شهادات الخبرة</h1>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleEditData(); }} className="experience-certificate-form">
        {/* Search Filters */}
        <div className="form-section">
          <h2>البحث عن الموظف</h2>
          <div className="search-form">
            <div className="search-filters">
              <div className="form-group">
                <label>البحث بالاسم:</label>
                <input
                  ref={searchNameRef}
                  type="text"
                  value={searchFilters.search_name}
                  onChange={(e) => setSearchFilters(prev => ({ ...prev, search_name: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearch(e);
                    }
                  }}
                  placeholder="ابحث بالاسم..."
                  className="form-control"
                />
              </div>
              <div className="form-group">
                <label>البحث برقم الهوية/الإقامة:</label>
                <input
                  ref={searchIdRef}
                  type="text"
                  value={searchFilters.search_id}
                  onChange={(e) => setSearchFilters(prev => ({ ...prev, search_id: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearch(e);
                    }
                  }}
                  placeholder="ابحث برقم الهوية..."
                  className="form-control"
                />
              </div>
              <div className="form-group">
                <label>البحث برقم الهاتف:</label>
                <input
                  ref={searchPhoneRef}
                  type="text"
                  value={searchFilters.search_phone}
                  onChange={(e) => setSearchFilters(prev => ({ ...prev, search_phone: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearch(e);
                    }
                  }}
                  placeholder="ابحث برقم الهاتف..."
                  className="form-control"
                />
              </div>
              <div className="form-group" style={{ position: 'relative' }}>
                <label>البحث بالفرع:</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={searchFilters.branch_id 
                      ? branches.find(b => b.id === parseInt(searchFilters.branch_id))?.branch_name || '' 
                      : branchSearchTerm}
                    onChange={(e) => {
                      const value = e.target.value;
                      setBranchSearchTerm(value);
                      setIsBranchDropdownOpen(true);
                      if (value !== branches.find(b => b.id === parseInt(searchFilters.branch_id))?.branch_name) {
                        setSearchFilters(prev => ({ ...prev, branch_id: '' }));
                      }
                    }}
                    onFocus={() => {
                      setIsBranchDropdownOpen(true);
                      if (searchFilters.branch_id) {
                        const selectedBranch = branches.find(b => b.id === parseInt(searchFilters.branch_id));
                        if (selectedBranch) {
                          setBranchSearchTerm(selectedBranch.branch_name);
                        }
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        setIsBranchDropdownOpen(false);
                        if (!searchFilters.branch_id) {
                          const matchingBranch = branches.find(b => 
                            b.branch_name.toLowerCase() === branchSearchTerm.toLowerCase()
                          );
                          if (!matchingBranch) {
                            setBranchSearchTerm('');
                          }
                        }
                      }, 200);
                    }}
                    placeholder="ابحث واختر فرع..."
                    className="form-control"
                  />
                  {isBranchDropdownOpen && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 1000,
                      backgroundColor: 'white',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      maxHeight: '300px',
                      overflowY: 'auto',
                      boxShadow: 'var(--shadow-lg)',
                      marginTop: '4px'
                    }}>
                      <div
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--border-light)',
                          backgroundColor: searchFilters.branch_id === '' ? 'var(--primary-light)' : 'transparent'
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSearchFilters(prev => ({ ...prev, branch_id: '' }));
                          setBranchSearchTerm('');
                          setIsBranchDropdownOpen(false);
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = searchFilters.branch_id === '' ? 'var(--primary-light)' : 'transparent';
                        }}
                      >
                        جميع الفروع
                      </div>
                      {branches
                        .filter(branch => 
                          !branchSearchTerm || 
                          (branch.branch_name || '').toLowerCase().includes(branchSearchTerm.toLowerCase())
                        )
                        .map(branch => (
                          <div
                            key={branch.id}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              borderBottom: '1px solid var(--border-light)',
                              backgroundColor: searchFilters.branch_id === branch.id.toString() ? 'var(--primary-light)' : 'transparent'
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSearchFilters(prev => ({ ...prev, branch_id: branch.id.toString() }));
                              setBranchSearchTerm('');
                              setIsBranchDropdownOpen(false);
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = searchFilters.branch_id === branch.id.toString() ? 'var(--primary-light)' : 'transparent';
                            }}
                          >
                            {branch.branch_name}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="search-actions">
              <button type="button" onClick={handleSearch} className="btn btn-primary" disabled={loading}>
                {loading ? 'جاري البحث...' : 'بحث'}
              </button>
              {(hasSearched || employees.length > 0) && (
                <button type="button" onClick={handleClearSearch} className="btn btn-secondary">
                  مسح البحث
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Employee Selection */}
        {hasSearched && (
          <div className="form-section">
            <h2>نتائج البحث</h2>
            {loading ? (
              <div className="loading">جاري التحميل...</div>
            ) : employees.length === 0 ? (
              <div className="no-data">لا توجد موظفين ينطبق عليهم البحث</div>
            ) : (
              <div className="employees-list">
                {employees.map(employee => (
                  <div
                    key={employee.id}
                    className={`employee-item ${selectedEmployeeId === employee.id ? 'selected' : ''}`}
                    onClick={() => handleEmployeeClick(employee)}
                  >
                    <div className="employee-info">
                      <div className="employee-name">{getFullName(employee)}</div>
                      <div className="employee-details">
                        {employee.employee_id_number && (
                          <span className="employee-detail">رقم الموظف: {employee.employee_id_number}</span>
                        )}
                        {employee.id_or_residency_number && (
                          <span className="employee-detail">رقم الهوية: {employee.id_or_residency_number}</span>
                        )}
                        {employee.phone_number && (
                          <span className="employee-detail">الهاتف: {employee.phone_number}</span>
                        )}
                      </div>
                    </div>
                    {selectedEmployeeId === employee.id && (
                      <div className="selected-indicator">✓</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Certificate Type Selection */}
        {selectedEmployeeId && (
          <div className="form-section">
            <h2>نوع الشهادة</h2>
            <div className="certificate-type-selection">
              {certificateTypes.map(type => (
                <label key={type.value} className="certificate-type-option">
                  <input
                    type="radio"
                    name="certificateType"
                    value={type.value}
                    checked={certificateType === type.value}
                    onChange={(e) => setCertificateType(e.target.value)}
                  />
                  <span>{type.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Generate Button */}
        {selectedEmployeeId && (
          <div className="form-section">
            <button 
              type="button"
              onClick={handleEditData}
              className="btn btn-primary btn-lg"
              disabled={generating || !certificateType}
            >
              {generating ? 'جاري إنشاء الشهادة...' : 'إنشاء الشهادة'}
            </button>
          </div>
        )}
      </form>

      {/* Edit Certificate Data Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content certificate-edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>تحرير بيانات الشهادة</h2>
              <button className="modal-close" onClick={handleCloseModal}>×</button>
            </div>
            <div className="modal-body">
              <table className="certificate-edit-table">
                <tbody>
                  <tr>
                    <td><label>الاسم الكامل:</label></td>
                    <td>
                      <input
                        type="text"
                        value={certificateData.full_name}
                        onChange={(e) => setCertificateData({...certificateData, full_name: e.target.value})}
                        className="form-control"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td><label>رقم الهوية/الإقامة:</label></td>
                    <td>
                      <input
                        type="text"
                        value={certificateData.id_number}
                        onChange={(e) => setCertificateData({...certificateData, id_number: e.target.value})}
                        className="form-control"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td><label>الجنسية:</label></td>
                    <td>
                      <input
                        type="text"
                        value={certificateData.nationality}
                        onChange={(e) => setCertificateData({...certificateData, nationality: e.target.value})}
                        className="form-control"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td><label>المسمى الوظيفي:</label></td>
                    <td>
                      <input
                        type="text"
                        value={certificateData.job_title}
                        onChange={(e) => setCertificateData({...certificateData, job_title: e.target.value})}
                        className="form-control"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td><label>تاريخ بداية العقد:</label></td>
                    <td>
                      <input
                        type="text"
                        value={certificateData.contract_start_date}
                        onChange={(e) => setCertificateData({...certificateData, contract_start_date: e.target.value})}
                        placeholder="dd/mm/yyyy"
                        className="form-control"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td><label>تاريخ نهاية العقد:</label></td>
                    <td>
                      <input
                        type="text"
                        value={certificateData.contract_end_date}
                        onChange={(e) => setCertificateData({...certificateData, contract_end_date: e.target.value})}
                        placeholder="dd/mm/yyyy"
                        className="form-control"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              <button 
                type="button"
                onClick={handleCloseModal}
                className="btn btn-secondary"
              >
                إلغاء
              </button>
              <button 
                type="button"
                onClick={() => handleGenerateCertificate(certificateData)}
                className="btn btn-primary"
                disabled={generating}
              >
                {generating ? 'جاري الإنشاء...' : 'إنشاء الشهادة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExperienceCertificate;
