/**
 * Branch Info Page
 * Branch manager can update branch contact information (phone, email, and number of employees)
 */

import { useState, useEffect } from 'react';
import { branchesAPI, clearCache } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import BranchBadge from '../components/BranchBadge';
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
    number_of_employees: '',
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
          number_of_employees: branchData.number_of_employees !== null && branchData.number_of_employees !== undefined
            ? String(branchData.number_of_employees)
            : '',
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

  const handleNumberChange = (e) => {
    const { name, value } = e.target;
    // For number inputs, allow empty string or valid numbers
    setFormData(prev => ({
      ...prev,
      [name]: value === '' ? '' : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);

      // Prepare update data - explicitly handle number_of_employees
      const updateData = {
        phone_number: formData.phone_number.trim() || null,
        email: formData.email.trim() || null,
      };

      // Handle number_of_employees: always send it explicitly
      // If empty string or falsy, send null; if has value, send the string value (backend will parse as int)
      const numEmployeesStr = String(formData.number_of_employees || '').trim();
      updateData.number_of_employees = numEmployeesStr === '' ? null : numEmployeesStr;

      const response = await branchesAPI.updateMyBranch(updateData);

      // Aggressively clear all related cache to ensure fresh data everywhere
      clearCache('/api/branches');
      clearCache('/api/branch-statistics');
      clearCache('/api/employees'); // Employee completion status may depend on branch info

      // Update state directly from response to avoid cache issues
      if (response && response.data && response.data.success && response.data.data) {
        const updatedBranch = response.data.data;
        setBranch(updatedBranch);
        setFormData({
          phone_number: updatedBranch.phone_number || '',
          email: updatedBranch.email || '',
          number_of_employees: updatedBranch.number_of_employees !== null && updatedBranch.number_of_employees !== undefined
            ? String(updatedBranch.number_of_employees)
            : '',
        });
      } else {
        // Fallback: reload from server if response format is unexpected
        await loadBranch();
      }

      showSuccess('تم تحديث معلومات الفرع بنجاح');

      // Trigger a custom event to notify Dashboard to refresh
      // This ensures Dashboard reloads when user navigates back
      window.dispatchEvent(new CustomEvent('branchInfoUpdated'));
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
        <p className="branch-name"><BranchBadge branch={branch} /> {branch.branch_name}</p>
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

          <div className="form-group">
            <label htmlFor="number_of_employees">عدد الموظفين في الفرع</label>
            <input
              type="number"
              id="number_of_employees"
              name="number_of_employees"
              value={formData.number_of_employees}
              onChange={handleNumberChange}
              placeholder="مثال: 50"
              min="0"
              step="1"
              className="form-input"
            />
            <small style={{ display: 'block', marginTop: '5px', color: '#666', fontSize: '12px' }}>
              يستخدم هذا العدد لحساب نسبة اكتمال بيانات الموظفين بدقة أكبر في لوحة التحكم
            </small>
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

