import React, { useEffect, useMemo, useState } from 'react';
import DashboardShell from '../../components/DashboardShell';
import api from '../../services/api';
import '../../styles/DashboardPages.css';

const SMS_TEMPLATES = {
  loaded: {
    label: 'Shipment Loaded Successfully',
    buildMessage: (exporterName, destination) =>
      `Dear ${exporterName || '[Exporter Name]'},\n\nPlease be informed that your shipment to ${destination || '[Destination]'} has been loaded successfully.\n\nKindly notify the client to prepare for collection upon arrival.\n\nThanks & Best regards,\nAirline Analyst`
  },
  offloaded: {
    label: 'Shipment Offloaded',
    buildMessage: (exporterName, destination, reason) =>
      `Dear ${exporterName || '[Exporter Name]'} Team,\n\nUnfortunately, your shipment to ${destination || '[Destination]'} has been offloaded due to ${reason || '[Reason]'}.\n\nKindly be informed that your shipment will be uplifted on the next available flight.\n\nWe sincerely apologize for any inconvenience this may cause and appreciate your understanding and cooperation during this time.\n\nKind regards`
  },
  partial: {
    label: 'Partial Offload',
    buildMessage: (exporterName, destination) =>
      `Dear ${exporterName || '[Exporter Name]'},\n\nPlease be informed that part of your shipment to ${destination || '[Destination]'} has been offloaded due to operational reasons.\n\nThe remaining shipment has been scheduled for the next available flight.\n\nThank you for your understanding.\n\nKind regards`
  },
  custom: {
    label: 'Custom Message',
    buildMessage: () => ''
  }
};

function toNumber(value) {
  return Number(value || 0);
}

