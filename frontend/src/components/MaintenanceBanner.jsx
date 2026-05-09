import React from 'react';
import '../styles/MaintenanceBanner.css';

export default function MaintenanceBanner({ message }) {
  if (!message) return null;
  return (
    <div className="maintenance-banner" role="alert">
      <div className="maintenance-banner__inner">
        <span className="maintenance-banner__icon" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M12 2L3 20h18L12 2zm0 3.83L17.93 17H6.07L12 5.83zM11 14v2h2v-2h-2zm0-6v4h2V8h-2z"
              fill="currentColor"
              opacity=".9"
            />
          </svg>
        </span>
        <div>
          <strong className="maintenance-banner__title">Maintenance in progress</strong>
          <p className="maintenance-banner__text">{message}</p>
          <p className="maintenance-banner__hint">Please do not use the platform for normal operations until service is fully restored.</p>
        </div>
      </div>
    </div>
  );
}
