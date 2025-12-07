/**
 * Branch Info Page
 * Branch manager can update branch contact information (phone and email)
 */

import { useState, useEffect } from 'react';
import { branchesAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import './BranchInfo.css';

const BranchInfo = () => {
  const { user } = useAuth();
  const { showError, showSuccess } = useNotification();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [branch, setBranch] = useState(null);
  const [formData, setFormData] = useState({
    phone_number: '',
    email: '',
  });

  useEffect(() => {
    if (user?.branch_id) {
      loadBranch();
    }
  }, [user?.branch_id]);

  const loadBranch = async () => {
    try {
      setLoading(true);
      const response = await branchesAPI.getById(user.branch_id);
      if (response && response.data && response.data.success) {
        const branchData = response.data.data;
        setBranch(branchData);
        setFormData({
          phone_number: branchData.phone_number || '',
          email: branchData.email || '',
        });
      } else {
        showError('فشل تحميل معلومات الفرع');
      }
    } catch (error) {
      console.error('Error loading branch:', error);
      showError('فشل تحميل معلومات الفرع: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      await branchesAPI.updateMyBranch({
        phone_number: formData.phone_number || null,
        email: formData.email || null,
      });
      showSuccess('تم تحديث معلومات الفرع بنجاح');
      await loadBranch(); // Reload to get updated data
    } catch (error) {
      console.error('Error updating branch:', error);
      showError('فشل تحديث معلومات الفرع: ' + (error.response?.data?.message || error.message));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="branch-info-container">
        <div className="loading-container">
          <p>جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="branch-info-container">
        <div className="error-container">
          <p>لم يتم العثور على معلومات الفرع</p>
        </div>
      </div>
    );
  }

  return (
    <div className="branch-info-container">
      <div className="branch-info-header">
        <h1>معلومات الفرع</h1>
        <p className="branch-name">{branch.branch_name}</p>
      </div>

      <div className="branch-info-form-container">
        <form onSubmit={handleSubmit} className="branch-info-form">
          <div className="form-group">
            <label htmlFor="phone_number">رقم جوال الفرع</label>
            <input
              type="text"
              id="phone_number"
              name="phone_number"
              value={formData.phone_number}
              onChange={handleChange}
              placeholder="مثال: 0501234567"
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">إيميل الفرع</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="مثال: branch@example.com"
              className="form-input"
            />
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={loadBranch}
              disabled={saving}
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BranchInfo;

