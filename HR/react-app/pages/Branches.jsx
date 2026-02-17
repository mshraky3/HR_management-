/**
 * Branches Page
 * Manage branches
 */

import { useState, useEffect } from 'react';
import { branchesAPI, clearCache } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import BranchBadge from '../components/BranchBadge';
// TablePage.css is now loaded in App.jsx to prevent FOUC

const Branches = () => {
  const { isMainManager, user } = useAuth();
  const { showError, showSuccess } = useNotification();
  const [branches, setBranches] = useState([]);
  const [allBranches, setAllBranches] = useState([]); // Store all branches for filtering
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [formData, setFormData] = useState({
    branch_name: '',
    branch_location: '',
    branch_type: 'school',
    username: '',
    password: '',
    phone_number: '',
    email: '',
  });

  // Function to filter and sort branches based on search query
  const filterAndSortBranches = (branchesList, query) => {
    if (!query || !query.trim()) {
      setBranches(branchesList);
      return;
    }

    const searchTerm = query.toLowerCase().trim();

    // Calculate relevance score for each branch
    const branchesWithScore = branchesList.map(branch => {
      let score = 0;
      const searchableText = [
        branch.branch_name || '',
        branch.branch_location || '',
        branch.username || '',
        branch.branch_type === 'school' ? 'مدرسة' : 'مركز رعاية نهارية',
        branch.password || '',
        branch.phone_number || '',
        branch.email || ''
      ].join(' ').toLowerCase();

      // Exact match gets highest score
      if (searchableText.includes(searchTerm)) {
        score += 100;
      }

      // Check if search term appears at the start (higher priority)
      if (branch.branch_name?.toLowerCase().startsWith(searchTerm)) {
        score += 50;
      }
      if (branch.username?.toLowerCase().startsWith(searchTerm)) {
        score += 40;
      }
      if (branch.branch_location?.toLowerCase().startsWith(searchTerm)) {
        score += 30;
      }

      // Check for partial matches in each field
      if (branch.branch_name?.toLowerCase().includes(searchTerm)) {
        score += 20;
      }
      if (branch.username?.toLowerCase().includes(searchTerm)) {
        score += 15;
      }
      if (branch.branch_location?.toLowerCase().includes(searchTerm)) {
        score += 10;
      }
      if (branch.password?.toLowerCase().includes(searchTerm)) {
        score += 5;
      }

      return { branch, score };
    });

    // Filter branches that have any match (score > 0)
    const filteredBranches = branchesWithScore
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score) // Sort by score descending
      .map(item => item.branch);

    setBranches(filteredBranches);
  };

  const loadBranches = async () => {
    try {
      setLoading(true);
      // Send boolean true instead of string 'true' for better reliability
      const filters = { is_active: true };

      // Branch managers only see their own branch
      // Main managers should see all active branches
      if (!isMainManager() && user?.branch_id) {
        filters.id = user.branch_id;
      }

      const response = await branchesAPI.getAll(filters);
      if (response && response.data && response.data.success) {
        const branchesList = Array.isArray(response.data.data) ? response.data.data : [];
        setAllBranches(branchesList);
        // Apply search filter if exists
        if (searchQuery && searchQuery.trim()) {
          filterAndSortBranches(branchesList, searchQuery);
        } else {
          setBranches(branchesList);
        }
      } else {
        setAllBranches([]);
        setBranches([]);
      }
    } catch (error) {
      console.error('Error loading branches:', error);
      setBranches([]);
      // Only show alert if we had branches before (not on initial load)
      if (branches.length > 0) {
        showError('فشل تحميل الفروع: ' + (error.response?.data?.message || error.message));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user !== undefined) {
      loadBranches();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.branch_id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      let response;
      if (editingBranch) {
        // Don't send branch_type when updating - it cannot be changed
        const updateData = { ...formData };
        delete updateData.branch_type;

        // If password is empty or same as current, don't send it (backend will keep current)
        // Only send password if it's different from current
        if (updateData.password === '' || updateData.password === editingBranch.password) {
          delete updateData.password;
        }

        response = await branchesAPI.update(editingBranch.id, updateData);

        // Clear cache to ensure fresh data everywhere
        clearCache('/api/branches');
        clearCache('/api/branch-statistics');
        clearCache('/api/employees'); // Employee completion status may depend on branch info

        // Immediately update local state to avoid lag
        if (response?.data?.success && response?.data?.data) {
          const updatedBranch = response.data.data;
          setBranches(prevBranches =>
            prevBranches.map(b => b.id === editingBranch.id ? updatedBranch : b)
          );
          setAllBranches(prevBranches =>
            prevBranches.map(b => b.id === editingBranch.id ? updatedBranch : b)
          );
        }
      } else {
        await branchesAPI.create(formData);
        // Clear cache after creating
        clearCache('/api/branches');
        clearCache('/api/branch-statistics');
      }
      setShowForm(false);
      setEditingBranch(null);
      resetForm();
      // Only reload if not editing (for create) or if update didn't work
      if (!editingBranch || !response?.data?.success) {
        loadBranches();
      }
      const message = editingBranch ? 'تم تحديث الفرع بنجاح' : 'تم إنشاء الفرع بنجاح';
      setSuccessMessage(message);
      setShowSuccessAnimation(true);
      setTimeout(() => {
        setShowSuccessAnimation(false);
        showSuccess(message);
      }, 2000);
    } catch (error) {
      showError(error.response?.data?.message || 'فشل حفظ الفرع');
    }
  };

  const handleEdit = (branch) => {
    setEditingBranch(branch);
    setFormData({
      branch_name: branch.branch_name,
      branch_location: branch.branch_location,
      branch_type: branch.branch_type,
      username: branch.username,
      password: branch.password || '', // Show current password
      phone_number: branch.phone_number || '',
      email: branch.email || '',
      number_of_employees: branch.number_of_employees || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('هل أنت متأكد من رغبتك في إلغاء تفعيل هذا الفرع؟')) return;
    try {
      await branchesAPI.delete(id);
      loadBranches();
      showSuccess('تم حذف الفرع بنجاح');
    } catch (error) {
      showError('فشل حذف الفرع');
    }
  };

  const resetForm = () => {
    setFormData({
      branch_name: '',
      branch_location: '',
      branch_type: 'school',
      username: '',
      password: '',
      phone_number: '',
      email: '',
      number_of_employees: '',
    });
  };

  // Handle search input change
  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    filterAndSortBranches(allBranches, query);
  };

  if (loading) {
    return (
      <div className="table-page">
        <div className="page-header">
          <h1>{'جاري التحميل...'}</h1>
        </div>
        <div style={{ padding: 'var(--spacing-xl)' }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton skeleton-branch-row" style={{ animationDelay: `${i * 0.1}s` }}></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="table-page">
      <div className="page-header">
        <h1>{isMainManager() ? 'إدارة الفروع' : 'فرعي'}</h1>
        {isMainManager() && (
          <button onClick={() => { setShowForm(true); resetForm(); setEditingBranch(null); }} className="btn-primary btn-lg">
            إضافة فرع جديد
          </button>
        )}
      </div>

      {isMainManager() && (
        <div style={{
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px'
        }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            البحث في الفروع:
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="ابحث عن فرع بالاسم، الموقع، اسم المستخدم، أو أي معلومة أخرى..."
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              fontSize: '14px'
            }}
          />
          {searchQuery && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
              عرض {branches.length} من {allBranches.length} فرع
            </div>
          )}
        </div>
      )}

      {showForm && isMainManager() && (
        <div className="modal modal-animated">
          <div className="modal-content modal-slide-up">
            <h2>{editingBranch ? 'تعديل الفرع' : 'إنشاء فرع جديد'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>اسم الفرع *</label>
                  <input
                    type="text"
                    value={formData.branch_name}
                    onChange={(e) => setFormData({ ...formData, branch_name: e.target.value })}
                    required
                  />
                </div>
                {!editingBranch && (
                  <div className="form-group">
                    <label>نوع الفرع *</label>
                    <select
                      value={formData.branch_type}
                      onChange={(e) => setFormData({ ...formData, branch_type: e.target.value })}
                      required
                    >
                      <option value="school">مدرسة</option>
                      <option value="healthcare_center">مركز رعاية نهارية</option>
                    </select>
                  </div>
                )}
                {editingBranch && (
                  <div className="form-group">
                    <label>نوع الفرع</label>
                    <input
                      type="text"
                      value={formData.branch_type === 'school' ? 'مدرسة' : 'مركز رعاية نهارية'}
                      disabled
                      style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
                    />
                    <small>
                      نوع الفرع لا يمكن تغييره بعد الإنشاء
                    </small>
                  </div>
                )}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>موقع الفرع *</label>
                  <input
                    type="text"
                    value={formData.branch_location}
                    onChange={(e) => setFormData({ ...formData, branch_location: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>اسم المستخدم *</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>كلمة المرور {!editingBranch && '*'}</label>
                  <input
                    type="text"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required={!editingBranch}
                    placeholder={editingBranch ? 'اتركه فارغاً للاحتفاظ بالقيمة الحالية' : ''}
                  />
                  {editingBranch && (
                    <small>
                      اتركه فارغاً للاحتفاظ بالقيمة الحالية
                    </small>
                  )}
                </div>
              </div>

              {/* معلومات الفرع */}
              <h3>معلومات الفرع</h3>
              <div className="form-row three-columns">
                <div className="form-group">
                  <label>رقم جوال الفرع</label>
                  <input
                    type="tel"
                    value={formData.phone_number}
                    onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                    placeholder="مثال: 0501234567"
                  />
                </div>
                <div className="form-group">
                  <label>إيميل الفرع</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="مثال: branch@example.com"
                  />
                </div>
                <div className="form-group">
                  <label>عدد الموظفين في الفرع</label>
                  <input
                    type="number"
                    value={formData.number_of_employees}
                    onChange={(e) => setFormData({ ...formData, number_of_employees: e.target.value })}
                    placeholder="مثال: 50"
                    min="0"
                  />
                  <small>
                    يستخدم هذا العدد لحساب نسبة اكتمال بيانات الموظفين بدقة أكبر في لوحة التحكم
                  </small>
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn-primary btn-lg">حفظ</button>
                <button type="button" onClick={() => { setShowForm(false); resetForm(); setEditingBranch(null); }} className="btn-secondary btn-lg">
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>اسم الفرع</th>
              <th>النوع</th>
              <th>الموقع</th>
              <th>اسم المستخدم</th>
              <th>كلمة المرور</th>
              <th>معلومات الفرع</th>
              {isMainManager() && <th>الإجراءات</th>}
            </tr>
          </thead>
          <tbody>
            {branches.length === 0 ? (
              <tr>
                <td colSpan={isMainManager() ? "7" : "6"} style={{ textAlign: 'center' }}>لم يتم العثور على فروع</td>
              </tr>
            ) : (
              branches.map((branch, index) => (
                <tr key={branch.id} className="branch-row" style={{ animationDelay: `${index * 0.05}s` }}>
                  <td><BranchBadge branch={branch} showName={true} /></td>
                  <td>{branch.branch_type === 'school' ? 'مدرسة' : 'مركز رعاية نهارية'}</td>
                  <td>{branch.branch_location}</td>
                  <td>{branch.username}</td>
                  <td>{branch.password || '-'}</td>
                  <td style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {branch.phone_number && (
                      <div style={{ fontSize: '13px' }}>
                        <strong>جوال:</strong> {branch.phone_number}
                      </div>
                    )}
                    {branch.email && (
                      <div style={{ fontSize: '13px' }}>
                        <strong>إيميل:</strong> {branch.email}
                      </div>
                    )}
                    {!branch.phone_number && !branch.email && (
                      <span style={{ color: '#999', fontSize: '13px' }}>-</span>
                    )}
                  </td>
                  {isMainManager() && (
                    <td>
                      <button onClick={() => handleEdit(branch)} className="btn-sm btn-edit">تعديل</button>
                      <button onClick={() => handleDelete(branch.id)} className="btn-sm btn-delete">حذف</button>
                    </td>
                  )}
                  {!isMainManager() && (
                    <td>
                      <span className="badge badge-info" style={{ fontSize: '11px', padding: '4px 8px' }}>
                        عرض فقط
                      </span>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Success Animation */}
      {showSuccessAnimation && (
        <div className="success-overlay">
          <div className="success-card">
            <div className="success-icon"></div>
            <div className="success-message">{successMessage}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Branches;

