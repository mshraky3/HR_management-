/**
 * Login Page — supports 2-step OTP for branch managers
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { firebaseAuth } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

const mapFirebasePhoneError = (error) => {
  const code = error?.code || '';
  const message = error?.message || '';

  if (code === 'auth/invalid-phone-number') {
    return 'رقم الهاتف غير صالح. تأكد أن رقم الفرع بصيغة صحيحة.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'تسجيل الدخول برقم الهاتف غير مفعّل في Firebase Authentication.';
  }
  if (code === 'auth/quota-exceeded') {
    return 'تم تجاوز حصة رسائل SMS. حاول لاحقاً أو راجع خطة Firebase.';
  }
  if (code === 'auth/too-many-requests') {
    return 'عدد المحاولات كبير جداً. انتظر قليلاً ثم أعد المحاولة.';
  }
  if (code === 'auth/captcha-check-failed') {
    return 'فشل تحقق reCAPTCHA. حدّث الصفحة وحاول مرة أخرى.';
  }
  if (code === 'auth/invalid-app-credential') {
    return 'بيانات اعتماد التطبيق غير صالحة. راجع إعدادات Firebase Authorized Domains.';
  }

  if (message.includes('BILLING_NOT_ENABLED')) {
    return 'خدمة الفوترة غير مفعلة لمشروع Firebase. يلزم تفعيل Blaze لإرسال SMS.';
  }

  return 'فشل إرسال رمز التحقق. راجع إعدادات Firebase أو حاول مجدداً.';
};

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [otpStep, setOtpStep] = useState(false);
  const [otpUsername, setOtpUsername] = useState('');
  const [otpPhone, setOtpPhone] = useState('');
  const [phoneDisplay, setPhoneDisplay] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const recaptchaVerifierRef = useRef(null);
  const { login, completeOTPLogin } = useAuth();
  const navigate = useNavigate();

  const initRecaptcha = () => {
    if (!recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current = new RecaptchaVerifier(
        firebaseAuth,
        'recaptcha-container',
        {
          size: 'invisible',
          'expired-callback': () => {
            setError('انتهت صلاحية التحقق. حاول مرة أخرى.');
          },
          'error-callback': () => {
            setError('حدث خطأ في reCAPTCHA. حدّث الصفحة وحاول مرة أخرى.');
          },
        }
      );
    }
  };

  useEffect(() => {
    initRecaptcha();
    return () => {
      try { recaptchaVerifierRef.current?.clear(); } catch (_) { }
      recaptchaVerifierRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const maskPhone = (phone) => {
    if (!phone || phone.length < 6) return phone;
    return phone.slice(0, 4) + '*'.repeat(phone.length - 8) + phone.slice(-4);
  };

  const sendOTP = async (phoneNumber) => {
    initRecaptcha();
    const result = await signInWithPhoneNumber(
      firebaseAuth,
      phoneNumber,
      recaptchaVerifierRef.current
    );
    setConfirmationResult(result);
    setResendCooldown(60);
  };

  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username, password);

    if (result.success && result.requiresOTP) {
      try {
        await sendOTP(result.phoneNumber);
        setOtpUsername(result.username);
        setOtpPhone(result.phoneNumber);
        setPhoneDisplay(maskPhone(result.phoneNumber));
        setOtpStep(true);
      } catch (firebaseErr) {
        console.error('Firebase send OTP error:', {
          code: firebaseErr?.code,
          message: firebaseErr?.message,
        });
        setError(mapFirebasePhoneError(firebaseErr));
      }
    } else if (result.success) {
      navigate('/dashboard');
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

    try {
      if (!confirmationResult) {
        setError('لم يتم إرسال رمز تحقق بعد.');
        setLoading(false);
        return;
      }

      const firebaseResult = await confirmationResult.confirm(otp);
      const firebaseIdToken = await firebaseResult.user.getIdToken();
      const result = await completeOTPLogin(otpUsername, firebaseIdToken);

      if (result.success) {
        navigate('/dashboard');
      } else {
        setError(result.message || 'فشل التحقق');
      }
    } catch {
      setError('رمز التحقق غير صحيح أو منتهي الصلاحية');
    }

    setLoading(false);
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    setError('');
    setLoading(true);
    try {
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = null;
      await sendOTP(otpPhone);
    } catch (firebaseErr) {
      console.error('Firebase resend OTP error:', {
        code: firebaseErr?.code,
        message: firebaseErr?.message,
      });
      setError(mapFirebasePhoneError(firebaseErr));
    }
    setLoading(false);
  };

  return (
    <div className="login-container">
      <div id="recaptcha-container" />

      <div className="login-card">
        <h1>نظام إدارة الموارد البشرية</h1>
        <h2>{otpStep ? 'التحقق بخطوتين' : 'تسجيل الدخول'}</h2>

        {error && <div className="error-message">{error}</div>}

        {!otpStep ? (
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
        ) : (
          <form onSubmit={handleOTPSubmit}>
            <p style={{ textAlign: 'center', color: 'var(--text-light)', marginBottom: '1.5rem' }}>
              تم إرسال رمز التحقق إلى
              <strong> {phoneDisplay}</strong>
            </p>

            <div className="form-group">
              <label htmlFor="otp">رمز التحقق</label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                required
                disabled={loading}
                placeholder="xxxxxx"
                autoComplete="one-time-code"
                style={{ letterSpacing: '0.4em', fontSize: '1.5rem', textAlign: 'center' }}
              />
            </div>

            <button type="submit" disabled={loading || otp.length !== 6} className="login-button">
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
      </div>
    </div>
  );
};

export default Login;

