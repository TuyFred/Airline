import React from 'react';
import '../styles/OurServices.css';

export default function OurServices() {
  const services = [
    {
      icon: '📊',
      title: 'Real-Time Booking & Capacity Management',
      description: 'Submit simple bookings (skids, tonnage, commodity) via our secure platform; view live public airline capacity and claim released space instantly.'
    },
    {
      icon: '🔄',
      title: 'Dynamic Reallocation & Optimization',
      description: 'Manage reductions, cancellations, and consolidations in real time to maximize utilization, recover unused space, and minimize spoilage.'
    },
    {
      icon: '✈️',
      title: 'Airline Liaison & Confirmation',
      description: 'Act as your dedicated coordinator: submit requests, secure allocations, provide daily 9 AM load confirmations, and handle communications with all carriers.'
    },
    {
      icon: '🔒',
      title: 'Document Vault & Compliance',
      description: 'Secure upload/storage of AWBs, phytosanitary certificates, COO, and other documents; generate shareable links for buyers or agents.'
    }
  ];

  return (
    <section id="services" className="services-section">
      <div className="container">
        <h2 className="section-title">Our Services</h2>
        <p className="section-subtitle">
          Dedicated coordination services designed to keep Rwanda's export cargo flow consistent, transparent, and fast.
        </p>

        <div className="services-shell">
          <div className="services-grid">
            {services.map((service, index) => (
              <div key={index} className="service-card">
                <div className="service-meta">
                  <span className="service-number">0{index + 1}</span>
                </div>
                <div className="service-icon">{service.icon}</div>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                <div className="service-accent"></div>
              </div>
            ))}
          </div>

          <div className="services-note">
            <p>
              <strong>All services are governed by individual confidential agreements,</strong> ensuring neutrality, fairness, and focus on mutual success.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
