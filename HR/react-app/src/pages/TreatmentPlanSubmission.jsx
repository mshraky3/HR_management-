/**
 * TreatmentPlanSubmission - Public Page
 * Collects therapeutic/educational plans from healthcare employees
 * No authentication required
 */
import { useState, useEffect, useRef } from 'react';
import { treatmentPlansPublicAPI } from '../utils/api';
import { getCurrentApiUrl } from '../config/api';
import { reportApiError } from '../utils/errorTracking';
import {
    getTreatmentPlansByJobTitle,
    getTreatmentPlanJobTitles,
} from '../utils/employeeConstants';
import './TreatmentPlanSubmission.css';

const TreatmentPlanSubmission = () => {
    const [branches, setBranches] = useState([]);
    const [formData, setFormData] = useState({
        employee_name: '',
        branch_id: '',
        job_title: '',
        department: '',
        plan_type: '',
        notes: '',
    });
    const [files, setFiles] = useState([]);
    const [customPlanType, setCustomPlanType] = useState('');
    const [loading, setLoading] = useState(false);
    const [fileProgress, setFileProgress] = useState([]); // [{ name, size, percent, status }]
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [showCircular, setShowCircular] = useState(false);
    const [isDragActive, setIsDragActive] = useState(false);
    const fileInputRef = useRef(null);
    const dragCounterRef = useRef(0);

    // Available job titles that have treatment plans
    const jobTitles = getTreatmentPlanJobTitles();

    // Get plan config for selected job title
    const planConfig = formData.job_title ? getTreatmentPlansByJobTitle(formData.job_title) : null;

    // Build combined plan options (main + additional department plans)
    const planOptions = planConfig ? [
        ...planConfig.plans.map(p => ({ label: p, department: planConfig.department })),
        ...(planConfig.additionalPlans || []).map(p => ({ label: p, department: planConfig.additionalDepartment })),
    ] : [];

    useEffect(() => {
        fetchBranches();
    }, []);

    const fetchBranches = async () => {
        try {
            const response = await treatmentPlansPublicAPI.getBranches();
            setBranches(response.data.data || []);
        } catch (err) {
            console.error('Error fetching branches:', err);
            setError('تعذر تحميل قائمة الفروع. يرجى تحديث الصفحة والمحاولة مرة أخرى');
            reportApiError(err, { url: '/api/treatment-plans/branches', method: 'GET' });
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => {
            const updated = { ...prev, [name]: value };
            // Reset dependent fields when job title changes
            if (name === 'job_title') {
                updated.plan_type = '';
                updated.department = '';
                setCustomPlanType('');
            }
            // Set department automatically when plan type is selected
            if (name === 'plan_type' && value) {
                if (value === '__other__') {
                    updated.department = planConfig?.department || '';
                } else {
                    const selected = planOptions.find(o => o.label === value);
                    if (selected) {
                        updated.department = selected.department;
                    }
                }
                if (value !== '__other__') {
                    setCustomPlanType('');
                }
            }
            return updated;
        });
        setError('');
    };

    const ALLOWED_TYPES = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
        'application/msword', // .doc
        'application/pdf', // .pdf
    ];

    /**
     * Upload a file directly to Vercel Blob via the client upload protocol.
     * Replicates what @vercel/blob/client `upload()` does, using plain XHR for progress.
     */
    const uploadToBlob = async (pathname, file, { handleUploadUrl, onUploadProgress }) => {
        // Step 1: Get client token from backend
        const tokenRes = await fetch(handleUploadUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                type: 'blob.generate-client-token',
                payload: { pathname, callbackUrl: handleUploadUrl, clientPayload: null, multipart: false },
            }),
        });
        if (!tokenRes.ok) {
            const errorData = await tokenRes.json().catch(() => ({}));
            throw new Error(errorData.error || 'فشل في الحصول على تصريح الرفع');
        }
        const { clientToken } = await tokenRes.json();

        // Step 2: Upload file directly to Vercel Blob using XHR (supports progress)
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const params = new URLSearchParams({ pathname });
            xhr.open('PUT', `https://vercel.com/api/blob/?${params.toString()}`);
            xhr.setRequestHeader('authorization', `Bearer ${clientToken}`);
            xhr.setRequestHeader('x-api-version', '12');
            xhr.setRequestHeader('x-content-type', file.type || 'application/octet-stream');
            xhr.setRequestHeader('x-content-length', String(file.size));

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable && onUploadProgress) {
                    onUploadProgress({ percentage: Math.round((e.loaded / e.total) * 100) });
                }
            };
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch {
                        reject(new Error('استجابة غير صالحة من خادم التخزين'));
                    }
                } else {
                    reject(new Error(`فشل رفع الملف (${xhr.status})`));
                }
            };
            xhr.onerror = () => reject(new Error('خطأ في الشبكة أثناء رفع الملف'));
            xhr.ontimeout = () => reject(new Error('انتهت مهلة رفع الملف'));
            xhr.send(file);
        });
    };

    const addFiles = (incomingFiles) => {
        const newFiles = Array.from(incomingFiles || []);
        const warnings = [];
        const validFiles = [];

        for (const f of newFiles) {
            if (!ALLOWED_TYPES.includes(f.type)) {
                warnings.push(`الملف "${f.name}" غير مدعوم. يُسمح بملفات Word و PDF فقط`);
            } else {
                validFiles.push(f);
            }
        }

        if (warnings.length > 0) {
            setError(warnings.join(' \u2022 '));
        }

        setFiles(prev => [...prev, ...validFiles]);
    };

    const handleFileChange = (e) => {
        addFiles(e.target.files);
        // Reset the input so the same file can be selected again
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current += 1;
        setIsDragActive(true);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDragActive) setIsDragActive(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current -= 1;
        if (dragCounterRef.current <= 0) {
            setIsDragActive(false);
            dragCounterRef.current = 0;
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
        dragCounterRef.current = 0;
        if (e.dataTransfer?.files?.length) {
            addFiles(e.dataTransfer.files);
        }
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const getUploadFailureReason = (fileErr, file) => {
        // Check for backend-specific error message
        if (fileErr.response?.data?.message) {
            return fileErr.response.data.message;
        }

        // Vercel Blob SDK errors
        if (fileErr.message?.includes('not allowed') || fileErr.message?.includes('content type')) {
            return 'نوع الملف غير مسموح به. يُسمح بملفات Word و PDF فقط';
        }
        if (fileErr.message?.includes('size') || fileErr.message?.includes('too large')) {
            return `حجم الملف كبير جداً (${formatFileSize(file?.size || 0)})`;
        }

        if (!navigator.onLine) {
            return 'لا يوجد اتصال بالإنترنت';
        }

        if (fileErr.code === 'ECONNABORTED' || fileErr.message?.includes('timeout')) {
            return 'انتهت مهلة الاتصال أثناء رفع الملف';
        }

        if (!fileErr.response && fileErr.message) {
            return fileErr.message;
        }

        if (fileErr.response?.status === 400) {
            return 'يرجى التأكد من صيغة الملف والحقول المطلوبة';
        }

        if (fileErr.response?.status >= 500) {
            return 'حدث خطأ في الخادم أثناء رفع الملف';
        }

        return 'تعذر إكمال رفع الملف. يرجى التحقق من الملف والمحاولة مرة أخرى';
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        // Validate
        if (!formData.employee_name.trim()) {
            setError('يرجى إدخال الاسم');
            return;
        }
        if (!formData.branch_id) {
            setError('يرجى اختيار الفرع');
            return;
        }
        if (!formData.job_title) {
            setError('يرجى اختيار المسمى الوظيفي');
            return;
        }
        if (!formData.plan_type) {
            setError('يرجى اختيار نوع الخطة');
            return;
        }
        if (formData.plan_type === '__other__' && !customPlanType.trim()) {
            setError('يرجى إدخال نوع الخطة الأخرى');
            return;
        }
        if (files.length === 0) {
            setError('يرجى رفع ملف واحد على الأقل');
            return;
        }

        setLoading(true);
        const progress = files.map(f => ({ name: f.name, size: f.size, percent: 0, status: 'waiting' }));
        setFileProgress([...progress]);
        let successCount = 0;
        let failedFiles = [];
        const handleUploadUrl = `${getCurrentApiUrl()}/api/treatment-plans/client-upload`;

        try {
            // Submit each file: upload to blob directly, then send metadata
            for (let i = 0; i < files.length; i++) {
                progress[i].status = 'uploading';
                progress[i].percent = 0;
                setFileProgress([...progress]);

                try {
                    // Generate unique filename for blob storage
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
                    const sanitized = files[i].name.replace(/[^a-zA-Z0-9.-]/g, '_');
                    const uniqueName = `${timestamp}_${sanitized}`;
                    const blobPath = `treatment-plans/${formData.branch_id}/${uniqueName}`;

                    // Step 1: Upload file directly to Vercel Blob
                    const blob = await uploadToBlob(blobPath, files[i], {
                        handleUploadUrl,
                        onUploadProgress: ({ percentage }) => {
                            // Blob upload = 90% of progress, metadata submission = last 10%
                            progress[i].percent = Math.round(percentage * 0.9);
                            setFileProgress([...progress]);
                        },
                    });

                    progress[i].percent = 90;
                    setFileProgress([...progress]);

                    // Step 2: Submit metadata + blob URL to backend
                    await treatmentPlansPublicAPI.submitDirect({
                        employee_name: formData.employee_name.trim(),
                        branch_id: formData.branch_id,
                        job_title: formData.job_title,
                        department: formData.department,
                        plan_type: formData.plan_type === '__other__' ? customPlanType.trim() : formData.plan_type,
                        notes: formData.notes,
                        file_url: blob.url,
                        original_filename: files[i].name,
                        file_size: files[i].size,
                    });

                    progress[i].percent = 100;
                    progress[i].status = 'done';
                    setFileProgress([...progress]);
                    successCount++;
                } catch (fileErr) {
                    console.error(`Error submitting file ${files[i].name}:`, fileErr);
                    progress[i].status = 'error';
                    setFileProgress([...progress]);

                    const reason = getUploadFailureReason(fileErr, files[i]);
                    failedFiles.push({ name: files[i].name, reason });
                    reportApiError(fileErr, {
                        url: '/api/treatment-plans/client-upload',
                        method: 'POST',
                        data: {
                            fileName: files[i].name,
                            fileSize: files[i].size,
                            fileType: files[i].type,
                            employee_name: formData.employee_name.trim(),
                            branch_id: formData.branch_id,
                            job_title: formData.job_title,
                            plan_type: formData.plan_type === '__other__' ? customPlanType.trim() : formData.plan_type,
                        },
                    });
                }
            }

            if (failedFiles.length === 0) {
                setSuccess(true);
            } else if (successCount > 0) {
                // Partial success
                const failDetails = failedFiles.map(f => `"${f.name}": ${f.reason}`).join(' \u2022 ');
                setError(`تم إرسال ${successCount} ملف بنجاح، لكن فشل ${failedFiles.length}: ${failDetails}`);
            } else {
                // All failed
                const failDetails = failedFiles.map(f => `"${f.name}": ${f.reason}`).join(' \u2022 ');
                setError(`فشل إرسال جميع الملفات: ${failDetails}`);
            }
        } catch (err) {
            console.error('Error submitting:', err);
            reportApiError(err, { url: '/api/treatment-plans/client-upload', method: 'POST' });
            setError('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى');
        } finally {
            setLoading(false);
            setFileProgress([]);
        }
    };

    const resetForm = () => {
        setFormData({
            employee_name: '',
            branch_id: '',
            job_title: '',
            department: '',
            plan_type: '',
            notes: '',
        });
        setCustomPlanType('');
        setFiles([]);
        setSuccess(false);
        setError('');
    };

    if (success) {
        return (
            <div className="treatment-plan-page">
                <div className="treatment-plan-container">
                    <div className="tp-success">
                        <div className="tp-success-icon">✅</div>
                        <h2>تم إرسال الخطة بنجاح!</h2>
                        <p>شكراً لك، تم استلام {files.length > 1 ? `${files.length} ملفات` : 'الملف'} بنجاح وسيتم مراجعته من قبل الإدارة.</p>
                        <button className="tp-success-btn" onClick={resetForm}>
                            إرسال خطة أخرى
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="treatment-plan-page">
            {/* Upload Overlay */}
            {loading && (
                <div className="tp-upload-overlay">
                    <div className="tp-upload-overlay-card">
                        <div className="tp-upload-spinner"></div>
                        <h3>جاري رفع الملفات...</h3>
                        <p>يرجى الانتظار، قد يستغرق الأمر بعض الوقت للملفات الكبيرة</p>
                        <div className="tp-upload-file-list">
                            {fileProgress.map((fp, idx) => (
                                <div key={idx} className={`tp-upload-file-item ${fp.status}`}>
                                    <div className="tp-upload-file-info">
                                        <span className="tp-upload-file-icon">
                                            {fp.status === 'done' ? '✅' : fp.status === 'error' ? '❌' : fp.status === 'uploading' ? '⏳' : '⏸️'}
                                        </span>
                                        <span className="tp-upload-file-name">{fp.name}</span>
                                        <span className="tp-upload-file-pct">{fp.percent}%</span>
                                    </div>
                                    <div className="tp-upload-file-bar">
                                        <div
                                            className="tp-upload-file-bar-fill"
                                            style={{ width: `${fp.percent}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="treatment-plan-container">
                {/* Header */}
                <div className="tp-header">
                    <h1>تقديم الخطط العلاجية والتربوية</h1>
                    <p>يرجى تعبئة النموذج ورفع الخطة بصيغة Word أو PDF</p>
                </div>

                {/* Circular Instructions */}
                <div className="tp-circular-toggle">
                    <button
                        className="tp-circular-toggle-btn"
                        onClick={() => setShowCircular(!showCircular)}
                    >
                        <span>📋 تعميم إعداد الخطط العلاجية والتربوية</span>
                        <span className={`toggle-icon ${showCircular ? 'open' : ''}`}>▼</span>
                    </button>
                    {showCircular && (
                        <div className="tp-circular-content">
                            <p>في إطار تطوير جودة الخدمات المقدمة للأطفال داخل المركز، يرجى من جميع الأخصائيين والمعلمين إعداد خطط علاجية وتربوية شاملة.</p>

                            <h3>أولاً: قسم التخاطب واللغة – عدد (3) خطط</h3>
                            <ul>
                                <li>اضطرابات اللغة (تأخر اللغة الاستقبالية، تأخر اللغة التعبيرية، ضعف المفردات، ضعف تكوين الجملة، ضعف الفهم اللغوي)</li>
                                <li>اضطرابات النطق (اللدغات، حذف الأصوات، إبدال الأصوات، تشويه الأصوات)</li>
                                <li>اضطرابات التواصل (ضعف التواصل البصري، ضعف مهارات الحوار، ضعف المبادأة في الكلام)</li>
                                <li>اضطرابات الطلاقة والصوت (التأتأة، التلعثم، اضطرابات الصوت)</li>
                            </ul>

                            <h3>ثانياً: قسم العلاج الوظيفي – عدد (2) خطة</h3>
                            <ul>
                                <li>المهارات الحركية الدقيقة (ضعف مسك القلم، ضعف التآزر البصري الحركي، صعوبة القص واللصق)</li>
                                <li>التكامل الحسي (فرط الحساسية، نقص الاستجابة، البحث الحسي، مشكلات التوازن)</li>
                                <li>مهارات الحياة اليومية (صعوبة الأكل، ارتداء الملابس، استخدام الحمام)</li>
                                <li>التخطيط الحركي (صعوبة تنفيذ الأوامر الحركية، ضعف تنظيم الحركة)</li>
                            </ul>

                            <h3>ثالثاً: قسم التكامل الحسي – عدد (2) خطة</h3>
                            <ul>
                                <li>فرط الحساسية (للصوت، اللمس، الضوء)</li>
                                <li>نقص الاستجابة الحسية</li>
                                <li>السلوكيات البحثية الحسية</li>
                                <li>مشكلات الجهاز الدهليزي واضطرابات التوازن</li>
                            </ul>

                            <h3>رابعاً: قسم العلاج الطبيعي – عدد (2) خطة</h3>
                            <ul>
                                <li>المهارات الحركية الكبرى (ضعف المشي، تأخر الجلوس أو الحبو، ضعف التوازن)</li>
                                <li>القوة العضلية (ضعف العضلات، الارتخاء، التيبس)</li>
                                <li>الاضطرابات العصبية الحركية (الشلل الدماغي وإصابات الجهاز العصبي)</li>
                                <li>مشكلات الوضعية (انحناء الظهر، صعوبات الوقوف، اضطرابات المشي)</li>
                            </ul>

                            <h3>خامساً: القسم النفسي – عدد (2) خطة</h3>
                            <ul>
                                <li>المشكلات الانفعالية (القلق، الاكتئاب، الخوف المرضي، نوبات الغضب)</li>
                                <li>المشكلات السلوكية (السلوك العدواني، الانسحاب، فرط الحركة وتشتت الانتباه)</li>
                                <li>المشكلات الاجتماعية (ضعف التفاعل الاجتماعي، صعوبة تكوين الصداقات)</li>
                                <li>المشكلات المعرفية (ضعف الانتباه، بطء التعلم، صعوبات حل المشكلات)</li>
                                <li>مشكلات التكيف داخل المركز</li>
                            </ul>

                            <h3>سادساً: المعلمات والمعلمون – عدد (5) خطط</h3>
                            <ul>
                                <li>خطة اضطراب طيف التوحد</li>
                                <li>خطة الإعاقة العقلية</li>
                                <li>خطة الإعاقة المزدوجة</li>
                                <li>خطة التأهيل للكبيرات</li>
                                <li>خطة متلازمة داون</li>
                            </ul>

                            <h3>سابعاً: الاخصائي الاجتماعي</h3>
                            <ul>
                                <li>التقارير الطبية للأطفال</li>
                                <li>نموذج لملف طفل</li>
                                <li>نموذج للام الزائرة</li>
                                <li>سجل آراء أولياء الأمور للمستفيدين</li>
                                <li>سجل الشكاوي والمقترحات</li>
                            </ul>

                            <div className="note-box">
                                <strong>📎 ملاحظات عامة:</strong>
                                <ul>
                                    <li>يجب أن تكون الخطط واضحة، منظمة، وقابلة للتطبيق والقياس</li>
                                    <li>يفضل أن تتضمن: (الأهداف – الأنشطة – الوسائل – آلية التقييم)</li>
                                    <li>الحد الأدنى: 15 خطة لكل مركز</li>
                                    <li>يجب أن يكون الملف بصيغة Word (.docx, .doc) أو PDF</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>

                {/* Form */}
                <form className="tp-form-card" onSubmit={handleSubmit}>
                    <h2>نموذج تقديم الخطة</h2>

                    {error && <div className="tp-error">⚠️ {error}</div>}

                    {/* Name & Branch in one row */}
                    <div className="tp-form-row">
                        <div className="tp-form-group">
                            <label>
                                الاسم الكامل <span className="required">*</span>
                            </label>
                            <input
                                type="text"
                                name="employee_name"
                                value={formData.employee_name}
                                onChange={handleChange}
                                placeholder="أدخل اسمك الكامل"
                                required
                            />
                        </div>

                        <div className="tp-form-group">
                            <label>
                                الفرع (المركز) <span className="required">*</span>
                            </label>
                            <select
                                name="branch_id"
                                value={formData.branch_id}
                                onChange={handleChange}
                                required
                            >
                                <option value="">-- اختر الفرع --</option>
                                {branches.map(branch => (
                                    <option key={branch.id} value={branch.id}>
                                        {branch.branch_name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Job Title */}
                    <div className="tp-form-group">
                        <label>
                            المسمى الوظيفي <span className="required">*</span>
                        </label>
                        <select
                            name="job_title"
                            value={formData.job_title}
                            onChange={handleChange}
                            required
                        >
                            <option value="">-- اختر المسمى الوظيفي --</option>
                            {jobTitles.map(title => (
                                <option key={title} value={title}>{title}</option>
                            ))}
                        </select>
                    </div>

                    {/* Show department info after selecting job title */}
                    {planConfig && (
                        <div className="tp-plan-info">
                            <div className="tp-plan-info-title">
                                📂 {planConfig.department}
                            </div>
                            <div className="tp-plan-info-count">
                                عدد الخطط المطلوبة: {planConfig.requiredCount} خطط
                            </div>
                        </div>
                    )}

                    {/* Additional department note for OT */}
                    {planConfig?.additionalDepartment && (
                        <div className="tp-additional-dept">
                            <div className="tp-additional-dept-title">
                                📌 يشمل أيضاً: {planConfig.additionalDepartment}
                            </div>
                            <div className="tp-additional-dept-text">
                                يمكنك اختيار خطط من هذا القسم أيضاً
                            </div>
                        </div>
                    )}

                    {/* Plan Type */}
                    {planConfig && (
                        <div className="tp-form-group">
                            <label>
                                نوع الخطة <span className="required">*</span>
                            </label>
                            <select
                                name="plan_type"
                                value={formData.plan_type}
                                onChange={handleChange}
                                required
                            >
                                <option value="">-- اختر نوع الخطة --</option>
                                {planConfig.plans.map(plan => (
                                    <option key={plan} value={plan}>{plan}</option>
                                ))}
                                {planConfig.additionalPlans && (
                                    <>
                                        <option disabled>── {planConfig.additionalDepartment} ──</option>
                                        {planConfig.additionalPlans.map(plan => (
                                            <option key={plan} value={plan}>{plan}</option>
                                        ))}
                                    </>
                                )}
                                <option value="__other__">أخرى</option>
                            </select>
                        </div>
                    )}

                    {formData.plan_type === '__other__' && (
                        <div className="tp-form-group">
                            <label>
                                نوع الخطة الأخرى <span className="required">*</span>
                            </label>
                            <input
                                type="text"
                                value={customPlanType}
                                onChange={(e) => {
                                    setCustomPlanType(e.target.value);
                                    setError('');
                                }}
                                placeholder="اكتب نوع الخطة"
                                required
                            />
                        </div>
                    )}

                    {/* File Upload */}
                    <div className="tp-form-group">
                        <label>
                            ملف الخطة <span className="required">*</span>
                        </label>
                        <div
                            className={`tp-file-upload ${files.length > 0 ? 'has-files' : ''} ${isDragActive ? 'drag-active' : ''}`}
                            onClick={() => fileInputRef.current?.click()}
                            onDragEnter={handleDragEnter}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".docx,.doc,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/pdf"
                                onChange={handleFileChange}
                                multiple
                            />
                            <div className="tp-file-upload-icon">📄</div>
                            <div className="tp-file-upload-text">
                                <strong>اضغط هنا</strong> أو اسحب وأفلت الملفات
                            </div>
                            <div className="tp-file-upload-hint">
                                يُسمح بملفات Word (.docx, .doc) و PDF
                            </div>
                        </div>

                        {files.length > 0 && (
                            <div className="tp-file-list">
                                {files.map((file, index) => (
                                    <div key={`${file.name}-${index}`} className="tp-file-item">
                                        <div className="tp-file-item-info">
                                            <span>📎</span>
                                            <span className="tp-file-item-name">{file.name}</span>
                                            <span className="tp-file-item-size">({formatFileSize(file.size)})</span>
                                        </div>
                                        <button
                                            type="button"
                                            className="tp-file-remove"
                                            onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Notes */}
                    <div className="tp-form-group">
                        <label>ملاحظات (اختياري)</label>
                        <textarea
                            name="notes"
                            value={formData.notes}
                            onChange={handleChange}
                            placeholder="أي ملاحظات إضافية..."
                            rows={3}
                        />
                    </div>

                    {/* Submit */}
                    <button
                        type="submit"
                        className="tp-submit-btn"
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                جاري الإرسال...
                                <span className="tp-loading"></span>
                            </>
                        ) : (
                            'إرسال الخطة'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default TreatmentPlanSubmission;
