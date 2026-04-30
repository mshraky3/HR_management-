/**
 * Employee Expiry Notifications Page
 * Shows expiring employee dates with stats, filters, inline editing, export, and branch notifications.
 * Main manager: sees all branches, can export Excel and notify branches.
 * Branch manager: sees own branch only, can update dates inline.
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNotification } from "../contexts/NotificationContext";
import { employeeExpiryAPI, branchesAPI } from "../utils/api";
import { downloadFile } from "../utils/downloadFile";
import "./EmployeeExpiry.css";

const STATUS_LABELS = {
    expired: "منتهي",
    within_30_days: "خلال 30 يوم",
    within_90_days: "خلال 90 يوم",
    ok: "ساري",
};

const TYPE_LABELS = {
    id_expiry: "الهوية/الإقامة",
    contract_end: "العقد",
    passport_expiry: "الجواز",
    document_expiry: "مستند",
};

const buildPrefillTaskMessage = (row) => {
    const name = [row.first_name, row.second_name, row.third_name, row.fourth_name].filter(Boolean).join(" ") || "غير محدد";
    const lines = [
        `يرجى مراجعة وتحديث تاريخ الموظف: ${name}`,
        `نوع التاريخ: ${row.expiry_type_label || TYPE_LABELS[row.expiry_type] || row.expiry_type}`,
        `التاريخ الحالي (ميلادي): ${row.expiry_date ? new Date(row.expiry_date).toLocaleDateString("en-CA") : "-"}`,
    ];

    if (row.expiry_date_hijri) {
        lines.push(`التاريخ الحالي (هجري): ${row.expiry_date_hijri}`);
    }

    lines.push("الرجاء تحديثه في أسرع وقت.");
    return lines.join("\n");
};

const EmployeeExpiry = () => {
    const { isMainManager } = useAuth();
    const { showError, showSuccess } = useNotification();

    // Data state
    const [summary, setSummary] = useState(null);
    const [records, setRecords] = useState([]);
    const [total, setTotal] = useState(0);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [listLoading, setListLoading] = useState(false);

    // Filters
    const [filterBranch, setFilterBranch] = useState("");
    const [filterType, setFilterType] = useState("");
    const [filterStatus, setFilterStatus] = useState("");
    const [page, setPage] = useState(1);
    const limit = 50;

    // Inline edit state
    const [editingRow, setEditingRow] = useState(null);
    const [editDate, setEditDate] = useState("");
    const [editDateHijri, setEditDateHijri] = useState("");
    const [saving, setSaving] = useState(false);

    // Notify state
    const [notifying, setNotifying] = useState(false);
    const [selectedBranches, setSelectedBranches] = useState([]);
    const [exporting, setExporting] = useState(false);

    // Row task request state
    const [taskModalOpen, setTaskModalOpen] = useState(false);
    const [selectedTaskRow, setSelectedTaskRow] = useState(null);
    const [taskMessage, setTaskMessage] = useState("");
    const [taskSubmitting, setTaskSubmitting] = useState(false);

    // Load summary + branches on mount
    useEffect(() => {
        loadInitialData();
    }, []);

    // Reload list when filters/page change
    useEffect(() => {
        loadList();
    }, [filterBranch, filterType, filterStatus, page]);

    const loadInitialData = async () => {
        try {
            setLoading(true);
            const promises = [employeeExpiryAPI.getSummary()];
            if (isMainManager()) {
                promises.push(branchesAPI.getAll({ is_active: true }));
            }
            const results = await Promise.all(promises);

            if (results[0]?.data?.success) {
                setSummary(results[0].data.data);
            }
            if (results[1]?.data?.success) {
                setBranches(results[1].data.data || []);
            }
        } catch (err) {
            showError("فشل تحميل البيانات");
        } finally {
            setLoading(false);
        }
        await loadList();
    };

    const loadList = useCallback(async () => {
        try {
            setListLoading(true);
            const params = { page, limit };
            if (filterBranch) params.branch_id = filterBranch;
            if (filterType) params.expiry_type = filterType;
            if (filterStatus) params.status_bucket = filterStatus;

            const res = await employeeExpiryAPI.getList(params);
            if (res?.data?.success) {
                setRecords(res.data.data || []);
                setTotal(res.data.total || 0);
            }
        } catch (err) {
            showError("فشل تحميل القائمة");
        } finally {
            setListLoading(false);
        }
    }, [filterBranch, filterType, filterStatus, page]);

    // Inline edit handlers
    const startEdit = (row) => {
        const key = `${row.employee_id}-${row.expiry_type}-${row.document_id || ""}`;
        setEditingRow(key);
        setEditDate(row.expiry_date ? new Date(row.expiry_date).toISOString().split("T")[0] : "");
        setEditDateHijri(row.expiry_date_hijri || "");
    };

    const cancelEdit = () => {
        setEditingRow(null);
        setEditDate("");
        setEditDateHijri("");
    };

    const saveEdit = async (row) => {
        if (!editDate) {
            showError("يرجى إدخال التاريخ");
            return;
        }
        try {
            setSaving(true);
            const payload = {
                employee_id: row.employee_id,
                expiry_type: row.expiry_type,
                new_date: editDate,
                new_date_hijri: editDateHijri || undefined,
            };
            if (row.document_id) payload.document_id = row.document_id;

            const res = await employeeExpiryAPI.updateDate(payload);
            if (res?.data?.success) {
                showSuccess("تم تحديث التاريخ بنجاح");
                cancelEdit();
                // Refresh both in parallel
                const [, summaryRes] = await Promise.all([loadList(), employeeExpiryAPI.getSummary()]);
                if (summaryRes?.data?.success) setSummary(summaryRes.data.data);
            }
        } catch (err) {
            showError(err.response?.data?.message || "فشل تحديث التاريخ");
        } finally {
            setSaving(false);
        }
    };

    // Export handler
    const handleExport = async () => {
        try {
            setExporting(true);
            const params = {};
            if (filterBranch) params.branch_id = filterBranch;
            if (filterType) params.expiry_type = filterType;
            if (filterStatus) params.status_bucket = filterStatus;

            const res = await employeeExpiryAPI.exportExcel(params);
            downloadFile(new Blob([res.data]), `employee-expiry-report-${new Date().toISOString().split("T")[0]}.xlsx`);
            showSuccess("تم تحميل التقرير بنجاح");
        } catch (err) {
            showError("فشل تحميل التقرير");
        } finally {
            setExporting(false);
        }
    };

    // Notify branches handler
    const handleNotifyBranches = async () => {
        if (selectedBranches.length === 0) {
            showError("يرجى اختيار فرع واحد على الأقل");
            return;
        }
        try {
            setNotifying(true);
            const res = await employeeExpiryAPI.notifyBranches({ branch_ids: selectedBranches });
            if (res?.data?.success) {
                const sent = res.data.data.filter((r) => r.status === "sent").length;
                const skipped = res.data.data.filter((r) => r.status === "skipped").length;
                showSuccess(`تم إرسال التنبيهات: ${sent} فرع. تم تجاوز: ${skipped} فرع (بدون تواريخ منتهية).`);
                setSelectedBranches([]);
            }
        } catch (err) {
            showError("فشل إرسال التنبيهات");
        } finally {
            setNotifying(false);
        }
    };

    const toggleBranchSelection = (branchId) => {
        setSelectedBranches((prev) =>
            prev.includes(branchId) ? prev.filter((id) => id !== branchId) : [...prev, branchId]
        );
    };

    const selectAllBranches = () => {
        if (summary?.byBranch) {
            setSelectedBranches(summary.byBranch.map((b) => b.branch_id));
        }
    };

    const getRowKey = (row) => `${row.employee_id}-${row.expiry_type}-${row.document_id || ""}`;

    const formatFullName = (row) =>
        [row.first_name, row.second_name, row.third_name, row.fourth_name].filter(Boolean).join(" ");

    const openTaskModal = (row) => {
        setSelectedTaskRow(row);
        setTaskMessage(buildPrefillTaskMessage(row));
        setTaskModalOpen(true);
    };

    const closeTaskModal = () => {
        setTaskModalOpen(false);
        setSelectedTaskRow(null);
        setTaskMessage("");
        setTaskSubmitting(false);
    };

    const handleSendRowTask = async () => {
        if (!selectedTaskRow) return;

        try {
            setTaskSubmitting(true);
            const payload = {
                employee_id: selectedTaskRow.employee_id,
                branch_id: selectedTaskRow.branch_id,
                expiry_type: selectedTaskRow.expiry_type,
                expiry_type_label: selectedTaskRow.expiry_type_label,
                current_expiry_date: selectedTaskRow.expiry_date ? new Date(selectedTaskRow.expiry_date).toISOString().split("T")[0] : "",
                current_expiry_date_hijri: selectedTaskRow.expiry_date_hijri || undefined,
                status_bucket: selectedTaskRow.status_bucket,
                document_id: selectedTaskRow.document_id || undefined,
                custom_message: taskMessage,
                employee_name: formatFullName(selectedTaskRow),
            };

            const res = await employeeExpiryAPI.requestUpdateTask(payload);
            if (res?.data?.success) {
                showSuccess("تم إرسال مهمة تحديث التاريخ للفرع");
                closeTaskModal();
            }
        } catch (err) {
            if (err?.response?.status === 409) {
                showError("يوجد طلب تحديث مفتوح بالفعل لهذا التاريخ");
            } else {
                showError(err.response?.data?.message || "فشل إرسال مهمة التحديث");
            }
        } finally {
            setTaskSubmitting(false);
        }
    };

    const totalPages = Math.ceil(total / limit);

    if (loading) {
        return (
            <div className="expiry-page">
                <div className="expiry-loading">
                    <div className="spinner" />
                    <p>جاري تحميل البيانات...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="expiry-page">
            <div className="expiry-header">
                <h1>
                    <span className="header-icon">⏰</span>
                    تنبيهات التواريخ المنتهية
                </h1>
                <p className="header-subtitle">متابعة وتحديث تواريخ انتهاء الهوية والعقد والجواز ومستندات الموظفين</p>
            </div>

            {/* Summary Cards */}
            {summary && (
                <div className="expiry-summary-cards">
                    <div
                        className={`summary-card expired ${filterStatus === "expired" ? "active" : ""}`}
                        onClick={() => { setFilterStatus(filterStatus === "expired" ? "" : "expired"); setPage(1); }}
                    >
                        <div className="card-icon">🔴</div>
                        <div className="card-content">
                            <div className="card-number">{summary.totals.expired || 0}</div>
                            <div className="card-label">منتهي</div>
                        </div>
                    </div>
                    <div
                        className={`summary-card warning ${filterStatus === "within_30_days" ? "active" : ""}`}
                        onClick={() => { setFilterStatus(filterStatus === "within_30_days" ? "" : "within_30_days"); setPage(1); }}
                    >
                        <div className="card-icon">🟠</div>
                        <div className="card-content">
                            <div className="card-number">{summary.totals.within_30_days || 0}</div>
                            <div className="card-label">خلال 30 يوم</div>
                        </div>
                    </div>
                    <div
                        className={`summary-card caution ${filterStatus === "within_90_days" ? "active" : ""}`}
                        onClick={() => { setFilterStatus(filterStatus === "within_90_days" ? "" : "within_90_days"); setPage(1); }}
                    >
                        <div className="card-icon">🟡</div>
                        <div className="card-content">
                            <div className="card-number">{summary.totals.within_90_days || 0}</div>
                            <div className="card-label">خلال 90 يوم</div>
                        </div>
                    </div>
                    <div
                        className={`summary-card ok ${filterStatus === "ok" ? "active" : ""}`}
                        onClick={() => { setFilterStatus(filterStatus === "ok" ? "" : "ok"); setPage(1); }}
                    >
                        <div className="card-icon">🟢</div>
                        <div className="card-content">
                            <div className="card-number">{summary.totals.ok || 0}</div>
                            <div className="card-label">ساري</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Type Breakdown */}
            {summary?.byType && (
                <div className="expiry-type-breakdown">
                    <h3>تفصيل حسب النوع</h3>
                    <div className="type-cards">
                        {Object.entries(summary.byType).map(([type, data]) => (
                            <div
                                key={type}
                                className={`type-card ${filterType === type ? "active" : ""}`}
                                onClick={() => { setFilterType(filterType === type ? "" : type); setPage(1); }}
                            >
                                <div className="type-label">{TYPE_LABELS[type] || data.label}</div>
                                <div className="type-counts">
                                    {data.expired > 0 && <span className="badge expired">{data.expired} منتهي</span>}
                                    {data.within_30_days > 0 && <span className="badge warning">{data.within_30_days} قريب</span>}
                                    {data.within_90_days > 0 && <span className="badge caution">{data.within_90_days} خلال 90</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Actions Bar */}
            <div className="expiry-actions-bar">
                <div className="filters">
                    {isMainManager() && (
                        <select
                            value={filterBranch}
                            onChange={(e) => { setFilterBranch(e.target.value); setPage(1); }}
                            className="filter-select"
                        >
                            <option value="">كل الفروع</option>
                            {branches.map((b) => (
                                <option key={b.id} value={b.id}>{b.branch_name}</option>
                            ))}
                        </select>
                    )}
                    <select
                        value={filterType}
                        onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
                        className="filter-select"
                    >
                        <option value="">كل الأنواع</option>
                        <option value="id_expiry">الهوية/الإقامة</option>
                        <option value="contract_end">العقد</option>
                        <option value="passport_expiry">الجواز</option>
                        <option value="document_expiry">مستند</option>
                    </select>
                    <select
                        value={filterStatus}
                        onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
                        className="filter-select"
                    >
                        <option value="">كل الحالات</option>
                        <option value="expired">منتهي</option>
                        <option value="within_30_days">خلال 30 يوم</option>
                        <option value="within_90_days">خلال 90 يوم</option>
                        <option value="ok">ساري</option>
                    </select>
                </div>
                <div className="action-buttons">
                    {isMainManager() && (
                        <button className="btn-export" onClick={handleExport} disabled={exporting}>
                            {exporting ? "جاري التصدير..." : "📥 تصدير Excel"}
                        </button>
                    )}
                </div>
            </div>

            {/* Branch Notification Section (main manager only) */}
            {isMainManager() && summary?.byBranch && summary.byBranch.length > 0 && (
                <div className="expiry-notify-section">
                    <div className="notify-header">
                        <h3>إرسال تنبيهات للفروع</h3>
                        <div className="notify-actions">
                            <button className="btn-select-all" onClick={selectAllBranches}>تحديد الكل</button>
                            <button className="btn-clear" onClick={() => setSelectedBranches([])}>إلغاء التحديد</button>
                            <button
                                className="btn-notify"
                                onClick={handleNotifyBranches}
                                disabled={notifying || selectedBranches.length === 0}
                            >
                                {notifying ? "جاري الإرسال..." : `📧 إرسال تنبيه (${selectedBranches.length})`}
                            </button>
                        </div>
                    </div>
                    <div className="branch-notify-list">
                        {summary.byBranch.map((b) => (
                            <div
                                key={b.branch_id}
                                className={`branch-notify-item ${selectedBranches.includes(b.branch_id) ? "selected" : ""}`}
                                onClick={() => toggleBranchSelection(b.branch_id)}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedBranches.includes(b.branch_id)}
                                    onChange={() => toggleBranchSelection(b.branch_id)}
                                />
                                <span className="branch-name">{b.branch_name}</span>
                                <div className="branch-counts">
                                    {b.expired_count > 0 && <span className="badge expired">{b.expired_count} منتهي</span>}
                                    {b.expiring_soon_count > 0 && <span className="badge warning">{b.expiring_soon_count} قريب</span>}
                                </div>
                                {!b.branch_email && <span className="no-email">⚠️ بدون بريد</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Records Table */}
            <div className="expiry-table-container">
                <div className="table-header-info">
                    <span>إجمالي النتائج: {total}</span>
                    {totalPages > 1 && <span>صفحة {page} من {totalPages}</span>}
                </div>

                {listLoading ? (
                    <div className="table-loading">
                        <div className="spinner" />
                    </div>
                ) : records.length === 0 ? (
                    <div className="empty-state">
                        <p>لا توجد نتائج مطابقة للفلاتر المحددة</p>
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table className="expiry-table">
                            <thead>
                                <tr>
                                    <th>الموظف</th>
                                    <th>رقم الهوية</th>
                                    {isMainManager() && <th>الفرع</th>}
                                    <th>نوع التاريخ</th>
                                    <th>تاريخ الانتهاء</th>
                                    <th>الأيام المتبقية</th>
                                    <th>الحالة</th>
                                    <th>إجراءات</th>
                                </tr>
                            </thead>
                            <tbody>
                                {records.map((row) => {
                                    const key = getRowKey(row);
                                    const isEditing = editingRow === key;
                                    return (
                                        <tr key={key} className={`status-${row.status_bucket}`}>
                                            <td className="employee-name">
                                                <div>{formatFullName(row)}</div>
                                                {row.employee_id_number && (
                                                    <small className="emp-num">{row.employee_id_number}</small>
                                                )}
                                            </td>
                                            <td>{row.id_or_residency_number || "-"}</td>
                                            {isMainManager() && <td>{row.branch_name}</td>}
                                            <td>
                                                <span className={`type-badge type-${row.expiry_type}`}>
                                                    {row.expiry_type_label}
                                                </span>
                                            </td>
                                            <td>
                                                {isEditing ? (
                                                    <div className="edit-field">
                                                        <input
                                                            type="date"
                                                            value={editDate}
                                                            onChange={(e) => setEditDate(e.target.value)}
                                                            className="date-input"
                                                        />
                                                        <input
                                                            type="text"
                                                            value={editDateHijri}
                                                            onChange={(e) => setEditDateHijri(e.target.value)}
                                                            className="date-hijri-input"
                                                            placeholder="هجري (اختياري)"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <div>{row.expiry_date ? new Date(row.expiry_date).toLocaleDateString("en-CA") : "-"}</div>
                                                        {row.expiry_date_hijri && <small className="hijri-date">{row.expiry_date_hijri}</small>}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <span className={`days-badge ${row.days_until_expiry < 0 ? "negative" : row.days_until_expiry <= 30 ? "urgent" : row.days_until_expiry <= 90 ? "soon" : "safe"}`}>
                                                    {row.days_until_expiry < 0
                                                        ? `متأخر ${Math.abs(row.days_until_expiry)} يوم`
                                                        : `${row.days_until_expiry} يوم`}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`status-badge status-${row.status_bucket}`}>
                                                    {STATUS_LABELS[row.status_bucket]}
                                                </span>
                                            </td>
                                            <td>
                                                {isEditing ? (
                                                    <div className="edit-actions">
                                                        <button
                                                            className="btn-save"
                                                            onClick={() => saveEdit(row)}
                                                            disabled={saving}
                                                        >
                                                            {saving ? "..." : "✓"}
                                                        </button>
                                                        <button className="btn-cancel" onClick={cancelEdit}>✕</button>
                                                    </div>
                                                ) : (
                                                    <div className="row-actions">
                                                        <button className="btn-edit" onClick={() => startEdit(row)} title="تعديل التاريخ">
                                                            ✏️
                                                        </button>
                                                        {isMainManager() && (
                                                            <button
                                                                className="btn-request-task"
                                                                onClick={() => openTaskModal(row)}
                                                                title="إرسال مهمة تحديث للفرع"
                                                            >
                                                                📌 طلب تحديث
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="pagination">
                        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
                        <span>صفحة {page} من {totalPages}</span>
                        <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>التالي</button>
                    </div>
                )}
            </div>

            {taskModalOpen && selectedTaskRow && (
                <div className="task-modal-overlay" onClick={closeTaskModal}>
                    <div className="task-modal" onClick={(e) => e.stopPropagation()}>
                        <h3>إرسال مهمة تحديث للفرع</h3>
                        <p className="task-modal-subtitle">
                            سيتم إنشاء مهمة للفرع لمراجعة/تحديث هذا التاريخ.
                        </p>
                        <textarea
                            className="task-message-input"
                            value={taskMessage}
                            onChange={(e) => setTaskMessage(e.target.value)}
                            rows={7}
                            placeholder="اكتب رسالة المهمة"
                        />
                        <div className="task-modal-actions">
                            <button className="btn-clear" onClick={closeTaskModal} disabled={taskSubmitting}>إلغاء</button>
                            <button className="btn-notify" onClick={handleSendRowTask} disabled={taskSubmitting}>
                                {taskSubmitting ? "جاري الإرسال..." : "إرسال المهمة"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmployeeExpiry;
