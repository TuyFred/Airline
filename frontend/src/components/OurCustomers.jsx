import React, { useEffect, useState } from 'react';
import api from '../services/api';
import '../styles/OurCustomers.css';

const fallbackCustomers = [
  {
    id: 'fallback-garden',
    name: 'Garden Fresh',
    website: 'https://www.gardenfreshrwanda.com',
    logo: '/customers/gardenfresh.jpeg',
    description: 'Fresh produce exporter with reliable international supply.'
  },
  {
    id: 'fallback-souk',
    name: 'Souk Farms',
    website: 'https://www.souk-ig.com',
    logo: '/customers/souk.jpeg',
    description: 'Premium agricultural products and export-ready logistics.'
  },
  {
    id: 'fallback-kinvest',
    name: 'Kinvest Impact',
    website: 'https://www.kinvestimpact.com',
    logo: '/customers/kinvest.jpeg',
    description: 'Impact-driven agribusiness and export partnership network.'
  },
  {
    id: 'fallback-proxifresh',
    name: 'ProxiFresh',
    website: 'https://www.proxifresh.com',
    logo: '/customers/proxifresh.jpeg',
    description: 'Fast-moving fresh export brand with quality-first coordination.'
  }
];

export default function OurCustomers() {
  const [customers, setCustomers] = useState(fallbackCustomers);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    const load = () => {
      api
        .apiGet('/api/public/customers')
        .then((rows) => {
          if (!mounted) return;
          if (Array.isArray(rows) && rows.length > 0) {
            setCustomers(rows);
          } else {
            setCustomers(fallbackCustomers);
          }
          setLoaded(true);
        })
        .catch(() => {
          if (mounted) setLoaded(true);
        });
    };

    load();
    const handler = () => load();
    window.addEventListener('customers-updated', handler);

    return () => {
      mounted = false;
      window.removeEventListener('customers-updated', handler);
    };
  }, []);

  if (!loaded && customers.length === 0) {
    return null;
  }

  return (
    <section className="customers-section" id="customers">
      <div className="container">
        <div className="customers-header">
          <div className="customers-copy">
            <h2 className="section-title">Our Customers Trust Us</h2>
            <p className="section-subtitle">
              Supporting Rwanda&apos;s leading exporters with reliable air cargo coordination and direct access to their official websites.
            </p>
          </div>
        </div>

        <div className="customers-grid">
          {customers.map((customer) => (
            <article key={customer.id || customer.name} className="customer-card">
              <div className="customer-logo-wrap">
                {customer.logo ? (
                  <img src={customer.logo} alt={`${customer.name} logo`} className="customer-logo-img" />
                ) : (
                  <div className="customer-logo-placeholder" aria-hidden="true">
                    {String(customer.name || '?').slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="customer-content">
                <h3>{customer.name}</h3>
                {customer.description ? <p>{customer.description}</p> : null}
              </div>

              {customer.website ? (
                <a className="customer-link" href={customer.website} target="_blank" rel="noopener noreferrer">
                  Visit Website
                </a>
              ) : null}
            </article>
          ))}
        </div>

        <div className="customers-footer">
          <p>
            <strong>Trusted by Rwanda&apos;s export community</strong> for professional booking, coordination, and cargo visibility.
          </p>
        </div>
      </div>
    </section>
  );
}
