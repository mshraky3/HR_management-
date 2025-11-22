/**
 * Branches Page
 * Manage branches
 */

import { useState, useEffect } from 'react';
import { branchesAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import './TablePage.css';

const Branches = () => {
  const { isMainManager, user } = useAuth();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [formData, setFormData] = useState({
    branch_name: '',
    branch_location: '',
    branch_type: 'school',
    username: '',
    password: '',
  });

  const loadBranches = async () => {
    try {
      setLoading(true);
      const filters = { is_active: 'true' };
      
      // Branch managers only see their own branch
      if (!isMainManager() && user?.branch_id) {
        filters.id = user.branch_id;
      }
      
      const response = await branchesAPI.getAll(filters);
      if (response && response.data && response.data.success) {
        setBranches(Array.isArray(response.data.data) ? response.data.data : []);
      } else {
        setBranches([]);
      }
    } catch (error) {
      console.error('Error loading branches:', error);
      setBranches([]);
      // Only show alert if we had branches before (not on initial load)
      if (branches.length > 0) {
        alert('Failed to load branches: ' + (error.response?.data?.message || error.message));
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
      if (editingBranch) {
        await branchesAPI.update(editingBranch.id, formData);
      } else {
        await branchesAPI.create(formData);
      }
      setShowForm(false);
      setEditingBranch(null);
      resetForm();
      loadBranches();
    } catch (error) {
      alert(error.response?.data?.message || 'فشل حفظ الفرع');
    }
  };

  const handleEdit = (branch) => {
    setEditingBranch(branch);
    setFormData({
      branch_name: branch.branch_name,
      branch_location: branch.branch_location,
      branch_type: branch.branch_type,
      username: branch.username,
      password: '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('هل أنت متأكد من رغبتك في إلغاء تفعيل هذا الفرع؟')) return;
    try {
      await branchesAPI.delete(id);
      loadBranches();
    } catch (error) {
      alert('فشل حذف الفرع');
    }
  };

  const resetForm = () => {
    setFormData({
      branch_name: '',
      branch_location: '',
      branch_type: 'school',
      username: '',
      password: '',
    });
  };

  if (loading) {
    return <div className="loading">جاري تحميل الفروع...</div>;
  }

  return (
    <div className="table-page">
      <div className="page-header">
        <h1>{isMainManager() ? 'إدارة الفروع' : 'فرعي'}</h1>
        {isMainManager() && (
          <button onClick={() => { setShowForm(true); resetForm(); setEditingBranch(null); }} className="btn-primary">
            إضافة فرع جديد
          </button>
        )}
      </div>

      {showForm && isMainManager() && (
        <div className="modal">
          <div className="modal-content">
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
                <div className="form-group">
                  <label>نوع الفرع *</label>
                  <select
                    value={formData.branch_type}
                    onChange={(e) => setFormData({ ...formData, branch_type: e.target.value })}
                    required
                  >
                    <option value="school">مدرسة</option>
                    <option value="healthcare_center">مركز صحي</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>موقع الفرع *</label>
                <input
                  type="text"
                  value={formData.branch_location}
                  onChange={(e) => setFormData({ ...formData, branch_location: e.target.value })}
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>اسم المستخدم *</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>كلمة المرور {!editingBranch && '*'}</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required={!editingBranch}
                  />
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary">حفظ</button>
                <button type="button" onClick={() => { setShowForm(false); resetForm(); setEditingBranch(null); }} className="btn-secondary">
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
              <th>الحالة</th>
              {isMainManager() && <th>الإجراءات</th>}
            </tr>
          </thead>
          <tbody>
            {branches.length === 0 ? (
              <tr>
                <td colSpan={isMainManager() ? "6" : "5"} style={{ textAlign: 'center' }}>لم يتم العثور على فروع</td>
              </tr>
            ) : (
              branches.map((branch) => (
                <tr key={branch.id}>
                  <td>{branch.branch_name}</td>
                  <td>{branch.branch_type === 'school' ? 'مدرسة' : 'مركز صحي'}</td>
                  <td>{branch.branch_location}</td>
                  <td>{branch.username}</td>
                  <td>
                    <span className={`badge ${branch.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {branch.is_active ? 'نشط' : 'غير نشط'}
                    </span>
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
    </div>
  );
};

export default Branches;

