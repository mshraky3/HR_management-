/**
 * Bus Transportation Page
 * Manage bus transportation data for branches
 * Main managers can view all branches, branch managers only their branch
 */

import { useState, useEffect, useRef } from 'react';
import { busTransportationAPI, branchesAPI, termsAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import BranchBadge from '../components/BranchBadge';
import UnifiedDatePicker from '../components/UnifiedDatePicker';
import './BusTransportation.css';

function PlateDisplay({ value = '' }) {
  const parsePlate = (plateValue) => {
    if (!plateValue) return { numbers: ['', '', '', ''], lettersEn: ['', '', ''], lettersAr: ['', '', ''] };
    const numbersPart = String(plateValue).replace(/[^0-9]/g, '').slice(0, 4);
    const lettersEnPart = String(plateValue).replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3);
    const lettersArPart = String(plateValue).replace(/[^\u0600-\u06FF]/g, '').slice(0, 3);
    const numbers = numbersPart.split('').concat(Array(4 - numbersPart.length).fill(''));
    const lettersEn = lettersEnPart.split('').concat(Array(3 - lettersEnPart.length).fill(''));
    const lettersAr = lettersArPart.split('').concat(Array(3 - lettersArPart.length).fill(''));
    return { numbers, lettersEn, lettersAr };
  };

  const { numbers, lettersEn, lettersAr } = parsePlate(value);

  return (
    <div className="saudi-plate-input plate-display plate-display-rect" aria-label="رقم اللوحة">
      <div className="plate-section">
        <div className="plate-label">الأرقام</div>
        <div className="plate-numbers">
          {numbers.map((num, idx) => (
            <div key={`num-d-${idx}`} className="plate-input-number plate-cell">
              {num || ''}
            </div>
          ))}
        </div>
      </div>

      <div className="plate-letters-row">
        <div className="plate-section plate-letters-en">
          <div className="plate-label">الحروف (EN)</div>
          <div className="plate-letters">
            {lettersEn.map((letter, idx) => (
              <div key={`en-d-${idx}`} className="plate-input-letter plate-cell">
                {letter || ''}
              </div>
            ))}
          </div>
        </div>

        <div className="plate-section plate-letters-ar">
          <div className="plate-label">الحروف (AR)</div>
          <div className="plate-letters">
            {lettersAr.map((letter, idx) => (
              <div
                key={`ar-d-${idx}`}
                className="plate-input-letter plate-cell"
                style={{ direction: 'rtl', fontFamily: "'Noto Sans Arabic', Arial, sans-serif" }}
              >
                {letter || ''}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const BusTransportation = () => {
  const { isMainManager, user } = useAuth();
  const { showError, showSuccess } = useNotification();
  const [buses, setBuses] = useState([]);
  const [filteredBuses, setFilteredBuses] = useState([]);
  const [highlightBusId, setHighlightBusId] = useState(null);
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

  // After finishing the flow, scroll + highlight the bus card
  useEffect(() => {
    if (!highlightBusId) return;
    const el = document.querySelector(`[data-bus-id="${highlightBusId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('bus-card-highlight');
    const t = setTimeout(() => {
      el.classList.remove('bus-card-highlight');
      setHighlightBusId(null);
    }, 1600);
    return () => clearTimeout(t);
  }, [highlightBusId, filteredBuses]);

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
        setEditingBus(null);
        // Load the created bus and open details modal to enter remaining data
        const busResponse = await busTransportationAPI.getById(response.data.data.id);
        if (busResponse.data.success) {
          setSelectedBus(busResponse.data.data);
        }
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
              <div key={bus.id} className="bus-card" data-bus-id={bus.id}>
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
                    <div className="plate-display-wrapper">
                      <span className="info-label">رقم اللوحات</span>
                      <PlateDisplay value={bus.primary_plate} />
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
                    {(() => {
                      const missingStudents = (bus.student_count === 0 || bus.student_count === null || bus.student_count === undefined);
                      const missingRegDoc = !bus.registration_document_url;
                      const missingDriverDoc = !bus.license_document_url;
                      const missingLeaseDoc = bus.ownership_type === 'leased' && !bus.lease_contract_document_url;
                      const missingDocs = missingRegDoc || missingDriverDoc || missingLeaseDoc;
                      return (missingDocs || missingStudents) ? 'إكمال' : 'تعديل';
                    })()}
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

      {/* Bus Form Section */}
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
          onReload={loadBuses}
          onAfterFinish={(busId) => setHighlightBusId(busId)}
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

// Bus Form Modal Component - Extended with tabs for all data
const BusFormModal = ({ bus, branches, terms, isMainManager, userBranchId, onClose, onSave, onReload, onAfterFinish }) => {
  const { user } = useAuth();
  const { showError, showSuccess } = useNotification();
  const isEditing = !!bus;
  const hydratedRef = useRef(false);
  const [activeTab, setActiveTab] = useState('basic');
  const tabsFlow = ['basic', 'registration', 'driver', 'details', 'students', 'documents'];
  const [maxStepIndex, setMaxStepIndex] = useState(bus ? tabsFlow.length - 1 : 0);
  const [saving, setSaving] = useState(false);
  const [docsState, setDocsState] = useState({
    registration: !!bus?.registration?.registration_document_url,
    driverLicense: !!bus?.driver_license?.license_document_url,
    leaseContract: !!bus?.lease_contract_document_url
  });
  const [currentTerm, setCurrentTerm] = useState(null);
  const [loadingTerm, setLoadingTerm] = useState(false);
  const [createdBusId, setCreatedBusId] = useState(bus?.id || null);
  const formSectionRef = useRef(null);
  
  // Basic bus info
  const [basicFormData, setBasicFormData] = useState({
    branch_id: bus?.branch_id || userBranchId || '',
    term_id: bus?.term_id || '',
    plate_number: bus?.bus_number || ''
  });

  // Scroll to form section when opened
  useEffect(() => {
    if (formSectionRef.current && !bus) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        formSectionRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }, 100);
    }
  }, [bus]);

  // Registration data
  const [registrationData, setRegistrationData] = useState({
    registration_number: bus?.registration?.registration_number || '',
    chassis_number: bus?.registration?.chassis_number || '',
    vehicle_model: bus?.registration?.vehicle_model || '',
    model_year: bus?.registration?.model_year || '',
    vehicle_color: bus?.registration?.vehicle_color || '',
    expiry_date_gregorian: bus?.registration?.expiry_date_gregorian || '',
  });

  // Driver license data
  const [driverLicenseData, setDriverLicenseData] = useState({
    driver_full_name: bus?.driver_license?.driver_full_name || '',
    driver_id_number: bus?.driver_license?.driver_id_number || '',
    license_number: bus?.driver_license?.license_number || '',
    issue_date_gregorian: bus?.driver_license?.issue_date_gregorian || '',
    expiry_date_gregorian: bus?.driver_license?.expiry_date_gregorian || '',
    driver_phone_number: bus?.driver_license?.driver_phone_number || '',
    driver_nationality: bus?.driver_license?.driver_nationality || '',
    driver_date_of_birth_gregorian: bus?.driver_license?.driver_date_of_birth_gregorian || '',
    has_assistant: bus?.driver_license?.has_assistant || false,
    assistant_full_name: bus?.driver_license?.assistant_full_name || '',
    assistant_phone_number: bus?.driver_license?.assistant_phone_number || '',
  });

  // License plates
  const [licensePlates, setLicensePlates] = useState(
    bus?.license_plates?.map(p => ({ ...p })) || [{ plate_number: bus?.bus_number || '', is_primary: true }]
  );

  // Keep the first plate in sync with the bus plate number (bus is identified by plate)
  useEffect(() => {
    const plate = String(basicFormData.plate_number || '').trim();
    if (!plate) return;
    setLicensePlates((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) {
        return [{ plate_number: plate, is_primary: true }];
      }
      const first = prev[0] || {};
      // Only auto-fill if empty to avoid overwriting user edits
      if (first.plate_number && String(first.plate_number).trim() !== '') return prev;
      const updated = [...prev];
      updated[0] = { ...first, plate_number: plate, is_primary: true };
      return updated;
    });
  }, [basicFormData.plate_number]);

  // Bus details (must be declared before step completeness checks)
  const normalizeOwnershipType = (v) => (v === 'rented' ? 'leased' : (v || 'owned'));
  const [busDetailsData, setBusDetailsData] = useState({
    route_name: bus?.details?.route_name || '',
    route_description: bus?.details?.route_description || '',
    number_of_seats: bus?.details?.number_of_seats || '',
    ownership_type: normalizeOwnershipType(bus?.details?.ownership_type),
    lease_company_name: bus?.details?.lease_company_name || '',
    lease_contact_info: bus?.details?.lease_contact_info || '',
    lease_contract_number: bus?.details?.lease_contract_number || '',
    lease_start_date_hijri: bus?.details?.lease_start_date_hijri || '',
    lease_start_date_gregorian: bus?.details?.lease_start_date_gregorian || '',
    lease_end_date_hijri: bus?.details?.lease_end_date_hijri || '',
    lease_end_date_gregorian: bus?.details?.lease_end_date_gregorian || '',
    insurance_provider: bus?.details?.insurance_provider || '',
    insurance_policy_number: bus?.details?.insurance_policy_number || '',
    insurance_expiry_date_gregorian: bus?.details?.insurance_expiry_date_gregorian || '',
  });

  const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';
  const parsePlate = (value) => {
    const raw = String(value || '');
    const numbers = raw.replace(/[^0-9]/g, '').slice(0, 4);
    const lettersEn = raw.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3);
    const lettersAr = raw.replace(/[^\u0600-\u06FF]/g, '').slice(0, 3);
    return { numbers, lettersEn, lettersAr, normalized: numbers + lettersEn + lettersAr };
  };

  // When editing, always hydrate the modal with the full saved record from API
  // (the bus list row is often missing nested registration/driver/details/students)
  useEffect(() => {
    if (!bus?.id) return;
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    (async () => {
      try {
        const res = await busTransportationAPI.getById(bus.id);
        if (!res?.data?.success) return;
        const full = res.data.data;
        if (!full) return;

        setCreatedBusId(full.id || bus.id);

        setBasicFormData({
          branch_id: full.branch_id || userBranchId || '',
          term_id: full.term_id || '',
          plate_number: full.bus_number || ''
        });

        setRegistrationData({
          registration_number: full.registration?.registration_number || '',
          chassis_number: full.registration?.chassis_number || '',
          vehicle_model: full.registration?.vehicle_model || '',
          model_year: full.registration?.model_year || '',
          vehicle_color: full.registration?.vehicle_color || '',
          expiry_date_gregorian: full.registration?.expiry_date_gregorian || ''
        });

        setDriverLicenseData({
          driver_full_name: full.driver_license?.driver_full_name || '',
          driver_id_number: full.driver_license?.driver_id_number || '',
          license_number: full.driver_license?.license_number || '',
          issue_date_gregorian: full.driver_license?.issue_date_gregorian || '',
          expiry_date_gregorian: full.driver_license?.expiry_date_gregorian || '',
          driver_phone_number: full.driver_license?.driver_phone_number || '',
          driver_nationality: full.driver_license?.driver_nationality || '',
          driver_date_of_birth_gregorian: full.driver_license?.driver_date_of_birth_gregorian || '',
          has_assistant: full.driver_license?.has_assistant || false,
          assistant_full_name: full.driver_license?.assistant_full_name || '',
          assistant_phone_number: full.driver_license?.assistant_phone_number || ''
        });

        setLicensePlates(
          (full.license_plates?.map(p => ({ ...p }))?.length
            ? full.license_plates.map(p => ({ ...p }))
            : [{ plate_number: full.bus_number || '', is_primary: true }])
        );

        setBusDetailsData({
          route_name: full.details?.route_name || '',
          route_description: full.details?.route_description || '',
          number_of_seats: full.details?.number_of_seats || '',
          ownership_type: normalizeOwnershipType(full.details?.ownership_type),
          lease_company_name: full.details?.lease_company_name || '',
          lease_contact_info: full.details?.lease_contact_info || '',
          lease_contract_number: full.details?.lease_contract_number || '',
          lease_start_date_hijri: full.details?.lease_start_date_hijri || '',
          lease_start_date_gregorian: full.details?.lease_start_date_gregorian || '',
          lease_end_date_hijri: full.details?.lease_end_date_hijri || '',
          lease_end_date_gregorian: full.details?.lease_end_date_gregorian || '',
          insurance_provider: full.details?.insurance_provider || '',
          insurance_policy_number: full.details?.insurance_policy_number || '',
          insurance_expiry_date_gregorian: full.details?.insurance_expiry_date_gregorian || ''
        });

        setDocsState({
          registration: !!full.registration?.registration_document_url,
          driverLicense: !!full.driver_license?.license_document_url,
          leaseContract: !!full.lease_contract_document_url
        });

        setStudents(() => {
          const existing = full.students?.map(s => ({ ...s })) || [];
          if (existing.length === 0) return [makeEmptyStudentRow()];
          return [...existing, makeEmptyStudentRow()];
        });
      } catch (e) {
        // keep initial values if fetch fails
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus?.id]);

  const getStepComplete = (tabKey) => {
    if (tabKey === 'basic') {
      const plateParsed = parsePlate(basicFormData.plate_number);
      const branchOk = !isMainManager || !isBlank(basicFormData.branch_id);
      return (
        branchOk &&
        !isBlank(basicFormData.term_id) &&
        plateParsed.numbers.length === 4 &&
        plateParsed.lettersEn.length === 3 &&
        plateParsed.lettersAr.length === 3
      );
    }
    if (tabKey === 'registration') {
      return (
        !isBlank(registrationData.registration_number) &&
        !isBlank(registrationData.chassis_number) &&
        !isBlank(registrationData.vehicle_model) &&
        !isBlank(registrationData.expiry_date_gregorian)
      );
    }
    if (tabKey === 'driver') {
      if (driverLicenseData?.has_assistant) {
        return (
          !isBlank(driverLicenseData.driver_full_name) &&
          !isBlank(driverLicenseData.driver_id_number) &&
          !isBlank(driverLicenseData.license_number) &&
          !isBlank(driverLicenseData.expiry_date_gregorian) &&
          !isBlank(driverLicenseData.assistant_full_name) &&
          !isBlank(driverLicenseData.assistant_phone_number)
        );
      }
      return (
        !isBlank(driverLicenseData.driver_full_name) &&
        !isBlank(driverLicenseData.driver_id_number) &&
        !isBlank(driverLicenseData.license_number) &&
        !isBlank(driverLicenseData.expiry_date_gregorian)
      );
    }
    if (tabKey === 'details') {
      return !isBlank(busDetailsData.number_of_seats) && !isBlank(busDetailsData.ownership_type);
    }
    if (tabKey === 'students') {
      return true;
    }
    if (tabKey === 'documents') {
      return true; // uploads are optional
    }
    return true;
  };

  const activeStepIndex = Math.max(0, tabsFlow.indexOf(activeTab));
  const canGoPrev = activeStepIndex > 0;
  const canGoNext = activeStepIndex >= 0 && activeStepIndex < tabsFlow.length - 1;
  const currentStepComplete = getStepComplete(activeTab);

  const goPrev = () => {
    if (!canGoPrev) return;
    setActiveTab(tabsFlow[activeStepIndex - 1]);
  };

  const autoSaveTab = async (tabKey) => {
    // Auto-save silently (no manual save needed)
    let busId = createdBusId || bus?.id;

    if (tabKey === 'basic') {
      if (isMainManager && isBlank(basicFormData.branch_id)) {
        showError('يرجى اختيار الفرع');
        return { ok: false };
      }
      if (isBlank(basicFormData.term_id)) {
        showError('يرجى اختيار الفصل الدراسي');
        return { ok: false };
      }

      const plateParsed = parsePlate(basicFormData.plate_number);
      if (plateParsed.numbers.length !== 4 || plateParsed.lettersEn.length !== 3 || plateParsed.lettersAr.length !== 3) {
        showError('يرجى إدخال رقم لوحة صحيح');
        return { ok: false };
      }

      const payload = {
        branch_id: basicFormData.branch_id || userBranchId,
        term_id: basicFormData.term_id,
        bus_number: plateParsed.normalized
      };

      // Create bus once
      if (!busId) {
        const createRes = await busTransportationAPI.create(payload);
        if (!createRes.data?.success) {
          throw new Error(createRes.data?.message || 'فشل إنشاء الحافلة');
        }
        busId = createRes.data.data.id;
        setCreatedBusId(busId);
      } else {
        // Update basic fields when editing or continuing create flow
        await onSave(payload);
      }

      // Keep one primary plate matching basic (safe)
      try {
        if (bus?.license_plates) {
          for (const plate of bus.license_plates) {
            await busTransportationAPI.deleteLicensePlate(busId, plate.id);
          }
        }
      } catch (e) {
        // ignore
      }
      await busTransportationAPI.addLicensePlate(busId, { plate_number: payload.bus_number, is_primary: true });

      return { ok: true, busId };
    }

    if (!busId) return { ok: false };

    if (tabKey === 'registration') {
      await busTransportationAPI.saveRegistration(busId, { ...registrationData, term_id: basicFormData.term_id });
      return { ok: true, busId };
    }

    if (tabKey === 'driver') {
      await busTransportationAPI.saveDriverLicense(busId, { ...driverLicenseData, term_id: basicFormData.term_id });
      return { ok: true, busId };
    }

    if (tabKey === 'details') {
      await busTransportationAPI.saveDetails(busId, { ...busDetailsData, term_id: basicFormData.term_id });
      return { ok: true, busId };
    }

    if (tabKey === 'students') {
      await handleSaveStudents();
      return { ok: true, busId };
    }

    return { ok: true, busId };
  };

  const goNext = async () => {
    if (!canGoNext) return;
    if (!currentStepComplete) return;

    // Auto-save current step before moving on (create flow only)
    if (!isEditing) {
      try {
        setSaving(true);
        const res = await autoSaveTab(activeTab);
        if (!res?.ok) return;
      } catch (e) {
        showError(e.response?.data?.message || e.message || 'حدث خطأ أثناء الحفظ');
        return;
      } finally {
        setSaving(false);
      }
    }

    const nextIndex = activeStepIndex + 1;
    setActiveTab(tabsFlow[nextIndex]);
    setMaxStepIndex((prev) => Math.max(prev, nextIndex));
  };

  const makeEmptyStudentRow = () => ({
    student_full_name: '',
    contact_mobile_number: '',
    address: ''
  });

  // Students (always keep one empty row at the end for fast bulk entry)
  const [students, setStudents] = useState(() => {
    const existing = bus?.students?.map(s => ({ ...s })) || [];
    if (existing.length === 0) return [makeEmptyStudentRow()];
    return [...existing, makeEmptyStudentRow()];
  });

  // Don't count the always-present blank row
  const studentsCount = students.filter(
    (s) => !isBlank(s?.student_full_name) && !isBlank(s?.contact_mobile_number) && !isBlank(s?.address)
  ).length;

  useEffect(() => {
    const loadCurrentTerm = async () => {
      // If editing, use the bus's term_id
      if (bus?.term_id) {
        setBasicFormData(prev => ({ ...prev, term_id: bus.term_id }));
        return;
      }

      // If creating, get current term for the branch
      const branchId = basicFormData.branch_id || userBranchId;
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
              setBasicFormData(prev => ({ ...prev, term_id: term.id }));
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
  }, [basicFormData.branch_id, userBranchId, bus, user]);

  // Legacy per-tab save removed: saving happens only at the final step

  const handleSaveRegistration = async () => {
    if (!createdBusId && !bus?.id) {
      showError('يرجى إنشاء الحافلة أولاً');
      return;
    }
    const busId = createdBusId || bus.id;
    
    try {
      await busTransportationAPI.saveRegistration(busId, registrationData);
      showSuccess('تم حفظ بيانات التسجيل بنجاح');
    } catch (error) {
      showError(error.response?.data?.message || 'فشل حفظ بيانات التسجيل');
      throw error;
    }
  };

  const handleSaveDriverLicense = async () => {
    if (!createdBusId && !bus?.id) {
      showError('يرجى إنشاء الحافلة أولاً');
      return;
    }
    const busId = createdBusId || bus.id;
    
    try {
      await busTransportationAPI.saveDriverLicense(busId, driverLicenseData);
      showSuccess('تم حفظ بيانات رخصة السائق بنجاح');
    } catch (error) {
      showError(error.response?.data?.message || 'فشل حفظ بيانات رخصة السائق');
      throw error;
    }
  };

  const handleSavePlates = async () => {
    if (!createdBusId && !bus?.id) {
      showError('يرجى إنشاء الحافلة أولاً');
      return;
    }
    const busId = createdBusId || bus.id;
    
    try {
      // Delete existing plates if editing
      if (bus?.license_plates) {
        for (const plate of bus.license_plates) {
          try {
            await busTransportationAPI.deleteLicensePlate(busId, plate.id);
          } catch (error) {
            // Ignore if plate doesn't exist
          }
        }
      }

      // Create new plates
      const validPlates = licensePlates.filter(p => p.plate_number);
      for (const plate of validPlates) {
        await busTransportationAPI.addLicensePlate(busId, plate);
      }
      if (validPlates.length > 0) {
        showSuccess('تم حفظ لوحات الترخيص بنجاح');
      }
    } catch (error) {
      showError(error.response?.data?.message || 'فشل حفظ لوحات الترخيص');
      throw error;
    }
  };

  const handleSaveDetails = async () => {
    if (!createdBusId && !bus?.id) {
      showError('يرجى إنشاء الحافلة أولاً');
      return;
    }
    const busId = createdBusId || bus.id;
    
    try {
      await busTransportationAPI.saveDetails(busId, busDetailsData);
      showSuccess('تم حفظ تفاصيل الحافلة بنجاح');
    } catch (error) {
      showError(error.response?.data?.message || 'فشل حفظ تفاصيل الحافلة');
      throw error;
    }
  };

  const handleAddStudent = () => {
    setStudents((prev) => [...(Array.isArray(prev) ? prev : []), makeEmptyStudentRow()]);
  };

  const handleUpdateStudent = (index, field, value) => {
    const digitsOnly = (v) => String(v || '').replace(/\D/g, '');
    setStudents((prev) => {
      const list = Array.isArray(prev) ? [...prev] : [];
      const current = list[index] || makeEmptyStudentRow();
      const nextValue = field === 'contact_mobile_number' ? digitsOnly(value) : value;
      list[index] = { ...current, [field]: nextValue };

      // Auto-add a new empty row when user starts filling the last row
      if (index === list.length - 1) {
        const last = list[index] || {};
        const hasAny =
          !isBlank(last.student_full_name) ||
          !isBlank(last.contact_mobile_number) ||
          !isBlank(last.address);
        if (hasAny) {
          list.push(makeEmptyStudentRow());
        }
      }
      return list;
    });
  };

  const handleRemoveStudent = (index) => {
    setStudents((prev) => {
      const list = Array.isArray(prev) ? prev.filter((_, i) => i !== index) : [];
      // Ensure at least one empty row remains
      if (list.length === 0) return [makeEmptyStudentRow()];
      return list;
    });
  };

  const handleSaveStudents = async () => {
    if (!createdBusId && !bus?.id) {
      showError('يرجى إنشاء الحافلة أولاً');
      return;
    }
    const busId = createdBusId || bus.id;
    
    try {
      // Delete existing students if editing
      if (bus?.students) {
        for (const student of bus.students) {
          try {
            await busTransportationAPI.deleteStudent(busId, student.id);
          } catch (error) {
            // Ignore if student doesn't exist
          }
        }
      }

      // Create new students
      const validStudents = students.filter(s => s.student_full_name && s.contact_mobile_number && s.address);
      for (const student of validStudents) {
        await busTransportationAPI.addStudent(busId, {
          ...student,
          term_id: basicFormData.term_id
        });
      }
      if (validStudents.length > 0) {
        showSuccess('تم حفظ بيانات الطلاب بنجاح');
      }
    } catch (error) {
      showError(error.response?.data?.message || 'فشل حفظ بيانات الطلاب');
      throw error;
    }
  };

  const handleFinalSave = async () => {
    // Strict validation: nothing is saved unless all required fields are filled (students optional)
    // Prevent branch managers from saving buses outside their branch (avoid 403 on final save)
    if (!isMainManager && bus?.branch_id && userBranchId && parseInt(bus.branch_id) !== parseInt(userBranchId)) {
      showError('لا يمكنك تعديل بيانات حافلة تابعة لفرع آخر');
      return;
    }
    // 1) Basic (required)
    if (isMainManager && isBlank(basicFormData.branch_id)) {
      showError('يرجى اختيار الفرع');
      setActiveTab('basic');
      return;
    }
    if (isBlank(basicFormData.term_id)) {
      showError('يرجى اختيار الفصل الدراسي');
      setActiveTab('basic');
      return;
    }
    const plateParsed = parsePlate(basicFormData.plate_number);
    if (plateParsed.numbers.length !== 4) {
      showError('يرجى إدخال 4 أرقام للوحة');
      setActiveTab('basic');
      return;
    }
    if (plateParsed.lettersEn.length !== 3) {
      showError('يرجى إدخال 3 حروف إنجليزية للوحة');
      setActiveTab('basic');
      return;
    }
    if (plateParsed.lettersAr.length !== 3) {
      showError('يرجى إدخال 3 حروف عربية للوحة');
      setActiveTab('basic');
      return;
    }

    // 2) Registration (required remaining fields)
    if (
      isBlank(registrationData.registration_number) ||
      isBlank(registrationData.chassis_number) ||
      isBlank(registrationData.vehicle_model) ||
      isBlank(registrationData.expiry_date_gregorian)
    ) {
      showError('يرجى إكمال بيانات التسجيل المطلوبة');
      setActiveTab('registration');
      return;
    }

    // 3) Driver license (required remaining fields)
    if (
      isBlank(driverLicenseData.driver_full_name) ||
      isBlank(driverLicenseData.driver_id_number) ||
      isBlank(driverLicenseData.license_number) ||
      isBlank(driverLicenseData.expiry_date_gregorian)
    ) {
      showError('يرجى إكمال بيانات رخصة السائق المطلوبة');
      setActiveTab('driver');
      return;
    }

    if (
      driverLicenseData?.has_assistant &&
      (isBlank(driverLicenseData.assistant_full_name) || isBlank(driverLicenseData.assistant_phone_number))
    ) {
      showError('يرجى إكمال بيانات مرافق السائق');
      setActiveTab('driver');
      return;
    }

    // 4) Bus details (required)
    if (isBlank(busDetailsData.number_of_seats) || isBlank(busDetailsData.ownership_type)) {
      showError('يرجى إكمال تفاصيل الحافلة المطلوبة');
      setActiveTab('details');
      return;
    }

    // 5) Students are optional, but if user added any partial rows, block save
    const hasAnyStudentInput = students.some((s) =>
      !isBlank(s.student_full_name) || !isBlank(s.contact_mobile_number) || !isBlank(s.address)
    );
    if (hasAnyStudentInput) {
      const hasInvalidStudent = students.some((s) => {
        const any = !isBlank(s.student_full_name) || !isBlank(s.contact_mobile_number) || !isBlank(s.address);
        if (!any) return false;
        return isBlank(s.student_full_name) || isBlank(s.contact_mobile_number) || isBlank(s.address);
      });
      if (hasInvalidStudent) {
        showError('يرجى إكمال بيانات الطلاب أو حذف الصفوف غير المكتملة');
        setActiveTab('students');
        return;
      }
    }

    setSaving(true);
    try {
      // Create bus if needed
      let busId = createdBusId || bus?.id;
      const basicPayload = {
        branch_id: basicFormData.branch_id,
        term_id: basicFormData.term_id,
        bus_number: plateParsed.normalized
      };

      if (!busId) {
        const createResponse = await busTransportationAPI.create(basicPayload);
        if (!createResponse.data.success) {
          throw new Error(createResponse.data.message || 'فشل إنشاء الحافلة');
        }
        busId = createResponse.data.data.id;
        setCreatedBusId(busId);
      } else {
        // keep basic updated when editing
        await onSave(basicPayload);
      }

      // Save all sections (strict, no silent ignore)
      await busTransportationAPI.saveRegistration(busId, {
        ...registrationData,
        term_id: basicFormData.term_id
      });

      await busTransportationAPI.saveDriverLicense(busId, {
        ...driverLicenseData,
        term_id: basicFormData.term_id
      });

      // Plates: keep one primary plate (from Basic)
      if (bus?.license_plates) {
        for (const plate of bus.license_plates) {
          await busTransportationAPI.deleteLicensePlate(busId, plate.id);
        }
      }
      await busTransportationAPI.addLicensePlate(busId, {
        plate_number: plateParsed.normalized,
        is_primary: true
      });

      await busTransportationAPI.saveDetails(busId, {
        ...busDetailsData,
        term_id: basicFormData.term_id
      });

      // Students (optional)
      const validStudents = students.filter((s) => !isBlank(s.student_full_name) && !isBlank(s.contact_mobile_number) && !isBlank(s.address));
      if (bus?.students) {
        for (const student of bus.students) {
          await busTransportationAPI.deleteStudent(busId, student.id);
        }
      }
      for (const student of validStudents) {
        await busTransportationAPI.addStudent(busId, { ...student, term_id: basicFormData.term_id });
      }

      showSuccess('تم حفظ جميع البيانات بنجاح');
      onClose();
      // IMPORTANT: don't auto-reload (it interrupts multi-file uploads)
    } catch (error) {
      showError(error.response?.data?.message || error.message || 'حدث خطأ أثناء حفظ البيانات');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCurrentTab = async () => {
    const busId = createdBusId || bus?.id;
    if (!busId) {
      showError('يرجى إنشاء الحافلة أولاً');
      return;
    }

    setSaving(true);
    try {
      if (activeTab === 'basic') {
        if (isMainManager && isBlank(basicFormData.branch_id)) {
          showError('يرجى اختيار الفرع');
          return;
        }
        if (isBlank(basicFormData.term_id)) {
          showError('يرجى اختيار الفصل الدراسي');
          return;
        }
        const plateParsed = parsePlate(basicFormData.plate_number);
        if (plateParsed.numbers.length !== 4 || plateParsed.lettersEn.length !== 3 || plateParsed.lettersAr.length !== 3) {
          showError('يرجى إدخال رقم لوحة صحيح');
          return;
        }

        // Update basic bus record (bus_number + term_id)
        await onSave({
          branch_id: basicFormData.branch_id,
          term_id: basicFormData.term_id,
          bus_number: plateParsed.normalized
        });

        // Keep one primary plate matching basic
        if (bus?.license_plates) {
          for (const plate of bus.license_plates) {
            await busTransportationAPI.deleteLicensePlate(busId, plate.id);
          }
        }
        await busTransportationAPI.addLicensePlate(busId, {
          plate_number: plateParsed.normalized,
          is_primary: true
        });

        showSuccess('تم حفظ البيانات الأساسية بنجاح');
        return;
      }

      if (activeTab === 'registration') {
        await busTransportationAPI.saveRegistration(busId, {
          ...registrationData,
          term_id: basicFormData.term_id
        });
        showSuccess('تم حفظ بيانات رخصة السير بنجاح');
        return;
      }

      if (activeTab === 'driver') {
        await busTransportationAPI.saveDriverLicense(busId, {
          ...driverLicenseData,
          term_id: basicFormData.term_id
        });
        showSuccess('تم حفظ بيانات رخصة السائق بنجاح');
        return;
      }

      if (activeTab === 'details') {
        await busTransportationAPI.saveDetails(busId, {
          ...busDetailsData,
          term_id: basicFormData.term_id
        });
        showSuccess('تم حفظ تفاصيل الحافلة بنجاح');
        return;
      }

      if (activeTab === 'students') {
        await handleSaveStudents();
        showSuccess('تم حفظ بيانات الطلاب بنجاح');
        return;
      }

      if (activeTab === 'documents') {
        showSuccess('يمكنك رفع المرفقات من هنا');
      }
    } catch (error) {
      showError(error.response?.data?.message || error.message || 'حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bus-form-expanding-section" ref={formSectionRef}>
      <div className="bus-form-section-header">
        <h2>{bus ? 'تعديل الحافلة' : 'إضافة حافلة جديدة'}</h2>
        <button className="section-close" onClick={onClose}>×</button>
      </div>
      <div className="bus-form-section-content">

        <div className="tabs">
          <button
            className={activeTab === 'basic' ? 'active' : ''}
            onClick={() => setActiveTab('basic')}
            disabled={!bus && 0 > maxStepIndex}
          >
            البيانات الأساسية
          </button>
          <button
            className={activeTab === 'registration' ? 'active' : ''}
            onClick={() => setActiveTab('registration')}
            disabled={!bus && 1 > maxStepIndex}
          >
            رخصة السير
          </button>
          <button
            className={activeTab === 'driver' ? 'active' : ''}
            onClick={() => setActiveTab('driver')}
            disabled={!bus && 2 > maxStepIndex}
          >
            رخصة السائق
          </button>
          <button
            className={activeTab === 'details' ? 'active' : ''}
            onClick={() => setActiveTab('details')}
            disabled={!bus && 3 > maxStepIndex}
          >
            تفاصيل الحافلة
          </button>
          <button
            className={activeTab === 'students' ? 'active' : ''}
            onClick={() => setActiveTab('students')}
            disabled={!bus && 4 > maxStepIndex}
          >
            الطلاب ({studentsCount})
          </button>
          <button
            className={activeTab === 'documents' ? 'active' : ''}
            onClick={() => setActiveTab('documents')}
            disabled={!bus && 5 > maxStepIndex}
          >
            المرفقات
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'basic' && (
            <div className="tab-panel">
              <form onSubmit={(e) => { e.preventDefault(); }} className="bus-form">
                {isMainManager && (
                  <div className="form-group">
                    <label>الفرع *</label>
                    <select
                      value={basicFormData.branch_id}
                      onChange={(e) => {
                        setBasicFormData({ ...basicFormData, branch_id: e.target.value, term_id: '' });
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
                    <div className="term-display" style={{ padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                      {currentTerm ? `${currentTerm.term_name} - ${currentTerm.academic_year_label}` : 
                       bus?.term_name ? `${bus.term_name} - ${bus.academic_year_label}` : 'الفصل الحالي'}
                    </div>
                  ) : (
                    <div className="term-display" style={{ padding: '8px', color: '#999' }}>يرجى اختيار الفرع أولاً</div>
                  )}
                  <input type="hidden" value={basicFormData.term_id} required />
                </div>
                {/* Plate identifies the bus - use the same plate UI style */}
                <div className="plates-list">
                  <div className="plate-form-item">
                    <div className="form-grid">
                      <div className="form-group full-width">
                        <label>رقم اللوحة *</label>
                        <SaudiPlateInput
                          value={basicFormData.plate_number || ''}
                          onChange={(value) => setBasicFormData({ ...basicFormData, plate_number: value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'registration' && (
            <RegistrationFormTab 
              formData={registrationData}
              setFormData={setRegistrationData}
              busId={createdBusId || bus?.id}
              saving={saving}
            />
          )}

          {activeTab === 'driver' && (
            <DriverLicenseFormTab
              formData={driverLicenseData}
              setFormData={setDriverLicenseData}
              busId={createdBusId || bus?.id}
              saving={saving}
            />
          )}

          {activeTab === 'details' && (
            <BusDetailsFormTab
              formData={busDetailsData}
              setFormData={setBusDetailsData}
              saving={saving}
              isMainManager={isMainManager}
            />
          )}

          {activeTab === 'students' && (
            <StudentsFormTab
              students={students}
              onUpdate={handleUpdateStudent}
              onRemove={handleRemoveStudent}
            />
          )}

          {activeTab === 'documents' && (
            <DocumentsFormTab
              busId={createdBusId || bus?.id}
              isLeased={busDetailsData.ownership_type === 'leased'}
              initialDocs={{
                registration: bus?.registration?.registration_document_url ? { url: bus.registration.registration_document_url } : null,
                driverLicense: bus?.driver_license?.license_document_url ? { url: bus.driver_license.license_document_url } : null,
                leaseContract: bus?.lease_contract_document_url ? { url: bus.lease_contract_document_url } : null
              }}
              beforeUpload={async (kind) => {
                try {
                  // ensure bus exists for uploads
                  if (!createdBusId && !bus?.id) {
                    const res = await autoSaveTab('basic');
                    if (!res?.ok) return false;
                  }
                  if (kind === 'registration') {
                    const res = await autoSaveTab('registration');
                    return !!res?.ok;
                  }
                  if (kind === 'driverLicense') {
                    const res = await autoSaveTab('driver');
                    return !!res?.ok;
                  }
                  if (kind === 'leaseContract') {
                    const res = await autoSaveTab('details');
                    return !!res?.ok;
                  }
                  return true;
                } catch (e) {
                  showError(e.response?.data?.message || e.message || 'حدث خطأ');
                  return false;
                }
              }}
              onDocsChange={(next) => setDocsState(next)}
              onReload={onReload}
            />
          )}
        </div>

        <div className="section-actions">
          {isEditing ? (
            <>
              <button type="button" onClick={handleSaveCurrentTab} className="btn-primary" disabled={saving}>
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </>
          ) : activeStepIndex !== tabsFlow.length - 1 ? (
            <>
              <button type="button" onClick={goPrev} disabled={!canGoPrev} className="btn-wizard-prev">
                السابق
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={saving || !currentStepComplete || !canGoNext}
                className={`btn-wizard-next ${currentStepComplete ? 'enabled' : ''}`}
              >
                التالي
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={goPrev} disabled={!canGoPrev} className="btn-wizard-prev">
                السابق
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={
                  saving ||
                  !docsState.registration ||
                  !docsState.driverLicense ||
                  (busDetailsData.ownership_type === 'leased' && !docsState.leaseContract)
                }
                onClick={() => {
                  showSuccess('تم حفظ البيانات بنجاح');
                  if (typeof onReload === 'function') onReload();
                  const id = createdBusId || bus?.id;
                  onClose();
                  if (typeof onAfterFinish === 'function' && id) onAfterFinish(id);
                }}
              >
                حفظ
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Form Tab Components for BusFormModal
const RegistrationFormTab = ({ formData, setFormData, busId }) => {
  const [uploading, setUploading] = useState(false);
  const { showError, showSuccess } = useNotification();

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !busId) return;

    try {
      setUploading(true);
      const response = await busTransportationAPI.uploadRegistrationDocument(busId, file);
      if (response.data.success) {
        showSuccess('تم رفع المستند بنجاح');
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
        <h3>بيانات تسجيل الحافلة</h3>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label>رقم التسلسل *</label>
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
        <UnifiedDatePicker
          label="تاريخ الانتهاء (ميلادي)"
          hijriValue=""
          gregorianValue={formData.expiry_date_gregorian || ''}
          onChange={(_, gregorian) => setFormData({ ...formData, expiry_date_gregorian: gregorian || null })}
          required
          dateType="general"
          defaultCalendarType="gregorian"
        />
      </div>
    </div>
  );
};

const DocumentsFormTab = ({ busId, isLeased, initialDocs, beforeUpload, onDocsChange, onReload }) => {
  const { showError, showSuccess } = useNotification();
  const [preSaving, setPreSaving] = useState(false);
  const [uploadingReg, setUploadingReg] = useState(false);
  const [uploadingLicense, setUploadingLicense] = useState(false);
  const [uploadingLease, setUploadingLease] = useState(false);
  const [uploaded, setUploaded] = useState({
    registration: initialDocs?.registration || null,
    driverLicense: initialDocs?.driverLicense || null,
    leaseContract: initialDocs?.leaseContract || null
  });

  // If we opened edit mode with partial data then hydrated later, merge in initial docs once
  useEffect(() => {
    setUploaded((prev) => ({
      registration: prev.registration || initialDocs?.registration || null,
      driverLicense: prev.driverLicense || initialDocs?.driverLicense || null,
      leaseContract: prev.leaseContract || initialDocs?.leaseContract || null
    }));
  }, [initialDocs?.registration?.url, initialDocs?.driverLicense?.url, initialDocs?.leaseContract?.url]);

  const uploadFile = async (kind, file) => {
    if (!file || !busId) return;

    try {
      if (kind === 'registration') setUploadingReg(true);
      if (kind === 'driverLicense') setUploadingLicense(true);
      if (kind === 'leaseContract') setUploadingLease(true);

      // silently save the related form section before uploading
      if (typeof beforeUpload === 'function') {
        setPreSaving(true);
        const ok = await beforeUpload(kind);
        setPreSaving(false);
        if (!ok) return;
      }

      const response =
        kind === 'registration'
          ? await busTransportationAPI.uploadRegistrationDocument(busId, file)
          : kind === 'driverLicense'
            ? await busTransportationAPI.uploadDriverLicenseDocument(busId, file)
            : await busTransportationAPI.uploadLeaseContractDocument(busId, file);

      if (response.data?.success) {
        setUploaded((prev) => {
          const next = {
            ...prev,
            [kind]: response.data?.data || { name: file.name }
          };
          if (typeof onDocsChange === 'function') {
            onDocsChange({
              registration: !!next.registration?.url,
              driverLicense: !!next.driverLicense?.url,
              leaseContract: !!next.leaseContract?.url
            });
          }
          return next;
        });
        const label =
          kind === 'registration'
            ? 'تم رفع مستند رخصة السير بنجاح'
            : kind === 'driverLicense'
              ? 'تم رفع مستند رخصة السائق بنجاح'
              : 'تم رفع عقد الإيجار بنجاح';
        showSuccess(label);
        if (typeof onReload === 'function') onReload();
      }
    } catch (error) {
      showError(error.response?.data?.message || 'فشل رفع الملف');
    } finally {
      if (kind === 'registration') setUploadingReg(false);
      if (kind === 'driverLicense') setUploadingLicense(false);
      if (kind === 'leaseContract') setUploadingLease(false);
      setPreSaving(false);
    }
  };

  return (
    <div className="tab-panel">
      <div className="tab-header">
        <h3>المرفقات</h3>
      </div>

      <div className="form-grid">
          <div className="form-group full-width">
            <label>مستند رخصة السير</label>
            <div className="students-table-hint">
              {preSaving ? 'جاري حفظ البيانات تلقائياً قبل الرفع...' : (uploaded.registration?.url ? 'تم الرفع' : 'لم يتم الرفع بعد')}
            </div>
            <input
              type="file"
              accept="image/*,application/pdf"
              disabled={!busId || preSaving || uploadingReg || uploadingLicense || uploadingLease}
              onChange={(e) => {
                const file = e.target.files?.[0];
                uploadFile('registration', file);
                e.target.value = '';
              }}
            />
            {!!uploaded.registration?.url && (
              <a href={uploaded.registration.url} target="_blank" rel="noreferrer">
                فتح الملف
              </a>
            )}
          </div>

          <div className="form-group full-width">
            <label>مستند رخصة السائق</label>
            <div className="students-table-hint">
              {preSaving ? 'جاري حفظ البيانات تلقائياً قبل الرفع...' : (uploaded.driverLicense?.url ? 'تم الرفع' : 'لم يتم الرفع بعد')}
            </div>
            <input
              type="file"
              accept="image/*,application/pdf"
              disabled={!busId || preSaving || uploadingReg || uploadingLicense || uploadingLease}
              onChange={(e) => {
                const file = e.target.files?.[0];
                uploadFile('driverLicense', file);
                e.target.value = '';
              }}
            />
            {!!uploaded.driverLicense?.url && (
              <a href={uploaded.driverLicense.url} target="_blank" rel="noreferrer">
                فتح الملف
              </a>
            )}
          </div>

          {isLeased && (
            <div className="form-group full-width">
              <label>عقد الإيجار</label>
              <div className="students-table-hint">
                {preSaving ? 'جاري حفظ البيانات تلقائياً قبل الرفع...' : (uploaded.leaseContract?.url ? 'تم الرفع' : 'لم يتم الرفع بعد')}
              </div>
              <input
                type="file"
                accept="image/*,application/pdf"
                disabled={!busId || preSaving || uploadingReg || uploadingLicense || uploadingLease}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  uploadFile('leaseContract', file);
                  e.target.value = '';
                }}
              />
              {!!uploaded.leaseContract?.url && (
                <a href={uploaded.leaseContract.url} target="_blank" rel="noreferrer">
                  فتح الملف
                </a>
              )}
            </div>
          )}
      </div>
    </div>
  );
};

const DriverLicenseFormTab = ({ formData, setFormData, busId }) => {
  const [uploading, setUploading] = useState(false);
  const { showError, showSuccess } = useNotification();
  const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !busId) return;

    try {
      setUploading(true);
      const response = await busTransportationAPI.uploadDriverLicenseDocument(busId, file);
      if (response.data.success) {
        showSuccess('تم رفع المستند بنجاح');
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
          <label>رقم هوية السائق *</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            dir="ltr"
            value={formData.driver_id_number}
            onChange={(e) => setFormData({ ...formData, driver_id_number: digitsOnly(e.target.value) })}
            required
          />
        </div>
        <div className="form-group">
          <label>رقم الرخصة *</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            dir="ltr"
            value={formData.license_number}
            onChange={(e) => setFormData({ ...formData, license_number: digitsOnly(e.target.value) })}
            required
          />
        </div>
        <div className="form-group">
          <label>رقم هاتف السائق</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            dir="ltr"
            value={formData.driver_phone_number}
            onChange={(e) => setFormData({ ...formData, driver_phone_number: digitsOnly(e.target.value) })}
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
        <UnifiedDatePicker
          label="تاريخ الميلاد (ميلادي)"
          hijriValue=""
          gregorianValue={formData.driver_date_of_birth_gregorian || ''}
          onChange={(_, gregorian) => setFormData({ ...formData, driver_date_of_birth_gregorian: gregorian || null })}
          dateType="birth_date"
          defaultCalendarType="gregorian"
        />
        <UnifiedDatePicker
          label="تاريخ الإصدار (ميلادي)"
          hijriValue=""
          gregorianValue={formData.issue_date_gregorian || ''}
          onChange={(_, gregorian) => setFormData({ ...formData, issue_date_gregorian: gregorian || null })}
          dateType="general"
          defaultCalendarType="gregorian"
        />
        <UnifiedDatePicker
          label="تاريخ الانتهاء (ميلادي)"
          hijriValue=""
          gregorianValue={formData.expiry_date_gregorian || ''}
          onChange={(_, gregorian) => setFormData({ ...formData, expiry_date_gregorian: gregorian || null })}
          required
          dateType="general"
          defaultCalendarType="gregorian"
        />
        <div className="form-group full-width assistant-section">
          <div className="assistant-toggle-row">
            <span className="assistant-toggle-label">هل يوجد مرافق للسائق؟</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={!!formData.has_assistant}
                onChange={(e) => {
                  const has = e.target.checked;
                  setFormData({
                    ...formData,
                    has_assistant: has,
                    assistant_full_name: has ? (formData.assistant_full_name || '') : '',
                    assistant_phone_number: has ? (formData.assistant_phone_number || '') : '',
                  });
                }}
              />
              <span className="slider"></span>
            </label>
          </div>

          {formData.has_assistant && (
            <div className="assistant-fields">
              <div className="assistant-fields-grid">
                <div className="form-group">
                  <label>اسم مرافق السائق *</label>
                  <input
                    type="text"
                    value={formData.assistant_full_name || ''}
                    onChange={(e) => setFormData({ ...formData, assistant_full_name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>رقم جوال مرافق السائق *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    dir="ltr"
                    value={formData.assistant_phone_number || ''}
                    onChange={(e) => setFormData({ ...formData, assistant_phone_number: digitsOnly(e.target.value) })}
                    required
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Saudi License Plate Input Component
const SaudiPlateInput = ({ value = '', onChange }) => {
  // Parse existing value: "7529HBAأبج" -> numbers: "7529", en: ["H","B","A"], ar: ["أ","ب","ج"]
  const parsePlate = (plateValue) => {
    if (!plateValue) return { numbers: ['', '', '', ''], lettersEn: ['', '', ''], lettersAr: ['', '', ''] };
    const numbersPart = plateValue.replace(/[^0-9]/g, '').slice(0, 4);
    const lettersEnPart = plateValue.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3);
    const lettersArPart = plateValue.replace(/[^\u0600-\u06FF]/g, '').slice(0, 3);
    const numbers = numbersPart.split('').concat(Array(4 - numbersPart.length).fill(''));
    const lettersEn = lettersEnPart.split('').concat(Array(3 - lettersEnPart.length).fill(''));
    const lettersAr = lettersArPart.split('').concat(Array(3 - lettersArPart.length).fill(''));
    return { numbers, lettersEn, lettersAr };
  };

  const initialParsed = parsePlate(value);
  const [numbers, setNumbers] = useState(initialParsed.numbers);
  const [lettersEn, setLettersEn] = useState(initialParsed.lettersEn);
  const [lettersAr, setLettersAr] = useState(initialParsed.lettersAr);
  const [lastValue, setLastValue] = useState(value);
  const numberRefs = useRef([]);
  const enRefs = useRef([]);
  const arRefs = useRef([]);

  // Update local state when value prop changes (external update)
  useEffect(() => {
    if (value !== lastValue) {
      const parsed = parsePlate(value);
      setNumbers(parsed.numbers);
      setLettersEn(parsed.lettersEn);
      setLettersAr(parsed.lettersAr);
      setLastValue(value);
    }
  }, [value, lastValue]);

  const handleNumberChange = (index, newValue) => {
    if (newValue === '' || (/^[0-9]$/.test(newValue))) {
      const updated = [...numbers];
      updated[index] = newValue;
      setNumbers(updated);
      const plateNumber = updated.join('') + lettersEn.join('') + lettersAr.join('');
      setLastValue(plateNumber);
      onChange(plateNumber);

      // Auto move to next input
      if (newValue !== '') {
        if (index < updated.length - 1) {
          numberRefs.current[index + 1]?.focus();
        } else {
          enRefs.current[0]?.focus();
        }
      }
    }
  };

  const handleEnglishLetterChange = (index, newValue) => {
    if (newValue === '' || (/^[A-Za-z]$/.test(newValue))) {
      const updated = [...lettersEn];
      updated[index] = newValue.toUpperCase();
      setLettersEn(updated);
      const plateNumber = numbers.join('') + updated.join('') + lettersAr.join('');
      setLastValue(plateNumber);
      onChange(plateNumber);

      // Auto move to next input
      if (newValue !== '') {
        if (index < updated.length - 1) {
          enRefs.current[index + 1]?.focus();
        } else {
          arRefs.current[0]?.focus();
        }
      }
    }
  };

  const handleArabicLetterChange = (index, newValue) => {
    if (newValue === '' || (/^[\u0600-\u06FF]$/.test(newValue))) {
      const updated = [...lettersAr];
      updated[index] = newValue;
      setLettersAr(updated);
      const plateNumber = numbers.join('') + lettersEn.join('') + updated.join('');
      setLastValue(plateNumber);
      onChange(plateNumber);

      // Auto move to next input
      if (newValue !== '' && index < updated.length - 1) {
        arRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleBackspaceNav = (e, group, index) => {
    if (e.key !== 'Backspace') return;
    if (e.currentTarget.value !== '') return;

    if (group === 'numbers') {
      if (index > 0) numberRefs.current[index - 1]?.focus();
      return;
    }
    if (group === 'en') {
      if (index > 0) enRefs.current[index - 1]?.focus();
      else numberRefs.current[numbers.length - 1]?.focus();
      return;
    }
    if (group === 'ar') {
      if (index > 0) arRefs.current[index - 1]?.focus();
      else enRefs.current[lettersEn.length - 1]?.focus();
    }
  };

  return (
    <div className="saudi-plate-input">
      <div className="plate-section">
        <div className="plate-label">الأرقام</div>
        <div className="plate-numbers">
          {numbers.map((num, idx) => (
            <input
              key={`num-${idx}`}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={num}
              onChange={(e) => handleNumberChange(idx, e.target.value)}
              onKeyDown={(e) => handleBackspaceNav(e, 'numbers', idx)}
              ref={(el) => { numberRefs.current[idx] = el; }}
              className="plate-input-number"
              placeholder="0"
            />
          ))}
        </div>
      </div>
      <div className="plate-section">
        <div className="plate-label">الحروف (EN)</div>
        <div className="plate-letters">
          {lettersEn.map((letter, idx) => (
            <input
              key={`letter-${idx}`}
              type="text"
              maxLength={1}
              value={letter}
              onChange={(e) => handleEnglishLetterChange(idx, e.target.value)}
              onKeyDown={(e) => handleBackspaceNav(e, 'en', idx)}
              ref={(el) => { enRefs.current[idx] = el; }}
              className="plate-input-letter"
              placeholder="A"
            />
          ))}
        </div>
      </div>
      <div className="plate-section">
        <div className="plate-label">الحروف (AR)</div>
        <div className="plate-letters">
          {lettersAr.map((letter, idx) => (
            <input
              key={`letter-ar-${idx}`}
              type="text"
              maxLength={1}
              value={letter}
              onChange={(e) => handleArabicLetterChange(idx, e.target.value)}
              onKeyDown={(e) => handleBackspaceNav(e, 'ar', idx)}
              ref={(el) => { arRefs.current[idx] = el; }}
              className="plate-input-letter"
              placeholder="أ"
              style={{ direction: 'rtl', fontFamily: "'Noto Sans Arabic', Arial, sans-serif" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const LicensePlatesFormTab = ({ plates, setPlates }) => {
  // Keep exactly one plate in the UI
  useEffect(() => {
    if (!Array.isArray(plates) || plates.length === 0) {
      setPlates([{ plate_number: '', is_primary: true }]);
    } else if (plates.length > 1) {
      setPlates([{ ...plates[0], is_primary: true }]);
    } else {
      // enforce primary
      setPlates([{ ...plates[0], is_primary: true }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updatePlate = (value) => {
    setPlates([{ ...(plates?.[0] || {}), plate_number: value, is_primary: true }]);
  };

  return (
    <div className="tab-panel">
      <div className="tab-header">
        <h3>لوحات الترخيص</h3>
      </div>

      <div className="plates-list">
        <div className="plate-form-item">
          <div className="form-grid">
            <div className="form-group full-width">
              <label>رقم اللوحة *</label>
              <SaudiPlateInput
                value={plates?.[0]?.plate_number || ''}
                onChange={(value) => updatePlate(value)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const BusDetailsFormTab = ({ formData, setFormData, isMainManager }) => {
  return (
    <div className="tab-panel">
      <div className="tab-header">
        <h3>تفاصيل الحافلة</h3>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label>خط السير</label>
          <input
            type="text"
            value={formData.route_name}
            onChange={(e) => setFormData({ ...formData, route_name: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>عدد المقاعد *</label>
          <input
            type="number"
            value={formData.number_of_seats}
            onChange={(e) => setFormData({ ...formData, number_of_seats: parseInt(e.target.value) || '' })}
            required
          />
        </div>
        <div className="form-group">
          <label>نوع الملكية *</label>
          <select
            value={formData.ownership_type}
            onChange={(e) => setFormData({ ...formData, ownership_type: e.target.value })}
            required
          >
            <option value="">اختر النوع</option>
            <option value="owned">ملك الشركة</option>
            <option value="leased">مستأجر</option>
          </select>
        </div>
        {formData.ownership_type === 'leased' && (
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
            <UnifiedDatePicker
              label="تاريخ بداية التأجير"
              hijriValue={formData.lease_start_date_hijri || ''}
              gregorianValue={formData.lease_start_date_gregorian || ''}
              onChange={(hijri, gregorian) =>
                setFormData({
                  ...formData,
                  lease_start_date_hijri: hijri || '',
                  lease_start_date_gregorian: gregorian || null
                })
              }
              dateType="general"
              defaultCalendarType="gregorian"
            />
            <UnifiedDatePicker
              label="تاريخ نهاية التأجير"
              hijriValue={formData.lease_end_date_hijri || ''}
              gregorianValue={formData.lease_end_date_gregorian || ''}
              onChange={(hijri, gregorian) =>
                setFormData({
                  ...formData,
                  lease_end_date_hijri: hijri || '',
                  lease_end_date_gregorian: gregorian || null
                })
              }
              dateType="general"
              defaultCalendarType="gregorian"
            />
          </>
        )}
        <div className="form-group full-width">
          <label>وصف خط سير الحافلة</label>
          <textarea
            value={formData.route_description}
            onChange={(e) => setFormData({ ...formData, route_description: e.target.value })}
            rows="3"
          />
        </div>

        {isMainManager && (
          <>
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
              <label>تاريخ انتهاء التأمين (ميلادي)</label>
              <input
                type="date"
                value={formData.insurance_expiry_date_gregorian || ''}
                onChange={(e) => setFormData({ ...formData, insurance_expiry_date_gregorian: e.target.value || null })}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const StudentsFormTab = ({ students, onUpdate, onRemove }) => {
  const visibleRows = Array.isArray(students) ? students : [];
  return (
    <div className="tab-panel">
      <div className="tab-header">
        <h3>الطلاب</h3>
      </div>

      <div className="students-table-wrapper">
        <table className="students-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>رقم الجوال</th>
              <th>العنوان</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((student, index) => (
              <tr key={index}>
                <td>
                  <input
                    type="text"
                    value={student.student_full_name || ''}
                    onChange={(e) => onUpdate(index, 'student_full_name', e.target.value)}
                    placeholder="اسم الطالب"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    dir="ltr"
                    value={student.contact_mobile_number || ''}
                    onChange={(e) => onUpdate(index, 'contact_mobile_number', e.target.value)}
                    placeholder="05xxxxxxxx"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={student.address || ''}
                    onChange={(e) => onUpdate(index, 'address', e.target.value)}
                    placeholder="العنوان"
                  />
                </td>
                <td className="students-table-actions">
                  <button
                    type="button"
                    className="btn-delete"
                    onClick={() => onRemove(index)}
                    disabled={visibleRows.length <= 1}
                    title="حذف"
                  >
                    حذف
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="students-table-hint">
          اكتب البيانات وسيتم إضافة صف جديد تلقائيًا.
        </div>
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
            رخصة السير
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
            الطلاب ({students.filter((s) => s?.student_full_name || s?.contact_mobile_number || s?.address).length})
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
    chassis_number: bus.registration?.chassis_number || '',
    vehicle_model: bus.registration?.vehicle_model || '',
    model_year: bus.registration?.model_year || '',
    vehicle_color: bus.registration?.vehicle_color || '',
    expiry_date_gregorian: bus.registration?.expiry_date_gregorian || '',
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
          <label>رقم التسلسل *</label>
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
        <UnifiedDatePicker
          label="تاريخ الانتهاء (ميلادي)"
          hijriValue=""
          gregorianValue={formData.expiry_date_gregorian || ''}
          onChange={(_, gregorian) => setFormData({ ...formData, expiry_date_gregorian: gregorian || null })}
          dateType="general"
          defaultCalendarType="gregorian"
        />
      </div>
    </div>
  );
};

// Driver License Tab Component
const DriverLicenseTab = ({ bus, onReload }) => {
  const { showError, showSuccess } = useNotification();
  const digitsOnly = (value) => String(value || '').replace(/\D/g, '');
  const [formData, setFormData] = useState({
    driver_full_name: bus.driver_license?.driver_full_name || '',
    driver_id_number: bus.driver_license?.driver_id_number || '',
    license_number: bus.driver_license?.license_number || '',
    issue_date_gregorian: bus.driver_license?.issue_date_gregorian || '',
    expiry_date_gregorian: bus.driver_license?.expiry_date_gregorian || '',
    driver_phone_number: bus.driver_license?.driver_phone_number || '',
    driver_nationality: bus.driver_license?.driver_nationality || '',
    driver_date_of_birth_gregorian: bus.driver_license?.driver_date_of_birth_gregorian || '',
    has_assistant: bus.driver_license?.has_assistant || false,
    assistant_full_name: bus.driver_license?.assistant_full_name || '',
    assistant_phone_number: bus.driver_license?.assistant_phone_number || '',
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
            inputMode="numeric"
            pattern="[0-9]*"
            dir="ltr"
            value={formData.driver_id_number}
            onChange={(e) => setFormData({ ...formData, driver_id_number: digitsOnly(e.target.value) })}
            required
          />
        </div>
        <div className="form-group">
          <label>رقم الرخصة *</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            dir="ltr"
            value={formData.license_number}
            onChange={(e) => setFormData({ ...formData, license_number: digitsOnly(e.target.value) })}
            required
          />
        </div>
        <div className="form-group full-width assistant-section">
          <div className="assistant-toggle-row">
            <span className="assistant-toggle-label">هل يوجد مرافق للسائق؟</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={!!formData.has_assistant}
                onChange={(e) => {
                  const has = e.target.checked;
                  setFormData({
                    ...formData,
                    has_assistant: has,
                    assistant_full_name: has ? (formData.assistant_full_name || '') : '',
                    assistant_phone_number: has ? (formData.assistant_phone_number || '') : '',
                  });
                }}
              />
              <span className="slider"></span>
            </label>
          </div>

          {formData.has_assistant && (
            <div className="assistant-fields">
              <div className="assistant-fields-grid">
                <div className="form-group">
                  <label>اسم مرافق السائق *</label>
                  <input
                    type="text"
                    value={formData.assistant_full_name || ''}
                    onChange={(e) => setFormData({ ...formData, assistant_full_name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>رقم جوال مرافق السائق *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    dir="ltr"
                    value={formData.assistant_phone_number || ''}
                    onChange={(e) => setFormData({ ...formData, assistant_phone_number: digitsOnly(e.target.value) })}
                    required
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        <UnifiedDatePicker
          label="تاريخ الإصدار (ميلادي)"
          hijriValue=""
          gregorianValue={formData.issue_date_gregorian || ''}
          onChange={(_, gregorian) => setFormData({ ...formData, issue_date_gregorian: gregorian || null })}
          dateType="general"
          defaultCalendarType="gregorian"
        />
        <UnifiedDatePicker
          label="تاريخ الانتهاء (ميلادي)"
          hijriValue=""
          gregorianValue={formData.expiry_date_gregorian || ''}
          onChange={(_, gregorian) => setFormData({ ...formData, expiry_date_gregorian: gregorian || null })}
          dateType="general"
          defaultCalendarType="gregorian"
        />
        <div className="form-group">
          <label>رقم هاتف السائق</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            dir="ltr"
            value={formData.driver_phone_number}
            onChange={(e) => setFormData({ ...formData, driver_phone_number: digitsOnly(e.target.value) })}
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
        <UnifiedDatePicker
          label="تاريخ الميلاد (ميلادي)"
          hijriValue=""
          gregorianValue={formData.driver_date_of_birth_gregorian || ''}
          onChange={(_, gregorian) => setFormData({ ...formData, driver_date_of_birth_gregorian: gregorian || null })}
          dateType="birth_date"
          defaultCalendarType="gregorian"
        />
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
    is_primary: true
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
      is_primary: true
    });
    setEditingPlate(null);
    setShowAddForm(true);
  };

  const handleEdit = (plate) => {
    setFormData({
      plate_number: plate.plate_number,
      is_primary: true
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
            <div className="form-group full-width">
              <label>رقم اللوحة *</label>
              <SaudiPlateInput
                value={formData.plate_number || ''}
                onChange={(value) => setFormData({ ...formData, plate_number: value })}
              />
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
  const { isMainManager } = useAuth();
  const normalizeOwnershipType = (v) => (v === 'rented' ? 'leased' : (v || 'owned'));
  const [formData, setFormData] = useState({
    route_name: bus.details?.route_name || '',
    route_description: bus.details?.route_description || '',
    number_of_seats: bus.details?.number_of_seats || '',
    ownership_type: normalizeOwnershipType(bus.details?.ownership_type),
    lease_company_name: bus.details?.lease_company_name || '',
    lease_contact_info: bus.details?.lease_contact_info || '',
    lease_contract_number: bus.details?.lease_contract_number || '',
    lease_start_date_hijri: bus.details?.lease_start_date_hijri || '',
    lease_start_date_gregorian: bus.details?.lease_start_date_gregorian || '',
    lease_end_date_hijri: bus.details?.lease_end_date_hijri || '',
    lease_end_date_gregorian: bus.details?.lease_end_date_gregorian || '',
    insurance_provider: bus.details?.insurance_provider || '',
    insurance_policy_number: bus.details?.insurance_policy_number || '',
    insurance_expiry_date_gregorian: bus.details?.insurance_expiry_date_gregorian || '',
    // removed fields intentionally
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
          <label>خط السير</label>
          <input
            type="text"
            value={formData.route_name}
            onChange={(e) => setFormData({ ...formData, route_name: e.target.value })}
          />
        </div>
        <div className="form-group full-width">
          <label>وصف خط سير الحافلة</label>
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
            <option value="owned">ملك الشركة</option>
            <option value="leased">مستأجر</option>
          </select>
        </div>

        {formData.ownership_type === 'leased' && (
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
            <UnifiedDatePicker
              label="تاريخ بداية التأجير"
              hijriValue={formData.lease_start_date_hijri || ''}
              gregorianValue={formData.lease_start_date_gregorian || ''}
              onChange={(hijri, gregorian) =>
                setFormData({
                  ...formData,
                  lease_start_date_hijri: hijri || '',
                  lease_start_date_gregorian: gregorian || null
                })
              }
              dateType="general"
              defaultCalendarType="gregorian"
            />
            <UnifiedDatePicker
              label="تاريخ نهاية التأجير"
              hijriValue={formData.lease_end_date_hijri || ''}
              gregorianValue={formData.lease_end_date_gregorian || ''}
              onChange={(hijri, gregorian) =>
                setFormData({
                  ...formData,
                  lease_end_date_hijri: hijri || '',
                  lease_end_date_gregorian: gregorian || null
                })
              }
              dateType="general"
              defaultCalendarType="gregorian"
            />
          </>
        )}

        {isMainManager && (
          <>
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
              <label>تاريخ انتهاء التأمين (ميلادي)</label>
              <input
                type="date"
                value={formData.insurance_expiry_date_gregorian || ''}
                onChange={(e) => setFormData({ ...formData, insurance_expiry_date_gregorian: e.target.value || null })}
              />
            </div>
          </>
        )}
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
  const digitsOnly = (value) => String(value || '').replace(/\D/g, '');
  const [formData, setFormData] = useState({
    student_full_name: student?.student_full_name || '',
    contact_mobile_number: student?.contact_mobile_number || '',
    address: student?.address || '',
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
              inputMode="numeric"
              pattern="[0-9]*"
              dir="ltr"
              value={formData.contact_mobile_number}
              onChange={(e) => setFormData({ ...formData, contact_mobile_number: digitsOnly(e.target.value) })}
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
          <input type="hidden" value={formData.term_id || bus?.term_id || ''} />
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
