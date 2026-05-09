import React, { useEffect, useState } from 'react';
import api from '../services/api';
import '../styles/AvailabilityPreview.css';

export default function AvailabilityPreview() {
  const roleViews = [
    { role: 'Exporter', note: 'Book, view public space availability, upload docs, confirm 9 AM uplift' },
    { role: 'Airline Analyst', note: 'Review bookings, analyze demand vs capacity, suggest allocation changes' },
    { role: 'Airline Supervisor', note: 'Final approval, uplift/offload control, send template or custom notifications' },
    { role: 'Clearing Agent', note: 'Upload AWB, Phyto, COO, Acceptance Docket, packing list, invoice' },
    { role: 'SBU Admin', note: 'Lock accounts, override reallocations, manage finance and analytics' }
  ];
  const [availabilityData, setAvailabilityData] = useState([]);

  useEffect(() => {
    api.apiGet('/api/public/availability')
      .then((rows) => {
        setAvailabilityData(rows.slice(0, 4).map((row) => ({
          id: row.id,
          airline: row.airline,
          airlineId: row.airline_id,
          route: `${row.destination}`,
          date: row.flight_date,
          skids: Number(row.free_skids ?? 0),
          tonnage: Number(row.free_kg ?? 0) / 1000,
          status: row.status === 'green' ? 'available' : row.status === 'yellow' ? 'limited' : 'full',
          nextFlight: '09:00'
        })))
      })
      .catch(() => setAvailabilityData([]));
  }, []);

  const getStatusBadge = (status) => {
    const badges = {
      available: { color: 'green', label: '✓ Available' },
      limited: { color: 'yellow', label: '⚠ Limited' },
      full: { color: 'red', label: '✕ Full' }
    };
    return badges[status] || badges.available;
  };

  return (
    <section id="availability" className="availability-section">
      <div className="container">
        <div className="availability-role-banner">
          <div>
            <p className="section-kicker">Protected Routes</p>
            <h2 className="section-title">Space Availability Feed</h2>
            <p className="section-subtitle">
              Public users can see space availability. Signed-in users see the dashboard that matches their role and permissions.
            </p>
          </div>

          <div className="availability-role-grid">
            {roleViews.map((view) => (
              <div key={view.role} className="availability-role-chip">
                <strong>{view.role}</strong>
                <span>{view.note}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="availability-grid">
          {availabilityData.map((flight, index) => {
            const statusInfo = getStatusBadge(flight.status);
            return (
              <div key={index} className={`availability-card ${flight.status}`}>
                <div className="card-header">
                  <h4>{flight.airline}</h4>
                  <div className={`status-badge ${statusInfo.color}`}>
                    {statusInfo.label}
                  </div>
                </div>

                <div className="card-body">
                  <p className="route"><strong>Route:</strong> {flight.route}</p>
                  <p className="date"><strong>Flight:</strong> {flight.date} at {flight.nextFlight}</p>
                </div>

                <div className="capacity-info">
                  <div className="capacity-item">
                    <span className="capacity-label">Skids Available</span>
                    <span className="capacity-value">{flight.skids}</span>
                  </div>
                  <div className="capacity-item">
                    <span className="capacity-label">Tonnage Available</span>
                    <span className="capacity-value">{flight.tonnage}t</span>
                  </div>
                </div>

                <a className="claim-btn" href={`#dashboard/exporter?view=capacity&book=${flight.id}`}>Claim Space & Book</a>
              </div>
            );
          })}
        </div>

        <div className="availability-footer">
          <p>✨ Check space availability and claim released space instantly</p>
          <a href="#bookings" className="link-button">View Full Schedule →</a>
        </div>
      </div>
    </section>
  );
}
