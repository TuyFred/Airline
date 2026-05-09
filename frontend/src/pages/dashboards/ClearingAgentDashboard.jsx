import React, { useEffect, useMemo, useRef, useState } from 'react';
import DashboardShell from '../../components/DashboardShell';
import Pagination, { usePagination } from '../../components/Pagination';
import DocumentPreview from '../../components/DocumentPreview';
import api from '../../services/api';
import '../../styles/DashboardPages.css';

const initialSubmit = {
  exporter_id: '',
  booking_id: '',
  doc_name_pattern: '',
  awb_code: '',
  actual_kg: '',
  files: []
};

function toNumber(value) {
  return Number(value || 0);
}

function setShareDisposition(url, disposition) {
  if (!url) return '';
  try {
    const u = new URL(url);
    u.searchParams.set('disposition', disposition);
    return u.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}disposition=${encodeURIComponent(disposition)}`;
  }
}

function formatBookingOption(b) {
  const status = String(b.status || '').toLowerCase();
  const tag =
    status === 'approved'
      ? 'Approved'
      : status === 'pending'
        ? 'Pending'
        : status === 'cancelled'
          ? 'Cancelled'
          : status === 'rejected'
            ? 'Rejected'
            : status || '—';
  const airline = b.airline_name || '—';
  const kg = Number(b.tonnage_kg || 0).toLocaleString('en-US');
  const date = String(b.flight_date || '').slice(0, 10);
  return `#${b.id} · ${airline} · ${b.destination} · ${date} · ${tag} · ${kg} kg`;
}

