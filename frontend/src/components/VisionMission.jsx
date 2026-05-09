import React from 'react';
import '../styles/VisionMission.css';

export default function VisionMission() {
  return (
    <section id="vision" className="vision-mission-section">
      <div className="container">
        <h2 className="section-title">Our Vision & Mission</h2>

        <div className="cards-grid">
          <div className="vision-card">
            <div className="vision-card-header">
              <div className="card-icon">🎯</div>
              <h3>Our Vision</h3>
            </div>
            <p>
              To become Rwanda&apos;s leading neutral digital hub for air cargo optimization, turning fragmented booking processes into seamless, high-utilization export operations. We help exporters of every size reduce spoilage, secure capacity more reliably, and grow Rwanda&apos;s fresh produce export economy.
            </p>
          </div>

          <div className="mission-card">
            <div className="vision-card-header">
              <div className="card-icon">🚀</div>
              <h3>Our Mission</h3>
            </div>
            <p>
              To empower Rwanda&apos;s fresh horticultural exporters with one centralized, real-time coordination platform. We streamline bookings, support dynamic capacity reallocation, strengthen transparent airline collaboration, and deliver dependable air cargo access so exporters can focus on growth while we coordinate the logistics.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
