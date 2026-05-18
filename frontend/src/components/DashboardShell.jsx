import React, { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import '../styles/DashboardShell.css';
import sbuLogo from '../assets/sbu-digital-hub-logo.png';

const roleSidebarConfig = {
  exporter: {
    nav: [
      { label: 'Dashboard Overview', href: '#dashboard/exporter?view=overview', icon: '📊' },
      { label: 'Weekly Booking',     href: '#dashboard/exporter?view=bookings',      icon: '📦' },
      { label: 'Space Availability', href: '#dashboard/exporter?view=capacity',      icon: '✈️' },
      { label: 'Booking History',    href: '#dashboard/exporter?view=history',       icon: '🕐' },
      { label: 'Notifications',      href: '#dashboard/exporter?view=notifications', icon: '🔔' },
      { label: 'Performance',        href: '#dashboard/exporter?view=performance',    icon: '📈' }
    ]
  },
  airline_analyst: {
    nav: [
      { label: 'Requests Table',       href: '#dashboard/airline?tab=requests',     icon: '📋' },
      { label: 'Capacity Sheet',       href: '#dashboard/airline?tab=capacity',     icon: '📐' },
      { label: 'General Notification', href: '#dashboard/airline?tab=uplift',       icon: '📣' },
      { label: 'Utilization',          href: '#dashboard/airline?tab=analytics',    icon: '📈' },
      { label: 'Performance Insights', href: '#dashboard/airline?tab=performance',  icon: '📊' },
      { label: '7-Day Performance',    href: '#dashboard/airline?tab=daily',        icon: '📅' }
    ]
  },
  airline_supervisor: {
    nav: [
      { label: 'Acceptance queue', href: '#dashboard/supervisor?tab=decisions', icon: '⚖️' },
      { label: 'Uplift confirmation', href: '#dashboard/supervisor?tab=uplift', icon: '🚀' }
    ]
  },
  clearing_agent: {
    nav: [
      { label: 'Submit acceptance', href: '#dashboard/agent?view=submit', icon: '📤' },
      { label: 'Document Vault', href: '#dashboard/agent?view=documents', icon: '📄' }
    ]
  },
  admin: {
    nav: [
      { label: 'Admin Overview',  href: '#dashboard/admin?tab=overview',      icon: '🏠' },
      { label: 'Airline Manager', href: '#dashboard/admin?tab=airlines',      icon: '✈️' },
      { label: 'Finance Vault',   href: '#dashboard/admin?tab=finance',       icon: '💰' },
      { label: 'User Access',     href: '#dashboard/admin?tab=users',         icon: '👥' },
      { label: 'Analytics',       href: '#dashboard/admin?tab=analytics',     icon: '📈' },
      { label: 'Available Space', href: '#dashboard/admin?tab=reallocations', icon: '📐' },
      { label: 'Platform', href: '#dashboard/admin?tab=operations', icon: '⚙️' },
      { label: 'Landing Media', href: '#dashboard/admin?tab=media', icon: '🎬' }
    ]
  }
};

export default function DashboardShell({ title, subtitle, role, sidebarSummary, accent, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const heroInputRef = useRef(null);
  const [heroUploadStatus, setHeroUploadStatus] = useState('');

  let currentUser = null;
  try { currentUser = JSON.parse(localStorage.getItem('sbu_user') || 'null'); } catch { /* */ }

  const currentHash  = (window.location.hash || '#').replace(/^#/, '');
  const currentRoute = (currentHash.split('?')[0] || '').trim();
  const config       = roleSidebarConfig[currentUser?.role] || { nav: [] };
  const signedInAs   = currentUser?.full_name || currentUser?.email || 'Guest';

  /* lock body scroll on mobile when sidebar is open */
  useEffect(() => {
    if (window.innerWidth <= 860) {
      document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  const closeOnResize = () => {
    if (window.innerWidth > 860) setSidebarOpen(false);
  };
  useEffect(() => {
    window.addEventListener('resize', closeOnResize);
    return () => window.removeEventListener('resize', closeOnResize);
  }, []);

  const handleNavClick = (e, href) => {
    e.preventDefault();
    const next    = href.replace(/^#/, '');
    const current = (window.location.hash || '#').replace(/^#/, '');
    if (current === next) { window.dispatchEvent(new HashChangeEvent('hashchange')); }
    else { window.location.hash = next; }
    setSidebarOpen(false);
  };

  const uploadHeroMedia = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isMedia = /\.(mp4|webm|mov|mkv|avi|m4v|flv|wmv|mpeg|mpg|png|jpg|jpeg|webp|gif)$/i.test(file.name);
    if (!String(file.type).startsWith('video/') && !String(file.type).startsWith('image/') && !isMedia) {
      setHeroUploadStatus('Please choose an image or video file.');
      return;
    }
    if (file.size > 100 * 1024 * 1024) { setHeroUploadStatus('File must be 100 MB or smaller.'); return; }
    const token = localStorage.getItem('sbu_token') || '';
    const form  = new FormData();
    form.append('media', file);
    try {
      setHeroUploadStatus('Uploading hero media…');
      const res = await fetch(`${api.API_BASE}/api/media/hero`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Upload failed');
      setHeroUploadStatus('Hero media updated.');
      window.dispatchEvent(new Event('hero-media-updated'));
    } catch (err) { setHeroUploadStatus(err.message || 'Upload failed'); }
  };

  const handleLogout = () => {
    localStorage.removeItem('sbu_token');
    localStorage.removeItem('sbu_user');
    window.location.hash = '#login';
    window.location.reload();
  };

  const Sidebar = () => (
    <aside className={`ds-sidebar${sidebarOpen ? ' is-open' : ''}`}>
      {/* close button — mobile only */}
      <button className="ds-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">✕</button>

      <div className="ds-brand">
        <img className="ds-brand-logo" src={sbuLogo} alt="SBU Air Cargo Hub" />
        <div>
          <h1 className="ds-brand-name">SBU Hub</h1>
          <p className="ds-brand-role">{role ? `${role} Workspace` : 'Dashboard'}</p>
        </div>
      </div>

      <div className="ds-divider" />

      <nav className="ds-nav" aria-label="Dashboard navigation">
        <span className="ds-nav-label">Navigation</span>
        {config.nav.map((item) => {
          const itemRoute = item.href.replace(/^#/, '');
          const isActive  = itemRoute.includes('?')
            ? currentHash === itemRoute
            : currentRoute === itemRoute.split('?')[0];
          return (
            <a
              key={item.label}
              href={item.href}
              onClick={(e) => handleNavClick(e, item.href)}
              className={`ds-nav-link${isActive ? ' active' : ''}`}
            >
              <span className="ds-nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>

      {sidebarSummary && (
        <div className="ds-block">
          <span className="ds-nav-label">Workspace Summary</span>
          <p>{sidebarSummary}</p>
        </div>
      )}

      {currentUser?.role === 'admin' && (
        <div className="ds-block ds-upload-block">
          <span className="ds-nav-label">Hero Media</span>
          <p>Upload or replace the homepage hero image / video. Max 100 MB.</p>
          <button className="ds-upload-btn" onClick={() => heroInputRef.current?.click()} type="button">
            Upload Media
          </button>
          <input ref={heroInputRef} type="file" accept="image/*,video/*" className="ds-hidden-input" onChange={uploadHeroMedia} />
          {heroUploadStatus && <small className="ds-upload-status">{heroUploadStatus}</small>}
        </div>
      )}

      <div className="ds-sidebar-footer">
        <button className="ds-logout-btn" onClick={handleLogout}>Logout</button>
      </div>
    </aside>
  );

  return (
    <div className={`ds-shell ${accent || ''}`}>
      <Sidebar />

      {/* backdrop — mobile only */}
      {sidebarOpen && (
        <div className="ds-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <main className="ds-main">
        {/* topbar */}
        <header className="ds-topbar">
          <div className="ds-topbar-left">
            {/* hamburger — mobile only */}
            <button
              className="ds-menu-toggle"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <span /><span /><span />
            </button>
            <div>
              {role && <span className="ds-kicker">{role}</span>}
              <h2 className="ds-topbar-title">{title}</h2>
              {subtitle && <p className="ds-topbar-sub">{subtitle}</p>}
            </div>
          </div>
          <div className="ds-user-chip">
            <span className="ds-user-avatar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            </span>
            <span className="ds-user-name">{signedInAs}</span>
          </div>
        </header>

        <section className="ds-content">
          {children}
        </section>
      </main>
    </div>
  );
}
