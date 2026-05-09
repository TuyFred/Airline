import React, { useEffect, useMemo, useState } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import api from '../services/api';
import '../styles/AvailabilityPage.css';

export default function AvailabilityPage() {
  const [rows, setRows] = useState([]);
  const [airlines, setAirlines] = useState([]);
  const [filters, setFilters] = useState({ startDate: '', endDate: '', airline: '' });

  const isLoggedIn = Boolean(localStorage.getItem('sbu_token'));

  const airlineOptions = useMemo(() => {
    return airlines.map((airline) => (
      typeof airline === 'object' && airline !== null
        ? airline
        : { id: airline, name: airline }
    ));
  }, [airlines]);

  useEffect(() => {
    api.apiGet('/api/public/airlines').then(setAirlines).catch(() => setAirlines([]));
  }, []);

  useEffect(() => {
    const query = new URLSearchParams();
    if (filters.startDate) query.set('startDate', filters.startDate);
    if (filters.endDate) query.set('endDate', filters.endDate);
    if (filters.airline) query.set('airline', filters.airline);

    api.apiGet(`/api/public/availability${query.toString() ? `?${query.toString()}` : ''}`)
      .then(setRows)
      .catch(() => setRows([]));
  }, [filters]);

  const mappedRows = useMemo(() => rows.map((row) => ({
    ...row,
    free_kg: Number(row.free_kg || 0),
    booked_kg: Number(row.booked_kg || 0),
    total_kg: Number(row.total_kg || 0),
    statusLabel: row.status === 'green' ? 'Green' : row.status === 'yellow' ? 'Yellow' : 'Red'
  })), [rows]);

  return (
    <div className="availability-page">
      <Header />

      <main className="availability-main">
        <section className="availability-hero">
          <h1>Space Availability</h1>
          <p>Public real-time feed for airlines, dates, total capacity, booked space, and free space status.</p>
        </section>

        <section className="availability-filter-card">
          <label>
            Start Date
            <input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} />
          </label>
          <label>
            End Date
            <input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} />
          </label>
          <label>
            Airline
            <select value={filters.airline} onChange={(event) => setFilters({ ...filters, airline: event.target.value })}>
              <option value="">All Airlines</option>
              {airlineOptions.map((airline) => (
                <option key={airline.id ?? airline.name} value={airline.name}>{airline.name}</option>
              ))}
            </select>
          </label>
        </section>

        <section className="availability-table-card">
          <table>
            <thead>
              <tr>
                <th>Airline</th>
                <th>Flight/Date</th>
                <th>Total Capacity (kg)</th>
                <th>Booked</th>
                <th>Free Space</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {mappedRows.map((row) => (
                <tr key={`${row.id}-${row.flight_date}`}>
                  <td>{row.airline}</td>
                  <td>{row.destination} / {row.flight_date}</td>
                  <td>{row.total_kg.toLocaleString('en-US')}</td>
                  <td>{row.booked_kg.toLocaleString('en-US')}</td>
                  <td>{row.free_kg.toLocaleString('en-US')}</td>
                  <td>
                    <span className={`status-pill ${row.status}`}>{row.statusLabel}</span>
                  </td>
                  <td>
                    {isLoggedIn ? (
                      <a className="claim-space-btn" href={`#dashboard/exporter?view=capacity&book=${row.id}`}>Claim Space</a>
                    ) : (
                      <span className="claim-login-hint">Login to claim</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>

      <Footer />
    </div>
  );
}
