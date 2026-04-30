import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { employeesAPI, documentsAPI, branchesAPI, clearCache } from '../../utils/api';
import { downloadFile } from '../../utils/downloadFile';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { DATA_COMPLETION_STATUS } from '../../utils/employeeConstants';
import './EmployeeDetails.css';
import EmployeeDetailsHeader from './components/EmployeeDetailsHeader';
import EmployeeProfileCard from './components/EmployeeProfileCard';
import RenewalSection from './components/RenewalSection';
import EmployeeInfoSections from './components/EmployeeInfoSections';
import DocumentsSection from './components/DocumentsSection';
import GenerateFileSection from './components/GenerateFileSection';
import ImagePreviewModal from './components/ImagePreviewModal';

const EmployeeDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isBranchManager, isMainManager, user } = useAuth();
  const { showError, showSuccess, showWarning } = useNotification();

  const [employee, setEmployee] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [downloading, setDownloading] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(null);
  const [missingData, setMissingData] = useState(null);
  const [processingRenewal, setProcessingRenewal] = useState(false);
  const [showNonRenewalForm, setShowNonRenewalForm] = useState(false);
  const [nonRenewalData, setNonRenewalData] = useState({ status: '', reason: '' });
  const [generatingFile, setGeneratingFile] = useState(false);
  const missingFields = missingData?.missingFields || [];
  const hasMissingFields = missingFields.length > 0;

  useEffect(() => {
    loadEmployeeData();
  }, [id]);

  const loadEmployeeData = async () => {
    try {
      setLoading(true);

      // Clear cache to ensure fresh data (especially completion status)
      clearCache('/api/employees');

      // Always refresh completion status when loading employee data
      try {
        await employeesAPI.updateCompletionStatus(id);
      } catch (updateError) {
        console.warn('Failed to refresh completion status', updateError);
      }

      // Clear cache again after status update to ensure fresh fetch
      clearCache('/api/employees');

      const [employeeResponse, documentsResponse, branchesResponse] = await Promise.all([
        employeesAPI.getById(id),
        employeesAPI.getDocuments(id),
        branchesAPI.getAll({ is_active: true }),
      ]);

      if (employeeResponse.data.success) {
        setEmployee(employeeResponse.data.data);

        try {
          const missingDataResponse = await employeesAPI.getMissingData(id);
          if (missingDataResponse.data.success) {
            setMissingData(missingDataResponse.data.data);

            // Reload employee to get updated completion status
            try {
              const updatedResponse = await employeesAPI.getById(id);
              if (updatedResponse.data.success) {
                setEmployee(updatedResponse.data.data);
              }
            } catch (updateError) {
              console.warn('Failed to reload employee after completion check', updateError);
            }
          } else {
            setMissingData({
              isComplete: employeeResponse.data.data.data_completion_status === DATA_COMPLETION_STATUS.COMPLETE,
              missingFields: [],
            });
          }
        } catch (error) {
          setMissingData({
            isComplete: employeeResponse.data.data.data_completion_status === DATA_COMPLETION_STATUS.COMPLETE,
            missingFields: [],
          });
        }
      }

      if (documentsResponse.data.success) {
        setDocuments(documentsResponse.data.data || []);
      }

      if (branchesResponse.data.success) {
        setBranches(branchesResponse.data.data || []);
      }
    } catch (error) {
      console.error('Error loading employee data:', error);
      showError('فشل تحميل بيانات الموظف');
      navigate('/employees');
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async (document) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        showWarning('يرجى تسجيل الدخول مرة أخرى');
        navigate('/login');
        return;
      }

      setPreviewLoading(document.id);
      setPreviewDocument(document);

      if (document.mime_type && document.mime_type.startsWith('image/')) {
        try {
          // Always proxy through backend to use authenticated blob access
          const response = await documentsAPI.download(document.id);
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
          setPreviewUrl(null);
        } finally {
          setPreviewLoading(null);
        }
      } else if (document.mime_type === 'application/pdf') {
        try {
          const response = await documentsAPI.download(document.id);
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
        } finally {
          setPreviewLoading(null);
        }
      } else {
        await handleDownload(document.id);
        setPreviewDocument(null);
        setPreviewLoading(null);
      }
    } catch (error) {
      console.error('Error previewing document:', error);
      showError('فشل عرض المستند');
      setPreviewDocument(null);
      setPreviewUrl(null);
      setPreviewLoading(null);
    }
  };

  const handleDownload = async (documentId) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        showWarning('يرجى تسجيل الدخول مرة أخرى');
        navigate('/login');
        return;
      }

      setDownloading(documentId);
      const response = await documentsAPI.download(documentId);
      const contentDisposition = response.headers['content-disposition'];
      let filename = `document_${documentId}`;
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

  const closePreview = () => {
    setPreviewDocument(null);
    setPreviewLoading(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  const handleGenerateFile = async (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    await generateFilePDF();
  };

  const generateFilePDF = async () => {
    try {
      setGeneratingFile(true);

      const branchId = employee?.branch_id || user?.branch_id;
      const response = await employeesAPI.generateSingleEmployeeFile(id, {
        responseType: 'blob',
        branch_id: branchId,
      });

      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'application/pdf' });
      const fileName = `ملف_موظف_${employee?.first_name}_${employee?.second_name}_${employee?.third_name}_${employee?.fourth_name}.pdf`;
      downloadFile(blob, fileName);

      showSuccess('تم إنشاء ملف الموظف بنجاح');
    } catch (error) {
      console.error('Error generating file:', error);
      const errorMessage = error.response?.data?.message || error.message || 'فشل إنشاء الملف';
      showError(errorMessage);
    } finally {
      setGeneratingFile(false);
    }
  };

  const handleOpenFullEdit = () => {
    navigate('/employees', { state: { editEmployeeId: id } });
  };

  const startNonRenewalFlow = () => {
    setShowNonRenewalForm(true);
    setNonRenewalData({ status: '', reason: '' });
  };

  const cancelNonRenewalFlow = () => {
    setShowNonRenewalForm(false);
    setNonRenewalData({ status: '', reason: '' });
  };

  const handleRenewal = async () => {
    if (processingRenewal) return;
    setProcessingRenewal(true);
    try {
      await employeesAPI.renew(id);
      showSuccess('تم تجديد العقد بنجاح');
      loadEmployeeData();
    } catch (error) {
      console.error('Error renewing employee:', error);
      const errorMsg = error.response?.data?.message || 'فشل تجديد العقد';
      if (error.response?.data?.missing_documents) {
        showError(
          `${errorMsg}\n\nالمستندات المطلوبة:\n${error.response.data.required_documents.join('\n')}\n\nيرجى تحديث هذه المستندات أولاً.`
        );
      } else {
        showError(errorMsg);
      }
    } finally {
      setProcessingRenewal(false);
    }
  };

  const handleNonRenewalFieldChange = (field, value) => {
    setNonRenewalData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNonRenewalSubmit = async () => {
    if (!nonRenewalData.status) {
      showWarning('يرجى اختيار سبب عدم التجديد');
      return;
    }

    try {
      await employeesAPI.nonRenewal(id, nonRenewalData);
      showSuccess('تم نقل الموظف إلى الأرشيف بنجاح');
      cancelNonRenewalFlow();
      loadEmployeeData();
    } catch (error) {
      console.error('Error processing non-renewal:', error);
      showError(error.response?.data?.message || 'فشل معالجة عدم التجديد');
    }
  };

  if (loading) {
    return <div className="loading">جاري تحميل بيانات الموظف...</div>;
  }

  if (!employee) {
    return (
      <div className="table-page">
        <div className="empty-state">
          <p>الموظف غير موجود</p>
          <button onClick={() => navigate('/employees')} className="btn btn-primary btn-md">
            العودة للقائمة
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="employee-details-page">
      <EmployeeDetailsHeader onBack={() => navigate('/employees')} />

      <EmployeeProfileCard
        employee={employee}
        missingData={missingData}
        hasMissingFields={hasMissingFields}
        onOpenEdit={handleOpenFullEdit}
      >
        <>
          {isBranchManager() && employee.status === 'pending' && (
            <RenewalSection
              processingRenewal={processingRenewal}
              onRenew={handleRenewal}
              showNonRenewalForm={showNonRenewalForm}
              onStartNonRenewal={startNonRenewalFlow}
              nonRenewalData={nonRenewalData}
              onChangeNonRenewalField={handleNonRenewalFieldChange}
              onSubmitNonRenewal={handleNonRenewalSubmit}
              onCancelNonRenewal={cancelNonRenewalFlow}
              employeeGender={employee.gender}
            />
          )}

          <EmployeeInfoSections employee={employee} branches={branches} />
        </>
      </EmployeeProfileCard>

      <DocumentsSection
        documents={documents}
        onPreview={handlePreview}
        onDownload={handleDownload}
        previewLoading={previewLoading}
        downloading={downloading}
      />

      <GenerateFileSection
        generatingFile={generatingFile}
        onGenerate={handleGenerateFile}
        disabled={!employee}
      />

      <ImagePreviewModal document={previewDocument} previewUrl={previewUrl} onClose={closePreview} />
    </div>
  );
};

export default EmployeeDetails;
