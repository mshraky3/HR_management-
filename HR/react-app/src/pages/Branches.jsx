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

  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    try {
      setLoading(true);
      const filters = { is_active: true };
      
      // Branch managers only see their own branch
      if (!isMainManager() && user?.branch_id) {
        filters.id = user.branch_id;
      }
      
      const response = await branchesAPI.getAll(filters);
      if (response.data.success) {
        setBranches(response.data.data);
      }
    } catch (error) {
      console.error('Error loading branches:', error);
      alert('Failed to load branches');
    } finally {
      setLoading(false);
    }
  };

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
      alert(error.response?.data?.message || 'Failed to save branch');
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
    if (!confirm('Are you sure you want to deactivate this branch?')) return;
    try {
      await branchesAPI.delete(id);
      loadBranches();
    } catch (error) {
      alert('Failed to delete branch');
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
    return <div className="loading">Loading branches...</div>;
  }

  // Branch managers can only view their own branch
  useEffect(() => {
    if (!isMainManager() && user?.branch_id) {
      // Load only their branch
      loadBranches();
    }
  }, [user?.branch_id, isMainManager()]);

  return (
    <div className="table-page">
      <div className="page-header">
        <h1>{isMainManager() ? 'Branches Management' : 'My Branch'}</h1>
        {isMainManager() && (
          <button onClick={() => { setShowForm(true); resetForm(); setEditingBranch(null); }} className="btn-primary">
            Add New Branch
          </button>
        )}
      </div>

      {showForm && isMainManager() && (
        <div className="modal">
          <div className="modal-content">
            <h2>{editingBranch ? 'Edit Branch' : 'Create New Branch'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Branch Name *</label>
                  <input
                    type="text"
                    value={formData.branch_name}
                    onChange={(e) => setFormData({ ...formData, branch_name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Branch Type *</label>
                  <select
                    value={formData.branch_type}
                    onChange={(e) => setFormData({ ...formData, branch_type: e.target.value })}
                    required
                  >
                    <option value="school">School</option>
                    <option value="healthcare_center">Healthcare Center</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Branch Location *</label>
                <input
                  type="text"
                  value={formData.branch_location}
                  onChange={(e) => setFormData({ ...formData, branch_location: e.target.value })}
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Username *</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Password {!editingBranch && '*'}</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required={!editingBranch}
                  />
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary">Save</button>
                <button type="button" onClick={() => { setShowForm(false); resetForm(); setEditingBranch(null); }} className="btn-secondary">
                  Cancel
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
              <th>ID</th>
              <th>Branch Name</th>
              <th>Type</th>
              <th>Location</th>
              <th>Username</th>
              <th>Status</th>
              {isMainManager() && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {branches.length === 0 ? (
              <tr>
                <td colSpan={isMainManager() ? "7" : "6"} style={{ textAlign: 'center' }}>No branches found</td>
              </tr>
            ) : (
              branches.map((branch) => (
                <tr key={branch.id}>
                  <td>{branch.id}</td>
                  <td>{branch.branch_name}</td>
                  <td>{branch.branch_type === 'school' ? 'School' : 'Healthcare Center'}</td>
                  <td>{branch.branch_location}</td>
                  <td>{branch.username}</td>
                  <td>
                    <span className={`badge ${branch.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {branch.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {isMainManager() && (
                    <td>
                      <button onClick={() => handleEdit(branch)} className="btn-sm btn-edit">Edit</button>
                      <button onClick={() => handleDelete(branch.id)} className="btn-sm btn-delete">Delete</button>
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