export default function UpliftAgentDashboard() {
  const [bookings, setBookings] = useState([]);
  const [smsForm, setSmsForm] = useState({
    booking_id: '',
    sms_type: 'loaded',
    exporter_name: '',
    destination: '',
    reason: '',
    custom_message: ''
  });
  const [broadcastForm, setBroadcastForm] = useState({
    title: '',
    message: '',
    type: 'info'
  });
  const [smsLogs, setSmsLogs] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [activeTab, setActiveTab] = useState('uplift');
  const [message, setMessage] = useState('');

  const previewMessage = useMemo(() => {
    const template = SMS_TEMPLATES[smsForm.sms_type];
    if (!template) return '';
    if (smsForm.sms_type === 'custom') return smsForm.custom_message;
    const generated = template.buildMessage(smsForm.exporter_name, smsForm.destination, smsForm.reason);
    return smsForm.sms_type === 'partial' && smsForm.custom_message ? smsForm.custom_message : generated;
  }, [smsForm]);

  const loadAll = async () => {
    try {
      const [bookingRows, logsRows, broadcastRows] = await Promise.all([
        api.apiGet('/api/bookings/airline').catch(() => []),
        api.apiGet('/api/notifications/uplift-sms-logs').catch(() => []),
        api.apiGet('/api/notifications/broadcasts').catch(() => [])
      ]);
      setBookings(bookingRows || []);
      setSmsLogs(logsRows || []);
      setBroadcasts(broadcastRows || []);
    } catch (err) {
      setMessage('Failed to load dashboard data');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSmsSubmit = async (event) => {
    event.preventDefault();
    if (!smsForm.booking_id || !smsForm.sms_type) {
      setMessage('Please enter a Booking ID and select an SMS type.');
      return;
    }
    if (smsForm.sms_type === 'offloaded' && !smsForm.reason.trim()) {
      setMessage('A reason is required for offload notifications.');
      return;
    }

    try {
      const payload = {
        booking_id: Number(smsForm.booking_id),
        sms_type: smsForm.sms_type,
        destination: smsForm.destination || undefined,
        reason: smsForm.reason || undefined,
        custom_message: (smsForm.sms_type === 'partial' || smsForm.sms_type === 'custom') ? previewMessage : undefined,
        exporter_name: smsForm.exporter_name || undefined
      };

      const result = await api.apiPost('/api/notifications/uplift-sms', payload);
      setMessage(`Notification sent successfully. ${result.recipients || 0} recipient(s) notified.`);
      setSmsForm({ booking_id: '', sms_type: 'loaded', exporter_name: '', destination: '', reason: '', custom_message: '' });
      await loadAll();
    } catch (err) {
      setMessage(err.message || 'Failed to send notification');
    }
  };

  const handleBroadcastSubmit = async (event) => {
    event.preventDefault();
    if (!broadcastForm.title || !broadcastForm.message) {
      setMessage('Title and message are required for broadcast.');
      return;
    }
    try {
      const result = await api.apiPost('/api/notifications/broadcast', broadcastForm);
      setMessage(`Broadcast sent to ${result.recipients || 0} exporters.`);
      setBroadcastForm({ title: '', message: '', type: 'info' });
      await loadAll();
    } catch (err) {
      setMessage(err.message || 'Failed to send broadcast');
    }
  };

  const autoFillFromBooking = (bookingId) => {
    const booking = bookings.find((b) => String(b.id) === String(bookingId));
    if (!booking) return;
    setSmsForm((prev) => ({
      ...prev,
      booking_id: String(bookingId),
      destination: booking.destination || prev.destination,
      exporter_name: booking.exporter || prev.exporter_name
    }));
  };

  return (
    <DashboardShell
      role="Uplift Agent"
      title="Uplift Notification Desk"
      subtitle="Send shipment status notifications to exporters and broadcast operational updates to all."
      accent="dashboard-agent"
      sidebarSummary="Use SMS templates to notify exporters about loaded, offloaded, or partially offloaded shipments. Send general broadcasts for flight changes."
    >
      <div className="sheet-tabs" role="tablist">
        <button className={activeTab === 'uplift' ? 'active' : ''} onClick={() => setActiveTab('uplift')}>Uplift Notifications</button>
        <button className={activeTab === 'broadcast' ? 'active' : ''} onClick={() => setActiveTab('broadcast')}>General Broadcast</button>
        <button className={activeTab === 'logs' ? 'active' : ''} onClick={() => setActiveTab('logs')}>Sent Logs</button>
        <button className={activeTab === 'bookings' ? 'active' : ''} onClick={() => setActiveTab('bookings')}>Bookings Feed</button>
      </div>

      {activeTab === 'uplift' ? (
        <div className="dashboard-grid two-column-grid">
          <article className="panel-card highlight-card">
            <h3>Send Uplift Notification</h3>
            <form className="booking-form" onSubmit={handleSmsSubmit}>
              <label>
                Booking ID *
                <input
                  type="number"
                  min="1"
                  value={smsForm.booking_id}
                  onChange={(event) => {
                    setSmsForm({ ...smsForm, booking_id: event.target.value });
                    autoFillFromBooking(event.target.value);
                  }}
                  placeholder="e.g., 102"
                  required
                />
              </label>

              <label>
                Notification Type *
                <select
                  value={smsForm.sms_type}
                  onChange={(event) => setSmsForm({ ...smsForm, sms_type: event.target.value, reason: '', custom_message: '' })}
                >
                  {Object.entries(SMS_TEMPLATES).map(([key, tpl]) => (
                    <option key={key} value={key}>{tpl.label}</option>
                  ))}
                </select>
              </label>

              <label>
                Exporter Name (auto-filled from booking)
                <input
                  type="text"
                  value={smsForm.exporter_name}
                  onChange={(event) => setSmsForm({ ...smsForm, exporter_name: event.target.value })}
                  placeholder="e.g., Souk Farms"
                />
              </label>

              <label>
                Destination (auto-filled from booking)
                <input
                  type="text"
                  value={smsForm.destination}
                  onChange={(event) => setSmsForm({ ...smsForm, destination: event.target.value })}
                  placeholder="e.g., AMS, BRU"
                />
              </label>

              {smsForm.sms_type === 'offloaded' ? (
                <label className="full-width">
                  Reason for Offload *
                  <input
                    type="text"
                    value={smsForm.reason}
                    onChange={(event) => setSmsForm({ ...smsForm, reason: event.target.value })}
                    placeholder="e.g., weight restrictions, operational reasons"
                    required
                  />
                </label>
              ) : null}

              {(smsForm.sms_type === 'partial' || smsForm.sms_type === 'custom') ? (
                <label className="full-width">
                  {smsForm.sms_type === 'partial' ? 'Custom Message (edit the template below)' : 'Custom Message *'}
                  <textarea
                    value={smsForm.custom_message || (smsForm.sms_type === 'partial' ? SMS_TEMPLATES.partial.buildMessage(smsForm.exporter_name, smsForm.destination) : '')}
                    onChange={(event) => setSmsForm({ ...smsForm, custom_message: event.target.value })}
                    rows={6}
                    placeholder="Type your custom notification message..."
                    required={smsForm.sms_type === 'custom'}
                  />
                </label>
              ) : null}

              <button className="search-submit full-width" type="submit">Send Notification</button>
            </form>
          </article>

          <article className="panel-card">
            <h3>Message Preview</h3>
            <p style={{ fontSize: '0.82rem', color: '#666' }}>This is how the notification will appear to the exporter.</p>
            <div style={{ background: '#f5f5f5', border: '1px solid #ddd', borderRadius: '8px', padding: '1rem', whiteSpace: 'pre-wrap', fontSize: '0.88rem', lineHeight: '1.6', minHeight: '200px', color: '#222' }}>
              {previewMessage || 'Fill in the form fields to see the message preview.'}
            </div>

            <h4 style={{ marginTop: '1.25rem' }}>SMS Template Reference</h4>
            <div style={{ fontSize: '0.82rem', color: '#555' }}>
              <p><strong>Notification 1 (Loaded):</strong> Used when shipment is fully loaded. Auto-sent to exporter with destination.</p>
              <p><strong>Notification 2 (Offloaded):</strong> Used when shipment is fully offloaded. Requires a reason.</p>
              <p><strong>Notification 3 (Partial):</strong> Used for partial offload. Analyst types a custom message describing what was offloaded.</p>
              <p><strong>Custom:</strong> Free-form message for any operational update.</p>
            </div>
          </article>
        </div>
      ) : null}

      {activeTab === 'broadcast' ? (
        <div className="dashboard-grid two-column-grid">
          <article className="panel-card highlight-card">
            <h3>General Broadcast to All Exporters</h3>
            <div className="panel-card" style={{ background: '#fff8e1', border: '1px solid #ffe082', marginBottom: '1rem', padding: '0.75rem', borderRadius: '8px' }}>
              <strong>Example:</strong>
              <p style={{ fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
                "We would like to inform all exporters that Flight ETxxx scheduled for today has been cancelled due to weather conditions. Further updates will be communicated shortly."
              </p>
            </div>
            <form className="booking-form" onSubmit={handleBroadcastSubmit}>
              <label>
                Notification Title *
                <input
                  type="text"
                  value={broadcastForm.title}
                  onChange={(event) => setBroadcastForm({ ...broadcastForm, title: event.target.value })}
                  placeholder="e.g., Flight ETxxx Cancelled"
                  required
                />
              </label>
              <label>
                Type
                <select
                  value={broadcastForm.type}
                  onChange={(event) => setBroadcastForm({ ...broadcastForm, type: event.target.value })}
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="success">Success</option>
                </select>
              </label>
              <label className="full-width">
                Message *
                <textarea
                  value={broadcastForm.message}
                  onChange={(event) => setBroadcastForm({ ...broadcastForm, message: event.target.value })}
                  rows={6}
                  placeholder="We would like to inform all exporters that..."
                  required
                />
              </label>
              <button className="search-submit full-width" type="submit">Send to All Exporters</button>
            </form>
          </article>

          <article className="panel-card">
            <h3>Recent Broadcasts</h3>
            <div className="document-list">
              {broadcasts.length ? broadcasts.map((b) => (
                <div key={b.id} className="document-row">
                  <div>
                    <strong>{b.title}</strong>
                    <p>{b.message}</p>
                    <small>{b.sender} — {b.created_at ? new Date(b.created_at).toLocaleString('en-US') : '-'}</small>
                  </div>
                  <span className={`status-pill ${b.type || 'info'}`}>{(b.type || 'info').toUpperCase()}</span>
                </div>
              )) : <p>No broadcasts sent yet.</p>}
            </div>
          </article>
        </div>
      ) : null}

      {activeTab === 'logs' ? (
        <article className="panel-card">
          <h3>Uplift Notification Logs</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Booking</th>
                  <th>Type</th>
                  <th>Exporter</th>
                  <th>Destination</th>
                  <th>Reason</th>
                  <th>Sent By</th>
                </tr>
              </thead>
              <tbody>
                {smsLogs.length ? smsLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{log.sent_at ? new Date(log.sent_at).toLocaleString('en-US') : '-'}</td>
                    <td>#{log.booking_id}</td>
                    <td><span className={`status-pill ${log.sms_type === 'loaded' ? 'confirmed' : log.sms_type === 'offloaded' ? 'full' : 'pending'}`}>{log.sms_type}</span></td>
                    <td>{log.exporter || '-'}</td>
                    <td>{log.destination || '-'}</td>
                    <td>{log.reason || '-'}</td>
                    <td>{log.sender || '-'}</td>
                  </tr>
                )) : <tr><td colSpan="7">No notification logs yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {activeTab === 'bookings' ? (
        <article className="panel-card">
          <h3>Bookings Feed</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Exporter</th>
                  <th>Airline</th>
                  <th>Date</th>
                  <th>Destination</th>
                  <th>Skids</th>
                  <th>Kg</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.length ? bookings.slice(0, 30).map((booking) => (
                  <tr key={booking.id} style={{ cursor: 'pointer' }} onClick={() => autoFillFromBooking(booking.id)}>
                    <td>#{booking.id}</td>
                    <td>{booking.exporter || '-'}</td>
                    <td>{booking.airline || '-'}</td>
                    <td>{String(booking.flight_date || '').slice(0, 10)}</td>
                    <td>{booking.destination || '-'}</td>
                    <td>{toNumber(booking.skids)}</td>
                    <td>{toNumber(booking.tonnage_kg).toLocaleString('en-US')}</td>
                    <td><span className={`status-pill ${booking.status}`}>{booking.status}</span></td>
                  </tr>
                )) : <tr><td colSpan="8">No bookings found.</td></tr>}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.5rem' }}>Click a row to auto-fill the booking ID in the Uplift Notifications tab.</p>
        </article>
      ) : null}

      {message ? <p className="booking-message">{message}</p> : null}
    </DashboardShell>
  );
}
