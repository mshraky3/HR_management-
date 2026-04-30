/**
 * Branch Documents Management Page
 * Document-centric view showing which documents exist/missing for each branch
 * Quick upload for missing documents
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  branchDocumentsAPI,
  branchesAPI,
  clearCache,
} from "../utils/api";
import { API_URL } from "../config/api";
import { useAuth } from "../contexts/AuthContext";
import { useNotification } from "../contexts/NotificationContext";
import BranchBadge from "../components/BranchBadge";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import BankSelect from "../components/BankSelect";
import { formatDate } from "../utils/dateConverters";
import {
  getRequiredBranchDocuments,
  getMonthlyRequiredBranchDocuments,
} from "../utils/employeeHelpers";
import { RESTRICTED_DOCUMENT_TYPES } from "../utils/documentRestrictions";
import { downloadFile } from "../utils/downloadFile";
import "./BranchDocumentsManagement.css";

const BranchDocumentsManagement = () => {
  const { isMainManager, isBranchOperationsManager, user } = useAuth();
  const { showError, showSuccess } = useNotification();
  const [searchParams] = useSearchParams();
  const isBranchOpsUser = isBranchOperationsManager();
  const assignedBranchIds = useMemo(
    () =>
      Array.isArray(user?.assigned_branches)
        ? user.assigned_branches.map((id) => parseInt(id, 10)).filter(Number.isFinite)
        : [],
    [user?.assigned_branches],
  );

  const [branches, setBranches] = useState([]);
  const [allDocuments, setAllDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Modals and forms
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);

  // Upload/Edit form data
  const [formData, setFormData] = useState({
    branch_id: "",
    document_type: "",
    description: "",
    document_number: "",
    issue_date: "",
    issue_date_hijri: "",
    expiry_date: "",
    expiry_date_hijri: "",
    iban_number: "",
    bank_name: "",
    file: null,
  });

  // Filters
  const [selectedBranchFilter, setSelectedBranchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState(""); // 'all', 'missing', 'existing'
  const [searchText, setSearchText] = useState("");
  const [documentTypeFilter, setDocumentTypeFilter] = useState("");

  // Search inputs for filtering dropdown options
  const [branchSearch, setBranchSearch] = useState("");
  const [documentTypeSearch, setDocumentTypeSearch] = useState("");
  const [statusSearch, setStatusSearch] = useState("");

  // PDF Generation filters
  const [pdfDocTypeFilter, setPdfDocTypeFilter] = useState("");
  const [pdfBranchFilter, setPdfBranchFilter] = useState("");
  const [pdfSelectedDocType, setPdfSelectedDocType] = useState("");
  const [pdfSelectedBranch, setPdfSelectedBranch] = useState("");

  // PDF Generation loading state
  const [pdfGenerating, setPdfGenerating] = useState(false);

  // PDF Generation dropdown state
  const [isPdfDocTypeDropdownOpen, setIsPdfDocTypeDropdownOpen] =
    useState(false);
  const [isPdfBranchDropdownOpen, setIsPdfBranchDropdownOpen] = useState(false);

  // Dropdown refs and state
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [isDocumentTypeDropdownOpen, setIsDocumentTypeDropdownOpen] =
    useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const branchDropdownRef = useRef(null);
  const documentTypeDropdownRef = useRef(null);
  const statusDropdownRef = useRef(null);
  const pdfDocTypeDropdownRef = useRef(null);
  const pdfBranchDropdownRef = useRef(null);

  // Expanded/collapsed state for document cards (default: all collapsed)
  const [expandedCards, setExpandedCards] = useState(new Set());

  // Document type labels
  const documentTypeLabels = {
    license: "الترخيص",
    permit: "التصريح",
    insurance: "التأمين",
    insurance_print: "كشف التأمينات",
    contract: "العقد",
    rental_contract: "عقد الايجار",
    registration: "السجل التجاري",
    security_contract: "عقد الامن والسلامة",
    civil_defense_certificate: "شهادة الدفاع المدني",
    municipality_certificate: "شهادة بلدي",
    insurance_certificate: "شهادة التامينات",
    insurance_statement: "كشف التأمينات",
    operational_plan: "الخطة التشغلية",
    owner_civil_id_copy: "نسخة هوية المالك",
    disclosure_commitment: "إفصاح وتعهد",
    certification_commitment_form: "نموذج تصديق وتعاقد",
    financial_platform_declaration: "ملف إقرار المنصة المالية",
    financial_claim_form: "نموذج مطالبة مالية",
    student_cadre_file: "بيانات الطلاب",
    dropped_students: "الطلاب المنقطعين",
    free_seats: "المقاعد المتاحة",
    acceptance_notifications: "إشعارات القبول",
    // NOTE: payroll_file removed - users enter payroll data directly in payroll absence system, not as file upload
  };

  // Filtered document type labels for modals (exclude restricted types for branch managers)
  const filteredDocumentTypeLabels = useMemo(() => {
    if (isMainManager()) {
      return documentTypeLabels;
    }
    const filtered = { ...documentTypeLabels };
    RESTRICTED_DOCUMENT_TYPES.forEach((type) => {
      delete filtered[type];
    });
    return filtered;
  }, [isMainManager]);

  // Get selected branch name for display
  const selectedBranchName = useMemo(() => {
    if (isBranchDropdownOpen && branchSearch) {
      return branchSearch;
    }
    if (selectedBranchFilter) {
      const branch = branches.find(
        (b) => b.id === parseInt(selectedBranchFilter),
      );
      return branch?.branch_name || "";
    }
    return branchSearch;
  }, [selectedBranchFilter, branches, branchSearch, isBranchDropdownOpen]);

  // Get selected document type name for display
  // Get selected PDF document type name for display
  const pdfSelectedDocTypeName = useMemo(() => {
    if (isPdfDocTypeDropdownOpen && pdfDocTypeFilter) {
      return pdfDocTypeFilter;
    }
    if (pdfSelectedDocType) {
      return documentTypeLabels[pdfSelectedDocType] || pdfSelectedDocType;
    }
    return pdfDocTypeFilter;
  }, [
    pdfSelectedDocType,
    pdfDocTypeFilter,
    isPdfDocTypeDropdownOpen,
    documentTypeLabels,
  ]);

  // Get selected PDF branch name for display
  const pdfSelectedBranchName = useMemo(() => {
    if (isPdfBranchDropdownOpen && pdfBranchFilter) {
      return pdfBranchFilter;
    }
    if (pdfSelectedBranch) {
      const branch = branches.find((b) => b.id === parseInt(pdfSelectedBranch));
      return branch?.branch_name || "";
    }
    return pdfBranchFilter;
  }, [pdfSelectedBranch, branches, pdfBranchFilter, isPdfBranchDropdownOpen]);

  const selectedDocumentTypeName = useMemo(() => {
    if (isDocumentTypeDropdownOpen && documentTypeSearch) {
      return documentTypeSearch;
    }
    if (documentTypeFilter) {
      return documentTypeLabels[documentTypeFilter] || documentTypeFilter;
    }
    return documentTypeSearch;
  }, [
    documentTypeFilter,
    documentTypeSearch,
    isDocumentTypeDropdownOpen,
    documentTypeLabels,
  ]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        branchDropdownRef.current &&
        !branchDropdownRef.current.contains(event.target)
      ) {
        setIsBranchDropdownOpen(false);
      }
      if (
        documentTypeDropdownRef.current &&
        !documentTypeDropdownRef.current.contains(event.target)
      ) {
        setIsDocumentTypeDropdownOpen(false);
      }
      if (
        statusDropdownRef.current &&
        !statusDropdownRef.current.contains(event.target)
      ) {
        setIsStatusDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Click outside handler for PDF dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        pdfDocTypeDropdownRef.current &&
        !pdfDocTypeDropdownRef.current.contains(event.target)
      ) {
        setIsPdfDocTypeDropdownOpen(false);
      }
      if (
        pdfBranchDropdownRef.current &&
        !pdfBranchDropdownRef.current.contains(event.target)
      ) {
        setIsPdfBranchDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Load branches and documents
  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    if (branches.length > 0) {
      loadAllDocuments();
    }
  }, [branches]);

  useEffect(() => {
    const branchIdFromUrl = searchParams.get("branch_id");
    if (!branchIdFromUrl) return;

    if (branches.some((branch) => String(branch.id) === String(branchIdFromUrl))) {
      setSelectedBranchFilter(String(branchIdFromUrl));
    }
  }, [branches, searchParams]);

  const loadBranches = async () => {
    try {
      setLoading(true);
      const filters = { is_active: true };

      if (!isMainManager() && !isBranchOpsUser && user?.branch_id) {
        filters.id = user.branch_id;
      }

      const response = await branchesAPI.getAll(filters);
      if (response.data.success) {
        const nextBranches = isBranchOpsUser
          ? (response.data.data || []).filter((branch) =>
            assignedBranchIds.includes(parseInt(branch.id, 10)),
          )
          : response.data.data || [];

        setBranches(nextBranches);

        if (!isMainManager() && !isBranchOpsUser && user?.branch_id) {
          setFormData((prev) => ({ ...prev, branch_id: user.branch_id }));
        } else if (isBranchOpsUser && nextBranches.length === 1) {
          setFormData((prev) => ({
            ...prev,
            branch_id: prev.branch_id || String(nextBranches[0].id),
          }));
        }
      }
    } catch (error) {
      showError("فشل تحميل الفروع");
    } finally {
      setLoading(false);
    }
  };

  const loadAllDocuments = async () => {
    try {
      setDocumentsLoading(true);
      const allDocs = [];

      // For main managers, load documents without password (backend allows it)
      // For branch managers, only load for their branch (password will be handled by API interceptor)
      const branchesToLoad = isMainManager()
        ? branches
        : isBranchOpsUser
          ? branches.filter((branch) =>
            assignedBranchIds.includes(parseInt(branch.id, 10)),
          )
          : branches.filter((b) => b.id === user?.branch_id);

      // Load documents for branches in parallel for faster UX
      const results = await Promise.allSettled(
        branchesToLoad.map((branch) =>
          branchDocumentsAPI.getAll({ branch_id: branch.id }),
        ),
      );

      results.forEach((result, index) => {
        const branch = branchesToLoad[index];
        if (result.status === "fulfilled") {
          const response = result.value;
          if (response.data.success && response.data.data) {
            allDocs.push(...response.data.data);
          }
        } else {
          const error = result.reason;
          if (
            error?.response?.status !== 401 &&
            error?.response?.status !== 403
          ) {
            console.warn(
              `Failed to load documents for branch ${branch?.id}:`,
              error,
            );
          }
        }
      });

      setAllDocuments(allDocs);
    } catch (error) {
      // Don't show error if it's just missing documents (empty list is valid)
      if (error.response?.status !== 401 && error.response?.status !== 403) {
        showError("فشل تحميل المستندات");
      }
    } finally {
      setDocumentsLoading(false);
    }
  };

  // Calculate document status for each branch
  const documentStatus = useMemo(() => {
    const status = {};
    const monthlyTypes = getMonthlyRequiredBranchDocuments();

    branches.forEach((branch) => {
      const requiredDocs = getRequiredBranchDocuments(branch.branch_type);
      // Filter out monthly documents
      const nonMonthlyRequired = requiredDocs.filter(
        (docType) => !monthlyTypes.includes(docType),
      );

      status[branch.id] = {};

      nonMonthlyRequired.forEach((docType) => {
        // IMPORTANT: Match the same logic as Dashboard.jsx
        // Document must be active AND have a stored file reference (file_path is the main one for branch docs)
        const existingDocs = allDocuments.filter(
          (doc) =>
            doc.branch_id === branch.id &&
            doc.document_type === docType &&
            doc.is_active !== false &&
            (doc.file_path || doc.file_url || doc.blob_url),
        );

        status[branch.id][docType] = {
          exists: existingDocs.length > 0,
          documents: existingDocs,
          count: existingDocs.length,
        };
      });
    });

    return status;
  }, [branches, allDocuments]);

  const requiredDocsByBranch = useMemo(() => {
    const map = {};
    const monthlyTypes = getMonthlyRequiredBranchDocuments();

    branches.forEach((branch) => {
      const requiredDocs = getRequiredBranchDocuments(branch.branch_type);
      const nonMonthlyRequired = requiredDocs.filter(
        (docType) => !monthlyTypes.includes(docType),
      );
      map[branch.id] = new Set(nonMonthlyRequired);
    });

    return map;
  }, [branches]);

  // Get all unique document types across all branches
  const allDocumentTypes = useMemo(() => {
    const types = new Set();
    branches.forEach((branch) => {
      const required = getRequiredBranchDocuments(branch.branch_type);
      const monthly = getMonthlyRequiredBranchDocuments();
      required
        .filter((doc) => !monthly.includes(doc))
        .forEach((type) => types.add(type));
    });

    let typesArray = Array.from(types).sort();

    // Hide restricted types from branch managers
    if (!isMainManager()) {
      typesArray = typesArray.filter(
        (type) => !RESTRICTED_DOCUMENT_TYPES.includes(type),
      );
    }

    return typesArray;
  }, [branches, isMainManager]);

  // Handle PDF generation for single document type across all branches
  const handleGeneratePdfByDocType = async () => {
    if (!pdfSelectedDocType) {
      showError("الرجاء اختيار نوع المستند");
      return;
    }

    setPdfGenerating(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${API_URL}/api/branch-documents/generate-pdf-by-type`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            document_type: pdfSelectedDocType,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "فشل في إنشاء ملف PDF");
      }

      // Get the PDF blob
      const blob = await response.blob();
      const docLabel =
        documentTypeLabels[pdfSelectedDocType] || pdfSelectedDocType;
      downloadFile(blob, `${docLabel}_جميع_الفروع.pdf`);

      showSuccess("تم إنشاء ملف PDF بنجاح");
      setPdfSelectedDocType("");
      setPdfDocTypeFilter("");
    } catch (error) {
      console.error("Error generating PDF:", error);
      showError(error.message || "حدث خطأ أثناء إنشاء ملف PDF");
    } finally {
      setPdfGenerating(false);
    }
  };

  // Handle PDF generation for all documents of a single branch
  const handleGeneratePdfByBranch = async () => {
    if (!pdfSelectedBranch) {
      showError("الرجاء اختيار الفرع");
      return;
    }

    setPdfGenerating(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${API_URL}/api/branch-documents/generate-pdf-by-branch`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            branch_id: parseInt(pdfSelectedBranch),
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "فشل في إنشاء ملف PDF");
      }

      // Get the PDF blob
      const blob = await response.blob();
      const branch = branches.find((b) => b.id === parseInt(pdfSelectedBranch));
      const branchName = branch?.branch_name || "فرع";
      downloadFile(blob, `مستندات_${branchName}.pdf`);

      showSuccess("تم إنشاء ملف PDF بنجاح");
      setPdfSelectedBranch("");
      setPdfBranchFilter("");
    } catch (error) {
      console.error("Error generating PDF:", error);
      showError(error.message || "حدث خطأ أثناء إنشاء ملف PDF");
    } finally {
      setPdfGenerating(false);
    }
  };

  // Filter branches and documents based on filters
  const filteredData = useMemo(() => {
    let filteredBranches = [...branches];
    let filteredTypes = [...allDocumentTypes];

    // Filter by branch
    if (selectedBranchFilter) {
      filteredBranches = filteredBranches.filter(
        (b) => b.id === parseInt(selectedBranchFilter),
      );
    }

    // Filter by search text (branch name or document type)
    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase().trim();
      filteredBranches = filteredBranches.filter((b) =>
        b.branch_name?.toLowerCase().includes(searchLower),
      );
      filteredTypes = filteredTypes.filter((docType) => {
        const docLabel = documentTypeLabels[docType] || docType;
        return docLabel.toLowerCase().includes(searchLower);
      });
    }

    // Filter by document type
    if (documentTypeFilter) {
      filteredTypes = filteredTypes.filter(
        (docType) => docType === documentTypeFilter,
      );
    }

    // Filter by status
    if (statusFilter === "missing") {
      filteredTypes = filteredTypes.filter((docType) => {
        return filteredBranches.some((branch) => {
          if (!requiredDocsByBranch[branch.id]?.has(docType)) {
            return false;
          }
          const status = documentStatus[branch.id]?.[docType];
          return !status || !status.exists;
        });
      });
    } else if (statusFilter === "existing") {
      filteredTypes = filteredTypes.filter((docType) => {
        return filteredBranches.some((branch) => {
          if (!requiredDocsByBranch[branch.id]?.has(docType)) {
            return false;
          }
          const status = documentStatus[branch.id]?.[docType];
          return status && status.exists;
        });
      });
    }

    return { filteredBranches, filteredTypes };
  }, [
    branches,
    allDocumentTypes,
    selectedBranchFilter,
    statusFilter,
    documentTypeFilter,
    searchText,
    documentStatus,
    requiredDocsByBranch,
    documentTypeLabels,
  ]);

  // Toggle card expand/collapse
  const toggleCard = (docType) => {
    setExpandedCards((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(docType)) {
        newSet.delete(docType);
      } else {
        newSet.add(docType);
      }
      return newSet;
    });
  };

  const handleQuickUpload = (branchId, documentType) => {
    setFormData({
      branch_id: branchId,
      document_type: documentType,
      description: "",
      document_number: "",
      issue_date: "",
      issue_date_hijri: "",
      expiry_date: "",
      expiry_date_hijri: "",
      iban_number: "",
      bank_name: "",
      file: null,
    });
    setShowUploadModal(true);
  };

  const handleUpload = async () => {
    if (!formData.branch_id || !formData.document_type || !formData.file) {
      showError("يرجى إدخال جميع الحقول المطلوبة");
      return;
    }

    try {
      setUploading(true);
      const uploadFormData = new FormData();
      Object.keys(formData).forEach((key) => {
        if (formData[key] !== null && formData[key] !== "") {
          uploadFormData.append(key, formData[key]);
        }
      });

      clearCache("/api/branch-documents");
      const response = await branchDocumentsAPI.upload(uploadFormData);
      if (response.data.success) {
        showSuccess("تم رفع المستند بنجاح");
        if (response.data.data) {
          setAllDocuments((prev) => [response.data.data, ...prev]);
        }
        setShowUploadModal(false);
        resetForm();
        loadAllDocuments();
      }
    } catch (error) {
      showError(error.response?.data?.message || "فشل رفع المستند");
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = async () => {
    if (!editingDocument) return;

    try {
      setUploading(true);
      const updateData = { ...formData };
      delete updateData.file;
      delete updateData.branch_id;

      const updateFormData = new FormData();
      Object.keys(updateData).forEach((key) => {
        if (updateData[key] !== null && updateData[key] !== "") {
          updateFormData.append(key, updateData[key]);
        }
      });

      let response;
      if (formData.file) {
        updateFormData.append("file", formData.file);
        response = await branchDocumentsAPI.updateWithFile(
          editingDocument.id,
          updateFormData,
        );
      } else {
        response = await branchDocumentsAPI.update(
          editingDocument.id,
          updateData,
        );
      }

      if (response.data.success) {
        showSuccess("تم تحديث المستند بنجاح");
        if (response.data.data) {
          setAllDocuments((prev) =>
            prev.map((doc) =>
              doc.id === response.data.data.id ? response.data.data : doc,
            ),
          );
        }
        setShowEditModal(false);
        setEditingDocument(null);
        resetForm();
        loadAllDocuments();
      }
    } catch (error) {
      showError(error.response?.data?.message || "فشل تحديث المستند");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc) => {
    if (
      !window.confirm(
        `هل أنت متأكد من حذف المستند "${documentTypeLabels[doc.document_type] || doc.document_type}"؟`,
      )
    ) {
      return;
    }

    try {
      clearCache("/api/branch-documents");
      const response = await branchDocumentsAPI.delete(doc.id);
      if (response.data.success) {
        showSuccess("تم حذف المستند بنجاح");
        setAllDocuments((prev) => prev.filter((d) => d.id !== doc.id));
        loadAllDocuments();
      }
    } catch (error) {
      showError(error.response?.data?.message || "فشل حذف المستند");
    }
  };

  const handleDownload = async (doc) => {
    try {
      const response = await branchDocumentsAPI.download(doc.id);
      const blob = new Blob([response.data]);
      downloadFile(blob, doc.file_name || "document");
      showSuccess("تم تحميل المستند");
    } catch (error) {
      const errorMsg = error.response?.data?.message || "فشل تحميل المستند";
      if (errorMsg.includes("password") || errorMsg.includes("كلمة مرور")) {
        showError("يرجى التحقق من كلمة مرور مستندات الفرع");
      } else {
        showError(errorMsg);
      }
    }
  };

  const handlePreview = (doc) => {
    setPreviewDocument(doc);
    setShowPreviewModal(true);
  };

  const openEditModal = (doc) => {
    setEditingDocument(doc);
    setFormData({
      branch_id: doc.branch_id,
      document_type: doc.document_type,
      description: doc.description || "",
      document_number: doc.document_number || "",
      issue_date: doc.issue_date || "",
      issue_date_hijri: doc.issue_date_hijri || "",
      expiry_date: doc.expiry_date || "",
      expiry_date_hijri: doc.expiry_date_hijri || "",
      iban_number: doc.iban_number || "",
      bank_name: doc.bank_name || "",
      file: null,
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      branch_id: "",
      document_type: "",
      description: "",
      document_number: "",
      issue_date: "",
      issue_date_hijri: "",
      expiry_date: "",
      expiry_date_hijri: "",
      iban_number: "",
      bank_name: "",
      file: null,
    });
  };

  // Calculate statistics
  const stats = useMemo(() => {
    let totalRequired = 0;
    let totalExisting = 0;
    let totalMissing = 0;

    filteredData.filteredBranches.forEach((branch) => {
      filteredData.filteredTypes.forEach((docType) => {
        if (!requiredDocsByBranch[branch.id]?.has(docType)) {
          return;
        }
        totalRequired++;
        const status = documentStatus[branch.id]?.[docType];
        if (status && status.exists) {
          totalExisting++;
        } else {
          totalMissing++;
        }
      });
    });

    return {
      total: totalRequired,
      existing: totalExisting,
      missing: totalMissing,
      completionRate:
        totalRequired > 0
          ? Math.round((totalExisting / totalRequired) * 100)
          : 0,
    };
  }, [filteredData, documentStatus, requiredDocsByBranch]);

  // Early return for initial loading - must be after all hooks
  if (loading && branches.length === 0) {
    return (
      <div className="branch-documents-management-page">
        <div className="documents-skeleton-page" aria-label="جاري تحميل مستندات الفروع">
          <div className="documents-skeleton-header" />
          <div className="documents-skeleton-stats">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="documents-skeleton-card" />
            ))}
          </div>
          <div className="documents-skeleton-table">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="documents-skeleton-row" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="branch-documents-management-page">
      <div className="page-header">
        <h1>مستندات الفروع</h1>
        {documentsLoading && (
          <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            جاري تحديث المستندات...
          </span>
        )}
        <div className="header-actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              resetForm();
              setShowUploadModal(true);
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 5v14m-7-7h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            رفع مستند جديد
          </button>
        </div>
      </div>

      {/* PDF Generation Section */}
      {isMainManager() && <div className="pdf-generation-section">
        <div className="section-header">
          <h2>إنشاء ملف PDF</h2>
        </div>

        <div className="pdf-search-container">
          <div className="pdf-options">
            <button
              className={`pdf-option-card ${isPdfDocTypeDropdownOpen ? "active" : ""}`}
              onClick={() => {
                setIsPdfDocTypeDropdownOpen(!isPdfDocTypeDropdownOpen);
                setIsPdfBranchDropdownOpen(false);
              }}
            >
              <div className="pdf-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3>حسب المستند</h3>
            </button>

            <button
              className={`pdf-option-card ${isPdfBranchDropdownOpen ? "active" : ""}`}
              onClick={() => {
                setIsPdfBranchDropdownOpen(!isPdfBranchDropdownOpen);
                setIsPdfDocTypeDropdownOpen(false);
              }}
            >
              <div className="pdf-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M17 21v-8H7v8M7 3v5h8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3>حسب الفرع</h3>
            </button>
          </div>

          {/* Unified Selection Area */}
          {(isPdfDocTypeDropdownOpen || isPdfBranchDropdownOpen) && (
            <div className="pdf-selection-container">
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  type="text"
                  placeholder={
                    isPdfDocTypeDropdownOpen ? "ابحث عن مستند..." : "ابحث عن فرع..."
                  }
                  onChange={(e) => {
                    if (isPdfDocTypeDropdownOpen) {
                      setPdfDocTypeFilter(e.target.value);
                    } else {
                      setPdfBranchFilter(e.target.value);
                    }
                  }}
                  className="pdf-search-input"
                  autoComplete="off"
                  autoFocus
                />

                <div className="filter-dropdown-menu">
                  {isPdfDocTypeDropdownOpen ? (
                    <>
                      {allDocumentTypes
                        .filter((docType) => {
                          const label = documentTypeLabels[docType] || docType;
                          return (
                            !pdfDocTypeFilter ||
                            label
                              .toLowerCase()
                              .includes(pdfDocTypeFilter.toLowerCase())
                          );
                        })
                        .map((docType) => (
                          <div
                            key={docType}
                            style={{
                              padding: "8px 12px",
                              cursor: "pointer",
                              borderBottom: "1px solid #f0f0f0",
                              backgroundColor:
                                pdfSelectedDocType === docType
                                  ? "#f0f9ff"
                                  : "white",
                              fontSize: "0.9rem",
                            }}
                            onClick={() => {
                              setPdfSelectedDocType(docType);
                              setPdfDocTypeFilter("");
                            }}
                            onMouseEnter={(e) =>
                              (e.target.style.backgroundColor = "#f0f9ff")
                            }
                            onMouseLeave={(e) =>
                            (e.target.style.backgroundColor =
                              pdfSelectedDocType === docType
                                ? "#f0f9ff"
                                : "white")
                            }
                          >
                            {documentTypeLabels[docType] || docType}
                          </div>
                        ))}
                    </>
                  ) : (
                    <>
                      {branches
                        .filter((b) => b.is_active)
                        .filter(
                          (branch) =>
                            !pdfBranchFilter ||
                            branch.branch_name
                              .toLowerCase()
                              .includes(pdfBranchFilter.toLowerCase()),
                        )
                        .sort((a, b) =>
                          (a.branch_name || "").localeCompare(
                            b.branch_name || "",
                            "ar",
                          ),
                        )
                        .map((branch) => (
                          <div
                            key={branch.id}
                            style={{
                              padding: "8px 12px",
                              cursor: "pointer",
                              borderBottom: "1px solid #f0f0f0",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              backgroundColor:
                                pdfSelectedBranch === String(branch.id)
                                  ? "#f0f9ff"
                                  : "white",
                              fontSize: "0.9rem",
                            }}
                            onClick={() => {
                              setPdfSelectedBranch(String(branch.id));
                              setPdfBranchFilter("");
                            }}
                            onMouseEnter={(e) =>
                              (e.target.style.backgroundColor = "#f0f9ff")
                            }
                            onMouseLeave={(e) =>
                            (e.target.style.backgroundColor =
                              pdfSelectedBranch === String(branch.id)
                                ? "#f0f9ff"
                                : "white")
                            }
                          >
                            <BranchBadge branch={branch} />
                            <span>{branch.branch_name}</span>
                          </div>
                        ))}
                    </>
                  )}
                </div>
              </div>

              {/* Summary and Action */}
              <div className="pdf-action-area">
                <div className="pdf-summary-message">
                  {isPdfDocTypeDropdownOpen && pdfSelectedDocType && (
                    <p>
                      سيتم إنشاء تقرير يحتوي على مستند{" "}
                      <strong>
                        {documentTypeLabels[pdfSelectedDocType] || pdfSelectedDocType}
                      </strong>{" "}
                      لـ <strong>جميع الفروع</strong>
                    </p>
                  )}
                  {isPdfBranchDropdownOpen && pdfSelectedBranch && (
                    <p>
                      سيتم إنشاء تقرير يحتوي على <strong>جميع المستندات</strong> لفرع{" "}
                      <strong>
                        {
                          branches.find(
                            (b) => String(b.id) === String(pdfSelectedBranch),
                          )?.branch_name
                        }
                      </strong>
                    </p>
                  )}
                  {(!pdfSelectedDocType && !pdfSelectedBranch) && <p className="placeholder-text">الرجاء الاختيار للمتابعة...</p>}
                </div>

                {((isPdfDocTypeDropdownOpen && pdfSelectedDocType) ||
                  (isPdfBranchDropdownOpen && pdfSelectedBranch)) && (
                    <button
                      className="btn btn-primary pdf-action-btn"
                      onClick={
                        isPdfDocTypeDropdownOpen
                          ? handleGeneratePdfByDocType
                          : handleGeneratePdfByBranch
                      }
                      disabled={pdfGenerating}
                    >
                      {pdfGenerating ? (
                        <>
                          <span className="spinner-small"></span>
                          جاري الإنشاء...
                        </>
                      ) : (
                        "إنشاء التقرير"
                      )}
                    </button>
                  )}
              </div>
            </div>
          )}
        </div>
      </div>}

      {/* Statistics Cards */}
      <div className="stats-section">
        <div className="stat-card">
          <div
            className="stat-icon"
            style={{
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                stroke="white"
                strokeWidth="2"
              />
              <polyline
                points="14 2 14 8 20 8"
                stroke="white"
                strokeWidth="2"
              />
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-label">إجمالي المستندات المطلوبة</div>
            <div className="stat-value">
              {loading ? <span className="stat-loader"></span> : stats.total}
            </div>
          </div>
        </div>

        <div className="stat-card success">
          <div
            className="stat-icon"
            style={{
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M22 11.08V12a10 10 0 1 1-5.93-9.14"
                stroke="white"
                strokeWidth="2"
              />
              <polyline
                points="22 4 12 14.01 9 11.01"
                stroke="white"
                strokeWidth="2"
              />
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-label">المستندات الموجودة</div>
            <div className="stat-value">
              {loading ? <span className="stat-loader"></span> : stats.existing}
            </div>
          </div>
        </div>

        <div className="stat-card warning">
          <div
            className="stat-icon"
            style={{
              background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="2" />
              <path
                d="M12 8v4M12 16h.01"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-label">المستندات المفقودة</div>
            <div className="stat-value">
              {loading ? <span className="stat-loader"></span> : stats.missing}
            </div>
          </div>
        </div>

        <div className="stat-card info">
          <div
            className="stat-icon"
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="2" />
              <path d="M12 6v6l4 2" stroke="white" strokeWidth="2" />
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-label">نسبة الإكمال</div>
            <div className="stat-value">
              {loading ? (
                <span className="stat-loader"></span>
              ) : (
                `${stats.completionRate}%`
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-section">
        <div className="filter-group">
          <label>البحث</label>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="ابحث عن فرع أو نوع مستند..."
            className="filter-input"
          />
        </div>

        <div
          className="filter-group"
          style={{ position: "relative" }}
          ref={branchDropdownRef}
        >
          <label>الفرع</label>
          <input
            type="text"
            value={selectedBranchName}
            onChange={(e) => {
              const term = e.target.value;
              setBranchSearch(term);
              setIsBranchDropdownOpen(true);
              if (!term) {
                setSelectedBranchFilter("");
              }
            }}
            onFocus={() => {
              setIsBranchDropdownOpen(true);
              if (selectedBranchFilter) {
                const branch = branches.find(
                  (b) => b.id === parseInt(selectedBranchFilter),
                );
                setBranchSearch(branch?.branch_name || "");
              }
            }}
            placeholder="ابحث عن فرع أو اختر من القائمة..."
            className="filter-input"
            autoComplete="off"
          />
          {isBranchDropdownOpen && (
            <div
              className="filter-dropdown-menu"
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                maxHeight: "300px",
                overflowY: "auto",
                backgroundColor: "white",
                border: "1px solid #ddd",
                borderRadius: "4px",
                boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
                zIndex: 9999,
                marginTop: "4px",
              }}
            >
              <div
                style={{
                  padding: "8px 12px",
                  cursor: "pointer",
                  borderBottom: "1px solid #f0f0f0",
                  backgroundColor: !selectedBranchFilter ? "#f0f9ff" : "white",
                }}
                onClick={() => {
                  setSelectedBranchFilter("");
                  setBranchSearch("");
                  setIsBranchDropdownOpen(false);
                }}
                onMouseEnter={(e) =>
                  (e.target.style.backgroundColor = "#f0f9ff")
                }
                onMouseLeave={(e) =>
                (e.target.style.backgroundColor = !selectedBranchFilter
                  ? "#f0f9ff"
                  : "white")
                }
              >
                جميع الفروع
              </div>
              {branches
                .filter(
                  (b) =>
                    !branchSearch ||
                    b.branch_name
                      .toLowerCase()
                      .includes(branchSearch.toLowerCase()),
                )
                .map((branch) => (
                  <div
                    key={branch.id}
                    style={{
                      padding: "8px 12px",
                      cursor: "pointer",
                      borderBottom: "1px solid #f0f0f0",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      backgroundColor:
                        selectedBranchFilter === String(branch.id)
                          ? "#f0f9ff"
                          : "white",
                    }}
                    onClick={() => {
                      setSelectedBranchFilter(String(branch.id));
                      setBranchSearch("");
                      setIsBranchDropdownOpen(false);
                    }}
                    onMouseEnter={(e) =>
                      (e.target.style.backgroundColor = "#f0f9ff")
                    }
                    onMouseLeave={(e) =>
                    (e.target.style.backgroundColor =
                      selectedBranchFilter === String(branch.id)
                        ? "#f0f9ff"
                        : "white")
                    }
                  >
                    <BranchBadge branch={branch} />
                    <span>{branch.branch_name}</span>
                  </div>
                ))}
              {branches.filter(
                (b) =>
                  !branchSearch ||
                  b.branch_name
                    .toLowerCase()
                    .includes(branchSearch.toLowerCase()),
              ).length === 0 && (
                  <div
                    style={{
                      padding: "12px",
                      textAlign: "center",
                      color: "#666",
                    }}
                  >
                    لا توجد فروع مطابقة
                  </div>
                )}
            </div>
          )}
        </div>

        <div
          className="filter-group"
          style={{ position: "relative" }}
          ref={documentTypeDropdownRef}
        >
          <label>نوع المستند</label>
          <input
            type="text"
            value={selectedDocumentTypeName}
            onChange={(e) => {
              const term = e.target.value;
              setDocumentTypeSearch(term);
              setIsDocumentTypeDropdownOpen(true);
              if (!term) {
                setDocumentTypeFilter("");
              }
            }}
            onFocus={() => {
              setIsDocumentTypeDropdownOpen(true);
              if (documentTypeFilter) {
                setDocumentTypeSearch(
                  documentTypeLabels[documentTypeFilter] || documentTypeFilter,
                );
              }
            }}
            placeholder="ابحث عن نوع مستند أو اختر من القائمة..."
            className="filter-input"
            autoComplete="off"
          />
          {isDocumentTypeDropdownOpen && (
            <div
              className="filter-dropdown-menu"
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                maxHeight: "300px",
                overflowY: "auto",
                backgroundColor: "white",
                border: "1px solid #ddd",
                borderRadius: "4px",
                boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
                zIndex: 9999,
                marginTop: "4px",
              }}
            >
              <div
                style={{
                  padding: "8px 12px",
                  cursor: "pointer",
                  borderBottom: "1px solid #f0f0f0",
                  backgroundColor: !documentTypeFilter ? "#f0f9ff" : "white",
                }}
                onClick={() => {
                  setDocumentTypeFilter("");
                  setDocumentTypeSearch("");
                  setIsDocumentTypeDropdownOpen(false);
                }}
                onMouseEnter={(e) =>
                  (e.target.style.backgroundColor = "#f0f9ff")
                }
                onMouseLeave={(e) =>
                (e.target.style.backgroundColor = !documentTypeFilter
                  ? "#f0f9ff"
                  : "white")
                }
              >
                جميع الأنواع
              </div>
              {allDocumentTypes
                .filter((docType) => {
                  if (!documentTypeSearch.trim()) return true;
                  const label = documentTypeLabels[docType] || docType;
                  return label
                    .toLowerCase()
                    .includes(documentTypeSearch.toLowerCase());
                })
                .map((docType) => {
                  const label = documentTypeLabels[docType] || docType;
                  return (
                    <div
                      key={docType}
                      style={{
                        padding: "8px 12px",
                        cursor: "pointer",
                        borderBottom: "1px solid #f0f0f0",
                        backgroundColor:
                          documentTypeFilter === docType ? "#f0f9ff" : "white",
                      }}
                      onClick={() => {
                        setDocumentTypeFilter(docType);
                        setDocumentTypeSearch("");
                        setIsDocumentTypeDropdownOpen(false);
                      }}
                      onMouseEnter={(e) =>
                        (e.target.style.backgroundColor = "#f0f9ff")
                      }
                      onMouseLeave={(e) =>
                      (e.target.style.backgroundColor =
                        documentTypeFilter === docType ? "#f0f9ff" : "white")
                      }
                    >
                      {label}
                    </div>
                  );
                })}
              {allDocumentTypes.filter((docType) => {
                if (!documentTypeSearch.trim()) return true;
                const label = documentTypeLabels[docType] || docType;
                return label
                  .toLowerCase()
                  .includes(documentTypeSearch.toLowerCase());
              }).length === 0 && (
                  <div
                    style={{
                      padding: "12px",
                      textAlign: "center",
                      color: "#666",
                    }}
                  >
                    لا توجد أنواع مطابقة
                  </div>
                )}
            </div>
          )}
        </div>

        <div
          className="filter-group"
          style={{ position: "relative" }}
          ref={statusDropdownRef}
        >
          <label>الحالة</label>
          <input
            type="text"
            value={
              isStatusDropdownOpen && statusSearch
                ? statusSearch
                : statusFilter === "all"
                  ? "الكل"
                  : statusFilter === "missing"
                    ? "المفقودة فقط"
                    : statusFilter === "existing"
                      ? "الموجودة فقط"
                      : ""
            }
            onChange={(e) => {
              const term = e.target.value;
              setStatusSearch(term);
              setIsStatusDropdownOpen(true);
              if (!term) {
                setStatusFilter("all");
              }
            }}
            onFocus={() => {
              setIsStatusDropdownOpen(true);
              if (statusFilter) {
                setStatusSearch(
                  statusFilter === "all"
                    ? "الكل"
                    : statusFilter === "missing"
                      ? "المفقودة فقط"
                      : statusFilter === "existing"
                        ? "الموجودة فقط"
                        : "",
                );
              }
            }}
            placeholder="ابحث عن حالة أو اختر من القائمة..."
            className="filter-input"
            autoComplete="off"
          />
          {isStatusDropdownOpen && (
            <div
              className="filter-dropdown-menu"
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                maxHeight: "300px",
                overflowY: "auto",
                backgroundColor: "white",
                border: "1px solid #ddd",
                borderRadius: "4px",
                boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
                zIndex: 9999,
                marginTop: "4px",
              }}
            >
              {[
                { value: "all", label: "الكل" },
                { value: "missing", label: "المفقودة فقط" },
                { value: "existing", label: "الموجودة فقط" },
              ]
                .filter((status) => {
                  if (!statusSearch.trim()) return true;
                  return status.label
                    .toLowerCase()
                    .includes(statusSearch.toLowerCase());
                })
                .map((status) => (
                  <div
                    key={status.value}
                    style={{
                      padding: "8px 12px",
                      cursor: "pointer",
                      borderBottom: "1px solid #f0f0f0",
                      backgroundColor:
                        statusFilter === status.value ? "#f0f9ff" : "white",
                    }}
                    onClick={() => {
                      setStatusFilter(status.value);
                      setStatusSearch("");
                      setIsStatusDropdownOpen(false);
                    }}
                    onMouseEnter={(e) =>
                      (e.target.style.backgroundColor = "#f0f9ff")
                    }
                    onMouseLeave={(e) =>
                    (e.target.style.backgroundColor =
                      statusFilter === status.value ? "#f0f9ff" : "white")
                    }
                  >
                    {status.label}
                  </div>
                ))}
              {[
                { value: "all", label: "الكل" },
                { value: "missing", label: "المفقودة فقط" },
                { value: "existing", label: "الموجودة فقط" },
              ].filter((status) => {
                if (!statusSearch.trim()) return true;
                return status.label
                  .toLowerCase()
                  .includes(statusSearch.toLowerCase());
              }).length === 0 && (
                  <div
                    style={{
                      padding: "12px",
                      textAlign: "center",
                      color: "#666",
                    }}
                  >
                    لا توجد حالات مطابقة
                  </div>
                )}
            </div>
          )}
        </div>

        {(selectedBranchFilter ||
          statusFilter ||
          documentTypeFilter ||
          searchText ||
          branchSearch ||
          documentTypeSearch) && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                setSelectedBranchFilter("");
                setStatusFilter("");
                setDocumentTypeFilter("");
                setSearchText("");
                setBranchSearch("");
                setDocumentTypeSearch("");
                setStatusSearch("");
              }}
            >
              إلغاء الفلاتر
            </button>
          )}
      </div>

      {/* Documents Grid - Document-centric view */}
      <div className="documents-grid-section">
        {filteredData.filteredTypes.map((docType) => {
          const missingBranches = filteredData.filteredBranches.filter(
            (branch) => {
              if (!requiredDocsByBranch[branch.id]?.has(docType)) {
                return false;
              }
              const status = documentStatus[branch.id]?.[docType];
              return !status || !status.exists;
            },
          );

          const existingBranches = filteredData.filteredBranches.filter(
            (branch) => {
              if (!requiredDocsByBranch[branch.id]?.has(docType)) {
                return false;
              }
              const status = documentStatus[branch.id]?.[docType];
              return status && status.exists;
            },
          );

          const isExpanded = expandedCards.has(docType);

          return (
            <div
              key={docType}
              className={`document-card ${isExpanded ? "expanded" : ""}`}
              onClick={() => toggleCard(docType)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleCard(docType);
                }
              }}
              aria-expanded={isExpanded}
            >
              <div className="document-card-header">
                <div className="document-header-left">
                  <div
                    className={`expand-toggle-indicator ${isExpanded ? "expanded" : ""}`}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M9 18l6-6-6-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <h3 className="document-type-title">
                    {documentTypeLabels[docType] || docType}
                  </h3>
                </div>
                <div className="document-type-stats">
                  <span className="stat-badge success">
                    ✓ {existingBranches.length} موجود
                  </span>
                  {missingBranches.length > 0 && (
                    <span className="stat-badge warning">
                      ✗ {missingBranches.length} مفقود
                    </span>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="document-branches-list">
                  {/* Missing Documents - Priority */}
                  {missingBranches.length > 0 && (
                    <div className="branches-group missing">
                      <div className="group-header">
                        <span className="group-icon">⚠️</span>
                        <span className="group-title">
                          مفقود ({missingBranches.length})
                        </span>
                      </div>
                      <div className="branches-list">
                        {missingBranches.map((branch) => (
                          <div key={branch.id} className="branch-item missing">
                            <BranchBadge branch={branch} />
                            <span className="branch-name">
                              {branch.branch_name}
                            </span>
                            <button
                              className="btn-quick-upload"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuickUpload(branch.id, docType);
                              }}
                              title="رفع سريع"
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                              >
                                <path
                                  d="M12 5v14m-7-7h14"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                />
                              </svg>
                              رفع
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Existing Documents */}
                  {existingBranches.length > 0 && (
                    <div className="branches-group existing">
                      <div className="group-header">
                        <span className="group-icon">✓</span>
                        <span className="group-title">
                          موجود ({existingBranches.length})
                        </span>
                      </div>
                      <div className="branches-list">
                        {existingBranches.map((branch) => {
                          const status = documentStatus[branch.id]?.[docType];
                          const doc = status?.documents[0]; // Show first document

                          return (
                            <div
                              key={branch.id}
                              className="branch-item existing"
                            >
                              <BranchBadge branch={branch} />
                              <span className="branch-name">
                                {branch.branch_name}
                              </span>
                              <div className="document-info">
                                {doc.expiry_date && (
                                  <span
                                    className={`expiry-date ${new Date(doc.expiry_date) < new Date() ? "expired" : ""}`}
                                  >
                                    ينتهي: {formatDate(doc.expiry_date)}
                                  </span>
                                )}
                                {doc.uploaded_at && (
                                  <span className="upload-date">
                                    {formatDate(doc.uploaded_at)}
                                  </span>
                                )}
                              </div>
                              <div className="document-actions">
                                {status.count > 1 && (
                                  <span className="doc-count">
                                    {status.count} مستندات
                                  </span>
                                )}
                                <button
                                  className="btn-action btn-preview"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePreview(doc);
                                  }}
                                  title="عرض"
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                  >
                                    <path
                                      d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    />
                                    <circle
                                      cx="12"
                                      cy="12"
                                      r="3"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    />
                                  </svg>
                                </button>
                                <button
                                  className="btn-action btn-download"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(doc);
                                  }}
                                  title="تحميل"
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                  >
                                    <path
                                      d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    />
                                    <polyline
                                      points="7 10 12 15 17 10"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    />
                                    <line
                                      x1="12"
                                      y1="15"
                                      x2="12"
                                      y2="3"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    />
                                  </svg>
                                </button>
                                <button
                                  className="btn-action btn-edit"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditModal(doc);
                                  }}
                                  title="تعديل"
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                  >
                                    <path
                                      d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    />
                                    <path
                                      d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    />
                                  </svg>
                                </button>
                                <button
                                  className="btn-action btn-delete"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(doc);
                                  }}
                                  title="حذف"
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                  >
                                    <polyline
                                      points="3 6 5 6 21 6"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    />
                                    <path
                                      d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredData.filteredTypes.length === 0 && (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
              <path
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                stroke="currentColor"
                strokeWidth="2"
              />
              <polyline
                points="14 2 14 8 20 8"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
            <p>لا توجد مستندات لعرضها</p>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <DocumentModal
          title="رفع مستند جديد"
          formData={formData}
          setFormData={setFormData}
          branches={branches}
          documentTypeLabels={filteredDocumentTypeLabels}
          onSave={handleUpload}
          onClose={() => {
            if (!uploading) {
              setShowUploadModal(false);
              resetForm();
            }
          }}
          loading={uploading}
          isEdit={false}
        />
      )}

      {/* Edit Modal */}
      {showEditModal && editingDocument && (
        <DocumentModal
          title="تعديل المستند"
          formData={formData}
          setFormData={setFormData}
          branches={branches}
          documentTypeLabels={filteredDocumentTypeLabels}
          onSave={handleEdit}
          onClose={() => {
            if (!uploading) {
              setShowEditModal(false);
              setEditingDocument(null);
              resetForm();
            }
          }}
          loading={uploading}
          isEdit={true}
        />
      )}

      {/* Preview Modal */}
      {showPreviewModal && previewDocument && (
        <div
          className="modal-overlay"
          onClick={() => setShowPreviewModal(false)}
        >
          <div
            className="modal-content preview-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>
                {documentTypeLabels[previewDocument.document_type] ||
                  previewDocument.document_type}
              </h2>
              <button
                className="modal-close"
                onClick={() => setShowPreviewModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body preview-body">
              {previewDocument.file_path && (
                <iframe
                  src={previewDocument.file_path}
                  className="preview-iframe"
                  title="Document Preview"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Document Modal Component
const DocumentModal = ({
  title,
  formData,
  setFormData,
  branches,
  documentTypeLabels,
  onSave,
  onClose,
  loading,
  isEdit,
}) => {
  const documentTypes = Object.keys(documentTypeLabels);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFormData((prev) => ({ ...prev, file: e.target.files[0] }));
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !loading && onClose()}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={() => !loading && onClose()}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="upload-edit-form">
            {!isEdit && (
              <div className="form-group">
                <label>الفرع *</label>
                <select
                  value={formData.branch_id}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      branch_id: e.target.value,
                    }))
                  }
                  required
                >
                  <option value="">اختر الفرع</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.branch_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label>نوع المستند *</label>
              <select
                value={formData.document_type}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    document_type: e.target.value,
                  }))
                }
                required
                disabled={isEdit}
              >
                <option value="">اختر نوع المستند</option>
                {documentTypes.map((type) => (
                  <option key={type} value={type}>
                    {documentTypeLabels[type]}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>الوصف</label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                rows="3"
              />
            </div>

            <div className="form-group">
              <label>رقم المستند</label>
              <input
                type="text"
                value={formData.document_number}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    document_number: e.target.value,
                  }))
                }
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>تاريخ الإصدار (ميلادي)</label>
                <UnifiedDatePicker
                  value={formData.issue_date}
                  onChange={(date) =>
                    setFormData((prev) => ({ ...prev, issue_date: date }))
                  }
                  placeholder="اختر التاريخ"
                />
              </div>

              <div className="form-group">
                <label>تاريخ الانتهاء (ميلادي)</label>
                <UnifiedDatePicker
                  value={formData.expiry_date}
                  onChange={(date) =>
                    setFormData((prev) => ({ ...prev, expiry_date: date }))
                  }
                  placeholder="اختر التاريخ"
                />
              </div>
            </div>

            {/* NOTE: payroll_file removed - users enter payroll data in payroll absence system, not as document upload */}

            <div className="form-group">
              <label>{isEdit ? "تغيير الملف (اختياري)" : "الملف *"}</label>
              <input
                type="file"
                onChange={handleFileChange}
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                required={!isEdit}
              />
              {formData.file && (
                <div className="file-info">
                  <span>{formData.file.name}</span>
                  <span>
                    {(formData.file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            إلغاء
          </button>
          <button
            className="btn btn-primary"
            onClick={onSave}
            disabled={loading}
          >
            {loading ? "جاري الحفظ..." : isEdit ? "تحديث" : "رفع"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BranchDocumentsManagement;
