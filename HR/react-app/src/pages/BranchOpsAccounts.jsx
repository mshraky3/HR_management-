/**
 * Branch Operations Manager Accounts Page
 * Full management: create/edit/delete accounts, assign branches, view stats
 */

import { useState, useEffect, useCallback } from 'react';
import { usersAPI, branchesAPI } from '../utils/api';
import { useNotification } from '../contexts/NotificationContext';

const BranchOpsAccounts = () => {
    const { showError, showSuccess } = useNotification();
    const [accounts, setAccounts] = useState([]);
    const [allBranches, setAllBranches] = useState([]);
    const [loading, setLoading] = useState(true);

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [editingAccount, setEditingAccount] = useState(null);
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        full_name: '',
        email: '',
    });
    // Branch selection inside form
    const [formBranchIds, setFormBranchIds] = useState([]);
    const [branchSaving, setBranchSaving] = useState(false);

    // Detail/expand view
    const [expandedId, setExpandedId] = useState(null);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const [accountsRes, branchesRes] = await Promise.all([
                usersAPI.getBranchOpsList(),
                branchesAPI.getAll({ is_active: true }),
            ]);
            if (accountsRes.data.success) setAccounts(accountsRes.data.data || []);
            if (branchesRes.data.success) setAllBranches(branchesRes.data.data || []);
        } catch (error) {
            console.error('Error loading data:', error);
            showError('فشل تحميل البيانات');
        } finally {
            setLoading(false);
        }
    }, [showError]);

    useEffect(() => { loadData(); }, [loadData]);

    // CRUD
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const submitData = { ...formData, role: 'branch_operations_manager' };
            let userId;

            if (editingAccount) {
                if (!submitData.password?.trim()) delete submitData.password;
                await usersAPI.update(editingAccount.id, submitData);
                userId = editingAccount.id;

                // Sync branch assignments
                const oldIds = (editingAccount.assigned_branches || []).map(b => b.branch_id);
                const toAssign = formBranchIds.filter(id => !oldIds.includes(id));
                const toUnassign = oldIds.filter(id => !formBranchIds.includes(id));
                setBranchSaving(true);
                await Promise.all([
                    ...toAssign.map(bid => usersAPI.assignBranch(userId, bid)),
                    ...toUnassign.map(bid => usersAPI.unassignBranch(userId, bid)),
                ]);
                setBranchSaving(false);
                showSuccess('تم تحديث الحساب بنجاح');
            } else {
                const res = await usersAPI.create(submitData);
                userId = res.data.data?.id;
                // Assign branches for new account
                if (userId && formBranchIds.length > 0) {
                    setBranchSaving(true);
                    await Promise.all(formBranchIds.map(bid => usersAPI.assignBranch(userId, bid)));
                    setBranchSaving(false);
                }
                showSuccess('تم إنشاء الحساب بنجاح');
            }
            closeForm();
            loadData();
        } catch (error) {
            setBranchSaving(false);
            showError(error.response?.data?.message || 'فشل حفظ الحساب');
        }
    };

    const openCreateForm = () => {
        setEditingAccount(null);
        setFormData({ username: '', password: '', full_name: '', email: '' });
        setFormBranchIds([]);
        setShowForm(true);
    };

    const handleEdit = (account) => {
        setEditingAccount(account);
        setFormData({
            username: account.username,
            password: '',
            full_name: account.full_name,
            email: account.email || '',
        });
        setFormBranchIds((account.assigned_branches || []).map(b => b.branch_id));
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (!confirm('هل أنت متأكد من رغبتك في حذف هذا الحساب؟')) return;
        try {
            await usersAPI.delete(id);
            showSuccess('تم حذف الحساب بنجاح');
            loadData();
        } catch (error) {
            showError('فشل حذف الحساب');
        }
    };

    const closeForm = () => {
        setShowForm(false);
        setEditingAccount(null);
        setFormData({ username: '', password: '', full_name: '', email: '' });
        setFormBranchIds([]);
    };

    // Branch toggle helpers
    const toggleFormBranch = (branchId) => {
        setFormBranchIds(prev =>
            prev.includes(branchId) ? prev.filter(id => id !== branchId) : [...prev, branchId]
        );
    };

    const selectAllBranches = () => setFormBranchIds(allBranches.map(b => b.id));
    const deselectAllBranches = () => setFormBranchIds([]);

    // Helpers
    const formatDate = (dateStr) => {
        if (!dateStr) return 'لم يسجل دخول بعد';
        return new Date(dateStr).toLocaleDateString('ar-SA', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    };

    const branchTypeName = (type) => type === 'healthcare_center' ? 'مركز رعاية' : 'مدرسة';

    if (loading) {
        return <div className="loading">جاري تحميل الحسابات...</div>;
    }

    return (
        <div className="table-page">
            <div className="page-header">
                <h1>حسابات إدارة بيانات الفروع</h1>
                <button onClick={openCreateForm} className="btn-primary btn-lg">
                    إضافة حساب جديد
                </button>
            </div>

            {/* Summary stats */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <div style={{ background: '#f0f4ff', borderRadius: '10px', padding: '16px 24px', flex: '1', minWidth: '180px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#3b82f6' }}>{accounts.length}</div>
                    <div style={{ color: '#6b7280', marginTop: '4px' }}>إجمالي الحسابات</div>
                </div>
                <div style={{ background: '#f0fdf4', borderRadius: '10px', padding: '16px 24px', flex: '1', minWidth: '180px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#22c55e' }}>
                        {accounts.filter(a => a.assigned_branches_count > 0).length}
                    </div>
                    <div style={{ color: '#6b7280', marginTop: '4px' }}>لديهم فروع معيّنة</div>
                </div>
                <div style={{ background: '#fff7ed', borderRadius: '10px', padding: '16px 24px', flex: '1', minWidth: '180px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#f59e0b' }}>
                        {accounts.filter(a => a.assigned_branches_count === 0).length}
                    </div>
                    <div style={{ color: '#6b7280', marginTop: '4px' }}>بدون فروع</div>
                </div>
            </div>

            {/* Create/Edit Form Modal — includes branch assignment */}
            {showForm && (
                <div className="modal">
                    <div className="modal-content" style={{ maxWidth: '700px' }}>
                        <h2>{editingAccount ? 'تعديل الحساب' : 'إنشاء حساب جديد'}</h2>
                        <form onSubmit={handleSubmit}>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>اسم المستخدم *</label>
                                    <input
                                        type="text"
                                        value={formData.username}
                                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                        required
                                        placeholder="اسم المستخدم لتسجيل الدخول"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>كلمة المرور {!editingAccount && '*'}</label>
                                    <input
                                        type="text"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        required={!editingAccount}
                                        placeholder={editingAccount ? 'اتركه فارغاً إذا لم ترد تغييره' : 'كلمة المرور'}
                                    />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>الاسم الكامل *</label>
                                    <input
                                        type="text"
                                        value={formData.full_name}
                                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>البريد الإلكتروني *</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        required
                                        placeholder="يُستخدم لإرسال رمز التحقق عند تسجيل الدخول"
                                    />
                                </div>
                            </div>

                            {/* Branch Assignment Section */}
                            <div style={{ marginTop: '16px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                    <label style={{ fontWeight: 600, fontSize: '1em', color: '#374151' }}>
                                        تعيين الفروع ({formBranchIds.length} / {allBranches.length})
                                    </label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            type="button"
                                            onClick={selectAllBranches}
                                            style={{
                                                padding: '4px 12px', borderRadius: '6px', border: '1px solid #8b5cf6',
                                                background: formBranchIds.length === allBranches.length ? '#8b5cf6' : '#fff',
                                                color: formBranchIds.length === allBranches.length ? '#fff' : '#8b5cf6',
                                                cursor: 'pointer', fontSize: '0.85em', fontWeight: 500,
                                            }}
                                        >
                                            تحديد الكل
                                        </button>
                                        {formBranchIds.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={deselectAllBranches}
                                                style={{
                                                    padding: '4px 12px', borderRadius: '6px', border: '1px solid #ef4444',
                                                    background: '#fff', color: '#ef4444',
                                                    cursor: 'pointer', fontSize: '0.85em', fontWeight: 500,
                                                }}
                                            >
                                                إلغاء الكل
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <p style={{ color: '#6b7280', fontSize: '0.85em', marginBottom: '8px' }}>
                                    اختر الفروع التي يستطيع هذا الحساب الوصول إليها
                                </p>
                                <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                                    {allBranches.map((branch) => (
                                        <label
                                            key={branch.id}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '10px',
                                                padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0',
                                                background: formBranchIds.includes(branch.id) ? '#f5f3ff' : 'transparent',
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={formBranchIds.includes(branch.id)}
                                                onChange={() => toggleFormBranch(branch.id)}
                                                style={{ width: '18px', height: '18px' }}
                                            />
                                            <span style={{ fontWeight: 500 }}>{branch.branch_name}</span>
                                            <span style={{
                                                fontSize: '0.8em', padding: '2px 8px', borderRadius: '12px',
                                                background: branch.branch_type === 'healthcare_center' ? '#dbeafe' : '#dcfce7',
                                                color: branch.branch_type === 'healthcare_center' ? '#1d4ed8' : '#166534',
                                            }}>
                                                {branchTypeName(branch.branch_type)}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="form-actions" style={{ marginTop: '16px' }}>
                                <button type="submit" className="btn-primary btn-lg" disabled={branchSaving}>
                                    {branchSaving ? 'جاري الحفظ...' : 'حفظ'}
                                </button>
                                <button type="button" onClick={closeForm} className="btn-secondary btn-lg">إلغاء</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Accounts list */}
            {accounts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
                    <div style={{ fontSize: '3em', marginBottom: '12px' }}>👤</div>
                    <p style={{ fontSize: '1.1em' }}>لا توجد حسابات إدارة بيانات فروع بعد</p>
                    <p>اضغط &quot;إضافة حساب جديد&quot; لإنشاء أول حساب</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {accounts.map((account) => (
                        <div
                            key={account.id}
                            style={{
                                background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb',
                                overflow: 'hidden', transition: 'box-shadow 0.2s',
                                boxShadow: expandedId === account.id ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
                            }}
                        >
                            {/* Card header */}
                            <div
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '16px 20px', cursor: 'pointer', flexWrap: 'wrap', gap: '10px',
                                }}
                                onClick={() => setExpandedId(expandedId === account.id ? null : account.id)}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '44px', height: '44px', borderRadius: '50%', background: '#ede9fe',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 'bold', color: '#7c3aed', fontSize: '1.2em',
                                    }}>
                                        {account.full_name?.charAt(0) || '?'}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '1.05em' }}>{account.full_name}</div>
                                        <div style={{ color: '#9ca3af', fontSize: '0.85em' }}>@{account.username}</div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                    <span style={{
                                        padding: '4px 12px', borderRadius: '16px', fontSize: '0.85em',
                                        background: account.assigned_branches_count > 0 ? '#dcfce7' : '#fef3c7',
                                        color: account.assigned_branches_count > 0 ? '#166534' : '#92400e',
                                    }}>
                                        {account.assigned_branches_count} فرع
                                    </span>
                                    <span style={{ color: '#9ca3af', fontSize: '0.8em' }}>
                                        ◀ {expandedId === account.id ? 'إخفاء' : 'التفاصيل'}
                                    </span>
                                </div>
                            </div>

                            {/* Expanded details */}
                            {expandedId === account.id && (
                                <div style={{ borderTop: '1px solid #f0f0f0', padding: '16px 20px' }}>
                                    {/* Info grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                                        <div style={{ background: '#f9fafb', padding: '12px', borderRadius: '8px' }}>
                                            <div style={{ color: '#6b7280', fontSize: '0.85em', marginBottom: '4px' }}>اسم المستخدم</div>
                                            <div style={{ fontWeight: 500 }}>{account.username}</div>
                                        </div>
                                        <div style={{ background: '#f9fafb', padding: '12px', borderRadius: '8px' }}>
                                            <div style={{ color: '#6b7280', fontSize: '0.85em', marginBottom: '4px' }}>كلمة المرور</div>
                                            <div style={{ fontWeight: 500, fontFamily: 'monospace' }}>{account.password || '-'}</div>
                                        </div>
                                        <div style={{ background: '#f9fafb', padding: '12px', borderRadius: '8px' }}>
                                            <div style={{ color: '#6b7280', fontSize: '0.85em', marginBottom: '4px' }}>البريد الإلكتروني</div>
                                            <div style={{ fontWeight: 500 }}>{account.email || '-'}</div>
                                        </div>
                                        <div style={{ background: '#f9fafb', padding: '12px', borderRadius: '8px' }}>
                                            <div style={{ color: '#6b7280', fontSize: '0.85em', marginBottom: '4px' }}>تاريخ الإنشاء</div>
                                            <div style={{ fontWeight: 500 }}>{formatDate(account.created_at)}</div>
                                        </div>
                                        <div style={{ background: '#f9fafb', padding: '12px', borderRadius: '8px' }}>
                                            <div style={{ color: '#6b7280', fontSize: '0.85em', marginBottom: '4px' }}>آخر تسجيل دخول</div>
                                            <div style={{ fontWeight: 500 }}>{formatDate(account.last_login_attempt)}</div>
                                        </div>
                                    </div>

                                    {/* Assigned branches */}
                                    <div style={{ marginBottom: '16px' }}>
                                        <div style={{ fontWeight: 600, marginBottom: '8px', color: '#374151' }}>الفروع المعيّنة:</div>
                                        {account.assigned_branches?.length > 0 ? (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                {account.assigned_branches.map((b) => (
                                                    <span key={b.branch_id} style={{
                                                        padding: '6px 14px', borderRadius: '20px', fontSize: '0.9em',
                                                        background: b.branch_type === 'healthcare_center' ? '#dbeafe' : '#dcfce7',
                                                        color: b.branch_type === 'healthcare_center' ? '#1d4ed8' : '#166534',
                                                    }}>
                                                        {b.branch_name}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span style={{ color: '#f59e0b' }}>لا توجد فروع معيّنة</span>
                                        )}
                                    </div>

                                    {/* Action buttons */}
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <button onClick={(e) => { e.stopPropagation(); handleEdit(account); }} className="btn-sm btn-edit">
                                            تعديل الحساب
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); handleDelete(account.id); }} className="btn-sm btn-delete">
                                            حذف
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default BranchOpsAccounts;
