import React, { useEffect, useState } from 'react';
import api from '../services/api';
import '../styles/MaintenancePage.css';
import sbuLogo from '../assets/sbu-digital-hub-logo.png';

export default function MaintenancePage() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.apiGet('/api/public/system-status');
        if (cancelled) return;
        if (!s?.maintenance) {
          window.location.hash = '#home';
          return;
        }
        setMessage(s.message || '');
      } catch {
        if (!cancelled) setMessage('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="maintenance-page">
      <div className="maintenance-page__card">
        <img src={sbuLogo} alt="SBU Digital Hub" className="maintenance-page__logo" />
        <p className="maintenance-page__badge">Service temporarily unavailable</p>
        <h1 className="maintenance-page__title">Platform under maintenance</h1>
        <p className="maintenance-page__body">
          {message || 'We are performing scheduled maintenance. Please try again later.'}
        </p>
        <p className="maintenance-page__note">
          Administrator accounts can still sign in to manage the system.
        </p>
        <a className="maintenance-page__link" href="#login">
          Administrator sign in
        </a>
        <a className="maintenance-page__link secondary" href="#home">
          Back to home
        </a>
      </div>
    </div>
  );
}
