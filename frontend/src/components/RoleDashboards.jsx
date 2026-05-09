import React from 'react';
import '../styles/RoleDashboards.css';

const roles = [
  {
    name: 'Exporter',
    route: '/dashboard/exporter',
    title: 'Personal booking grid & tracking',
    permissions: ['Book capacity', 'View public availability', 'Upload documents', 'Confirm 9 AM uplift'],
    accent: 'exporter'
  },
  {
    name: 'Airline Analyst',
    route: '/dashboard/airline-analyst',
    title: 'Excel-style capacity view per exporter',
    permissions: ['Confirm bookings', 'Review requests', 'Notify uplift/offload', 'See exporter allocation'],
    accent: 'airline'
  },
  {
    name: 'Airline Supervisor',
    route: '/dashboard/supervisor',
    title: 'Final booking control and shipment notifications',
    permissions: ['Final approval', 'Uplift/offload decision', 'Template messaging', 'PMC capacity control'],
    accent: 'airline'
  },
  {
    name: 'Clearing Agent',
    route: '/dashboard/clearing-agent',
    title: 'Linked to exporter accounts',
    permissions: ['Upload AWB', 'Upload Phyto', 'Upload COO', 'Upload Acceptance Docket', 'Confirm actual kg'],
    accent: 'agent'
  },
  {
    name: 'SBU Admin',
    route: '/dashboard/admin',
    title: 'Full vault & finance control',
    permissions: ['Invoicing', 'Analytics', 'Account lock', 'Reallocation override', 'Media upload management'],
    accent: 'admin'
  }
]

export default function RoleDashboards() {
  return (
    <section className="roles-section">
      <div className="container">
        <div className="roles-header">
          <p className="section-kicker">RBAC + Protected Routes</p>
          <h2 className="section-title">Dashboard Access by Role</h2>
          <p className="section-subtitle">
            Each user sees the right tools, data, and permissions through protected routes and role-based dashboards.
          </p>
        </div>

        <div className="roles-grid">
          {roles.map((role) => (
            <article key={role.name} className={`role-card ${role.accent}`}>
              <div className="role-card-top">
                <div>
                  <p className="role-name">{role.name}</p>
                  <h3>{role.title}</h3>
                </div>
                <span className="route-pill">{role.route}</span>
              </div>

              <ul className="permission-list">
                {role.permissions.map((permission) => (
                  <li key={permission}>{permission}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
