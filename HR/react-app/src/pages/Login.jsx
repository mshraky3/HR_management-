/**
 * Login: password step, then (for branch accounts and operations managers) an e-mailed 6-digit code.
 * A branch with no e-mail on file can ask the head office to add one.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../utils/api';
import { Button, FormField, Input, Alert, Icon } from '../ui';
import './Login.css';

const TITLES = {
  login: ['تسجيل الدخول', 'أدخل بيانات حسابك للمتابعة'],
  otp: ['التحقق بخطوتين', 'أدخل الرمز المرسل إلى بريدك الإلكتروني'],
  emailUpdate: ['طلب تحديث البريد الإلكتروني', 'لا يوجد بريد مسجل لحسابك'],
};

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [otpStep, setOtpStep] = useState(false);
  const [otpSession, setOtpSession] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const [emailUpdateStep, setEmailUpdateStep] = useState(false);
  const [emailUpdateUsername, setEmailUpdateUsername] = useState('');
  const [emailUpdateBranchName, setEmailUpdateBranchName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailUpdateSuccess, setEmailUpdateSuccess] = useState(false);

  const { login, completeOTPLogin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const backToLogin = () => {
    setOtpStep(false); setOtp(''); setOtpSession(''); setEmailUpdateStep(false);
    setEmailUpdateSuccess(false); setNewEmail(''); setError('');
  };

  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(username.trim(), password);
    if (result.success && result.requiresOTP) {
      setOtpSession(result.otpSession || '');
      setMaskedEmail(result.maskedEmail || '');
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
    if (otp.length !== 6) {
      setError('أدخل الرمز المكوّن من 6 أرقام');
      return;
    }
    setError('');
    setLoading(true);
    const result = await completeOTPLogin(otpSession, otp);
    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.message || 'فشل التحقق');
      if (result.expired) { setOtpStep(false); setOtp(''); setOtpSession(''); }
    }
    setLoading(false);
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setError('');
    setLoading(true);
    try {
      const response = await authAPI.resendOTP(otpSession);
      if (response.data.success) {
        setResendCooldown(60);
        setMaskedEmail(response.data.maskedEmail || maskedEmail);
      } else {
        setError(response.data.message || 'فشل إعادة إرسال الرمز');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'فشل إعادة إرسال الرمز');
      if (err.response?.data?.sessionExpired) { setOtpStep(false); setOtp(''); setOtpSession(''); }
    }
    setLoading(false);
  };

  const handleEmailUpdateRequest = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await authAPI.requestEmailUpdate(emailUpdateUsername, newEmail);
      if (response.data.success) setEmailUpdateSuccess(true);
      else setError(response.data.message || 'فشل إرسال الطلب');
    } catch (err) {
      setError(err.response?.data?.message || 'فشل إرسال الطلب');
    }
    setLoading(false);
  };

  const step = emailUpdateStep ? 'emailUpdate' : otpStep ? 'otp' : 'login';
  const [title, subtitle] = TITLES[step];

  return (
    <div className="ui-auth">
      <aside className="ui-auth-brand" aria-hidden="true">
        <span className="ui-auth-mark"><Icon name="users" size={34} /></span>
        <h1>نظام الموارد البشرية</h1>
        <p>إدارة موظفي الفروع والمستندات والغياب والمستفيدين في مكان واحد، بخطوات واضحة وبياناتك دائماً محدّثة.</p>
      </aside>

      <main className="ui-auth-panel">
        <div className="ui-auth-card">
          <div className="ui-auth-logo-mobile" aria-hidden="true"><Icon name="users" size={26} /></div>
          <h2 className="ui-auth-title">{title}</h2>
          <p className="ui-auth-subtitle">{subtitle}</p>

          {error && <Alert tone="danger">{error}</Alert>}

          {step === 'login' && (
            <form onSubmit={handleCredentialsSubmit} className="ui-form-stack" noValidate={false}>
              <FormField label="اسم المستخدم" required>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required disabled={loading} dir="ltr" placeholder="اسم المستخدم" />
              </FormField>
              <FormField label="كلمة المرور" required>
                <div className="ui-password">
                  <Input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required disabled={loading} dir="ltr" placeholder="كلمة المرور" />
                  <button type="button" className="ui-password-toggle" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>
                    <Icon name={showPassword ? 'lock' : 'eye'} size={18} />
                  </button>
                </div>
              </FormField>
              <Button variant="primary" size="lg" type="submit" block loading={loading}>تسجيل الدخول</Button>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={handleOTPSubmit} className="ui-form-stack">
              <p className="ui-auth-hint">تم إرسال رمز مكوّن من 6 أرقام إلى <bdi>{maskedEmail}</bdi>. ينتهي خلال 10 دقائق.</p>
              <FormField label="رمز التحقق" required>
                <Input
                  className="ui-otp-input"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  disabled={loading}
                  dir="ltr"
                  placeholder="000000"
                />
              </FormField>
              <Button variant="primary" size="lg" type="submit" block loading={loading} disabled={otp.length !== 6}>تأكيد الدخول</Button>
              <Button variant="secondary" block onClick={handleResend} disabled={resendCooldown > 0 || loading}>
                {resendCooldown > 0 ? `إعادة الإرسال بعد ${resendCooldown} ث` : 'إعادة إرسال الرمز'}
              </Button>
              <Button variant="link" onClick={backToLogin} disabled={loading}>رجوع</Button>
            </form>
          )}

          {step === 'emailUpdate' && (emailUpdateSuccess ? (
            <div className="ui-form-stack">
              <Alert tone="success">تم إرسال طلبك للإدارة. سيتم تحديث بريدك الإلكتروني قريباً، ثم يمكنك الدخول.</Alert>
              <Button variant="primary" block onClick={backToLogin}>العودة لتسجيل الدخول</Button>
            </div>
          ) : (
            <form onSubmit={handleEmailUpdateRequest} className="ui-form-stack">
              <p className="ui-auth-hint">لا يوجد بريد إلكتروني مسجل لفرع <strong>{emailUpdateBranchName}</strong>. اكتب بريدك لإرسال طلب تحديث للإدارة.</p>
              <FormField label="البريد الإلكتروني" required>
                <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required disabled={loading} dir="ltr" placeholder="name@example.com" />
              </FormField>
              <Button variant="primary" size="lg" type="submit" block loading={loading} disabled={!newEmail}>إرسال الطلب</Button>
              <Button variant="link" onClick={backToLogin} disabled={loading}>رجوع</Button>
            </form>
          ))}
        </div>
      </main>
    </div>
  );
}
