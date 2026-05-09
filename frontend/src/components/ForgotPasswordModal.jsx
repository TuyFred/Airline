import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import '../styles/ForgotPasswordModal.css';

const PWD_RULES = [
  { id: 'len',   test: (v) => v.length >= 8,             label: 'At least 8 characters' },
  { id: 'upper', test: (v) => /[A-Z]/.test(v),           label: 'One uppercase letter' },
  { id: 'lower', test: (v) => /[a-z]/.test(v),           label: 'One lowercase letter' },
  { id: 'num',   test: (v) => /[0-9]/.test(v),           label: 'One number' },
  { id: 'sym',   test: (v) => /[^A-Za-z0-9]/.test(v),    label: 'One special character' }
];

function makeCaptcha() {
  const a = Math.floor(Math.random() * 8) + 2;
  const b = Math.floor(Math.random() * 8) + 1;
  return { question: `${a} + ${b} = ?`, answer: a + b };
}

export default function ForgotPasswordModal({ open, onClose, onResetComplete }) {
  const [step, setStep] = useState(1);
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [delivery, setDelivery] = useState({ masked_email: null, masked_phone: null });
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ kind: '', text: '' });
  const [resendCountdown, setResendCountdown] = useState(0);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captcha, setCaptcha] = useState(makeCaptcha());
  const [captchaInput, setCaptchaInput] = useState('');
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setIdentifier('');
    setCode('');
    setResetToken('');
    setDelivery({ masked_email: null, masked_phone: null });
    setNewPwd('');
    setConfirmPwd('');
    setShowPwd(false);
    setMessage({ kind: '', text: '' });
    setResendCountdown(0);
    setCaptchaRequired(false);
    setCaptcha(makeCaptcha());
    setCaptchaInput('');
  }, [open]);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    intervalRef.current = setInterval(() => {
      setResendCountdown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [resendCountdown]);

  const pwdScore = useMemo(() => PWD_RULES.filter((r) => r.test(newPwd)).length, [newPwd]);
  const pwdValid = pwdScore === PWD_RULES.length;
  const pwdsMatch = newPwd && newPwd === confirmPwd;

  if (!open) return null;

  const flash = (kind, text) => setMessage({ kind, text });

  const requestCode = async (silent = false) => {
    if (!identifier.trim()) {
      flash('error', 'Please enter your registered email or phone number.');
      return;
    }
    if (captchaRequired) {
      const ans = Number(captchaInput);
      if (Number.isNaN(ans) || ans !== captcha.answer) {
        flash('error', 'Verification challenge incorrect.');
        return;
      }
    }
    setLoading(true);
    try {
      const result = await api.apiPost('/api/auth/forgot-password', {
        identifier: identifier.trim(),
        ...(captchaRequired ? { captcha: Number(captchaInput) } : {})
      });
      setDelivery(result.delivery || {});
      setStep(2);
      setResendCountdown(45);
      setCaptchaRequired(false);
      flash(
        'success',
        result.dev_otp
          ? `Code sent. (Dev mode: ${result.dev_otp})`
          : 'Code sent. Check your inbox (and spam) for the 6-digit code.'
      );
    } catch (error) {
      const msg = error.message || 'Could not send code.';
      if (/verification challenge|captcha/i.test(msg)) {
        setCaptchaRequired(true);
        setCaptcha(makeCaptcha());
        setCaptchaInput('');
        flash('error', 'Please solve the verification challenge below.');
      } else {
        flash('error', msg);
      }
    } finally {
      if (!silent) setLoading(false);
      else setLoading(false);
    }
  };

  const verifyCode = async () => {
    if (code.trim().length < 4) {
      flash('error', 'Enter the code from your email.');
      return;
    }
    setLoading(true);
    try {
      const result = await api.apiPost('/api/auth/verify-reset-code', {
        identifier: identifier.trim(),
        code: code.trim()
      });
      setResetToken(result.reset_token);
      setStep(3);
      flash('success', 'Code verified. Set a strong new password to finish.');
    } catch (error) {
      flash('error', error.message || 'Invalid code.');
    } finally {
      setLoading(false);
    }
  };

  const submitNewPassword = async () => {
    if (!pwdValid) {
      flash('error', 'Password does not meet the security policy.');
      return;
    }
    if (!pwdsMatch) {
      flash('error', 'Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api.apiPost('/api/auth/reset-password', {
        reset_token: resetToken,
        new_password: newPwd
      });
      flash('success', 'Password updated. You may now sign in with your new password.');
      setStep(4);
      try {
        localStorage.removeItem('sbu_token');
        localStorage.removeItem('sbu_user');
      } catch {
        /* localStorage might not be available */
      }
      onResetComplete?.();
    } catch (error) {
      flash('error', error.message || 'Could not update password.');
    } finally {
      setLoading(false);
    }
  };

  const stepBadge = (n, label) => (
    <div className={`fp-step-badge ${step === n ? 'is-current' : step > n ? 'is-done' : ''}`}>
      <span className="fp-step-num">{step > n ? '✓' : n}</span>
      <span className="fp-step-label">{label}</span>
    </div>
  );

  return (
    <div className="fp-overlay" role="dialog" aria-modal="true" aria-label="Forgot password">
      <div className="fp-modal">
        <header className="fp-header">
          <div>
            <h2>Reset your password</h2>
            <p className="fp-subtitle">Secure 3-step recovery — code by email, single-use, expires in 10 minutes.</p>
          </div>
          <button type="button" className="fp-close" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="fp-stepper">
          {stepBadge(1, 'Account')}
          <span className="fp-step-line" />
          {stepBadge(2, 'Verify code')}
          <span className="fp-step-line" />
          {stepBadge(3, 'New password')}
        </div>

        {message.text ? <div className={`fp-flash fp-flash--${message.kind}`}>{message.text}</div> : null}

        {step === 1 && (
          <form
            className="fp-form"
            onSubmit={(e) => {
              e.preventDefault();
              requestCode();
            }}
          >
            <label className="fp-label">
              Registered email or phone number
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@company.com or +250 7xx xxx xxx"
                autoComplete="username"
                autoFocus
              />
              <span className="fp-hint">We'll send a one-time 6-digit code to your registered email.</span>
            </label>

            {captchaRequired ? (
              <label className="fp-label">
                Verification challenge — {captcha.question}
                <input
                  type="number"
                  value={captchaInput}
                  onChange={(e) => setCaptchaInput(e.target.value)}
                  placeholder="Type the answer"
                  inputMode="numeric"
                />
              </label>
            ) : null}

            <button type="submit" className="fp-primary" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset code'}
            </button>
          </form>
        )}

        {step === 2 && (
          <form
            className="fp-form"
            onSubmit={(e) => {
              e.preventDefault();
              verifyCode();
            }}
          >
            <p className="fp-message">
              We sent a 6-digit code to{' '}
              <strong>{delivery.masked_email || delivery.masked_phone || identifier}</strong>.
              Enter it below to continue.
            </p>

            <label className="fp-label">
              Verification code
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                placeholder="123456"
                className="fp-otp-input"
                autoFocus
              />
              <span className="fp-hint">The code expires in 10 minutes and can be used only once.</span>
            </label>

            <div className="fp-row">
              <button
                type="button"
                className="fp-link"
                onClick={() => requestCode(true)}
                disabled={resendCountdown > 0 || loading}
              >
                {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend code'}
              </button>
              <button type="button" className="fp-link fp-link--muted" onClick={() => setStep(1)}>
                Use a different account
              </button>
            </div>

            <button type="submit" className="fp-primary" disabled={loading || !code.trim()}>
              {loading ? 'Verifying…' : 'Verify code'}
            </button>
          </form>
        )}

        {step === 3 && (
          <form
            className="fp-form"
            onSubmit={(e) => {
              e.preventDefault();
              submitNewPassword();
            }}
          >
            <label className="fp-label">
              New password
              <div className="fp-pwd-wrap">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="Create a strong new password"
                  autoComplete="new-password"
                  autoFocus
                />
                <button
                  type="button"
                  className="fp-pwd-toggle"
                  onClick={() => setShowPwd((v) => !v)}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                >
                  {showPwd ? '🙈' : '👁️'}
                </button>
              </div>
            </label>

            <label className="fp-label">
              Confirm password
              <input
                type={showPwd ? 'text' : 'password'}
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                placeholder="Re-type the new password"
                autoComplete="new-password"
              />
            </label>

            <div className="fp-strength">
              <div className="fp-strength-bar">
                <span className={`fp-strength-fill fp-strength-${pwdScore}`} />
              </div>
              <ul className="fp-rules">
                {PWD_RULES.map((r) => (
                  <li key={r.id} className={r.test(newPwd) ? 'is-met' : ''}>
                    <span className="fp-rule-icon">{r.test(newPwd) ? '✓' : '○'}</span>
                    {r.label}
                  </li>
                ))}
              </ul>
            </div>

            {confirmPwd && !pwdsMatch ? (
              <p className="fp-flash fp-flash--error">Passwords don't match.</p>
            ) : null}

            <button
              type="submit"
              className="fp-primary"
              disabled={loading || !pwdValid || !pwdsMatch}
            >
              {loading ? 'Saving…' : 'Update password & sign me out everywhere'}
            </button>
          </form>
        )}

        {step === 4 && (
          <div className="fp-success-block">
            <div className="fp-success-icon">✓</div>
            <h3>Password updated</h3>
            <p>
              You're all set. We sent a confirmation to your email with the date, time and IP address of this change.
              Other active sessions have been signed out automatically.
            </p>
            <button type="button" className="fp-primary" onClick={onClose}>Back to sign-in</button>
          </div>
        )}

        <footer className="fp-footer">
          <p>
            <strong>Stay safe:</strong> SBU staff will never ask for your password or verification code.
            If you didn't request this reset, simply ignore the email.
          </p>
        </footer>
      </div>
    </div>
  );
}
