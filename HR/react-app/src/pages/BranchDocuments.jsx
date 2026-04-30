/**
 * Branch Documents Page
 * Manage branch-level documents
 * Completely separate from employee documents
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { branchDocumentsAPI, branchesAPI, setDocumentBranchMapping } from '../utils/api';
import { downloadFile } from '../utils/downloadFile';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import BankSelect from '../components/BankSelect';
import UnifiedDatePicker from '../components/UnifiedDatePicker';
import BranchBadge from '../components/BranchBadge';
import { formatDate, hijriToGregorian, parseHijriString, gregorianToHijri } from '../utils/dateConverters';
import { RESTRICTED_DOCUMENT_TYPES } from '../utils/documentRestrictions';
import './BranchDocuments.css';
// TablePage.css is now loaded in App.jsx to prevent FOUC

const BranchDocuments = () => {
  const { isMainManager, user } = useAuth();
  const { showError, showSuccess, showWarning, showInfo } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const [documents, setDocuments] = useState([]);
  const [allDocuments, setAllDocuments] = useState([]); // Store all documents for filtering
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [documentAlert, setDocumentAlert] = useState(null); // Alert message for document type
  const [currentBranchId, setCurrentBranchId] = useState(null);
  const [uploadData, setUploadData] = useState({
    branch_id: '',
    document_type: '',
    description: '',
    document_number: '',
    issue_date: '',
    issue_date_hijri: '',
    expiry_date: '',
    expiry_date_hijri: '',
    iban_number: '',
    bank_name: '',
    file: null,
  });
  const [editData, setEditData] = useState({
    description: '',
    document_number: '',
    issue_date: '',
    issue_date_hijri: '',
    expiry_date: '',
    expiry_date_hijri: '',
    iban_number: '',
    bank_name: '',
    file: null,
  });

  const loadBranches = async () => {
    try {
      const filters = { is_active: true };

      // Branch managers only see their branch
      if (!isMainManager() && user?.branch_id) {
        filters.id = user.branch_id;
      }

      const response = await branchesAPI.getAll(filters);
      if (response.data.success) {
        setBranches(response.data.data || []);
        // Auto-set branch_id for branch managers
        if (!isMainManager() && user?.branch_id) {
          setUploadData(prev => ({ ...prev, branch_id: user.branch_id }));
          setCurrentBranchId(user.branch_id);
        }
      }
    } catch (error) {
      console.error('Error loading branches:', error);
      // Don't show alert for branch loading errors
    }
  };

  // Set current branch when URL changes (for main manager)
  useEffect(() => {
    if (isMainManager() && branches.length > 0) {
      const branchIdFromUrl = searchParams.get('branch_id');
      if (branchIdFromUrl) {
        const branchId = parseInt(branchIdFromUrl);
        setCurrentBranchId(branchId);
      } else {
        setCurrentBranchId(null);
      }
    }
  }, [searchParams, isMainManager, branches]);

  // Get current branch ID helper
  const getCurrentBranchId = useCallback(() => {
    return currentBranchId ||
      (!isMainManager() && user?.branch_id ? user.branch_id : null) ||
      (isMainManager() ? parseInt(searchParams.get('branch_id') || '0') || null : null);
  }, [currentBranchId, isMainManager, user, searchParams]);

  const loadDocuments = useCallback(async () => {
    // Safety check: Need a branch ID
    const branchIdForLoad = getCurrentBranchId();
    if (!branchIdForLoad) {
      return;
    }

    try {
      setLoading(true);
      const filters = {};

      // Handle branch filter from URL or user role
      filters.branch_id = branchIdForLoad;

      const response = await branchDocumentsAPI.getAll(filters);
      if (response.data.success) {
        const docs = response.data.data || [];
        setAllDocuments(docs);
        // Store document-to-branch mapping for API interceptor (metadata only)
        docs.forEach(doc => {
          if (doc.id && doc.branch_id) {
            setDocumentBranchMapping(doc.id, doc.branch_id);
          }
        });
      } else {
        // If API returns success: false, just set empty array, don't show alert
        setAllDocuments([]);
      }
    } catch (error) {
      console.error('Error loading branch documents:', error);
      // Only show alert if it's a real error (not just empty results)
      // Check if it's a network error or server error (status >= 400)
      if (error.response && error.response.status >= 400) {
        showError('فشل تحميل مستندات الفرع: ' + (error.response?.data?.message || error.message));
      }
      // Otherwise, just set empty array (might be no documents yet)
      setAllDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [searchParams, isMainManager, user, getCurrentBranchId]);

  useEffect(() => {
    if (user) {
      loadBranches();
    }
  }, [user]);

  // Handle URL parameters for filtering (from Dashboard links)
  useEffect(() => {
    const branchId = searchParams.get('branch_id');

    if (branchId) {
      setUploadData(prev => ({ ...prev, branch_id: branchId }));
    }
  }, [searchParams]);

  // Load documents when we have a branch ID
  useEffect(() => {
    const branchIdForLoad = getCurrentBranchId();
    if (user && branchIdForLoad) {
      loadDocuments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, getCurrentBranchId]);

  // Set all documents (no filtering needed since monthly documents are in separate page)
  useEffect(() => {
    setDocuments(allDocuments);
  }, [allDocuments]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Determine max file size based on document type
      const highCapacityDocs = ['operational_plan', 'acceptance_notifications'];
      const isHighCapacity = highCapacityDocs.includes(uploadData.document_type);
      const maxSize = (isHighCapacity ? 15 : 1) * 1024 * 1024;

      if (file.size > maxSize) {
        const sizeLimitMsg = isHighCapacity ? '15 ميجابايت' : '1 ميجابايت';
        showWarning(`حجم الملف كبير جداً. الحد الأقصى لحجم الملف هو ${sizeLimitMsg}.`);
        e.target.value = ''; // Clear the file input
        return;
      }
    }
    setUploadData({ ...uploadData, file });
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadData.file) {
      showWarning('الرجاء اختيار ملف');
      return;
    }

    // Re-validate file size before upload (in case document type changed)
    const highCapacityDocs = ['operational_plan', 'acceptance_notifications'];
    // Check both uploadData.document_type and fallback to 'other' logic if needed, but strict check is better
    const isHighCapacity = highCapacityDocs.includes(uploadData.document_type);
    const maxSize = (isHighCapacity ? 15 : 1) * 1024 * 1024;

    if (uploadData.file.size > maxSize) {
      const sizeLimitMsg = isHighCapacity ? '15 ميجابايت' : '1 ميجابايت';
      showWarning(`حجم الملف كبير جداً. الحد الأقصى لحجم الملف هو ${sizeLimitMsg}.`);
      return;
    }

    // Validate IBAN for IBAN file documents
    if (uploadData.document_type === 'iban_file') {
      if (!uploadData.iban_number || !uploadData.bank_name) {
        showWarning('رقم الآيبان واسم البنك مطلوبان لمستندات الآيبان');
        return;
      }

      // Validate IBAN format and bank match
      const cleanIban = uploadData.iban_number.replace(/\s/g, '').toUpperCase();
      if (cleanIban.length !== 24 || !cleanIban.startsWith('SA')) {
        showWarning('صيغة IBAN غير صحيحة. يجب أن يكون بالشكل: SAXX XXXX XXXX XXXX XXXX XXXX');
        return;
      }

      // Extract bank code from correct position (indices 4-5)
      // Structure: SA(0-1) Check(2-3) BankCode(4-5) Account(6-23)
      const bankCode = cleanIban.substring(4, 6);
      const banks = [
        { code: '10', nameAr: 'البنك الأهلي السعودي (SNB)', alternativeCodes: [] },
        { code: '80', nameAr: 'مصرف الراجحي', alternativeCodes: ['82'] },
        { code: '05', nameAr: 'مصرف الإنماء', alternativeCodes: [] },
        { code: '20', nameAr: 'بنك الرياض', alternativeCodes: [] },
        { code: '50', nameAr: 'البنك السعودي الأول (ساب)', alternativeCodes: [] },
        { code: '15', nameAr: 'بنك البلاد', alternativeCodes: [] },
        { code: '30', nameAr: 'البنك العربي الوطني', alternativeCodes: [] },
        { code: '45', nameAr: 'البنك السعودي الفرنسي', alternativeCodes: [] },
        { code: '60', nameAr: 'بنك الجزيرة', alternativeCodes: [] },
        { code: '55', nameAr: 'البنك السعودي للاستثمار', alternativeCodes: [] },
        { code: '90', nameAr: 'بنك الخليج الدولي (ميم)', alternativeCodes: [] },
        { code: '95', nameAr: 'بنك الإمارات دبي الوطني', alternativeCodes: [] },
        { code: '76', nameAr: 'بنك مسقط', alternativeCodes: [] },
        { code: '31', nameAr: 'بنك الكويت الوطني', alternativeCodes: [] },
      ];

      // Helper function to check if bank code matches (including alternative codes)
      const bankCodeMatches = (bank, code) => {
        if (bank.code === code) return true;
        if (bank.alternativeCodes && bank.alternativeCodes.includes(code)) return true;
        return false;
      };

      const ibanBank = banks.find(b => bankCodeMatches(b, bankCode));
      if (!ibanBank) {
        showWarning('كود البنك في IBAN غير معروف');
        return;
      }

      if (ibanBank.nameAr !== uploadData.bank_name) {
        showWarning(`IBAN لا يطابق البنك المختار. IBAN يخص: ${ibanBank.nameAr}`);
        return;
      }
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', uploadData.file);
      formData.append('branch_id', uploadData.branch_id);
      formData.append('document_type', uploadData.document_type);
      if (uploadData.description) formData.append('description', uploadData.description);

      // Check if document type requires default fields
      const selectedDocType = allBranchDocumentTypes.find(t => t.value === uploadData.document_type);
      const requiresDefaultFields = selectedDocType?.requiresDefaultFields !== false && uploadData.document_type !== 'iban_file';

      // Date fields only for documents that require default fields
      if (requiresDefaultFields) {
        if (uploadData.document_number) formData.append('document_number', uploadData.document_number);
        if (uploadData.issue_date) formData.append('issue_date', uploadData.issue_date);
        if (uploadData.issue_date_hijri) formData.append('issue_date_hijri', uploadData.issue_date_hijri);
        if (uploadData.expiry_date) formData.append('expiry_date', uploadData.expiry_date);
        if (uploadData.expiry_date_hijri) formData.append('expiry_date_hijri', uploadData.expiry_date_hijri);
      }

      // IBAN fields only for IBAN documents
      if (uploadData.document_type === 'iban_file') {
        if (uploadData.iban_number) formData.append('iban_number', uploadData.iban_number);
        if (uploadData.bank_name) formData.append('bank_name', uploadData.bank_name);
      }

      await branchDocumentsAPI.upload(formData);
      setShowUploadForm(false);
      setDocumentAlert(null);
      setUploadData({
        branch_id: !isMainManager() && user?.branch_id ? user.branch_id : '',
        document_type: '',
        description: '',
        document_number: '',
        issue_date: '',
        issue_date_hijri: '',
        expiry_date: '',
        expiry_date_hijri: '',
        iban_number: '',
        bank_name: '',
        file: null,
      });
      loadDocuments();
    } catch (error) {
      showError(error.response?.data?.message || 'فشل رفع المستند');
    } finally {
      setUploading(false);
    }
  };

  const handlePreview = async (document) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        showWarning('يرجى تسجيل الدخول مرة أخرى');
        return;
      }

      setPreviewLoading(document.id);
      setPreviewDocument(document);
      // Check if it's an image
      if (document.mime_type && document.mime_type.startsWith('image/')) {
        try {
          const response = await branchDocumentsAPI.download(document.id);
          if (response.data instanceof Blob) {
            const blobUrl = URL.createObjectURL(response.data);
            setPreviewUrl(blobUrl);
          } else {
            throw new Error('Invalid response format');
          }
        } catch (error) {
          console.error('Error loading image:', error);
          const errorMsg = error.response?.data?.message || error.message || 'فشل تحميل الصورة';
          showError(`فشل تحميل الصورة للمعاينة: ${errorMsg}`);
          setPreviewDocument(null);
          setPreviewLoading(null);
        } finally {
          setPreviewLoading(null);
        }
      } else if (document.mime_type === 'application/pdf') {
        try {
          const response = await branchDocumentsAPI.download(document.id);
          if (response.data instanceof Blob) {
            const blobUrl = URL.createObjectURL(response.data);
            const newWindow = window.open(blobUrl, '_blank');
            if (!newWindow) {
              showWarning('يرجى السماح للنافذة المنبثقة بفتح ملف PDF');
            }
          } else {
            throw new Error('Invalid response format');
          }
          setPreviewDocument(null);
        } catch (error) {
          console.error('Error opening PDF:', error);
          const errorMsg = error.response?.data?.message || error.message || 'فشل فتح ملف PDF';
          showError(`فشل فتح ملف PDF: ${errorMsg}`);
          setPreviewDocument(null);
          setPreviewLoading(null);
        } finally {
          setPreviewLoading(null);
        }
      } else {
        handleDownload(document.id, document.file_name);
        setPreviewDocument(null);
        setPreviewLoading(null);
      }
    } catch (error) {
      console.error('Error previewing document:', error);
      showError('فشل عرض المستند');
      setPreviewDocument(null);
      setPreviewLoading(null);
    }
  };

  const closePreview = () => {
    setPreviewDocument(null);
    setPreviewLoading(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  const handleDownload = async (id, fileName) => {
    try {
      setDownloading(id);
      const response = await branchDocumentsAPI.download(id);

      // Get filename from response headers
      const contentDisposition = response.headers['content-disposition'];
      let filename = fileName || `document_${id}`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
        if (filenameMatch) {
          filename = decodeURIComponent(filenameMatch[1].replace(/"/g, ''));
        }
      }

      if (response.data instanceof Blob) {
        downloadFile(response.data, filename);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Error downloading document:', error);
      const errorMsg = error.response?.data?.message || error.message || 'فشل تحميل المستند';
      showError(`فشل تحميل المستند: ${errorMsg}`);
    } finally {
      setDownloading(null);
    }
  };

  const handleEdit = (document) => {
    setEditingDocument(document);
    // Determine date type based on which date exists
    const issueDateType = document.issue_date_hijri ? 'hijri' : 'gregorian';
    const expiryDateType = document.expiry_date_hijri ? 'hijri' : 'gregorian';

    setEditData({
      description: document.description || '',
      document_number: document.document_number || '',
      issue_date: document.issue_date ? document.issue_date.split('T')[0] : '',
      issue_date_hijri: document.issue_date_hijri || '',
      expiry_date: document.expiry_date ? document.expiry_date.split('T')[0] : '',
      expiry_date_hijri: document.expiry_date_hijri || '',
      iban_number: document.iban_number || '',
      bank_name: document.bank_name || '',
      file: null,
    });
    setShowEditForm(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();

    // Validate IBAN for IBAN file documents
    if (editingDocument && editingDocument.document_type === 'iban_file') {
      if (!editData.iban_number || !editData.bank_name) {
        showWarning('رقم الآيبان واسم البنك مطلوبان لمستندات الآيبان');
        return;
      }

      // Validate IBAN format and bank match
      const cleanIban = editData.iban_number.replace(/\s/g, '').toUpperCase();
      if (cleanIban.length !== 24 || !cleanIban.startsWith('SA')) {
        showWarning('صيغة IBAN غير صحيحة. يجب أن يكون بالشكل: SAXX XXXX XXXX XXXX XXXX XXXX');
        return;
      }

      // Extract bank code from correct position (indices 4-5)
      // Structure: SA(0-1) Check(2-3) BankCode(4-5) Account(6-23)
      const bankCode = cleanIban.substring(4, 6);
      const banks = [
        { code: '10', nameAr: 'البنك الأهلي السعودي (SNB)', alternativeCodes: [] },
        { code: '80', nameAr: 'مصرف الراجحي', alternativeCodes: ['82'] },
        { code: '05', nameAr: 'مصرف الإنماء', alternativeCodes: [] },
        { code: '20', nameAr: 'بنك الرياض', alternativeCodes: [] },
        { code: '50', nameAr: 'البنك السعودي الأول (ساب)', alternativeCodes: [] },
        { code: '15', nameAr: 'بنك البلاد', alternativeCodes: [] },
        { code: '30', nameAr: 'البنك العربي الوطني', alternativeCodes: [] },
        { code: '45', nameAr: 'البنك السعودي الفرنسي', alternativeCodes: [] },
        { code: '60', nameAr: 'بنك الجزيرة', alternativeCodes: [] },
        { code: '55', nameAr: 'البنك السعودي للاستثمار', alternativeCodes: [] },
        { code: '90', nameAr: 'بنك الخليج الدولي (ميم)', alternativeCodes: [] },
        { code: '95', nameAr: 'بنك الإمارات دبي الوطني', alternativeCodes: [] },
        { code: '76', nameAr: 'بنك مسقط', alternativeCodes: [] },
        { code: '31', nameAr: 'بنك الكويت الوطني', alternativeCodes: [] },
      ];

      // Helper function to check if bank code matches (including alternative codes)
      const bankCodeMatches = (bank, code) => {
        if (bank.code === code) return true;
        if (bank.alternativeCodes && bank.alternativeCodes.includes(code)) return true;
        return false;
      };

      const ibanBank = banks.find(b => bankCodeMatches(b, bankCode));
      if (!ibanBank) {
        showWarning('كود البنك في IBAN غير معروف');
        return;
      }

      if (ibanBank.nameAr !== editData.bank_name) {
        showWarning(`IBAN لا يطابق البنك المختار. IBAN يخص: ${ibanBank.nameAr}`);
        return;
      }
    }

    try {
      if (editData.file) {
        // If file is provided, upload new file
        const formData = new FormData();
        formData.append('file', editData.file);
        if (editData.description) formData.append('description', editData.description);

        // Check if document type requires default fields
        const selectedDocType = allBranchDocumentTypes.find(t => t.value === editingDocument.document_type);
        const requiresDefaultFields = selectedDocType?.requiresDefaultFields !== false && editingDocument.document_type !== 'iban_file';

        // Date fields only for documents that require default fields
        if (requiresDefaultFields) {
          if (editData.document_number) formData.append('document_number', editData.document_number);
          if (editData.issue_date) formData.append('issue_date', editData.issue_date);
          if (editData.issue_date_hijri) formData.append('issue_date_hijri', editData.issue_date_hijri);
          if (editData.expiry_date) formData.append('expiry_date', editData.expiry_date);
          if (editData.expiry_date_hijri) formData.append('expiry_date_hijri', editData.expiry_date_hijri);
        }

        // IBAN fields only for IBAN documents
        if (editingDocument && editingDocument.document_type === 'iban_file') {
          if (editData.iban_number) formData.append('iban_number', editData.iban_number);
          if (editData.bank_name) formData.append('bank_name', editData.bank_name);
        }

        // Use PUT with FormData to replace the file
        await branchDocumentsAPI.updateWithFile(editingDocument.id, formData);
      } else {
        // Just update metadata
        const updatePayload = {
          description: editData.description
        };

        // Check if document type requires default fields
        const selectedDocType = allBranchDocumentTypes.find(t => t.value === editingDocument.document_type);
        const requiresDefaultFields = selectedDocType?.requiresDefaultFields !== false && editingDocument.document_type !== 'iban_file';

        // Date fields only for documents that require default fields
        if (requiresDefaultFields) {
          updatePayload.document_number = editData.document_number || null;
          updatePayload.issue_date = editData.issue_date || null;
          updatePayload.issue_date_hijri = editData.issue_date_hijri || null;
          updatePayload.expiry_date = editData.expiry_date || null;
          updatePayload.expiry_date_hijri = editData.expiry_date_hijri || null;
        }

        // IBAN fields only for IBAN documents
        if (editingDocument.document_type === 'iban_file') {
          updatePayload.iban_number = editData.iban_number || null;
          updatePayload.bank_name = editData.bank_name || null;
        }

        await branchDocumentsAPI.update(editingDocument.id, updatePayload);
      }

      setShowEditForm(false);
      setEditingDocument(null);
      setEditData({ description: '', document_number: '', issue_date: '', issue_date_hijri: '', expiry_date: '', expiry_date_hijri: '', iban_number: '', bank_name: '', file: null });
      loadDocuments();
      showSuccess('تم تحديث المستند بنجاح');
    } catch (error) {
      showError(error.response?.data?.message || 'فشل تحديث المستند');
    }
  };

  const handleFileChangeEdit = (e) => {
    const file = e.target.files[0] || null;
    if (file) {
      // Determine max file size based on document type
      const highCapacityDocs = ['operational_plan', 'acceptance_notifications'];
      const isHighCapacity = editingDocument && highCapacityDocs.includes(editingDocument.document_type);
      const maxSize = (isHighCapacity ? 15 : 1) * 1024 * 1024;

      if (file.size > maxSize) {
        const sizeLimitMsg = isHighCapacity ? '15 ميجابايت' : '1 ميجابايت';
        showWarning(`حجم الملف كبير جداً. الحد الأقصى لحجم الملف هو ${sizeLimitMsg}.`);
        e.target.value = ''; // Clear the file input
        return;
      }
    }
    setEditData({ ...editData, file });
  };

  const handleVerify = async (id) => {
    try {
      await branchDocumentsAPI.verify(id);
      loadDocuments();
    } catch (error) {
      showError('فشل التحقق من المستند');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('هل أنت متأكد من رغبتك في حذف هذا المستند؟')) return;
    try {
      await branchDocumentsAPI.delete(id);
      loadDocuments();
    } catch (error) {
      showError('فشل حذف المستند');
    }
  };

  // All document types (monthly documents are in separate page)
  const allBranchDocumentTypes = [
    // Required for all branches (per rules)
    { value: 'license', label: 'الترخيص', requiresDefaultFields: true, branchType: null },
    // Common documents (all branches)
    { value: 'registration', label: 'السجل التجاري', requiresDefaultFields: true, branchType: null },
    { value: 'iban_file', label: 'ملف الآيبان', requiresDefaultFields: false, branchType: null },
    // Common documents with default fields (all branches)
    { value: 'civil_defense_certificate', label: 'شهادة الدفاع المدني', requiresDefaultFields: true, branchType: null },
    { value: 'municipality_certificate', label: 'شهادة بلدي', requiresDefaultFields: true, branchType: null },
    // School and healthcare (same document)
    { value: 'insurance_statement', label: 'كشف التأمينات', requiresDefaultFields: true, branchType: null },
    // School/healthcare specific documents
    { value: 'rental_contract', label: 'عقد الايجار', requiresDefaultFields: true, branchType: null },
    { value: 'operational_plan', label: 'الخطة التشغلية للمركز', requiresDefaultFields: true, branchType: 'healthcare_center' },
    { value: 'owner_civil_id_copy', label: 'نسخه من هوية الاحوال الشخصية لمالك المركز', requiresDefaultFields: true, branchType: 'healthcare_center' },
    // Student-related documents for healthcare centers only (should appear in alerts)
    { value: 'student_cadre_file', label: 'بيانات الطلاب', requiresDefaultFields: false, branchType: 'healthcare_center' },
  ];

  // Get current branch type (memoized)
  // Use URL branch_id first, then currentBranchId, then user branch_id
  const currentBranchType = useMemo(() => {
    let branchId = null;

    // Priority: URL > currentBranchId (from password) > user branch_id
    const branchIdFromUrl = searchParams.get('branch_id');
    if (branchIdFromUrl) {
      branchId = parseInt(branchIdFromUrl);
    } else if (currentBranchId) {
      branchId = currentBranchId;
    } else if (!isMainManager() && user?.branch_id) {
      branchId = user.branch_id;
    }

    if (!branchId) return null;
    const branch = branches.find(b => b.id === branchId);
    return branch?.branch_type || null;
  }, [branches, currentBranchId, isMainManager, user, searchParams]);

  // Filter document types based on branch type (memoized)
  const branchDocumentTypes = useMemo(() => {
    let filtered = allBranchDocumentTypes.filter(type => {
      if (type.branchType) {
        return currentBranchType === type.branchType;
      }
      return true;
    });

    // Hide restricted types from branch managers
    if (!isMainManager()) {
      filtered = filtered.filter(type => !RESTRICTED_DOCUMENT_TYPES.includes(type.value));
    }

    return filtered;
  }, [currentBranchType, isMainManager]);

  // Get current branch (must be before early returns)
  const currentBranch = useMemo(() => {
    const branchId = getCurrentBranchId();
    if (!branchId) return null;
    return branches.find(b => b.id === branchId);
  }, [branches, currentBranchId, isMainManager, user, searchParams]);

  // Get document status for each document type (must be before early returns)
  const getDocumentStatus = useCallback((docType) => {
    if (!allDocuments || allDocuments.length === 0) {
      return { exists: false, document: null };
    }

    // Get branch ID from URL first, then currentBranchId, then user branch_id
    let branchId = null;
    const branchIdFromUrl = searchParams.get('branch_id');
    if (branchIdFromUrl) {
      branchId = parseInt(branchIdFromUrl);
    } else if (currentBranchId) {
      branchId = currentBranchId;
    } else if (!isMainManager() && user?.branch_id) {
      branchId = user.branch_id;
    }

    const normalizedType = docType === 'insurance_statement' ? ['insurance_statement', 'insurance_print'] : [docType];
    const doc = allDocuments.find(d =>
      normalizedType.includes(d.document_type) &&
      d.is_active !== false &&
      (!isMainManager() || d.branch_id === branchId)
    );
    return {
      exists: !!doc,
      document: doc || null
    };
  }, [allDocuments, isMainManager, currentBranchId, user, searchParams]);

  // Sort documents by priority: 1) Student/Cadre, 2) Others
  // NOTE: payroll_file removed - users enter payroll data in payroll absence system, not as file upload
  const sortDocumentCardsByPriority = useCallback((cards) => {
    const monthlyTypes = [];
    const studentCadreTypes = ['student_cadre_file'];

    return [...cards].sort((a, b) => {
      const aType = a.value;
      const bType = b.value;

      // Monthly documents first (highest priority)
      const aIsMonthly = monthlyTypes.includes(aType);
      const bIsMonthly = monthlyTypes.includes(bType);
      if (aIsMonthly && !bIsMonthly) return -1;
      if (!aIsMonthly && bIsMonthly) return 1;

      // Student/Cadre documents second (only student_cadre_file remains)
      const studentCadreTypes = ['student_cadre_file'];
      const aIsStudentCadre = studentCadreTypes.includes(aType);
      const bIsStudentCadre = studentCadreTypes.includes(bType);
      if (aIsStudentCadre && !bIsStudentCadre) return -1;
      if (!aIsStudentCadre && bIsStudentCadre) return 1;

      // Others last
      return 0;
    });
  }, []);

  // Prepare document cards data (must be before early returns)
  const documentCards = useMemo(() => {
    if (!currentBranchType) return [];

    const cards = branchDocumentTypes.map(docType => {
      const status = getDocumentStatus(docType.value);
      return {
        ...docType,
        exists: status.exists,
        document: status.document
      };
    });

    // Sort by priority
    return sortDocumentCardsByPriority(cards);
  }, [branchDocumentTypes, currentBranchType, getDocumentStatus, sortDocumentCardsByPriority]);

  // For main managers: show message if no branch selected
  if (isMainManager() && !searchParams.get('branch_id') && branches.length > 0) {
    return (
      <div className="table-page">
        <div className="page-header">
          <h1>مستندات الفروع</h1>
        </div>
        <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
          الرجاء اختيار فرع لعرض مستنداته
        </div>
      </div>
    );
  }

  // Show loading states
  if (loading || (branches.length === 0 && user)) {
    return <div className="loading">جاري التحميل...</div>;
  }

  const handleOpenUploadForm = (documentType = '') => {
    // Auto-select document type based on URL parameter
    const documentTypeFromUrl = searchParams.get('document_type');
    let selectedDocumentType = documentType || documentTypeFromUrl || '';

    // Get branch_id from URL or user's branch
    const branchIdFromUrl = searchParams.get('branch_id');
    let branchId = '';
    if (branchIdFromUrl) {
      branchId = branchIdFromUrl;
    } else if (!isMainManager() && user?.branch_id) {
      branchId = user.branch_id;
    }

    if (isMainManager() && !branchId) {
      showError('اختر الفرع أولاً قبل رفع المستند');
      return;
    }

    if (!currentBranchType) {
      showError('نوع الفرع غير معروف. يرجى اختيار فرع صالح ثم إعادة المحاولة');
      return;
    }

    // Show alerts for specific document types
    setDocumentAlert(null);
    if (selectedDocumentType) {
      const selectedDocType = allBranchDocumentTypes.find(t => t.value === selectedDocumentType);
      if (selectedDocType?.hasAlert) {
        if (selectedDocumentType === 'student_cadre_file' || selectedDocumentType === 'dropped_students') {
          setDocumentAlert({
            type: 'info',
            message: 'تنبيه: يجب أن يحتوي المستند على:\n- أرقام جوالات أولياء الأمور\n- المواصلات\n- الخدمات المقدمة لهم'
          });
        } else if (selectedDocumentType === 'free_seats') {
          setDocumentAlert({
            type: 'info',
            message: 'تنبيه: يجب أن يحتوي المستند على:\n- عدد المقاعد\n- الفصل الدراسي\n- السنة الدراسية'
          });
        } else if (selectedDocumentType === 'acceptance_notifications') {
          setDocumentAlert({
            type: 'info',
            message: 'تنبيه: يجب أن يكون ترتيب أسماء الطلاب في هذا الملف نفس ترتيب أسماء الطلاب في مستند بيانات الطلاب'
          });
        }
      }
    }

    setUploadData({
      branch_id: branchId,
      document_type: selectedDocumentType,
      description: '',
      document_number: '',
      issue_date: '',
      expiry_date: '',
      iban_number: '',
      bank_name: '',
      file: null,
    });
    setShowUploadForm(true);

    // Smooth scroll to upload form section after a brief delay to ensure DOM update
    setTimeout(() => {
      const uploadSection = document.getElementById('upload-form-section');
      if (uploadSection) {
        // Calculate offset to account for any fixed headers
        const headerOffset = 80;
        const elementPosition = uploadSection.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    }, 150);
  };

  return (
    <div className="table-page">
      <div className="page-header">
        <h1>{isMainManager() ? 'مستندات الفروع' : 'مستندات الفرع'}</h1>
      </div>

      {/* Branch Info */}
      {currentBranch && (
        <div className="branch-info-card" style={{
          background: 'var(--bg)',
          padding: '1rem 1.5rem',
          borderRadius: 'var(--radius-xl)',
          marginBottom: '1.5rem',
          boxShadow: 'var(--shadow-sm)',
          border: '1px solid var(--border-light)'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text)' }}>
            {currentBranch.branch_name}
          </h2>
          <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            نوع الفرع: {currentBranch.branch_type === 'school' ? 'مدرسة' : 'مركز رعاية نهارية'}
          </p>
        </div>
      )}

      {/* Document Cards Grid */}
      <div className="document-cards-container">
        <h2 style={{
          marginBottom: '1.5rem',
          fontSize: '1.5rem',
          color: 'var(--text)',
          fontWeight: 600
        }}>
          مستندات الفرع
        </h2>
        {documentCards.length === 0 ? (
          <div className="no-data" style={{
            textAlign: 'center',
            padding: '3rem',
            color: 'var(--text-secondary)'
          }}>
            لا توجد مستندات مطلوبة لهذا النوع من الفروع
          </div>
        ) : (
          <div className="document-cards-grid">
            {documentCards.map((card) => {
              const docType = allBranchDocumentTypes.find(dt => dt.value === card.value);

              // Check if document is expired
              const isExpired = card.exists && card.document?.expiry_date ? (() => {
                try {
                  const expiryDate = new Date(card.document.expiry_date);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  expiryDate.setHours(0, 0, 0, 0);
                  return expiryDate < today;
                } catch (e) {
                  return false;
                }
              })() : false;

              return (
                <div
                  key={card.value}
                  className={`document-card ${card.exists ? 'document-exists' : 'document-missing'} ${isExpired ? 'document-expired' : ''}`}
                >
                  <div className="document-card-header">
                    <div className="document-card-icon">
                      {card.exists ? (
                        <span className="status-icon exists">✓</span>
                      ) : (
                        <span className="status-icon missing">✗</span>
                      )}
                    </div>
                    <h3 className="document-card-title">{card.label}</h3>
                  </div>

                  <div className="document-card-body">
                    {card.exists && card.document ? (
                      <div className="document-info">
                        <div className="document-info-item">
                          <span className="info-label">اسم الملف:</span>
                          <span className="info-value">{card.document.file_name}</span>
                        </div>
                        <div className="document-info-item">
                          <span className="info-label">تاريخ الرفع:</span>
                          <span className="info-value">
                            {formatDate(card.document.uploaded_at)}
                          </span>
                        </div>
                        {/* Expiry date display */}
                        {(card.document.expiry_date || card.document.expiry_date_hijri) && (
                          <div className="document-info-item">
                            <span className="info-label">تاريخ الانتهاء:</span>
                            <span className="info-value">
                              {card.document.expiry_date && formatDate(card.document.expiry_date)}
                              {card.document.expiry_date && card.document.expiry_date_hijri && ' / '}
                              {card.document.expiry_date_hijri && (
                                <span>
                                  {card.document.expiry_date_hijri} هجري
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="document-missing-message">
                        <p>المستند غير موجود</p>
                      </div>
                    )}
                  </div>

                  <div className="document-card-actions">
                    {card.exists && card.document ? (
                      <>
                        <button
                          onClick={() => handleEdit(card.document)}
                          className="btn-card btn-update"
                        >
                          <img src="https://img.icons8.com/material-rounded/24/edit.png" alt="تحديث" style={{ width: '16px', height: '16px', marginLeft: '5px' }} />
                          تحديث
                        </button>
                        {card.document.mime_type && (card.document.mime_type.startsWith('image/') || card.document.mime_type === 'application/pdf') && (
                          <button
                            onClick={() => handlePreview(card.document)}
                            className="btn-card btn-preview"
                            disabled={previewLoading === card.document.id}
                          >
                            {previewLoading === card.document.id ? (
                              <span className="spinner" style={{ display: 'inline-block', width: '12px', height: '12px', marginLeft: '5px' }}></span>
                            ) : (
                              <img src="https://img.icons8.com/?size=24&id=85028&format=png&color=000000" alt="معاينة" style={{ width: '16px', height: '16px', marginLeft: '5px' }} />
                            )}
                            معاينة
                          </button>
                        )}
                        <button
                          onClick={() => handleDownload(card.document.id, card.document.file_name)}
                          className="btn-card btn-download"
                          disabled={downloading === card.document.id}
                        >
                          {downloading === card.document.id ? (
                            <span className="spinner" style={{ display: 'inline-block', width: '12px', height: '12px', marginLeft: '5px' }}></span>
                          ) : (
                            <img src="https://img.icons8.com/material-rounded/24/download--v1.png" alt="تحميل" style={{ width: '16px', height: '16px', marginLeft: '5px' }} />
                          )}
                          تحميل
                        </button>
                        {(isMainManager() || (user?.branch_id === card.document.branch_id)) && (
                          <button
                            onClick={() => handleDelete(card.document.id)}
                            className="btn-card btn-delete"
                          >
                            <img src="https://img.icons8.com/material-rounded/24/trash.png" alt="حذف" style={{ width: '16px', height: '16px', marginLeft: '5px' }} />
                            حذف
                          </button>
                        )}
                        {isMainManager() && !card.document.is_verified && (
                          <button
                            onClick={() => handleVerify(card.document.id)}
                            className="btn-card btn-verify"
                          >
                            ✓ التحقق
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={() => handleOpenUploadForm(card.value)}
                        className="btn-card btn-upload"
                      >
                        <img src="https://img.icons8.com/material-rounded/24/upload.png" alt="رفع" style={{ width: '16px', height: '16px', marginLeft: '5px' }} />
                        رفع المستند
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upload Form - Expandable Section */}
      {showUploadForm && (
        <div id="upload-form-section" className="upload-form-expanding-section">
          <div className="upload-form-section-header">
            <h2>رفع مستند فرع</h2>
            <button
              type="button"
              className="section-close"
              onClick={() => {
                setShowUploadForm(false);
                setUploadData({
                  branch_id: !isMainManager() && user?.branch_id ? user.branch_id : '',
                  document_type: '',
                  description: '',
                  document_number: '',
                  issue_date: '',
                  issue_date_hijri: '',
                  expiry_date: '',
                  expiry_date_hijri: '',
                  iban_number: '',
                  bank_name: '',
                  file: null,
                });
                setDocumentAlert(null);
              }}
            >
              ×
            </button>
          </div>
          <div className="upload-form-section-content">
            <form onSubmit={handleUpload}>
              {isMainManager() && (
                <div className="form-group">
                  <label>الفرع *</label>
                  <select
                    value={uploadData.branch_id}
                    onChange={(e) => setUploadData({ ...uploadData, branch_id: e.target.value })}
                    required
                  >
                    <option value="">اختر الفرع</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>
                        {branch.branch_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {!isMainManager() && user?.branch_id && (
                <div className="form-group">
                  <label>الفرع</label>
                  <input
                    type="text"
                    value={branches.find(b => b.id === user.branch_id)?.branch_name || 'فرعك'}
                    disabled
                    style={{ background: '#f0f0f0', cursor: 'not-allowed' }}
                  />
                </div>
              )}
              <div className="form-group">
                <label>نوع المستند *</label>
                <select
                  value={uploadData.document_type}
                  onChange={(e) => {
                    const selectedType = e.target.value;
                    setUploadData({ ...uploadData, document_type: selectedType });

                    // Show alerts for specific document types
                    const selectedDocType = allBranchDocumentTypes.find(t => t.value === selectedType);
                    if (selectedDocType?.hasAlert) {
                      if (selectedType === 'student_cadre_file' || selectedType === 'dropped_students') {
                        setDocumentAlert({
                          type: 'info',
                          message: 'تنبيه: يجب أن يحتوي المستند على:\n- أرقام جوالات أولياء الأمور\n- المواصلات\n- الخدمات المقدمة لهم'
                        });
                      } else if (selectedType === 'free_seats') {
                        setDocumentAlert({
                          type: 'info',
                          message: 'تنبيه: يجب أن يحتوي المستند على:\n- عدد المقاعد\n- الفصل الدراسي\n- السنة الدراسية'
                        });
                      } else if (selectedType === 'acceptance_notifications') {
                        setDocumentAlert({
                          type: 'info',
                          message: 'تنبيه: يجب أن يكون ترتيب أسماء الطلاب في هذا الملف نفس ترتيب أسماء الطلاب في مستند بيانات الطلاب'
                        });
                      }
                    } else {
                      setDocumentAlert(null);
                    }
                  }}
                  required
                >
                  <option value="">اختر النوع</option>
                  {branchDocumentTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                {/* Document type alert */}
                {documentAlert && (
                  <div className="document-alert" style={{
                    marginTop: '10px',
                    padding: '12px',
                    backgroundColor: '#e3f2fd',
                    border: '1px solid var(--primary)',
                    borderRadius: '4px',
                    color: '#1565c0',
                    fontSize: '14px',
                    whiteSpace: 'pre-line',
                    lineHeight: '1.6'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span>{documentAlert.message}</span>
                      <button
                        onClick={() => setDocumentAlert(null)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#1565c0',
                          cursor: 'pointer',
                          fontSize: '18px',
                          padding: '0 5px',
                          marginLeft: '10px'
                        }}
                        type="button"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>الملف * (PDF, JPG, PNG - الحد الأقصى 15 ميجابايت)</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                  required
                />
              </div>
              {/* Date fields - shown for documents that require default fields, hidden for IBAN and file-only documents */}
              {(() => {
                const selectedDocType = allBranchDocumentTypes.find(t => t.value === uploadData.document_type);
                const requiresDefaultFields = selectedDocType?.requiresDefaultFields !== false && uploadData.document_type !== 'iban_file';
                return requiresDefaultFields ? (
                  <>
                    <div className="form-group">
                      <label>رقم المستند</label>
                      <input
                        type="text"
                        value={uploadData.document_number}
                        onChange={(e) => setUploadData({ ...uploadData, document_number: e.target.value })}
                        placeholder="رقم المستند"
                      />
                    </div>
                    <div className="form-group">
                      <UnifiedDatePicker
                        label="تاريخ الإصدار"
                        hijriValue={uploadData.issue_date_hijri}
                        gregorianValue={uploadData.issue_date}
                        onChange={(hijri, gregorian) => {
                          setUploadData({ ...uploadData, issue_date_hijri: hijri, issue_date: gregorian });
                        }}
                        dateType="general"
                      />
                    </div>
                    <div className="form-group">
                      <UnifiedDatePicker
                        label="تاريخ الانتهاء"
                        hijriValue={uploadData.expiry_date_hijri}
                        gregorianValue={uploadData.expiry_date}
                        onChange={(hijri, gregorian) => {
                          setUploadData({ ...uploadData, expiry_date_hijri: hijri, expiry_date: gregorian });
                        }}
                        dateType="expiry_date"
                      />
                    </div>
                  </>
                ) : null;
              })()}
              {/* IBAN fields - only for IBAN file document type */}
              {uploadData.document_type === 'iban_file' && (
                <div className="form-group">
                  <BankSelect
                    label="البنك"
                    value={uploadData.bank_name}
                    onChange={(value) => setUploadData({ ...uploadData, bank_name: value })}
                    ibanValue={uploadData.iban_number}
                    onIbanChange={(value) => setUploadData({ ...uploadData, iban_number: value })}
                    required={true}
                  />
                </div>
              )}
              <div className="form-group">
                <label>الوصف</label>
                <textarea
                  value={uploadData.description}
                  onChange={(e) => setUploadData({ ...uploadData, description: e.target.value })}
                  rows="3"
                />
              </div>
              <div className="upload-form-actions">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <span className="spinner" style={{ display: 'inline-block', marginLeft: '8px' }}></span>
                      جاري الرفع...
                    </>
                  ) : 'رفع'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowUploadForm(false);
                    setUploadData({
                      branch_id: !isMainManager() && user?.branch_id ? user.branch_id : '',
                      document_type: '',
                      description: '',
                      document_number: '',
                      issue_date: '',
                      issue_date_hijri: '',
                      expiry_date: '',
                      expiry_date_hijri: '',
                      iban_number: '',
                      bank_name: '',
                      file: null,
                    });
                    setDocumentAlert(null);
                  }}
                  className="btn-secondary"
                  disabled={uploading}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Edit Document Modal */}
      {showEditForm && editingDocument && (
        <div className="modal">
          <div className="modal-content">
            <h2>تعديل المستند</h2>
            <form onSubmit={handleUpdate}>
              <div className="form-group">
                <label>الملف الحالي</label>
                <input
                  type="text"
                  value={editingDocument.file_name}
                  disabled
                  style={{ background: '#f0f0f0', cursor: 'not-allowed' }}
                />
              </div>
              <div className="form-group">
                <label>رفع ملف جديد (اختياري)</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileChangeEdit}
                />
                {editData.file && (
                  <span className="file-name" style={{ fontSize: '12px', color: '#4CAF50', display: 'block', marginTop: '5px' }}>
                    ✓ {editData.file.name}
                  </span>
                )}
              </div>
              {/* Date fields - hidden for IBAN file documents */}
              {editingDocument && editingDocument.document_type !== 'iban_file' && (
                <>
                  <div className="form-group">
                    <label>رقم المستند</label>
                    <input
                      type="text"
                      value={editData.document_number}
                      onChange={(e) => setEditData({ ...editData, document_number: e.target.value })}
                      placeholder="رقم المستند"
                    />
                  </div>
                  <div className="form-group">
                    <UnifiedDatePicker
                      label="تاريخ الإصدار"
                      hijriValue={editData.issue_date_hijri}
                      gregorianValue={editData.issue_date}
                      onChange={(hijri, gregorian) => {
                        setEditData({ ...editData, issue_date_hijri: hijri, issue_date: gregorian });
                      }}
                      dateType="general"
                    />
                  </div>
                  <div className="form-group">
                    <UnifiedDatePicker
                      label="تاريخ الانتهاء"
                      hijriValue={editData.expiry_date_hijri}
                      gregorianValue={editData.expiry_date}
                      onChange={(hijri, gregorian) => {
                        setEditData({ ...editData, expiry_date_hijri: hijri, expiry_date: gregorian });
                      }}
                      dateType="expiry_date"
                    />
                  </div>
                </>
              )}
              {/* IBAN fields - only for IBAN file document type */}
              {editingDocument && editingDocument.document_type === 'iban_file' && (
                <div className="form-group">
                  <BankSelect
                    label="البنك"
                    value={editData.bank_name}
                    onChange={(value) => setEditData({ ...editData, bank_name: value })}
                    ibanValue={editData.iban_number}
                    onIbanChange={(value) => setEditData({ ...editData, iban_number: value })}
                    required={true}
                  />
                </div>
              )}
              <div className="form-group">
                <label>الوصف</label>
                <textarea
                  value={editData.description}
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  rows="3"
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary">حفظ</button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditForm(false);
                    setEditingDocument(null);
                    setEditData({ description: '', document_number: '', issue_date: '', expiry_date: '', file: null });
                  }}
                  className="btn-secondary"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewDocument && previewUrl && previewDocument.mime_type && previewDocument.mime_type.startsWith('image/') && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}
          onClick={closePreview}
        >
          <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%' }}>
            <button
              onClick={closePreview}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0',
                background: 'none',
                border: 'none',
                color: 'white',
                fontSize: '32px',
                cursor: 'pointer',
                zIndex: 2001
              }}
            >
              ×
            </button>
            <img
              src={previewUrl}
              alt={previewDocument.file_name}
              style={{
                maxWidth: '100%',
                maxHeight: '90vh',
                objectFit: 'contain'
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default BranchDocuments;