export default function ClearingAgentDashboard() {
  const [activeView, setActiveView] = useState('overview');
  const [summary, setSummary] = useState({});
  const [documents, setDocuments] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [exporters, setExporters] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [submitForm, setSubmitForm] = useState(initialSubmit);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [exporterBookings, setExporterBookings] = useState([]);
  const [loadingExporterBookings, setLoadingExporterBookings] = useState(false);
  const [useManualBookingId, setUseManualBookingId] = useState(false);
  const documentsRef = useRef(null);

  const documentsPager = usePagination(documents, 5);
  const documentRows = documentsPager.pagedItems;

  const pendingBookings = useMemo(
    () => bookings.filter((booking) => String(booking.status || '').toLowerCase() === 'pending').length,
    [bookings]
  );

  const confirmedBookings = useMemo(
    () => bookings.filter((booking) => String(booking.status || '').toLowerCase() === 'approved').length,
    [bookings]
  );

  const docsToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return documents.filter((doc) => String(doc.created_at || '').slice(0, 10) === today).length;
  }, [documents]);

  const loadAll = async () => {
    try {
      const [dashboardData, docs, exportersData] = await Promise.all([
        api.apiGet('/api/public/dashboards/agent'),
        api.apiGet('/api/documents'),
        api.apiGet('/api/public/exporters')
      ]);
      setSummary(dashboardData.summary || {});
      setBookings(dashboardData.bookings || []);
      setDocuments(docs || []);
      setExporters(exportersData || []);
      documentsPager.setPage(1);
    } catch (error) {
      setMessage(error.message || 'Failed to load clearing dashboard data');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const scrollToSection = () => {
      const hash = window.location.hash || '';
      const queryPart = hash.includes('?') ? hash.split('?')[1] : '';
      const params = new URLSearchParams(queryPart);
      const view = params.get('view');
      const allowed = ['overview', 'submit', 'documents'];

      if (!view || !allowed.includes(view)) {
        window.location.hash = '#dashboard/agent?view=overview';
        return;
      }
      setActiveView(view);

      if (view === 'submit') {
        setShowSubmitModal(true);
      }
      if (view === 'documents') {
        documentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    scrollToSection();
    window.addEventListener('hashchange', scrollToSection);
    return () => window.removeEventListener('hashchange', scrollToSection);
  }, []);

  const exporterIdForBookings = submitForm.exporter_id;

  useEffect(() => {
    if (!exporterIdForBookings) {
      setExporterBookings([]);
      setLoadingExporterBookings(false);
      return;
    }

    let cancelled = false;
    setUseManualBookingId(false);
    setLoadingExporterBookings(true);
    setExporterBookings([]);

    api
      .apiGet(`/api/bookings/exporter/${exporterIdForBookings}`)
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setExporterBookings(list);
        const approvedFirst = list.find((b) => String(b.status).toLowerCase() === 'approved');
        const pick = approvedFirst || list[0];
        setSubmitForm((prev) => ({
          ...prev,
          booking_id: pick ? String(pick.id) : ''
        }));
      })
      .catch(() => {
        if (!cancelled) {
          setExporterBookings([]);
          setSubmitForm((prev) => ({ ...prev, booking_id: '' }));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingExporterBookings(false);
      });

    return () => {
      cancelled = true;
    };
  }, [exporterIdForBookings]);

  const submitUplift = async (event) => {
    event.preventDefault();
    if (!submitForm.exporter_id) {
      setMessage('Please select the exporter account.');
      return;
    }

    const wantsKg = String(submitForm.actual_kg || '').trim() !== '';
    const wantsDocs = submitForm.files.length > 0;

    if (!wantsKg && !wantsDocs) {
      setMessage('Add at least an uplift kg confirmation or one document to upload.');
      return;
    }

    if (wantsKg && !submitForm.booking_id) {
      setMessage('Booking ID is required to confirm uplift kg.');
      return;
    }

    setSubmitting(true);
    try {
      if (wantsDocs) {
        const payload = new FormData();
        payload.append('exporter_id', submitForm.exporter_id);
        payload.append('doc_type', 'general');
        if (submitForm.booking_id) payload.append('booking_id', submitForm.booking_id);
        if (submitForm.doc_name_pattern) payload.append('doc_name_pattern', submitForm.doc_name_pattern);
        if (submitForm.awb_code) payload.append('awb_code', submitForm.awb_code);
        if (submitForm.files.length === 1) {
          payload.append('file', submitForm.files[0]);
        } else {
          submitForm.files.forEach((file) => payload.append('files', file));
        }
        await api.apiPost('/api/documents/upload', payload);
      }

      if (wantsKg) {
        await api.apiPost(`/api/bookings/${submitForm.booking_id}/uplift-confirm`, {
          actual_kg: Number(submitForm.actual_kg)
        });
      }

      const messages = [];
      if (wantsDocs) messages.push(submitForm.files.length > 1 ? 'Documents merged & uploaded.' : 'Document uploaded.');
      if (wantsKg) messages.push(`Uplift kg confirmed for booking #${submitForm.booking_id}.`);
      setMessage(messages.join(' '));

      setSubmitForm(initialSubmit);
      setExporterBookings([]);
      setUseManualBookingId(false);
      setShowSubmitModal(false);
      window.location.hash = '#dashboard/agent?view=overview';
      await loadAll();
    } catch (error) {
      setMessage(error.message || 'Failed to submit uplift');
    } finally {
      setSubmitting(false);
    }
  };

  const setView = (view) => {
    setActiveView(view);
    window.location.hash = `#dashboard/agent?view=${view}`;
    if (view === 'submit') {
      setShowSubmitModal(true);
    }
  };

  const openSubmitModal = () => {
    setShowSubmitModal(true);
    window.location.hash = '#dashboard/agent?view=submit';
  };

  const closeSubmitModal = () => {
    setShowSubmitModal(false);
    if (activeView === 'submit') {
      window.location.hash = '#dashboard/agent?view=overview';
      setActiveView('overview');
    }
  };

  const openDocumentPreview = async (doc) => {
    try {
      const detail = await api.apiGet(`/api/documents/${doc.id}`);
      const shared = await api.apiPost(`/api/documents/${doc.id}/share-link`, { expires_in_hours: 72 });
      setSelectedDocument({ ...detail, shareUrl: shared?.share_url || '' });
    } catch (error) {
      setMessage(error.message || 'Unable to open document preview');
    }
  };

  return (
    <DashboardShell
      role="Clearing Agent"
      title="Documents & Uplift Confirmation"
      subtitle=""
      accent="dashboard-agent"
      sidebarSummary=""
    >
      <div className="sheet-tabs" role="tablist" aria-label="Clearing agent views">
        <button className={activeView === 'overview' ? 'active' : ''} onClick={() => setView('overview')}>Overview</button>
        <button className={activeView === 'submit' ? 'active' : ''} onClick={openSubmitModal}>Submit Uplift</button>
        <button className={activeView === 'documents' ? 'active' : ''} onClick={() => setView('documents')}>Document Vault</button>
      </div>

      {activeView === 'overview' ? (
      <div className="dashboard-grid metrics-grid">
        <article className="metric-card">
          <span>Docs Pending</span>
          <strong>{toNumber(summary.docsPending)}</strong>
        </article>
        <article className="metric-card">
          <span>Shipments</span>
          <strong>{toNumber(summary.shipments)}</strong>
        </article>
        <article className="metric-card">
          <span>Linked Exporters</span>
          <strong>{toNumber(summary.exportersLinked)}</strong>
        </article>
        <article className="metric-card">
          <span>Pending Bookings</span>
          <strong>{pendingBookings}</strong>
        </article>
        <article className="metric-card">
          <span>Confirmed Bookings</span>
          <strong>{confirmedBookings}</strong>
        </article>
        <article className="metric-card">
          <span>Uploaded Today</span>
          <strong>{docsToday}</strong>
        </article>
        <article className="metric-card">
          <span>My Documents</span>
          <strong>{documents.length}</strong>
        </article>
        <article className="metric-card metric-card-cta">
          <span>Quick Action</span>
          <button type="button" className="search-submit" onClick={openSubmitModal}>+ Submit Uplift</button>
        </article>
      </div>
      ) : null}

      {activeView === 'documents' ? (
      <div className="dashboard-grid single-panel-grid">
        <article className="panel-card full-width" ref={documentsRef}>
          <div className="admin-toolbar">
            <h3>Document Vault</h3>
            <button type="button" className="search-submit" onClick={openSubmitModal}>+ Submit Uplift</button>
          </div>
          <div className="document-list">
            {documentRows.map((doc) => (
              <div className="document-row" key={doc.id}>
                <div>
                  <strong>{doc.doc_name_pattern || doc.file_name}</strong>
                  <p>
                    {doc.awb_code ? `${doc.awb_code} • ` : ''}{doc.exporter_name || 'Exporter'} • {doc.created_at}
                  </p>
                </div>
                <div className="inline-actions">
                  <button type="button" className="table-action" onClick={() => openDocumentPreview(doc)}>View</button>
                  <button
                    type="button"
                    className="table-action"
                    onClick={async () => {
                      try {
                        const shared = await api.apiPost(`/api/documents/${doc.id}/share-link`, { expires_in_hours: 72 });
                        if (shared?.share_url) window.open(setShareDisposition(shared.share_url, 'attachment'), '_blank', 'noopener,noreferrer');
                      } catch (error) {
                        setMessage(error.message || 'Failed to create download link');
                      }
                    }}
                  >
                    Download
                  </button>
                  <span className="status-pill uploaded">Uploaded</span>
                </div>
              </div>
            ))}
            {!documents.length ? <p>No documents uploaded yet.</p> : null}
          </div>
          {documents.length ? <Pagination {...documentsPager} label="documents" compact /> : null}
        </article>
      </div>
      ) : null}

      {showSubmitModal ? (
        <div className="smart-grid-modal-overlay">
          <div className="smart-grid-modal submit-uplift-modal" role="dialog" aria-label="Submit uplift">
            <div className="smart-grid-head">
              <h4>Submit Uplift — Documents & Confirmation</h4>
              <button className="close-btn" type="button" onClick={closeSubmitModal} aria-label="Close">✕</button>
            </div>
            <form className="booking-form submit-uplift-form" onSubmit={submitUplift}>
              <label>
                Exporter Account *
                <select
                  value={submitForm.exporter_id}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    setSubmitForm((prev) => ({ ...prev, exporter_id: nextId, booking_id: '' }));
                    setUseManualBookingId(false);
                  }}
                  required
                >
                  <option value="">-- Choose exporter --</option>
                  {exporters.map((exp) => (
                    <option key={exp.id} value={exp.id}>{exp.name}</option>
                  ))}
                </select>
              </label>

              {submitForm.exporter_id ? (
                loadingExporterBookings ? (
                  <label className="full-width">
                    Booking
                    <span className="muted-cell" style={{ display: 'block', padding: '0.45rem 0' }}>Loading bookings…</span>
                  </label>
                ) : exporterBookings.length > 0 && !useManualBookingId ? (
                  <label className="full-width">
                    Booking
                    <select
                      value={submitForm.booking_id}
                      onChange={(event) => setSubmitForm((prev) => ({ ...prev, booking_id: event.target.value }))}
                    >
                      <option value="">— Select booking —</option>
                      {exporterBookings.map((b) => (
                        <option key={b.id} value={String(b.id)}>
                          {formatBookingOption(b)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="table-action"
                      style={{ marginTop: '0.45rem' }}
                      onClick={() => {
                        setUseManualBookingId(true);
                        setSubmitForm((prev) => ({ ...prev, booking_id: '' }));
                      }}
                    >
                      Enter booking ID manually
                    </button>
                  </label>
                ) : (
                  <label className="full-width">
                    Booking ID
                    <input
                      type="number"
                      min="1"
                      value={submitForm.booking_id}
                      onChange={(event) => setSubmitForm((prev) => ({ ...prev, booking_id: event.target.value }))}
                      placeholder="e.g., 102"
                    />
                    {exporterBookings.length > 0 ? (
                      <button
                        type="button"
                        className="table-action"
                        style={{ marginTop: '0.45rem' }}
                        onClick={() => {
                          setUseManualBookingId(false);
                          const approvedFirst = exporterBookings.find((x) => String(x.status).toLowerCase() === 'approved');
                          const pick = approvedFirst || exporterBookings[0];
                          setSubmitForm((prev) => ({
                            ...prev,
                            booking_id: pick ? String(pick.id) : ''
                          }));
                        }}
                      >
                        Choose from list
                      </button>
                    ) : (
                      <span className="file-input-hint">No bookings for this exporter — enter the booking ID.</span>
                    )}
                  </label>
                )
              ) : null}

              <label>
                AWB Code
                <input
                  type="text"
                  value={submitForm.awb_code}
                  onChange={(event) => setSubmitForm({ ...submitForm, awb_code: event.target.value })}
                  placeholder="e.g., 071-12345678"
                />
              </label>

              <label>
                Actual Uplift (kg)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={submitForm.actual_kg}
                  onChange={(event) => setSubmitForm({ ...submitForm, actual_kg: event.target.value })}
                  placeholder="e.g., 1940"
                />
              </label>

              <label className="full-width">
                Document Name (e.g., "Fresh4u document", "MWW document")
                <input
                  type="text"
                  value={submitForm.doc_name_pattern}
                  onChange={(event) => setSubmitForm({ ...submitForm, doc_name_pattern: event.target.value })}
                  placeholder="Type any document name"
                />
              </label>

              <label className="file-input-label full-width">
                Select File(s) — multiple files will be merged into one PDF
                <input
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(event) => setSubmitForm({ ...submitForm, files: Array.from(event.target.files || []) })}
                />
                {submitForm.files.length > 0 ? (
                  <span className="file-input-hint">
                    {submitForm.files.length} file{submitForm.files.length > 1 ? 's' : ''} selected
                    {submitForm.files.length > 1 ? ' — will be merged into one PDF' : ''}
                  </span>
                ) : null}
              </label>

              <div className="modal-button-group full-width">
                <button className="search-submit" type="submit" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit Uplift'}
                </button>
                <button className="table-action" type="button" onClick={closeSubmitModal} disabled={submitting}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {selectedDocument ? (
        <div className="smart-grid-modal-overlay">
          <div className="smart-grid-modal document-preview-modal" role="dialog" aria-label="Document preview">
            <div className="smart-grid-head">
              <h4>{selectedDocument.doc_name_pattern || selectedDocument.file_name}</h4>
              <button className="close-btn" type="button" onClick={() => setSelectedDocument(null)} aria-label="Close">✕</button>
            </div>
            <DocumentPreview
              key={selectedDocument.id}
              shareUrl={selectedDocument.shareUrl}
              mimeType={selectedDocument.mime_type}
              fileName={selectedDocument.file_name || selectedDocument.doc_name_pattern}
            />
            <div className="smart-grid-footer">
              <p>{selectedDocument.exporter_name || 'Exporter'} • {selectedDocument.awb_code || ''}</p>
              <a className="table-action" href={setShareDisposition(selectedDocument.shareUrl, 'attachment')} target="_blank" rel="noopener noreferrer">Download file</a>
            </div>
          </div>
        </div>
      ) : null}

      {message ? <p className="booking-message">{message}</p> : null}
    </DashboardShell>
  );
}
