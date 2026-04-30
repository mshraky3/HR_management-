/**
 * Account Management Page
 * Manage main manager accounts only (Main Manager only)
 */

import { useState, useEffect } from 'react';
import { usersAPI } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';

const AccountManagement = () => {
  const { showError, showSuccess } = useNotification();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    phone_number: '',
  });

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const response = await usersAPI.getAll({ role: 'main_manager', is_active: true });
      if (response.data.success) {
        setAccounts(response.data.data || []);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
      showError('فشل تحميل الحسابات');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      if (editingAccount) {
        const updateData = { ...formData };
        if (!updateData.password || updateData.password.trim() === '') {
          delete updateData.password;
        }
        await usersAPI.update(editingAccount.id, updateData);
      } else {
        await usersAPI.create(formData);
      }
      setShowForm(false);
      setEditingAccount(null);
      resetForm();
      loadAccounts();
      showSuccess(editingAccount ? 'تم تحديث الحساب بنجاح' : 'تم إنشاء الحساب بنجاح');
    } catch (error) {
      showError(error.response?.data?.message || 'فشل حفظ الحساب');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (account) => {
    setEditingAccount(account);
    setFormData({
      username: account.username,
      password: account.password || '',
      full_name: account.full_name,
      phone_number: account.phone_number || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('هل أنت متأكد من رغبتك في حذف هذا الحساب؟')) return;
    try {
      await usersAPI.delete(id);
      loadAccounts();
      showSuccess('تم حذف الحساب بنجاح');
    } catch (error) {
      showError('فشل حذف الحساب');
    }
  };

  const resetForm = () => {
    setFormData({ username: '', password: '', full_name: '', phone_number: '' });
  };

  if (loading) {
    return <div className="loading">جاري تحميل الحسابات...</div>;
  }

  return (
    <div className="table-page">
      <div className="page-header">
        <h1>إدارة الحسابات</h1>
        <button onClick={() => { setShowForm(true); resetForm(); setEditingAccount(null); }} className="btn-primary btn-lg">
          إضافة حساب جديد
        </button>
      </div>

      {showForm && (
        <div className="modal">
          <div className="modal-content">
            <h2>{editingAccount ? 'تعديل الحساب' : 'إنشاء حساب جديد'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>اسم الحساب *</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>كلمة المرور {!editingAccount && '*'}</label>
                  <input
                    type="text"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required={!editingAccount}
                    placeholder={editingAccount ? 'اتركه فارغاً إذا لم ترد تغييره' : ''}
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
                  <label>رقم الجوال</label>
                  <input
                    type="text"
                    value={formData.phone_number}
                    onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary btn-lg" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ'}</button>
                <button type="button" onClick={() => { setShowForm(false); resetForm(); setEditingAccount(null); }} className="btn-secondary btn-lg">
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
              <th>الاسم</th>
              <th>اسم الحساب</th>
              <th>كلمة المرور</th>
              <th>رقم الجوال</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center' }}>لم يتم العثور على حسابات</td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.full_name}</td>
                  <td>{account.username}</td>
                  <td>{account.password || '-'}</td>
                  <td>{account.phone_number || '-'}</td>
                  <td>
                    <button onClick={() => handleEdit(account)} className="btn-sm btn-edit">تعديل</button>
                    <button onClick={() => handleDelete(account.id)} className="btn-sm btn-delete">حذف</button>
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

export default AccountManagement;

