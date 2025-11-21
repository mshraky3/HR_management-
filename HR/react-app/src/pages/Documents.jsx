/**
 * Documents Page
 * Manage employee documents
 */

import { useState, useEffect } from 'react';
import { documentsAPI, employeesAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import './TablePage.css';

const Documents = () => {
  const { isMainManager, user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [uploadData, setUploadData] = useState({
    employee_id: '',
    document_type: '',
    description: '',
    expiry_date: '',
    file: null,
  });

  useEffect(() => {
    loadEmployees();
    loadDocuments();
  }, []);

  const loadEmployees = async () => {
    try {
      const response = await employeesAPI.getAll({ is_active: true });
      if (response.data.success) {
        setEmployees(response.data.data);
      }
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  };

  const loadDocuments = async () => {
    try {
      setLoading(true);
      let response;
      if (selectedEmployee) {
        response = await documentsAPI.getAll({ employee_id: selectedEmployee });
      } else {
        // Don't send employee_id if it's null - let the backend handle it
        response = await documentsAPI.getAll({});
      }
      if (response.data.success) {
        setDocuments(response.data.data);
      }
    } catch (error) {
      console.error('Error loading documents:', error);
      alert('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    setUploadData({ ...uploadData, file: e.target.files[0] });
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadData.file) {
      alert('Please select a file');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', uploadData.file);
      formData.append('employee_id', uploadData.employee_id);
      formData.append('document_type', uploadData.document_type);
      if (uploadData.description) formData.append('description', uploadData.description);
      if (uploadData.expiry_date) formData.append('expiry_date', uploadData.expiry_date);

      await documentsAPI.upload(formData);
      setShowUploadForm(false);
      setUploadData({
        employee_id: '',
        document_type: '',
        description: '',
        expiry_date: '',
        file: null,
      });
      loadDocuments();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to upload document');
    }
  };

  const handleDownload = async (id, fileName) => {
    try {
      const response = await documentsAPI.download(id);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      alert('Failed to download document');
    }
  };

  const handleVerify = async (id) => {
    try {
      await documentsAPI.verify(id);
      loadDocuments();
    } catch (error) {
      alert('Failed to verify document');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    try {
      await documentsAPI.delete(id);
      loadDocuments();
    } catch (error) {
      alert('Failed to delete document');
    }
  };

  const documentTypes = [
    'id_or_residency',
    'employment_letter',
    'bank_iban',
    'primary_qualification',
    'employment_contract',
    'additional_courses',
    'passport',
    'professional_license',
    'experience_certificate',
    'classification',
    'speech_therapy_course',
    'physical_therapy_course',
  ];

  if (loading) {
    return <div className="loading">Loading documents...</div>;
  }

  return (
    <div className="table-page">
      <div className="page-header">
        <h1>{isMainManager() ? 'Documents Management' : 'My Branch Documents'}</h1>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select
            value={selectedEmployee}
            onChange={(e) => {
              setSelectedEmployee(e.target.value);
              setTimeout(loadDocuments, 100);
            }}
            style={{ padding: '8px', borderRadius: '5px', border: '1px solid #ddd' }}
          >
            <option value="">All Employees</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.first_name} {emp.second_name} - {emp.employee_id_number}
              </option>
            ))}
          </select>
          <button onClick={() => setShowUploadForm(true)} className="btn-primary">
            Upload Document
          </button>
        </div>
      </div>

      {showUploadForm && (
        <div className="modal">
          <div className="modal-content">
            <h2>Upload Document</h2>
            <form onSubmit={handleUpload}>
              <div className="form-group">
                <label>Employee *</label>
                <select
                  value={uploadData.employee_id}
                  onChange={(e) => setUploadData({ ...uploadData, employee_id: e.target.value })}
                  required
                >
                  <option value="">Select Employee</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.second_name} - {emp.employee_id_number}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Document Type *</label>
                <select
                  value={uploadData.document_type}
                  onChange={(e) => setUploadData({ ...uploadData, document_type: e.target.value })}
                  required
                >
                  <option value="">Select Type</option>
                  {documentTypes.map(type => (
                    <option key={type} value={type}>
                      {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>File * (PDF, JPG, PNG - Max 10MB)</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={uploadData.description}
                  onChange={(e) => setUploadData({ ...uploadData, description: e.target.value })}
                  rows="3"
                />
              </div>
              <div className="form-group">
                <label>Expiry Date</label>
                <input
                  type="date"
                  value={uploadData.expiry_date}
                  onChange={(e) => setUploadData({ ...uploadData, expiry_date: e.target.value })}
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary">Upload</button>
                <button type="button" onClick={() => {
                  setShowUploadForm(false);
                  setUploadData({
                    employee_id: '',
                    document_type: '',
                    description: '',
                    expiry_date: '',
                    file: null,
                  });
                }} className="btn-secondary">
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
              <th>Employee ID</th>
              <th>Document Type</th>
              <th>File Name</th>
              <th>Size</th>
              <th>Uploaded</th>
              <th>Verified</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center' }}>No documents found</td>
              </tr>
            ) : (
              documents.map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.id}</td>
                  <td>{doc.employee_id}</td>
                  <td>{doc.document_type.replace(/_/g, ' ')}</td>
                  <td>{doc.file_name}</td>
                  <td>{(doc.file_size / 1024).toFixed(2)} KB</td>
                  <td>{new Date(doc.uploaded_at).toLocaleDateString()}</td>
                  <td>
                    <span className={`badge ${doc.is_verified ? 'badge-success' : 'badge-danger'}`}>
                      {doc.is_verified ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td>
                    <button onClick={() => handleDownload(doc.id, doc.file_name)} className="btn-sm btn-edit">
                      Download
                    </button>
                    {isMainManager() && !doc.is_verified && (
                      <button onClick={() => handleVerify(doc.id)} className="btn-sm" style={{ background: '#27ae60', color: 'white' }}>
                        Verify
                      </button>
                    )}
                    {isMainManager() && (
                      <button onClick={() => handleDelete(doc.id)} className="btn-sm btn-delete">Delete</button>
                    )}
                    {!isMainManager() && (
                      <span className="badge badge-info" style={{ fontSize: '11px', padding: '4px 8px' }}>
                        View Only
                      </span>
                    )}
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

export default Documents;

