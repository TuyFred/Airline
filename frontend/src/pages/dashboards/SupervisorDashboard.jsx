import React, { useEffect, useMemo, useState } from 'react';
import DashboardShell from '../../components/DashboardShell';
import Pagination, { usePagination } from '../../components/Pagination';
import api from '../../services/api';
import '../../styles/DashboardPages.css';

const UPLIFT_STATUSES = [
  { value: 'full', label: 'Full Loaded' },
  { value: 'half', label: 'Partial Offload' },
  { value: 'offload', label: 'Offload' }
];

const TABS = ['decisions', 'uplift'];

function statusLabel(value) {
  return UPLIFT_STATUSES.find((s) => s.value === value)?.label || value;
}

function emptyAwbRow() {
  return {
    rowId: `awb-${Math.random().toString(36).slice(2, 8)}`,
    awb_number: '',
    actual_kg: '',
    uplift_type: 'full'
  };
}

export default function SupervisorDashboard() {
  const [activeTab, setActiveTab] = useState('decisions');
  const [airlines, setAirlines] = useState([]);
  const [activeAirline, setActiveAirline] = useState('');
  const [bookings, setBookings] = useState([]);
  const [message, setMessage] = useState('');
  const [showMessagePopup, setShowMessagePopup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showUpliftModal, setShowUpliftModal] = useState(false);

  const [upliftForm, setUpliftForm] = useState({
    bookingId: '',
    message: '',
    awbRows: [emptyAwbRow()]
  });

  useEffect(() => {
    try {
      const hash = window.location.hash || '';
      const queryPart = hash.includes('?') ? hash.split('?')[1] : '';
      const params = new URLSearchParams(queryPart);
      const tab = params.get('tab') || 'decisions';
      setActiveTab(TABS.includes(tab) ? tab : 'decisions');
    } catch {
      setActiveTab('decisions');
    }

    const onHashChange = () => {
      const hash = window.location.hash || '';
      const queryPart = hash.includes('?') ? hash.split('?')[1] : '';
      const params = new URLSearchParams(queryPart);
      const tab = params.get('tab') || 'decisions';
      setActiveTab(TABS.includes(tab) ? tab : 'decisions');
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const setTab = (tab) => {
    const safe = TABS.includes(tab) ? tab : 'decisions';
    setActiveTab(safe);
    window.location.hash = `#dashboard/supervisor?tab=${safe}`;
  };

  const loadAirlines = async () => {
    try {
      const rows = await api.apiGet('/api/public/airlines');
      setAirlines(rows || []);

      let linkedAirline = '';
      try {
        const currentUser = JSON.parse(localStorage.getItem('sbu_user') || 'null');
        linkedAirline = String(currentUser?.linked_airline || '').trim();
      } catch {
        linkedAirline = '';
      }

      const defaultAirline = linkedAirline || rows?.[0]?.name || '';
      setActiveAirline(defaultAirline);
    } catch (error) {
      setMessage(error.message || 'Failed to load airlines');
    }
  };

  const loadOperationalData = async () => {
    try {
      setLoading(true);
      const bookingRows = await api.apiGet('/api/bookings/airline');
      setBookings(bookingRows || []);
      setMessage('');
    } catch (error) {
      setMessage(error.message || 'Failed to load supervisor data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAirlines();
    loadOperationalData();
  }, []);

  useEffect(() => {
    if (!message) return;
    setShowMessagePopup(true);
    const timer = window.setTimeout(() => setShowMessagePopup(false), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);

  const filteredBookings = useMemo(() => {
    if (!activeAirline) return bookings;
    return bookings.filter((row) => String(row.airline || '') === activeAirline);
  }, [bookings, activeAirline]);

  const approvedAllocations = useMemo(
    () => filteredBookings
      .filter((row) => row.status === 'approved')
      .sort((a, b) => String(b.flight_date || '').localeCompare(String(a.flight_date || ''))),
    [filteredBookings]
  );

  const decisionsPager = usePagination(approvedAllocations, 5);

  const selectedBookingForUplift = useMemo(
    () => bookings.find((b) => String(b.id) === String(upliftForm.bookingId)),
    [bookings, upliftForm.bookingId]
  );
  const upliftBookingOptions = useMemo(
    () => filteredBookings
      .filter((row) => ['approved', 'pending'].includes(String(row.status || '').toLowerCase()))
      .sort((a, b) => String(b.flight_date || '').localeCompare(String(a.flight_date || ''))),
    [filteredBookings]
  );

  const totalUpliftKg = useMemo(
    () => upliftForm.awbRows.reduce((sum, row) => sum + Number(row.actual_kg || 0), 0),
    [upliftForm.awbRows]
  );

  const updateAwbRow = (rowId, patch) => {
    setUpliftForm((prev) => ({
      ...prev,
      awbRows: prev.awbRows.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row))
    }));
  };

  const addAwbRow = () => {
    setUpliftForm((prev) => ({ ...prev, awbRows: [...prev.awbRows, emptyAwbRow()] }));
  };

  const removeAwbRow = (rowId) => {
    setUpliftForm((prev) => ({
      ...prev,
      awbRows: prev.awbRows.length === 1 ? prev.awbRows : prev.awbRows.filter((row) => row.rowId !== rowId)
    }));
  };

  const submitUplift = async (event) => {
    event.preventDefault();
    if (!upliftForm.bookingId) {
      setMessage('Pick a booking ID first.');
      return;
    }
    const validRows = upliftForm.awbRows.filter((row) => row.awb_number && row.actual_kg);
    if (!validRows.length) {
      setMessage('Add at least one AWB number with its uplift kg.');
      return;
    }

    setSubmitting(true);
    let saved = 0;
    let failed = 0;
    let totalSavedKg = 0;
    try {
      for (const row of validRows) {
        try {
          const formData = new FormData();
          formData.append('actual_kg', String(Number(row.actual_kg)));
          formData.append('awb_number', row.awb_number);
          formData.append('awb_type', 'house');
          formData.append('uplift_type', row.uplift_type || 'full');
          formData.append('reason', '');
          formData.append('message', upliftForm.message || '');
          formData.append(
            'explanation',
            ['half', 'offload'].includes(row.uplift_type) ? (upliftForm.message || 'Update') : ''
          );

          await api.apiPost(`/api/bookings/${upliftForm.bookingId}/uplift-notification`, formData);
          totalSavedKg += Number(row.actual_kg) || 0;
          saved += 1;
        } catch (rowError) {
          failed += 1;
          console.error('Failed AWB row', row, rowError);
        }
      }

      if (saved > 0) {
        try {
          await api.apiPost(`/api/bookings/${upliftForm.bookingId}/uplift-confirmation`, {
            actual_kg: totalSavedKg
          });
        } catch (confirmError) {
          console.warn('Confirmation post failed', confirmError);
        }
      }

      setMessage(
        failed
          ? `Saved ${saved} AWB entr${saved === 1 ? 'y' : 'ies'}, ${failed} failed.`
          : `Saved ${saved} AWB entr${saved === 1 ? 'y' : 'ies'} (${totalSavedKg.toLocaleString('en-US')} kg total). Exporter notified — invoice auto-generated when clearing-agent KG matches.`
      );
      if (saved > 0) {
        setUpliftForm({ bookingId: '', message: '', awbRows: [emptyAwbRow()] });
        setShowUpliftModal(false);
        await loadOperationalData();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openUpliftModal = () => {
    const defaultBooking = upliftBookingOptions[0] || null;
    setUpliftForm((prev) => ({
      ...prev,
      bookingId: prev.bookingId || (defaultBooking ? String(defaultBooking.id) : '')
    }));
    setShowUpliftModal(true);
  };

  return (
    <DashboardShell
      role="Acceptance Team"
      title="Acceptance Team — final control"
      subtitle=""
      accent="dashboard-airline"
      sidebarSummary=""
    >
      <div className="sheet-tabs" role="tablist" aria-label="Supervisor dashboard tabs">
        <button className={activeTab === 'decisions' ? 'active' : ''} onClick={() => setTab('decisions')}>Acceptance queue</button>
        <button className={activeTab === 'uplift' ? 'active' : ''} onClick={() => setTab('uplift')}>Uplift confirmation</button>
      </div>

      <div className="inline-actions" style={{ marginBottom: '0.9rem', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontWeight: 700 }}>Airline</label>
        <select
          value={activeAirline}
          onChange={(event) => setActiveAirline(event.target.value)}
          style={{ borderRadius: '12px', border: '1px solid rgba(0, 82, 204, 0.2)', padding: '0.55rem 0.8rem' }}
        >
          {airlines.map((airline) => (
            <option key={airline.id} value={airline.name}>{airline.name}</option>
          ))}
        </select>
        <span className="status-pill confirmed">Approved bookings: {approvedAllocations.length}</span>
      </div>

      {activeTab === 'decisions' ? (
        <article className="panel-card">
          <h3>Approved Allocations</h3>
          {loading ? (
            <p>Loading approved allocations...</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Flight date</th>
                    <th>Exporter</th>
                    <th>Destination</th>
                    <th>Approved skids</th>
                    <th>Approved kg</th>
                    <th>Uplift confirmed kg</th>
                    <th>Commodity</th>
                  </tr>
                </thead>
                <tbody>
                  {decisionsPager.pagedItems.map((booking) => (
                    <tr key={booking.id}>
                      <td>#{booking.id}</td>
                      <td>{String(booking.flight_date || '').slice(0, 10)}</td>
                      <td><strong>{booking.exporter || '—'}</strong></td>
                      <td>{booking.destination || '—'}</td>
                      <td>{Number(booking.skids || 0).toLocaleString('en-US')}</td>
                      <td>{Number(booking.tonnage_kg || 0).toLocaleString('en-US')}</td>
                      <td>
                        {booking.actual_kg
                          ? <strong>{Number(booking.actual_kg).toLocaleString('en-US')}</strong>
                          : <span className="muted-cell">—</span>}
                      </td>
                      <td>{booking.commodity || '—'}</td>
                    </tr>
                  ))}
                  {!approvedAllocations.length ? (
                    <tr><td colSpan="8">No approved allocations for {activeAirline || 'this airline'} yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
          {approvedAllocations.length ? <Pagination {...decisionsPager} label="approved bookings" /> : null}
        </article>
      ) : null}

      {activeTab === 'uplift' ? (
        <article className="panel-card">
          <h3>Uplift Updates</h3>
          <p className="muted-cell" style={{ marginTop: '-0.25rem' }}>
            Use popup form to submit AWB-level uplift updates and notify exporter.
          </p>

          <div className="inline-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="search-submit" onClick={openUpliftModal}>
              + Open Uplift Popup Form
            </button>
            <span className="status-pill confirmed">Approved allocations: {upliftBookingOptions.length}</span>
          </div>
        </article>
      ) : null}

      {showUpliftModal ? (
        <div className="admin-modal-overlay" role="dialog" aria-label="Supervisor uplift updates">
          <div className="admin-modal compact-modal compact-modal-wide">
            <div className="smart-grid-head">
              <h4>Uplift Updates</h4>
              <button className="close-btn" type="button" onClick={() => setShowUpliftModal(false)} aria-label="Close">✕</button>
            </div>
            <form className="booking-form compact-form" onSubmit={submitUplift}>
              <label>
                Booking ID *
                {upliftBookingOptions.length ? (
                  <select
                    value={upliftForm.bookingId}
                    onChange={(e) => setUpliftForm({ ...upliftForm, bookingId: e.target.value })}
                    required
                  >
                    <option value="">Select booking</option>
                    {upliftBookingOptions.map((booking) => (
                      <option key={booking.id} value={String(booking.id)}>
                        #{booking.id} · {booking.exporter || '—'} · {booking.destination || '—'} · {String(booking.flight_date || '').slice(0, 10)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      type="number"
                      min="1"
                      value={upliftForm.bookingId}
                      onChange={(e) => setUpliftForm({ ...upliftForm, bookingId: e.target.value })}
                      placeholder="Type booking ID manually"
                      required
                    />
                  </>
                )}
              </label>
              <label>
                Booking summary
                <input
                  type="text"
                  readOnly
                  value={selectedBookingForUplift
                    ? `${selectedBookingForUplift.exporter || '—'} • ${selectedBookingForUplift.destination || '—'} • ${Number(selectedBookingForUplift.tonnage_kg || 0).toLocaleString('en-US')} kg approved`
                    : 'Pick a booking ID to see exporter and destination.'}
                  style={{ background: '#f5f7fb', cursor: 'not-allowed' }}
                />
              </label>

              <div className="full-width">
                <div className="awb-rows-head">
                  <h4>AWB entries (one row per AWB)</h4>
                  <button type="button" className="table-action success" onClick={addAwbRow}>+ Add another AWB</button>
                </div>

                <div className="awb-rows-list">
                  {upliftForm.awbRows.map((row, index) => (
                    <div key={row.rowId} className="awb-row-card">
                      <div className="awb-row-head">
                        <strong>AWB #{index + 1}</strong>
                        {upliftForm.awbRows.length > 1 ? (
                          <button type="button" className="table-action danger" onClick={() => removeAwbRow(row.rowId)}>Remove</button>
                        ) : null}
                      </div>
                      <div className="awb-row-grid">
                        <label>
                          AWB number *
                          <input
                            type="text"
                            value={row.awb_number}
                            onChange={(e) => updateAwbRow(row.rowId, { awb_number: e.target.value })}
                            placeholder="e.g. 071-12345678"
                          />
                        </label>
                        <label>
                          Uplift KG *
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.actual_kg}
                            onChange={(e) => updateAwbRow(row.rowId, { actual_kg: e.target.value })}
                            placeholder="e.g. 1250"
                          />
                        </label>
                        <label>
                          Status *
                          <select
                            value={row.uplift_type}
                            onChange={(e) => updateAwbRow(row.rowId, { uplift_type: e.target.value })}
                          >
                            {UPLIFT_STATUSES.map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <small className="muted-cell">{statusLabel(row.uplift_type)} • {Number(row.actual_kg || 0).toLocaleString('en-US')} kg</small>
                    </div>
                  ))}
                </div>

                <div className="awb-rows-total">
                  <span>Total uplift kg across all AWBs</span>
                  <strong>{totalUpliftKg.toLocaleString('en-US')} kg</strong>
                </div>
              </div>

              <label className="full-width">
                Message to exporter (single field — appears in their Notifications tab)
                <textarea
                  value={upliftForm.message}
                  onChange={(e) => setUpliftForm({ ...upliftForm, message: e.target.value })}
                  rows={5}
                  placeholder="Operational message for the exporter (covers all AWB entries above)."
                />
              </label>

              <div className="modal-button-group full-width">
                <button className="search-submit" type="submit" disabled={submitting}>
                  {submitting ? 'Saving…' : `Save ${upliftForm.awbRows.filter((r) => r.awb_number && r.actual_kg).length || 0} AWB entr${upliftForm.awbRows.filter((r) => r.awb_number && r.actual_kg).length === 1 ? 'y' : 'ies'} & notify exporter`}
                </button>
                <button type="button" className="table-action" onClick={() => setShowUpliftModal(false)} disabled={submitting}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {message ? <p className="booking-message">{message}</p> : null}

      {showMessagePopup ? (
        <div className="admin-float-popup" role="status">
          <div className="admin-float-popup-inner">
            <p>{message}</p>
            <button type="button" onClick={() => setShowMessagePopup(false)}>Close</button>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
