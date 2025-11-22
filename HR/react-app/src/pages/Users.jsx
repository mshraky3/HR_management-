/**
 * Users Page
 * Manage system users (Main Manager only)
 */

import { useState, useEffect } from 'react';
import { usersAPI } from '../utils/api';
import './TablePage.css';

const Users = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'branch_manager',
    branch_id: '',
    full_name: '',
    email: '',
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await usersAPI.getAll();
      if (response.data.success) {
        setUsers(response.data.data);
      }
    } catch (error) {
      console.error('Error loading users:', error);
      alert('فشل تحميل المستخدمين');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await usersAPI.update(editingUser.id, formData);
      } else {
        await usersAPI.create(formData);
      }
      setShowForm(false);
      setEditingUser(null);
      resetForm();
      loadUsers();
    } catch (error) {
      alert(error.response?.data?.message || 'فشل حفظ المستخدم');
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      role: user.role,
      branch_id: user.branch_id || '',
      full_name: user.full_name,
      email: user.email || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('هل أنت متأكد من رغبتك في إلغاء تفعيل هذا المستخدم؟')) return;
    try {
      await usersAPI.delete(id);
      loadUsers();
    } catch (error) {
      alert('فشل حذف المستخدم');
    }
  };

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      role: 'branch_manager',
      branch_id: '',
      full_name: '',
      email: '',
    });
  };

  if (loading) {
    return <div className="loading">جاري تحميل المستخدمين...</div>;
  }

  return (
    <div className="table-page">
      <div className="page-header">
        <h1>إدارة المستخدمين</h1>
        <button onClick={() => { setShowForm(true); resetForm(); setEditingUser(null); }} className="btn-primary">
          إضافة مستخدم جديد
        </button>
      </div>

      {showForm && (
        <div className="modal">
          <div className="modal-content">
            <h2>{editingUser ? 'تعديل المستخدم' : 'إنشاء مستخدم جديد'}</h2>
            <form onSubmit={handleSubmit}>
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
                  <label>كلمة المرور {!editingUser && '*'}</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required={!editingUser}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>الاسم الكامل *</label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>الدور *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    required
                  >
                    <option value="branch_manager">مدير فرع</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>معرف الفرع</label>
                  <input
                    type="number"
                    value={formData.branch_id}
                    onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                    placeholder="اتركه فارغاً إذا كان مدير رئيسي"
                  />
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary">حفظ</button>
                <button type="button" onClick={() => { setShowForm(false); resetForm(); setEditingUser(null); }} className="btn-secondary">
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
              <th>اسم المستخدم</th>
              <th>الاسم الكامل</th>
              <th>البريد الإلكتروني</th>
              <th>الدور</th>
              <th>معرف الفرع</th>
              <th>الحالة</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center' }}>لم يتم العثور على مستخدمين</td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.full_name}</td>
                  <td>{user.email || '-'}</td>
                  <td>{user.role === 'main_manager' ? 'مدير رئيسي' : 'مدير فرع'}</td>
                  <td>{user.branch_id || '-'}</td>
                  <td>
                    <span className={`badge ${user.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {user.is_active ? 'نشط' : 'غير نشط'}
                    </span>
                  </td>
                  <td>
                    <button onClick={() => handleEdit(user)} className="btn-sm btn-edit">تعديل</button>
                    <button onClick={() => handleDelete(user.id)} className="btn-sm btn-delete">حذف</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Users;

