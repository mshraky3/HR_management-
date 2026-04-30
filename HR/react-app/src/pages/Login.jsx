/**
 * Login Page — supports 2-step email OTP for branch managers
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../utils/api';
import './Login.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [otpStep, setOtpStep] = useState(false);
  const [otpUsername, setOtpUsername] = useState('');
  const [isUserOTP, setIsUserOTP] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Email update request state
  const [emailUpdateStep, setEmailUpdateStep] = useState(false);
  const [emailUpdateUsername, setEmailUpdateUsername] = useState('');
  const [emailUpdateBranchName, setEmailUpdateBranchName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailUpdateSuccess, setEmailUpdateSuccess] = useState(false);

  const { login, completeOTPLogin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username, password);

    if (result.success && result.requiresOTP) {
      setOtpUsername(result.username);
      setMaskedEmail(result.maskedEmail || '');
      setIsUserOTP(result.isUserOTP || false);
      setOtpStep(true);
      setResendCooldown(60);
    } else if (result.success) {
      navigate('/dashboard');
    } else if (result.noEmail) {
      setEmailUpdateStep(true);
      setEmailUpdateUsername(result.username);
      setEmailUpdateBranchName(result.branchName || '');
    } else {
      setError(result.message || 'فشل تسجيل الدخول');
    }

    setLoading(false);
  };

  const handleOTPSubmit = async (e) => {
    e.preventDefault();
    if (otp.length !== 4) {
      setError('أدخل الرمز المكوّن من 4 أرقام');
      return;
    }

    setError('');
    setLoading(true);

    const result = await completeOTPLogin(otpUsername, otp, isUserOTP);

    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.message || 'فشل التحقق');
      // If expired, go back to credentials
      if (result.expired) {
        setOtpStep(false);
        setOtp('');
      }
    }

    setLoading(false);
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    setError('');
    setLoading(true);
    try {
      const response = await authAPI.resendOTP(otpUsername, isUserOTP);
      if (response.data.success) {
        setResendCooldown(60);
        setMaskedEmail(response.data.maskedEmail || maskedEmail);
      } else {
        setError(response.data.message || 'فشل إعادة إرسال الرمز');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'فشل إعادة إرسال الرمز');
    }
    setLoading(false);
  };

  const handleEmailUpdateRequest = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.requestEmailUpdate(emailUpdateUsername, newEmail);
      if (response.data.success) {
        setEmailUpdateSuccess(true);
      } else {
        setError(response.data.message || 'فشل إرسال الطلب');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'فشل إرسال الطلب');
    }
    setLoading(false);
  };

  const currentStep = emailUpdateStep ? 'emailUpdate' : otpStep ? 'otp' : 'login';
  const stepTitle = {
    login: 'تسجيل الدخول',
    otp: 'التحقق بخطوتين',
    emailUpdate: 'طلب تحديث البريد الإلكتروني'
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>نظام إدارة الموارد البشرية</h1>
        <h2>{stepTitle[currentStep]}</h2>

        {error && <div className="error-message">{error}</div>}

        {currentStep === 'login' && (
          <form onSubmit={handleCredentialsSubmit}>
            <div className="form-group">
              <label htmlFor="username">اسم المستخدم</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={loading}
                placeholder="أدخل اسم المستخدم"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">كلمة المرور</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                placeholder="أدخل كلمة المرور"
              />
            </div>

            <button type="submit" disabled={loading} className="login-button">
              {loading ? 'جاري التحقق...' : 'تسجيل الدخول'}
            </button>
          </form>
        )}

        {currentStep === 'otp' && (
          <form onSubmit={handleOTPSubmit}>
            <p style={{ textAlign: 'center', color: 'var(--text-light)', marginBottom: '1.5rem' }}>
              تم إرسال رمز التحقق إلى
              <strong> {maskedEmail}</strong>
            </p>

            <div className="form-group">
              <label htmlFor="otp">رمز التحقق</label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                required
                disabled={loading}
                placeholder="xxxx"
                autoComplete="one-time-code"
                style={{ letterSpacing: '0.4em', fontSize: '1.5rem', textAlign: 'center' }}
              />
            </div>

            <button type="submit" disabled={loading || otp.length !== 4} className="login-button">
              {loading ? 'جاري التحقق...' : 'تأكيد الدخول'}
            </button>

            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || loading}
              className="login-button"
              style={{ marginTop: 8, background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)' }}
            >
              {resendCooldown > 0 ? `إعادة الإرسال بعد ${resendCooldown}ث` : 'إعادة إرسال الرمز'}
            </button>

            <button
              type="button"
              onClick={() => {
                setOtpStep(false);
                setOtp('');
                setError('');
              }}
              disabled={loading}
              style={{ marginTop: 4, background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', width: '100%', padding: '0.5rem' }}
            >
              ← رجوع
            </button>
          </form>
        )}

        {currentStep === 'emailUpdate' && (
          emailUpdateSuccess ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'var(--success, #28a745)', marginBottom: '1rem', fontSize: '1.1rem' }}>
                ✓ تم إرسال طلبك للمسؤول بنجاح. سيتم تحديث بريدك الإلكتروني قريبًا.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEmailUpdateStep(false);
                  setEmailUpdateSuccess(false);
                  setNewEmail('');
                  setError('');
                }}
                className="login-button"
              >
                العودة لتسجيل الدخول
              </button>
            </div>
          ) : (
            <form onSubmit={handleEmailUpdateRequest}>
              <p style={{ textAlign: 'center', color: 'var(--text-light)', marginBottom: '1.5rem' }}>
                لا يوجد بريد إلكتروني مسجل لفرع <strong>{emailUpdateBranchName}</strong>.
                <br />أدخل بريدك الإلكتروني لإرسال طلب تحديث للمسؤول.
              </p>

              <div className="form-group">
                <label htmlFor="newEmail">البريد الإلكتروني الجديد</label>
                <input
                  id="newEmail"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="example@email.com"
                  dir="ltr"
                />
              </div>

              <button type="submit" disabled={loading || !newEmail} className="login-button">
                {loading ? 'جاري الإرسال...' : 'إرسال الطلب'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setEmailUpdateStep(false);
                  setNewEmail('');
                  setError('');
                }}
                disabled={loading}
                style={{ marginTop: 4, background: 'none', border: 'none', color: 'var(--text-light)', cursor: 'pointer', width: '100%', padding: '0.5rem' }}
              >
                ← رجوع
              </button>
            </form>
          )
        )}
      </div>
    </div>
  );
};

export default Login;

