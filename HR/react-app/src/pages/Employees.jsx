/**
 * Employees Page
 * Manage employees
 */

import { useState, useEffect } from 'react';
import { employeesAPI, branchesAPI, documentsAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import './TablePage.css';

const Employees = () => {
  const { isMainManager, user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [formData, setFormData] = useState({
    employee_id_number: '',
    branch_id: user?.branch_id || '',
    first_name: '',
    second_name: '',
    third_name: '',
    fourth_name: '',
    occupation: '',
    nationality: '',
    date_of_birth_hijri: '',
    date_of_birth_gregorian: '',
    id_or_residency_number: '',
    id_type: 'citizen',
    gender: 'male',
    id_expiry_date_hijri: '',
    id_expiry_date_gregorian: '',
    religion: '',
    marital_status: '',
    educational_qualification: '',
    specialization: '',
    bank_iban: '',
    bank_name: '',
    email: '',
    phone_number: '',
    contract_type: '',
    salary: '',
  });
  
  // Document uploads state
  const [documents, setDocuments] = useState({
    id_or_residency: null,
    employment_letter: null,
    bank_iban: null,
    primary_qualification: null,
    employment_contract: null,
    additional_courses: null,
    passport: null,
    professional_license: null,
    experience_certificate: null,
    classification: null,
    speech_therapy_course: null,
    physical_therapy_course: null,
  });

  useEffect(() => {
    loadBranches();
    loadEmployees();
  }, []);

  const loadBranches = async () => {
    try {
      const response = await branchesAPI.getAll({ is_active: true });
      if (response.data.success) {
        setBranches(response.data.data);
      }
    } catch (error) {
      console.error('Error loading branches:', error);
    }
  };

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const response = await employeesAPI.getAll({ is_active: true });
      if (response.data.success) {
        setEmployees(response.data.data);
      }
    } catch (error) {
      console.error('Error loading employees:', error);
      alert('Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = { ...formData };
      if (data.salary) data.salary = parseFloat(data.salary);
      
      let employee;
      if (editingEmployee) {
        await employeesAPI.update(editingEmployee.id, data);
      } else {
        // Create employee first
        const createResponse = await employeesAPI.create(data);
        employee = createResponse.data.data;
        
        // Upload documents if any were provided
        const documentEntries = Object.entries(documents).filter(([_, file]) => file !== null);
        
        if (documentEntries.length > 0) {
          const uploadPromises = documentEntries.map(async ([documentType, file]) => {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('employee_id', employee.id);
            formData.append('document_type', documentType);
            
            try {
              await documentsAPI.upload(formData);
            } catch (error) {
              console.error(`Error uploading ${documentType}:`, error);
              // Continue with other uploads even if one fails
            }
          });
          
          await Promise.all(uploadPromises);
        }
      }
      
      setShowForm(false);
      setEditingEmployee(null);
      resetForm();
      resetDocuments();
      loadEmployees();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to save employee');
    }
  };
  
  const resetDocuments = () => {
    setDocuments({
      id_or_residency: null,
      employment_letter: null,
      bank_iban: null,
      primary_qualification: null,
      employment_contract: null,
      additional_courses: null,
      passport: null,
      professional_license: null,
      experience_certificate: null,
      classification: null,
      speech_therapy_course: null,
      physical_therapy_course: null,
    });
  };
  
  const handleDocumentChange = (documentType, file) => {
    setDocuments(prev => ({
      ...prev,
      [documentType]: file
    }));
  };

  const handleEdit = (employee) => {
    setEditingEmployee(employee);
    setFormData({
      employee_id_number: employee.employee_id_number,
      branch_id: employee.branch_id,
      first_name: employee.first_name,
      second_name: employee.second_name,
      third_name: employee.third_name,
      fourth_name: employee.fourth_name,
      occupation: employee.occupation,
      nationality: employee.nationality,
      date_of_birth_hijri: employee.date_of_birth_hijri || '',
      date_of_birth_gregorian: employee.date_of_birth_gregorian || '',
      id_or_residency_number: employee.id_or_residency_number,
      id_type: employee.id_type,
      gender: employee.gender,
      id_expiry_date_hijri: employee.id_expiry_date_hijri || '',
      id_expiry_date_gregorian: employee.id_expiry_date_gregorian || '',
      religion: employee.religion || '',
      marital_status: employee.marital_status || '',
      educational_qualification: employee.educational_qualification || '',
      specialization: employee.specialization || '',
      bank_iban: employee.bank_iban || '',
      bank_name: employee.bank_name || '',
      email: employee.email || '',
      phone_number: employee.phone_number || '',
      contract_type: employee.contract_type || '',
      salary: employee.salary || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to deactivate this employee?')) return;
    try {
      await employeesAPI.delete(id);
      loadEmployees();
    } catch (error) {
      alert('Failed to delete employee');
    }
  };

  const resetForm = () => {
    setFormData({
      employee_id_number: '',
      branch_id: user?.branch_id || '',
      first_name: '',
      second_name: '',
      third_name: '',
      fourth_name: '',
      occupation: '',
      nationality: '',
      date_of_birth_hijri: '',
      date_of_birth_gregorian: '',
      id_or_residency_number: '',
      id_type: 'citizen',
      gender: 'male',
      id_expiry_date_hijri: '',
      id_expiry_date_gregorian: '',
      religion: '',
      marital_status: '',
      educational_qualification: '',
      specialization: '',
      bank_iban: '',
      bank_name: '',
      email: '',
      phone_number: '',
      contract_type: '',
      salary: '',
    });
    resetDocuments();
  };

  if (loading) {
    return <div className="loading">Loading employees...</div>;
  }

  return (
    <div className="table-page">
      <div className="page-header">
        <h1>Employees Management</h1>
        <button onClick={() => { setShowForm(true); resetForm(); setEditingEmployee(null); }} className="btn-primary">
          Add New Employee
        </button>
      </div>

      {showForm && (
        <div className="modal">
          <div className="modal-content" style={{ maxWidth: '800px' }}>
            <h2>{editingEmployee ? 'Edit Employee' : 'Create New Employee'}</h2>
            <form onSubmit={handleSubmit} style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <h3>Basic Information</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>Employee ID Number *</label>
                  <input
                    type="text"
                    value={formData.employee_id_number}
                    onChange={(e) => setFormData({ ...formData, employee_id_number: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Branch *</label>
                  <select
                    value={formData.branch_id}
                    onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                    required
                    disabled={!isMainManager()}
                  >
                    <option value="">Select Branch</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.branch_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <h3>Name (4 Names Required)</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>First Name *</label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Second Name *</label>
                  <input
                    type="text"
                    value={formData.second_name}
                    onChange={(e) => setFormData({ ...formData, second_name: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Third Name *</label>
                  <input
                    type="text"
                    value={formData.third_name}
                    onChange={(e) => setFormData({ ...formData, third_name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Fourth Name *</label>
                  <input
                    type="text"
                    value={formData.fourth_name}
                    onChange={(e) => setFormData({ ...formData, fourth_name: e.target.value })}
                    required
                  />
                </div>
              </div>

              <h3>Personal Information</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>Occupation *</label>
                  <input
                    type="text"
                    value={formData.occupation}
                    onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Nationality *</label>
                  <input
                    type="text"
                    value={formData.nationality}
                    onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Date of Birth (Gregorian) *</label>
                  <input
                    type="date"
                    value={formData.date_of_birth_gregorian}
                    onChange={(e) => setFormData({ ...formData, date_of_birth_gregorian: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Date of Birth (Hijri)</label>
                  <input
                    type="date"
                    value={formData.date_of_birth_hijri}
                    onChange={(e) => setFormData({ ...formData, date_of_birth_hijri: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>ID/Residency Number *</label>
                  <input
                    type="text"
                    value={formData.id_or_residency_number}
                    onChange={(e) => setFormData({ ...formData, id_or_residency_number: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>ID Type *</label>
                  <select
                    value={formData.id_type}
                    onChange={(e) => setFormData({ ...formData, id_type: e.target.value })}
                    required
                  >
                    <option value="citizen">Citizen</option>
                    <option value="resident">Resident</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Gender *</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    required
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>ID Expiry Date (Gregorian)</label>
                  <input
                    type="date"
                    value={formData.id_expiry_date_gregorian}
                    onChange={(e) => setFormData({ ...formData, id_expiry_date_gregorian: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>ID Expiry Date (Hijri)</label>
                  <input
                    type="date"
                    value={formData.id_expiry_date_hijri}
                    onChange={(e) => setFormData({ ...formData, id_expiry_date_hijri: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Religion</label>
                  <input
                    type="text"
                    value={formData.religion}
                    onChange={(e) => setFormData({ ...formData, religion: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Marital Status</label>
                  <input
                    type="text"
                    value={formData.marital_status}
                    onChange={(e) => setFormData({ ...formData, marital_status: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Educational Qualification</label>
                  <input
                    type="text"
                    value={formData.educational_qualification}
                    onChange={(e) => setFormData({ ...formData, educational_qualification: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Specialization</label>
                  <input
                    type="text"
                    value={formData.specialization}
                    onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Contract Type</label>
                  <input
                    type="text"
                    value={formData.contract_type}
                    onChange={(e) => setFormData({ ...formData, contract_type: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Salary</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.salary}
                    onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="text"
                    value={formData.phone_number}
                    onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Bank IBAN</label>
                  <input
                    type="text"
                    value={formData.bank_iban}
                    onChange={(e) => setFormData({ ...formData, bank_iban: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Bank Name</label>
                <input
                  type="text"
                  value={formData.bank_name}
                  onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                />
              </div>

              {!editingEmployee && (
                <>
                  <h3>Documents (Optional - Can be uploaded later)</h3>
                  <div className="documents-section">
                    <div className="form-row">
                      <div className="form-group">
                        <label>ID or Residency</label>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => handleDocumentChange('id_or_residency', e.target.files[0] || null)}
                        />
                        {documents.id_or_residency && <span className="file-name">✓ {documents.id_or_residency.name}</span>}
                      </div>
                      <div className="form-group">
                        <label>Employment Letter</label>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => handleDocumentChange('employment_letter', e.target.files[0] || null)}
                        />
                        {documents.employment_letter && <span className="file-name">✓ {documents.employment_letter.name}</span>}
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Bank IBAN Document</label>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => handleDocumentChange('bank_iban', e.target.files[0] || null)}
                        />
                        {documents.bank_iban && <span className="file-name">✓ {documents.bank_iban.name}</span>}
                      </div>
                      <div className="form-group">
                        <label>Primary Qualification</label>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => handleDocumentChange('primary_qualification', e.target.files[0] || null)}
                        />
                        {documents.primary_qualification && <span className="file-name">✓ {documents.primary_qualification.name}</span>}
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Employment Contract</label>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => handleDocumentChange('employment_contract', e.target.files[0] || null)}
                        />
                        {documents.employment_contract && <span className="file-name">✓ {documents.employment_contract.name}</span>}
                      </div>
                      <div className="form-group">
                        <label>Passport (for non-citizens)</label>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => handleDocumentChange('passport', e.target.files[0] || null)}
                        />
                        {documents.passport && <span className="file-name">✓ {documents.passport.name}</span>}
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Professional License (for schools)</label>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => handleDocumentChange('professional_license', e.target.files[0] || null)}
                        />
                        {documents.professional_license && <span className="file-name">✓ {documents.professional_license.name}</span>}
                      </div>
                      <div className="form-group">
                        <label>Experience Certificate</label>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => handleDocumentChange('experience_certificate', e.target.files[0] || null)}
                        />
                        {documents.experience_certificate && <span className="file-name">✓ {documents.experience_certificate.name}</span>}
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Classification Certificate</label>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => handleDocumentChange('classification', e.target.files[0] || null)}
                        />
                        {documents.classification && <span className="file-name">✓ {documents.classification.name}</span>}
                      </div>
                      <div className="form-group">
                        <label>Additional Courses</label>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => handleDocumentChange('additional_courses', e.target.files[0] || null)}
                        />
                        {documents.additional_courses && <span className="file-name">✓ {documents.additional_courses.name}</span>}
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Speech Therapy Course (70h)</label>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => handleDocumentChange('speech_therapy_course', e.target.files[0] || null)}
                        />
                        {documents.speech_therapy_course && <span className="file-name">✓ {documents.speech_therapy_course.name}</span>}
                      </div>
                      <div className="form-group">
                        <label>Physical Therapy Course (40h)</label>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => handleDocumentChange('physical_therapy_course', e.target.files[0] || null)}
                        />
                        {documents.physical_therapy_course && <span className="file-name">✓ {documents.physical_therapy_course.name}</span>}
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="form-actions">
                <button type="submit" className="btn-primary">Save</button>
                <button type="button" onClick={() => { setShowForm(false); resetForm(); setEditingEmployee(null); }} className="btn-secondary">
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
              <th>Name</th>
              <th>Occupation</th>
              <th>Nationality</th>
              <th>Branch</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center' }}>No employees found</td>
              </tr>
            ) : (
              employees.map((employee) => (
                <tr key={employee.id}>
                  <td>{employee.id}</td>
                  <td>{employee.employee_id_number}</td>
                  <td>{employee.first_name} {employee.second_name} {employee.third_name} {employee.fourth_name}</td>
                  <td>{employee.occupation}</td>
                  <td>{employee.nationality}</td>
                  <td>{employee.branch_id}</td>
                  <td>
                    <span className={`badge ${employee.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {employee.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button onClick={() => handleEdit(employee)} className="btn-sm btn-edit">Edit</button>
                    {isMainManager() && (
                      <button onClick={() => handleDelete(employee.id)} className="btn-sm btn-delete">Delete</button>
                    )}
                    {!isMainManager() && (
                      <span className="badge badge-info" style={{ fontSize: '11px', padding: '4px 8px', marginLeft: '5px' }}>
                        Limited Edit
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

export default Employees;

