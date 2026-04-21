/**
 * Test Emails Page
 * Main Manager only — send test emails to verify the notification systems work
 */

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { adminAPI } from '../utils/api';
import './TestEmails.css';

const TestEmails = () => {
    const { isMainManager } = useAuth();
    const { showSuccess, showError } = useNotification();

    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);

    if (!isMainManager()) {
        return (
            <div className="test-emails-page">
                <p>غير مصرح</p>
            </div>
        );
    }

    const handleSendTest = async () => {
        try {
            setLoading(true);
            setResults(null);
            const res = await adminAPI.testEmail();
            const data = res.data;
            setResults(data.results || {});
            if (data.success) {
                showSuccess('تم إرسال رسائل الاختبار بنجاح');
            } else {
                showError('بعض الرسائل فشلت — راجع النتائج أدناه');
            }
        } catch (err) {
            showError('فشل إرسال رسائل الاختبار');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="test-emails-page">
            {/* Header */}
            <div className="test-emails-header">
                <div className="test-emails-header-text">
                    <h1>اختبار نظام البريد الإلكتروني</h1>
                    <p>تحقق من أن جميع قنوات البريد الإلكتروني تعمل بشكل صحيح</p>
                </div>
            </div>

            {/* Cards describing what will be sent */}
            <div className="test-emails-cards">
                <div className="test-email-card">
                    <div className="test-email-card-icon manager-icon">📋</div>
                    <div className="test-email-card-body">
                        <h3>إشعار المدير الرئيسي</h3>
                        <p>رسالة اختبار إلى بريد المدير الرئيسي للتحقق من وصول الإشعارات</p>
                        <span className="test-email-recipient">Sharaksa@gmail.com</span>
                    </div>
                </div>

                <div className="test-email-card">
                    <div className="test-email-card-icon dev-icon">🚨</div>
                    <div className="test-email-card-body">
                        <h3>تقرير خطأ للمطوّر</h3>
                        <p>رسالة اختبار بتنسيق تقرير الأخطاء للتحقق من وصول تنبيهات المطوّر</p>
                        <span className="test-email-recipient">alshraky3@gmail.com</span>
                    </div>
                </div>
            </div>

            {/* Send button */}
            <div className="test-emails-action">
                <button
                    className="btn btn-primary btn-send-test"
                    onClick={handleSendTest}
                    disabled={loading}
                >
                    {loading ? (
                        <>
                            <span className="btn-spinner" />
                            جاري الإرسال...
                        </>
                    ) : (
                        <>
                            <span>📧</span>
                            إرسال رسائل الاختبار
                        </>
                    )}
                </button>
            </div>

            {/* Results */}
            {results && (
                <div className="test-emails-results">
                    <h2>نتائج الإرسال</h2>
                    <div className="test-results-grid">

                        {/* Manager result */}
                        {results.manager && (
                            <div className={`test-result-item ${results.manager.success ? 'success' : 'failure'}`}>
                                <div className="test-result-header">
                                    <span className="test-result-icon">{results.manager.success ? '✅' : '❌'}</span>
                                    <span className="test-result-title">إشعار المدير الرئيسي</span>
                                    <span className={`test-result-badge ${results.manager.success ? 'badge-success' : 'badge-fail'}`}>
                                        {results.manager.success ? 'نجح' : 'فشل'}
                                    </span>
                                </div>
                                <div className="test-result-body">
                                    {results.manager.email && (
                                        <p><strong>المستلم:</strong> {results.manager.email}</p>
                                    )}
                                    {results.manager.messageId && (
                                        <p className="message-id"><strong>Message ID:</strong> {results.manager.messageId}</p>
                                    )}
                                    {results.manager.error && (
                                        <p className="result-error"><strong>الخطأ:</strong> {results.manager.error}</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Developer result */}
                        {results.developer && (
                            <div className={`test-result-item ${results.developer.success ? 'success' : 'failure'}`}>
                                <div className="test-result-header">
                                    <span className="test-result-icon">{results.developer.success ? '✅' : '❌'}</span>
                                    <span className="test-result-title">تقرير الأخطاء للمطوّر</span>
                                    <span className={`test-result-badge ${results.developer.success ? 'badge-success' : 'badge-fail'}`}>
                                        {results.developer.success ? 'نجح' : 'فشل'}
                                    </span>
                                </div>
                                <div className="test-result-body">
                                    {results.developer.email && (
                                        <p><strong>المستلم:</strong> {results.developer.email}</p>
                                    )}
                                    {results.developer.messageId && (
                                        <p className="message-id"><strong>Message ID:</strong> {results.developer.messageId}</p>
                                    )}
                                    {results.developer.error && (
                                        <p className="result-error"><strong>الخطأ:</strong> {results.developer.error}</p>
                                    )}
                                    {results.developer.reason === 'rate_limited' && (
                                        <p className="result-warn">تم تجاوز حد الإرسال — انتظر 5 دقائق وأعد المحاولة</p>
                                    )}
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            )}
        </div>
    );
};

export default TestEmails;
