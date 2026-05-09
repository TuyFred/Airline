import React, { useEffect, useRef, useState } from 'react';
import '../styles/Header.css';
import companyLogo from '../assets/sbu-digital-hub-logo.png';

const NAV_LINKS = [
  { label: 'Home',               href: '#home' },
  { label: 'About Us',           href: '#vision' },
  { label: 'Our Services',       href: '#services' },
  { label: 'Space Availability', href: '#availability' },
  { label: 'Contact',            href: '#contact' },
];

const ROLES = [
  { name: 'Exporter',           id: 'exporter' },
  { name: 'Airline Analyst',    id: 'airline-analyst' },
  { name: 'Airline Supervisor', id: 'airline-supervisor' },
  { name: 'Clearing Agent',     id: 'clearing-agent' },
  { name: 'Admin',              id: 'admin' },
];

export default function Header() {
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [roleOpen,  setRoleOpen]  = useState(false);
  const roleRef = useRef(null);

  const closeAll = () => { setMenuOpen(false); setRoleOpen(false); };

  const goLogin    = () => { window.location.hash = '#login'; closeAll(); };
  const goRole     = (id) => { window.location.hash = `#login?role=${id}`; closeAll(); };

  /* close desktop role-dropdown on outside click */
  useEffect(() => {
    const fn = (e) => {
      if (roleRef.current && !roleRef.current.contains(e.target)) setRoleOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  /* prevent body scroll while mobile menu is open */
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  return (
    <>
      <header className="hdr">
        <div className="hdr-inner">

          {/* Logo */}
          <a className="hdr-logo-link" href="#home" onClick={closeAll} aria-label="Home">
            <img src={companyLogo} alt="NEEPR-SBU Digital Hub" className="hdr-logo" />
          </a>

          {/* Desktop nav */}
          <nav className="hdr-nav" aria-label="Main navigation">
            {NAV_LINKS.map(({ label, href }) => (
              <a key={href} href={href} className="hdr-nav-link">{label}</a>
            ))}
          </nav>

          {/* Desktop actions */}
          <div className="hdr-actions">
            <button className="hdr-login-btn" onClick={goLogin}>Login</button>

            {/* Role picker */}
            <div className="hdr-role-wrap" ref={roleRef}>
              <button
                className="hdr-avatar-btn"
                onClick={() => setRoleOpen(v => !v)}
                aria-label="Select role to login"
                aria-expanded={roleOpen}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            </button>
              {roleOpen && (
                <div className="hdr-role-dropdown">
                  <p className="hdr-role-title">Login as:</p>
                  {ROLES.map(r => (
                    <button key={r.id} className="hdr-role-item" onClick={() => goRole(r.id)}>
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Hamburger — mobile only */}
            <button
              className={`hdr-burger${menuOpen ? ' is-open' : ''}`}
              onClick={() => setMenuOpen(v => !v)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              <span /><span /><span />
            </button>
          </div>

        </div>
      </header>

      {/* Mobile drawer — lives OUTSIDE header so it doesn't affect stacking */}
      <div className={`mob-drawer${menuOpen ? ' is-open' : ''}`} aria-hidden={!menuOpen}>
        <nav className="mob-nav" aria-label="Mobile navigation">
          {NAV_LINKS.map(({ label, href }) => (
            <a key={href} href={href} className="mob-nav-link" onClick={closeAll}>{label}</a>
          ))}
        </nav>

        <div className="mob-divider" />

        <button className="mob-login-btn" onClick={goLogin}>Login</button>

        <p className="mob-role-title">Login as a specific role</p>
        <div className="mob-role-grid">
          {ROLES.map(r => (
            <button key={r.id} className="mob-role-btn" onClick={() => goRole(r.id)}>
              {r.name}
            </button>
          ))}
        </div>
      </div>

      {/* Backdrop */}
      {menuOpen && (
        <div className="mob-backdrop" onClick={closeAll} aria-hidden="true" />
      )}
    </>
  );
}
