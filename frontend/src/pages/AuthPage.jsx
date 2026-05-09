import React, { useState, useEffect } from 'react';
import '../styles/AuthPage.css';
import airplaneHero from '../assets/rwandair-real-hero.jpg';
import MaintenanceBanner from '../components/MaintenanceBanner';
import ForgotPasswordModal from '../components/ForgotPasswordModal';
import api from '../services/api';

const loginDefaults = {
  email: '',
  password: ''
};

const roleLabels = {
  'exporter': 'Exporter',
  'airline': 'Airline',
  'airline-analyst': 'Airline Analyst',
  'airline-supervisor': 'Airline Supervisor',
  'clearing-agent': 'Clearing Agent',
  'admin': 'Admin'
};

export default function AuthPage({ mode = 'login', redirectTo = 'dashboard/exporter', onAuth, maintenanceMessage = '' }) {
  const [activeMode, setActiveMode] = useState(mode);
  const [selectedRole, setSelectedRole] = useState(null);
  const [loginForm, setLoginForm] = useState(loginDefaults);
  const [registerForm, setRegisterForm] = useState({
    full_name: '',
    exporter_name: '',
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showLoginPwd, setShowLoginPwd] = useState(false);
  const [showRegisterPwd, setShowRegisterPwd] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  useEffect(() => {
    // Parse role from URL hash
    const hash = window.location.hash;
    const roleMatch = hash.match(/role=([^&]*)/);
    if (roleMatch) {
      setSelectedRole(roleMatch[1]);
    }
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const result = await api.apiPost('/api/auth/login', {
        email: String(loginForm.email || '').trim().toLowerCase(),
        password: loginForm.password
      });
      localStorage.setItem('sbu_token', result.token);
      localStorage.setItem('sbu_user', JSON.stringify(result.user));
      onAuth?.(result.user);
    } catch (error) {
      setMessage(error.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const result = await api.apiPost('/api/auth/register', {
        ...registerForm,
        email: String(registerForm.email || '').trim().toLowerCase()
      });
      localStorage.setItem('sbu_token', result.token);
      localStorage.setItem('sbu_user', JSON.stringify(result.user));
      onAuth?.(result.user);
    } catch (error) {
      setMessage(error.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <img src={airplaneHero} alt="RwandAir cargo aircraft" className="auth-hero-image" />
        <div className="auth-overlay">
          <p className="auth-kicker">Secure access</p>
          <h1>SBU Export Coordination Hub</h1>
          <p>
            Log in to your role dashboard or create an exporter account to start booking air cargo space.
          </p>
          <div className="auth-badges">
            <span>Exporter self-signup</span>
            <span>Admin-managed roles</span>
            <span>Protected dashboards</span>
          </div>
        </div>
      </div>

      <div className="auth-card">
        <div className="auth-maintenance-slot">
          <MaintenanceBanner message={maintenanceMessage} />
        </div>
        {maintenanceMessage ? (
          <p className="auth-maintenance-admin-hint">
            During maintenance, only <strong>administrator</strong> accounts can sign in.
          </p>
        ) : null}
        {selectedRole && (
          <div className="role-indicator">
            <p>Logging in as: <strong>{roleLabels[selectedRole]}</strong></p>
          </div>
        )}
        
        <div className="auth-tabs">
          <button className={activeMode === 'login' ? 'active' : ''} onClick={() => setActiveMode('login')}>Login</button>
          <button className={activeMode === 'register' ? 'active' : ''} onClick={() => setActiveMode('register')}>Create Exporter Account</button>
        </div>

        {activeMode === 'login' ? (
          <form className="auth-form" onSubmit={handleLogin}>
            <label>
              Email
              <input value={loginForm.email} onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })} type="email" placeholder="you@company.com" />
            </label>
            <label>
              Password
              <div className="auth-pwd-wrap">
                <input
                  value={loginForm.password}
                  onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                  type={showLoginPwd ? 'text' : 'password'}
                  placeholder="Enter your password"
                />
                <button type="button" className="auth-pwd-toggle" onClick={() => setShowLoginPwd(v => !v)} aria-label={showLoginPwd ? 'Hide password' : 'Show password'}>
                  {showLoginPwd ? '🙈' : '👁️'}
                </button>
              </div>
            </label>

            <div className="auth-forgot-row">
              <button
                type="button"
                className="auth-forgot-link"
                onClick={() => setForgotOpen(true)}
              >
                Forgot password?
              </button>
            </div>

            {message ? <p className="auth-message">{message}</p> : null}

            <button className="auth-submit" disabled={loading} type="submit">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleRegister}>
            <label>
              Full name
              <input value={registerForm.full_name} onChange={(event) => setRegisterForm({ ...registerForm, full_name: event.target.value })} type="text" placeholder="Your name" />
            </label>
            <label>
              Exporter business name
              <input value={registerForm.exporter_name} onChange={(event) => setRegisterForm({ ...registerForm, exporter_name: event.target.value })} type="text" placeholder="Company or farm name" />
            </label>
            <label>
              Email
              <input value={registerForm.email} onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })} type="email" placeholder="you@example.com" />
            </label>
            <label>
              Password
              <div className="auth-pwd-wrap">
                <input
                  value={registerForm.password}
                  onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })}
                  type={showRegisterPwd ? 'text' : 'password'}
                  placeholder="Create a secure password"
                />
                <button type="button" className="auth-pwd-toggle" onClick={() => setShowRegisterPwd(v => !v)} aria-label={showRegisterPwd ? 'Hide password' : 'Show password'}>
                  {showRegisterPwd ? '🙈' : '👁️'}
                </button>
              </div>
            </label>

            <div className="auth-hint">
              <strong>Role policy</strong>
              <p>Exporter accounts can self-register. Airline, clearing agent, and admin accounts are created by the admin dashboard.</p>
            </div>

            {message ? <p className="auth-message">{message}</p> : null}

            <button className="auth-submit" disabled={loading} type="submit">
              {loading ? 'Creating account...' : 'Create exporter account'}
            </button>
          </form>
        )}

        <button className="back-home" onClick={() => { window.location.hash = '#home'; }}>
          Back to home
        </button>
      </div>

      <ForgotPasswordModal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        onResetComplete={() => {
          setMessage('Password updated. Please sign in with your new password.');
        }}
      />
    </div>
  );
}