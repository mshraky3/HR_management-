/**
 * Bus Transportation Page
 * Manage bus transportation data for branches
 * Main managers can view all branches, branch managers only their branch
 */

import { useState, useEffect } from 'react';
import { busTransportationAPI, branchesAPI, termsAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import BranchBadge from '../components/BranchBadge';
import './BusTransportation.css';

const BusTransportation = () => {
  const { isMainManager, user } = useAuth();
  const { showError, showSuccess } = useNotification();
  const [buses, setBuses] = useState([]);
  const [filteredBuses, setFilteredBuses] = useState([]);
  const [branches, setBranches] = useState([]);
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBus, setSelectedBus] = useState(null);
  const [showBusForm, setShowBusForm] = useState(false);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [editingBus, setEditingBus] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedTermId, setSelectedTermId] = useState('');

  useEffect(() => {
    loadTerms();
    if (isMainManager()) {
      loadBranches();
    }
  }, [isMainManager]);

  useEffect(() => {
    loadBuses();
  }, [selectedTermId, selectedBranchId]);

  useEffect(() => {
    filterBuses();
  }, [searchTerm, selectedBranchId, selectedTermId, buses]);

  const loadBranches = async () => {
    try {
      const response = await branchesAPI.getAll({ is_active: true });
      if (response.data.success) {
        const sorted = (response.data.data || []).sort((a, b) =>
          (a.branch_name || '').localeCompare(b.branch_name || '', 'ar')
        );
        setBranches(sorted);
      }
    } catch (error) {
      console.error('Error loading branches:', error);
    }
  };

  const loadTerms = async () => {
    try {
      let response;
      if (!isMainManager() && user?.branch_id) {
        // For branch managers, get active terms for their branch type
        const branchResponse = await branchesAPI.getById(user.branch_id);
        if (branchResponse.data.success && branchResponse.data.data?.branch_type) {
          response = await termsAPI.getAll({ is_active: true, branch_type: branchResponse.data.data.branch_type });
          if (response.data.success) {
            const activeTerms = response.data.data || [];
            setTerms(activeTerms);
            // Set default to first active term (which should be the current one)
            if (activeTerms.length > 0 && !selectedTermId) {
              setSelectedTermId(activeTerms[0].id);
            }
          } else {
            setTerms([]);
          }
        }
      } else {
        // For main managers, get all active terms
        response = await termsAPI.getAll({ is_active: true });
        if (response.data.success) {
          setTerms(response.data.data || []);
          // Set default to first active term if available
          if (response.data.data && response.data.data.length > 0 && !selectedTermId) {
            setSelectedTermId(response.data.data[0].id);
          }
        }
      }
    } catch (error) {
      console.error('Error loading terms:', error);
      showError('فشل تحميل الفصول الدراسية');
    }
  };

  const loadBuses = async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedTermId) {
        params.term_id = selectedTermId;
      }
      if (!isMainManager() && user?.branch_id) {
        params.branch_id = user.branch_id;
      } else if (selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const response = await busTransportationAPI.getAll(params);
      if (response.data.success) {
        setBuses(response.data.data || []);
      }
    } catch (error) {
      console.error('Error loading buses:', error);
      showError('فشل تحميل بيانات الحافلات');
    } finally {
      setLoading(false);
    }
  };

  const filterBuses = () => {
    let filtered = [...buses];

    // Filter by term (already filtered in API, but double-check)
    if (selectedTermId) {
      filtered = filtered.filter(bus => bus.term_id === parseInt(selectedTermId));
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(bus =>
        bus.bus_number?.toLowerCase().includes(term) ||
        bus.driver_full_name?.toLowerCase().includes(term) ||
        bus.primary_plate?.toLowerCase().includes(term) ||
        bus.route_name?.toLowerCase().includes(term) ||
        bus.branch_name?.toLowerCase().includes(term) ||
        bus.term_name?.toLowerCase().includes(term)
      );
    }

    setFilteredBuses(filtered);
  };

  const handleCreateBus = async (busData) => {
    try {
      const response = await busTransportationAPI.create(busData);
      if (response.data.success) {
        showSuccess('تم إنشاء الحافلة بنجاح');
        setShowBusForm(false);
        loadBuses();
      }
    } catch (error) {
      showError(error.response?.data?.message || 'فشل إنشاء الحافلة');
    }
  };

  const handleUpdateBus = async (id, busData) => {
    try {
      const response = await busTransportationAPI.update(id, busData);
      if (response.data.success) {
        showSuccess('تم تحديث الحافلة بنجاح');
        setEditingBus(null);
        loadBuses();
      }
    } catch (error) {
      showError(error.response?.data?.message || 'فشل تحديث الحافلة');
    }
  };

  const handleDeleteBus = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الحافلة؟')) return;

    try {
      const response = await busTransportationAPI.delete(id);
      if (response.data.success) {
        showSuccess('تم حذف الحافلة بنجاح');
        loadBuses();
      }
    } catch (error) {
      showError(error.response?.data?.message || 'فشل حذف الحافلة');
    }
  };

  const handleViewBus = async (id) => {
    try {
      const response = await busTransportationAPI.getById(id);
      if (response.data.success) {
        setSelectedBus(response.data.data);
      }
    } catch (error) {
      showError('فشل تحميل بيانات الحافلة');
    }
  };

  if (loading) {
    return (
      <div className="bus-transportation-container">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bus-transportation-container">
      <div className="bus-transportation-header">
        <div className="header-content">
          <div className="header-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" fill="currentColor"/>
              <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" stroke="currentColor" strokeWidth="2" fill="none"/>
            </svg>
          </div>
          <div>
            <h1>نقل الطلاب</h1>
            <p className="page-description">إدارة بيانات حافلات نقل الطلاب</p>
          </div>
        </div>
        <button className="btn-primary" onClick={() => {
          setEditingBus(null);
          setShowBusForm(true);
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          إضافة حافلة
        </button>
      </div>

      {/* Filters */}
      <div className="filters-section">
        <div className="search-box">
          <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2"/>
          </svg>
          <input
            type="text"
            placeholder="ابحث عن حافلة، سائق، لوحة، أو مسار..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <select
          className="filter-select"
          value={selectedTermId}
          onChange={(e) => setSelectedTermId(e.target.value)}
        >
          <option value="">جميع الفصول</option>
          {terms.map(term => (
            <option key={term.id} value={term.id}>
              {term.term_name} - {term.academic_year_label}
            </option>
          ))}
        </select>

        {isMainManager() && (
          <select
            className="filter-select"
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
          >
            <option value="">جميع الفروع</option>
            {branches.map(branch => (
              <option key={branch.id} value={branch.id}>{branch.branch_name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Buses List */}
      <div className="buses-list">
        {filteredBuses.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </div>
            <p>لا توجد حافلات</p>
          </div>
        ) : (
          <div className="buses-grid">
            {filteredBuses.map(bus => (
              <div key={bus.id} className="bus-card">
                <div className="bus-card-header">
                  <div className="bus-number">{bus.bus_number}</div>
                  {isMainManager() && (
                    <div className="branch-badge-wrapper">
                      <BranchBadge branch={{ id: bus.branch_id, branch_name: bus.branch_name, branch_type: bus.branch_type }} />
                    </div>
                  )}
                </div>

                <div className="bus-card-body">
                  {bus.driver_full_name && (
                    <div className="bus-info-item">
                      <span className="info-label">السائق:</span>
                      <span className="info-value">{bus.driver_full_name}</span>
                    </div>
                  )}
                  {bus.primary_plate && (
                    <div className="bus-info-item">
                      <span className="info-label">لوحة الترخيص:</span>
                      <span className="info-value">{bus.primary_plate}</span>
                    </div>
                  )}
                  {bus.route_name && (
                    <div className="bus-info-item">
                      <span className="info-label">المسار:</span>
                      <span className="info-value">{bus.route_name}</span>
                    </div>
                  )}
                  {bus.number_of_seats && (
                    <div className="bus-info-item">
                      <span className="info-label">عدد المقاعد:</span>
                      <span className="info-value">{bus.number_of_seats}</span>
                    </div>
                  )}
                  {bus.student_count !== undefined && (
                    <div className="bus-info-item">
                      <span className="info-label">عدد الطلاب:</span>
                      <span className="info-value">{bus.student_count}</span>
                    </div>
                  )}
                  {bus.term_name && (
                    <div className="bus-info-item">
                      <span className="info-label">الفصل الدراسي:</span>
                      <span className="info-value">{bus.term_name} - {bus.academic_year_label}</span>
                    </div>
                  )}
                </div>

                <div className="bus-card-actions">
                  <button
                    className="btn-view"
                    onClick={() => handleViewBus(bus.id)}
                  >
                    عرض التفاصيل
                  </button>
                  <button
                    className="btn-edit"
                    onClick={() => {
                      setEditingBus(bus);
                      setShowBusForm(true);
                    }}
                  >
                    تعديل
                  </button>
                  <button
                    className="btn-delete"
                    onClick={() => handleDeleteBus(bus.id)}
                  >
                    حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bus Form Modal */}
      {showBusForm && (
        <BusFormModal
          bus={editingBus}
          branches={branches}
          terms={terms}
          isMainManager={isMainManager()}
          userBranchId={user?.branch_id}
          onClose={() => {
            setShowBusForm(false);
            setEditingBus(null);
          }}
          onSave={editingBus ? (data) => handleUpdateBus(editingBus.id, data) : handleCreateBus}
        />
      )}

      {/* Bus Details Modal */}
      {selectedBus && (
        <BusDetailsModal
          bus={selectedBus}
          onClose={() => setSelectedBus(null)}
          onEdit={() => {
            setSelectedBus(null);
            setEditingBus(selectedBus);
            setShowBusForm(true);
          }}
          onReload={loadBuses}
        />
      )}
    </div>
  );
};

// Bus Form Modal Component
const BusFormModal = ({ bus, branches, terms, isMainManager, userBranchId, onClose, onSave }) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    branch_id: bus?.branch_id || userBranchId || '',
    term_id: bus?.term_id || '',
    bus_number: bus?.bus_number || ''
  });
  const [saving, setSaving] = useState(false);
  const [currentTerm, setCurrentTerm] = useState(null);
  const [loadingTerm, setLoadingTerm] = useState(false);

  useEffect(() => {
    const loadCurrentTerm = async () => {
      // If editing, use the bus's term_id
      if (bus?.term_id) {
        setFormData(prev => ({ ...prev, term_id: bus.term_id }));
        return;
      }

      // If creating, get current term for the branch
      const branchId = formData.branch_id || userBranchId;
      if (branchId) {
        try {
          setLoadingTerm(true);
          const branchResponse = await branchesAPI.getById(branchId);
          if (branchResponse.data.success && branchResponse.data.data?.branch_type) {
            const termResponse = await termsAPI.getAll({ 
              is_active: true, 
              branch_type: branchResponse.data.data.branch_type 
            });
            if (termResponse.data.success && termResponse.data.data && termResponse.data.data.length > 0) {
              // Get the first active term (current term)
              const term = termResponse.data.data[0];
              setCurrentTerm(term);
              setFormData(prev => ({ ...prev, term_id: term.id }));
            }
          }
        } catch (error) {
          console.error('Error loading current term:', error);
        } finally {
          setLoadingTerm(false);
        }
      }
    };

    loadCurrentTerm();
  }, [formData.branch_id, userBranchId, bus, user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.branch_id || !formData.term_id || !formData.bus_number) {
      alert('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    setSaving(true);
    try {
      await onSave(formData);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{bus ? 'تعديل الحافلة' : 'إضافة حافلة جديدة'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="bus-form">
          {isMainManager && (
            <div className="form-group">
              <label>الفرع *</label>
              <select
                value={formData.branch_id}
                onChange={(e) => {
                  setFormData({ ...formData, branch_id: e.target.value, term_id: '' });
                  setCurrentTerm(null);
                }}
                required
              >
                <option value="">اختر الفرع</option>
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>{branch.branch_name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="form-group">
            <label>الفصل الدراسي *</label>
            {loadingTerm ? (
              <div>جاري تحميل الفصل الدراسي...</div>
            ) : currentTerm || bus?.term_id ? (
              <div className="term-display">
                {currentTerm ? `${currentTerm.term_name} - ${currentTerm.academic_year_label}` : 
                 bus?.term_name ? `${bus.term_name} - ${bus.academic_year_label}` : 'الفصل الحالي'}
              </div>
            ) : (
              <div className="term-display">يرجى اختيار الفرع أولاً</div>
            )}
            <input type="hidden" value={formData.term_id} />
          </div>
          <div className="form-group">
            <label>رقم الحافلة *</label>
            <input
              type="text"
              value={formData.bus_number}
              onChange={(e) => setFormData({ ...formData, bus_number: e.target.value })}
              required
            />
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'حفظ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Bus Details Modal Component
const BusDetailsModal = ({ bus, onClose, onEdit, onReload }) => {
  const { showError, showSuccess } = useNotification();
  const [activeTab, setActiveTab] = useState('overview');
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);

  useEffect(() => {
    if (activeTab === 'students') {
      loadStudents();
    }
  }, [activeTab, bus.id]);

  const loadStudents = async () => {
    try {
      setLoadingStudents(true);
      const response = await busTransportationAPI.getStudents(bus.id);
      if (response.data.success) {
        setStudents(response.data.data || []);
      }
    } catch (error) {
      showError('فشل تحميل بيانات الطلاب');
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleDeleteStudent = async (studentId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الطالب؟')) return;
    try {
      const response = await busTransportationAPI.deleteStudent(bus.id, studentId);
      if (response.data.success) {
        showSuccess('تم حذف الطالب بنجاح');
        loadStudents();
      }
    } catch (error) {
      showError(error.response?.data?.message || 'فشل حذف الطالب');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>تفاصيل الحافلة - {bus.bus_number}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="tabs">
          <button
            className={activeTab === 'overview' ? 'active' : ''}
            onClick={() => setActiveTab('overview')}
          >
            نظرة عامة
          </button>
          <button
            className={activeTab === 'registration' ? 'active' : ''}
            onClick={() => setActiveTab('registration')}
          >
            بيانات التسجيل
          </button>
          <button
            className={activeTab === 'driver' ? 'active' : ''}
            onClick={() => setActiveTab('driver')}
          >
            رخصة السائق
          </button>
          <button
            className={activeTab === 'plates' ? 'active' : ''}
            onClick={() => setActiveTab('plates')}
          >
            لوحات الترخيص
          </button>
          <button
            className={activeTab === 'details' ? 'active' : ''}
            onClick={() => setActiveTab('details')}
          >
            تفاصيل الحافلة
          </button>
          <button
            className={activeTab === 'students' ? 'active' : ''}
            onClick={() => setActiveTab('students')}
          >
            الطلاب ({students.length})
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'overview' && (
            <div className="overview-tab">
              <div className="info-grid">
                <div className="info-item">
                  <label>رقم الحافلة:</label>
                  <span>{bus.bus_number}</span>
                </div>
                <div className="info-item">
                  <label>الفرع:</label>
                  <span>{bus.branch_name}</span>
                </div>
                {bus.registration?.registration_number && (
                  <div className="info-item">
                    <label>رقم التسجيل:</label>
                    <span>{bus.registration.registration_number}</span>
                  </div>
                )}
                {bus.driver_license?.driver_full_name && (
                  <div className="info-item">
                    <label>السائق:</label>
                    <span>{bus.driver_license.driver_full_name}</span>
                  </div>
                )}
                {bus.details?.route_name && (
                  <div className="info-item">
                    <label>المسار:</label>
                    <span>{bus.details.route_name}</span>
                  </div>
                )}
                {bus.details?.number_of_seats && (
                  <div className="info-item">
                    <label>عدد المقاعد:</label>
                    <span>{bus.details.number_of_seats}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'registration' && (
            <RegistrationTab bus={bus} onReload={onReload} />
          )}

          {activeTab === 'driver' && (
            <DriverLicenseTab bus={bus} onReload={onReload} />
          )}

          {activeTab === 'plates' && (
            <LicensePlatesTab bus={bus} onReload={onReload} />
          )}

          {activeTab === 'details' && (
            <BusDetailsTab bus={bus} onReload={onReload} />
          )}

          {activeTab === 'students' && (
            <StudentsTab
              bus={bus}
              students={students}
              loading={loadingStudents}
              onReload={loadStudents}
              onAdd={() => {
                setEditingStudent(null);
                setShowStudentForm(true);
              }}
              onEdit={(student) => {
                setEditingStudent(student);
                setShowStudentForm(true);
              }}
              onDelete={handleDeleteStudent}
            />
          )}
        </div>

        <div className="modal-actions">
          <button onClick={onEdit} className="btn-primary">تعديل</button>
          <button onClick={onClose}>إغلاق</button>
        </div>
      </div>

      {showStudentForm && (
        <StudentFormModal
          bus={bus}
          student={editingStudent}
          onClose={() => {
            setShowStudentForm(false);
            setEditingStudent(null);
          }}
          onSave={async (data) => {
            try {
              if (editingStudent) {
                await busTransportationAPI.updateStudent(bus.id, editingStudent.id, data);
              } else {
                await busTransportationAPI.addStudent(bus.id, data);
              }
              showSuccess(editingStudent ? 'تم تحديث الطالب بنجاح' : 'تم إضافة الطالب بنجاح');
              setShowStudentForm(false);
              setEditingStudent(null);
              loadStudents();
            } catch (error) {
              showError(error.response?.data?.message || 'فشل حفظ الطالب');
            }
          }}
        />
      )}
    </div>
  );
};

// Registration Tab Component
const RegistrationTab = ({ bus, onReload }) => {
  const { showError, showSuccess } = useNotification();
  const [formData, setFormData] = useState({
    registration_number: bus.registration?.registration_number || '',
    registration_authority: bus.registration?.registration_authority || '',
    chassis_number: bus.registration?.chassis_number || '',
    engine_number: bus.registration?.engine_number || '',
    vehicle_make: bus.registration?.vehicle_make || '',
    vehicle_model: bus.registration?.vehicle_model || '',
    model_year: bus.registration?.model_year || '',
    vehicle_color: bus.registration?.vehicle_color || '',
    vehicle_type: bus.registration?.vehicle_type || '',
    vehicle_category: bus.registration?.vehicle_category || '',
    registration_date_hijri: bus.registration?.registration_date_hijri || '',
    registration_date_gregorian: bus.registration?.registration_date_gregorian || '',
    expiry_date_hijri: bus.registration?.expiry_date_hijri || '',
    expiry_date_gregorian: bus.registration?.expiry_date_gregorian || '',
    owner_name: bus.registration?.owner_name || '',
    owner_id_number: bus.registration?.owner_id_number || '',
    owner_type: bus.registration?.owner_type || '',
    notes: bus.registration?.notes || ''
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await busTransportationAPI.saveRegistration(bus.id, formData);
      if (response.data.success) {
        showSuccess('تم حفظ بيانات التسجيل بنجاح');
        onReload();
      }
    } catch (error) {
      showError(error.response?.data?.message || 'فشل حفظ بيانات التسجيل');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploading(true);
      const response = await busTransportationAPI.uploadRegistrationDocument(bus.id, file);
      if (response.data.success) {
        showSuccess('تم رفع المستند بنجاح');
        onReload();
      }
    } catch (error) {
      showError(error.response?.data?.message || 'فشل رفع المستند');
    } finally {
      setUploading(false);
      e.target.value = ''; // Reset file input
    }
  };

  return (
    <div className="tab-panel">
      <div className="tab-header">
        <h3>بيانات تسجيل الحافلة</h3>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'جاري الحفظ...' : 'حفظ'}
        </button>
      </div>

      {bus.registration?.registration_document_url && (
        <div className="document-preview">
          <a href={bus.registration.registration_document_url} target="_blank" rel="noopener noreferrer" className="document-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2"/>
              <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="2"/>
            </svg>
            عرض مستند التسجيل
          </a>
        </div>
      )}

      <div className="file-upload-section">
        <label className="file-upload-label">
          <input type="file" accept="image/*,application/pdf" onChange={handleFileUpload} disabled={uploading} />
          {uploading ? 'جاري الرفع...' : bus.registration?.registration_document_url ? 'استبدال المستند' : 'رفع مستند التسجيل'}
        </label>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label>رقم التسجيل *</label>
          <input
            type="text"
            value={formData.registration_number}
            onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label>رقم الشاصي *</label>
          <input
            type="text"
            value={formData.chassis_number}
            onChange={(e) => setFormData({ ...formData, chassis_number: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label>الجهة المصدرة</label>
          <input
            type="text"
            value={formData.registration_authority}
            onChange={(e) => setFormData({ ...formData, registration_authority: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>رقم المحرك</label>
          <input
            type="text"
            value={formData.engine_number}
            onChange={(e) => setFormData({ ...formData, engine_number: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>المصنع *</label>
          <input
            type="text"
            value={formData.vehicle_make}
            onChange={(e) => setFormData({ ...formData, vehicle_make: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label>الموديل *</label>
          <input
            type="text"
            value={formData.vehicle_model}
            onChange={(e) => setFormData({ ...formData, vehicle_model: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label>سنة الصنع</label>
          <input
            type="number"
            value={formData.model_year || ''}
            onChange={(e) => setFormData({ ...formData, model_year: e.target.value ? parseInt(e.target.value) : null })}
          />
        </div>
        <div className="form-group">
          <label>اللون</label>
          <input
            type="text"
            value={formData.vehicle_color}
            onChange={(e) => setFormData({ ...formData, vehicle_color: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>نوع المركبة</label>
          <input
            type="text"
            value={formData.vehicle_type}
            onChange={(e) => setFormData({ ...formData, vehicle_type: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>فئة المركبة</label>
          <input
            type="text"
            value={formData.vehicle_category}
            onChange={(e) => setFormData({ ...formData, vehicle_category: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>تاريخ التسجيل (هجري)</label>
          <input
            type="text"
            value={formData.registration_date_hijri}
            onChange={(e) => setFormData({ ...formData, registration_date_hijri: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>تاريخ التسجيل (ميلادي)</label>
          <input
            type="date"
            value={formData.registration_date_gregorian || ''}
            onChange={(e) => setFormData({ ...formData, registration_date_gregorian: e.target.value || null })}
          />
        </div>
        <div className="form-group">
          <label>تاريخ الانتهاء (هجري)</label>
          <input
            type="text"
            value={formData.expiry_date_hijri}
            onChange={(e) => setFormData({ ...formData, expiry_date_hijri: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>تاريخ الانتهاء (ميلادي)</label>
          <input
            type="date"
            value={formData.expiry_date_gregorian || ''}
            onChange={(e) => setFormData({ ...formData, expiry_date_gregorian: e.target.value || null })}
          />
        </div>
        <div className="form-group">
          <label>اسم المالك</label>
          <input
            type="text"
            value={formData.owner_name}
            onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>رقم هوية المالك</label>
          <input
            type="text"
            value={formData.owner_id_number}
            onChange={(e) => setFormData({ ...formData, owner_id_number: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>نوع المالك</label>
          <select
            value={formData.owner_type}
            onChange={(e) => setFormData({ ...formData, owner_type: e.target.value })}
          >
            <option value="">اختر النوع</option>
            <option value="individual">فرد</option>
            <option value="company">شركة</option>
          </select>
        </div>
        <div className="form-group full-width">
          <label>ملاحظات</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows="3"
          />
        </div>
      </div>
    </div>
  );
};

// Driver License Tab Component
const DriverLicenseTab = ({ bus, onReload }) => {
  const { showError, showSuccess } = useNotification();
  const [formData, setFormData] = useState({
    driver_full_name: bus.driver_license?.driver_full_name || '',
    driver_id_number: bus.driver_license?.driver_id_number || '',
    license_number: bus.driver_license?.license_number || '',
    license_type: bus.driver_license?.license_type || '',
    license_category: bus.driver_license?.license_category || '',
    license_authority: bus.driver_license?.license_authority || '',
    issue_date_hijri: bus.driver_license?.issue_date_hijri || '',
    issue_date_gregorian: bus.driver_license?.issue_date_gregorian || '',
    expiry_date_hijri: bus.driver_license?.expiry_date_hijri || '',
    expiry_date_gregorian: bus.driver_license?.expiry_date_gregorian || '',
    issue_place: bus.driver_license?.issue_place || '',
    driver_phone_number: bus.driver_license?.driver_phone_number || '',
    driver_address: bus.driver_license?.driver_address || '',
    driver_nationality: bus.driver_license?.driver_nationality || '',
    driver_date_of_birth_hijri: bus.driver_license?.driver_date_of_birth_hijri || '',
    driver_date_of_birth_gregorian: bus.driver_license?.driver_date_of_birth_gregorian || '',
    notes: bus.driver_license?.notes || ''
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await busTransportationAPI.saveDriverLicense(bus.id, formData);
      if (response.data.success) {
        showSuccess('تم حفظ بيانات رخصة السائق بنجاح');
        onReload();
      }
    } catch (error) {
      showError(error.response?.data?.message || 'فشل حفظ بيانات رخصة السائق');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploading(true);
      const response = await busTransportationAPI.uploadDriverLicenseDocument(bus.id, file);
      if (response.data.success) {
        showSuccess('تم رفع المستند بنجاح');
        onReload();
      }
    } catch (error) {
      showError(error.response?.data?.message || 'فشل رفع المستند');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="tab-panel">
      <div className="tab-header">
        <h3>بيانات رخصة السائق</h3>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'جاري الحفظ...' : 'حفظ'}
        </button>
      </div>

      {bus.driver_license?.license_document_url && (
        <div className="document-preview">
          <a href={bus.driver_license.license_document_url} target="_blank" rel="noopener noreferrer" className="document-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2"/>
              <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="2"/>
            </svg>
            عرض رخصة السائق
          </a>
        </div>
      )}

      <div className="file-upload-section">
        <label className="file-upload-label">
          <input type="file" accept="image/*,application/pdf" onChange={handleFileUpload} disabled={uploading} />
          {uploading ? 'جاري الرفع...' : bus.driver_license?.license_document_url ? 'استبدال المستند' : 'رفع رخصة السائق'}
        </label>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label>اسم السائق الكامل *</label>
          <input
            type="text"
            value={formData.driver_full_name}
            onChange={(e) => setFormData({ ...formData, driver_full_name: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label>رقم الهوية/الإقامة *</label>
          <input
            type="text"
            value={formData.driver_id_number}
            onChange={(e) => setFormData({ ...formData, driver_id_number: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label>رقم الرخصة *</label>
          <input
            type="text"
            value={formData.license_number}
            onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label>نوع الرخصة</label>
          <input
            type="text"
            value={formData.license_type}
            onChange={(e) => setFormData({ ...formData, license_type: e.target.value })}
            placeholder="مثل: نقل عام، مركبات ثقيلة"
          />
        </div>
        <div className="form-group">
          <label>فئة الرخصة</label>
          <input
            type="text"
            value={formData.license_category}
            onChange={(e) => setFormData({ ...formData, license_category: e.target.value })}
            placeholder="مثل: C, D, E"
          />
        </div>
        <div className="form-group">
          <label>الجهة المصدرة</label>
          <input
            type="text"
            value={formData.license_authority}
            onChange={(e) => setFormData({ ...formData, license_authority: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>تاريخ الإصدار (هجري)</label>
          <input
            type="text"
            value={formData.issue_date_hijri}
            onChange={(e) => setFormData({ ...formData, issue_date_hijri: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>تاريخ الإصدار (ميلادي)</label>
          <input
            type="date"
            value={formData.issue_date_gregorian || ''}
            onChange={(e) => setFormData({ ...formData, issue_date_gregorian: e.target.value || null })}
          />
        </div>
        <div className="form-group">
          <label>تاريخ الانتهاء (هجري)</label>
          <input
            type="text"
            value={formData.expiry_date_hijri}
            onChange={(e) => setFormData({ ...formData, expiry_date_hijri: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>تاريخ الانتهاء (ميلادي)</label>
          <input
            type="date"
            value={formData.expiry_date_gregorian || ''}
            onChange={(e) => setFormData({ ...formData, expiry_date_gregorian: e.target.value || null })}
          />
        </div>
        <div className="form-group">
          <label>مكان الإصدار</label>
          <input
            type="text"
            value={formData.issue_place}
            onChange={(e) => setFormData({ ...formData, issue_place: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>رقم هاتف السائق</label>
          <input
            type="text"
            value={formData.driver_phone_number}
            onChange={(e) => setFormData({ ...formData, driver_phone_number: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>عنوان السائق</label>
          <textarea
            value={formData.driver_address}
            onChange={(e) => setFormData({ ...formData, driver_address: e.target.value })}
            rows="2"
          />
        </div>
        <div className="form-group">
          <label>جنسية السائق</label>
          <input
            type="text"
            value={formData.driver_nationality}
            onChange={(e) => setFormData({ ...formData, driver_nationality: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>تاريخ الميلاد (هجري)</label>
          <input
            type="text"
            value={formData.driver_date_of_birth_hijri}
            onChange={(e) => setFormData({ ...formData, driver_date_of_birth_hijri: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>تاريخ الميلاد (ميلادي)</label>
          <input
            type="date"
            value={formData.driver_date_of_birth_gregorian || ''}
            onChange={(e) => setFormData({ ...formData, driver_date_of_birth_gregorian: e.target.value || null })}
          />
        </div>
        <div className="form-group full-width">
          <label>ملاحظات</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows="3"
          />
        </div>
      </div>
    </div>
  );
};

// License Plates Tab Component
const LicensePlatesTab = ({ bus, onReload }) => {
  const { showError, showSuccess } = useNotification();
  const [plates, setPlates] = useState(bus.license_plates || []);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPlate, setEditingPlate] = useState(null);
  const [formData, setFormData] = useState({
    plate_number: '',
    plate_region: '',
    plate_type: '',
    plate_color: '',
    is_primary: false
  });

  useEffect(() => {
    setPlates(bus.license_plates || []);
  }, [bus.license_plates]);

  const loadPlates = async () => {
    try {
      const response = await busTransportationAPI.getById(bus.id);
      if (response.data.success) {
        setPlates(response.data.data.license_plates || []);
      }
    } catch (error) {
      showError('فشل تحميل لوحات الترخيص');
    }
  };

  const handleAdd = () => {
    setFormData({
      plate_number: '',
      plate_region: '',
      plate_type: '',
      plate_color: '',
      is_primary: plates.length === 0 // First plate is primary by default
    });
    setEditingPlate(null);
    setShowAddForm(true);
  };

  const handleEdit = (plate) => {
    setFormData({
      plate_number: plate.plate_number,
      plate_region: plate.plate_region || '',
      plate_type: plate.plate_type || '',
      plate_color: plate.plate_color || '',
      is_primary: plate.is_primary
    });
    setEditingPlate(plate);
    setShowAddForm(true);
  };

  const handleSave = async () => {
    if (!formData.plate_number) {
      showError('يرجى إدخال رقم اللوحة');
      return;
    }

    try {
      if (editingPlate) {
        await busTransportationAPI.updateLicensePlate(bus.id, editingPlate.id, formData);
        showSuccess('تم تحديث لوحة الترخيص بنجاح');
      } else {
        await busTransportationAPI.addLicensePlate(bus.id, formData);
        showSuccess('تم إضافة لوحة الترخيص بنجاح');
      }
      setShowAddForm(false);
      setEditingPlate(null);
      loadPlates();
      onReload();
    } catch (error) {
      showError(error.response?.data?.message || 'فشل حفظ لوحة الترخيص');
    }
  };

  const handleDelete = async (plateId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه اللوحة؟')) return;

    try {
      await busTransportationAPI.deleteLicensePlate(bus.id, plateId);
      showSuccess('تم حذف لوحة الترخيص بنجاح');
      loadPlates();
      onReload();
    } catch (error) {
      showError(error.response?.data?.message || 'فشل حذف لوحة الترخيص');
    }
  };

  return (
    <div className="tab-panel">
      <div className="tab-header">
        <h3>لوحات الترخيص</h3>
        <button className="btn-primary" onClick={handleAdd}>
          إضافة لوحة
        </button>
      </div>

      {showAddForm && (
        <div className="plate-form-card">
          <h4>{editingPlate ? 'تعديل لوحة الترخيص' : 'إضافة لوحة ترخيص جديدة'}</h4>
          <div className="form-grid">
            <div className="form-group">
              <label>رقم اللوحة *</label>
              <input
                type="text"
                value={formData.plate_number}
                onChange={(e) => setFormData({ ...formData, plate_number: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>المنطقة</label>
              <input
                type="text"
                value={formData.plate_region}
                onChange={(e) => setFormData({ ...formData, plate_region: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>نوع اللوحة</label>
              <select
                value={formData.plate_type}
                onChange={(e) => setFormData({ ...formData, plate_type: e.target.value })}
              >
                <option value="">اختر النوع</option>
                <option value="private">خاص</option>
                <option value="commercial">تجاري</option>
                <option value="government">حكومي</option>
                <option value="taxi">تاكسي</option>
              </select>
            </div>
            <div className="form-group">
              <label>لون اللوحة</label>
              <input
                type="text"
                value={formData.plate_color}
                onChange={(e) => setFormData({ ...formData, plate_color: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.is_primary}
                  onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })}
                />
                لوحة أساسية
              </label>
            </div>
          </div>
          <div className="form-actions">
            <button onClick={() => {
              setShowAddForm(false);
              setEditingPlate(null);
            }}>إلغاء</button>
            <button className="btn-primary" onClick={handleSave}>حفظ</button>
          </div>
        </div>
      )}

      <div className="plates-list">
        {plates.length === 0 ? (
          <div className="empty-state">لا توجد لوحات ترخيص</div>
        ) : (
          plates.map(plate => (
            <div key={plate.id} className={`plate-item ${plate.is_primary ? 'primary' : ''}`}>
              <div className="plate-info">
                <div className="plate-number">{plate.plate_number}</div>
                {plate.is_primary && <span className="primary-badge">أساسية</span>}
                <div className="plate-details">
                  {plate.plate_region && <span>المنطقة: {plate.plate_region}</span>}
                  {plate.plate_type && <span>النوع: {plate.plate_type}</span>}
                  {plate.plate_color && <span>اللون: {plate.plate_color}</span>}
                </div>
              </div>
              <div className="plate-actions">
                <button onClick={() => handleEdit(plate)}>تعديل</button>
                <button onClick={() => handleDelete(plate.id)}>حذف</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Bus Details Tab Component
const BusDetailsTab = ({ bus, onReload }) => {
  const { showError, showSuccess } = useNotification();
  const [formData, setFormData] = useState({
    route_name: bus.details?.route_name || '',
    route_description: bus.details?.route_description || '',
    number_of_seats: bus.details?.number_of_seats || '',
    ownership_type: bus.details?.ownership_type || 'owned',
    lease_company_name: bus.details?.lease_company_name || '',
    lease_contact_info: bus.details?.lease_contact_info || '',
    lease_contract_number: bus.details?.lease_contract_number || '',
    lease_start_date_hijri: bus.details?.lease_start_date_hijri || '',
    lease_start_date_gregorian: bus.details?.lease_start_date_gregorian || '',
    lease_end_date_hijri: bus.details?.lease_end_date_hijri || '',
    lease_end_date_gregorian: bus.details?.lease_end_date_gregorian || '',
    insurance_provider: bus.details?.insurance_provider || '',
    insurance_policy_number: bus.details?.insurance_policy_number || '',
    insurance_expiry_date_hijri: bus.details?.insurance_expiry_date_hijri || '',
    insurance_expiry_date_gregorian: bus.details?.insurance_expiry_date_gregorian || '',
    maintenance_schedule: bus.details?.maintenance_schedule || '',
    notes: bus.details?.notes || ''
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!formData.number_of_seats || !formData.ownership_type) {
      showError('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    try {
      setSaving(true);
      const response = await busTransportationAPI.saveDetails(bus.id, {
        ...formData,
        number_of_seats: parseInt(formData.number_of_seats)
      });
      if (response.data.success) {
        showSuccess('تم حفظ تفاصيل الحافلة بنجاح');
        onReload();
      }
    } catch (error) {
      showError(error.response?.data?.message || 'فشل حفظ تفاصيل الحافلة');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tab-panel">
      <div className="tab-header">
        <h3>تفاصيل الحافلة</h3>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'جاري الحفظ...' : 'حفظ'}
        </button>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label>اسم المسار</label>
          <input
            type="text"
            value={formData.route_name}
            onChange={(e) => setFormData({ ...formData, route_name: e.target.value })}
          />
        </div>
        <div className="form-group full-width">
          <label>وصف المسار</label>
          <textarea
            value={formData.route_description}
            onChange={(e) => setFormData({ ...formData, route_description: e.target.value })}
            rows="3"
          />
        </div>
        <div className="form-group">
          <label>عدد المقاعد *</label>
          <input
            type="number"
            value={formData.number_of_seats}
            onChange={(e) => setFormData({ ...formData, number_of_seats: e.target.value })}
            required
            min="1"
          />
        </div>
        <div className="form-group">
          <label>نوع الملكية *</label>
          <select
            value={formData.ownership_type}
            onChange={(e) => setFormData({ ...formData, ownership_type: e.target.value })}
            required
          >
            <option value="owned">مملوكة</option>
            <option value="leased">مؤجرة</option>
            <option value="rented">مستأجرة</option>
          </select>
        </div>

        {(formData.ownership_type === 'leased' || formData.ownership_type === 'rented') && (
          <>
            <div className="form-group">
              <label>اسم شركة التأجير</label>
              <input
                type="text"
                value={formData.lease_company_name}
                onChange={(e) => setFormData({ ...formData, lease_company_name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>معلومات الاتصال</label>
              <input
                type="text"
                value={formData.lease_contact_info}
                onChange={(e) => setFormData({ ...formData, lease_contact_info: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>رقم عقد التأجير</label>
              <input
                type="text"
                value={formData.lease_contract_number}
                onChange={(e) => setFormData({ ...formData, lease_contract_number: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>تاريخ بدء التأجير (هجري)</label>
              <input
                type="text"
                value={formData.lease_start_date_hijri}
                onChange={(e) => setFormData({ ...formData, lease_start_date_hijri: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>تاريخ بدء التأجير (ميلادي)</label>
              <input
                type="date"
                value={formData.lease_start_date_gregorian || ''}
                onChange={(e) => setFormData({ ...formData, lease_start_date_gregorian: e.target.value || null })}
              />
            </div>
            <div className="form-group">
              <label>تاريخ انتهاء التأجير (هجري)</label>
              <input
                type="text"
                value={formData.lease_end_date_hijri}
                onChange={(e) => setFormData({ ...formData, lease_end_date_hijri: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>تاريخ انتهاء التأجير (ميلادي)</label>
              <input
                type="date"
                value={formData.lease_end_date_gregorian || ''}
                onChange={(e) => setFormData({ ...formData, lease_end_date_gregorian: e.target.value || null })}
              />
            </div>
          </>
        )}

        <div className="form-group">
          <label>شركة التأمين</label>
          <input
            type="text"
            value={formData.insurance_provider}
            onChange={(e) => setFormData({ ...formData, insurance_provider: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>رقم بوليصة التأمين</label>
          <input
            type="text"
            value={formData.insurance_policy_number}
            onChange={(e) => setFormData({ ...formData, insurance_policy_number: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>تاريخ انتهاء التأمين (هجري)</label>
          <input
            type="text"
            value={formData.insurance_expiry_date_hijri}
            onChange={(e) => setFormData({ ...formData, insurance_expiry_date_hijri: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>تاريخ انتهاء التأمين (ميلادي)</label>
          <input
            type="date"
            value={formData.insurance_expiry_date_gregorian || ''}
            onChange={(e) => setFormData({ ...formData, insurance_expiry_date_gregorian: e.target.value || null })}
          />
        </div>
        <div className="form-group full-width">
          <label>جدول الصيانة</label>
          <textarea
            value={formData.maintenance_schedule}
            onChange={(e) => setFormData({ ...formData, maintenance_schedule: e.target.value })}
            rows="3"
          />
        </div>
        <div className="form-group full-width">
          <label>ملاحظات</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows="3"
          />
        </div>
      </div>
    </div>
  );
};

const StudentsTab = ({ bus, students, loading, onReload, onAdd, onEdit, onDelete }) => (
  <div className="tab-panel">
    <div className="students-header">
      <h3>قائمة الطلاب</h3>
      <button className="btn-primary" onClick={onAdd}>
        إضافة طالب
      </button>
    </div>
    {loading ? (
      <div className="loading">جاري التحميل...</div>
    ) : students.length === 0 ? (
      <div className="empty-state">لا يوجد طلاب</div>
    ) : (
      <div className="students-list">
        {students.map(student => (
          <div key={student.id} className="student-item">
            <div className="student-info">
              <div className="student-name">{student.student_full_name}</div>
              <div className="student-contact">{student.contact_mobile_number}</div>
              {student.address && <div className="student-address">{student.address}</div>}
            </div>
            <div className="student-actions">
              <button onClick={() => onEdit(student)}>تعديل</button>
              <button onClick={() => onDelete(student.id)}>حذف</button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

const StudentFormModal = ({ bus, student, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    student_full_name: student?.student_full_name || '',
    contact_mobile_number: student?.contact_mobile_number || '',
    address: student?.address || '',
    pickup_location: student?.pickup_location || '',
    dropoff_location: student?.dropoff_location || '',
    pickup_time: student?.pickup_time || '',
    dropoff_time: student?.dropoff_time || '',
    guardian_name: student?.guardian_name || '',
    guardian_relationship: student?.guardian_relationship || '',
    guardian_phone: student?.guardian_phone || '',
    notes: student?.notes || '',
    term_id: student?.term_id || bus?.term_id || ''
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.student_full_name || !formData.contact_mobile_number || !formData.address) {
      alert('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    // Ensure term_id is set from bus if not already set
    const submitData = {
      ...formData,
      term_id: formData.term_id || bus?.term_id
    };

    setSaving(true);
    try {
      await onSave(submitData);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{student ? 'تعديل الطالب' : 'إضافة طالب جديد'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="student-form">
          <div className="form-group">
            <label>الاسم الكامل *</label>
            <input
              type="text"
              value={formData.student_full_name}
              onChange={(e) => setFormData({ ...formData, student_full_name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>رقم الجوال *</label>
            <input
              type="text"
              value={formData.contact_mobile_number}
              onChange={(e) => setFormData({ ...formData, contact_mobile_number: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>العنوان *</label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>موقع الاستلام</label>
            <input
              type="text"
              value={formData.pickup_location}
              onChange={(e) => setFormData({ ...formData, pickup_location: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>موقع التسليم</label>
            <input
              type="text"
              value={formData.dropoff_location}
              onChange={(e) => setFormData({ ...formData, dropoff_location: e.target.value })}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>وقت الاستلام</label>
              <input
                type="time"
                value={formData.pickup_time}
                onChange={(e) => setFormData({ ...formData, pickup_time: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>وقت التسليم</label>
              <input
                type="time"
                value={formData.dropoff_time}
                onChange={(e) => setFormData({ ...formData, dropoff_time: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label>اسم ولي الأمر</label>
            <input
              type="text"
              value={formData.guardian_name}
              onChange={(e) => setFormData({ ...formData, guardian_name: e.target.value })}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>صلة القرابة</label>
              <input
                type="text"
                value={formData.guardian_relationship}
                onChange={(e) => setFormData({ ...formData, guardian_relationship: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>هاتف ولي الأمر</label>
              <input
                type="text"
                value={formData.guardian_phone}
                onChange={(e) => setFormData({ ...formData, guardian_phone: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label>ملاحظات</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'حفظ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BusTransportation;
