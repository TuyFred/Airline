import React, { useEffect, useState } from 'react';
import '../styles/AdminModals.css';

export default function PMCSpaceModal({ open, onClose, onSave, pmcSpace = null, airlines = [], directions = [], loading = false }) {
  const [capacityForm, setCapacityForm] = useState({
    airline_id: '',
    flight_date: '',
    destination: '',
    total_kg: '',
    total_skids: '',
    pmc_details: ''
  });

  useEffect(() => {
    if (!open) return;

    if (pmcSpace) {
      setCapacityForm({
        airline_id: pmcSpace.airline_id || '',
        flight_date: pmcSpace.flight_date || '',
        destination: pmcSpace.destination || '',
        total_kg: pmcSpace.total_kg != null && pmcSpace.total_kg !== '' ? String(pmcSpace.total_kg) : '',
        total_skids: pmcSpace.total_skids != null && pmcSpace.total_skids !== '' ? String(pmcSpace.total_skids) : '',
        pmc_details: pmcSpace.pmc_details || ''
      });
    } else {
      setCapacityForm({
        airline_id: '',
        flight_date: '',
        destination: '',
        total_kg: '',
        total_skids: '',
        pmc_details: ''
      });
    }
  }, [open, pmcSpace]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(capacityForm);
  };

  if (!open) return null;

  return (
    <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-label={pmcSpace ? 'Edit PMC Space' : 'Add PMC Space'}>
      <div className="admin-modal">
        <header className="admin-modal-header">
          <div>
            <h2>{pmcSpace ? 'Edit PMC Space' : 'Add New PMC Space'}</h2>
            <p className="admin-modal-subtitle">
              {pmcSpace ? 'Update capacity totals manually' : 'Enter total skids and total weight (kg) for this lane and date'}
            </p>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <form className="admin-modal-form" onSubmit={handleSubmit}>
          <label className="admin-modal-label">
            <span className="admin-modal-label-text">Airline <span className="required">*</span></span>
            <select
              value={capacityForm.airline_id}
              onChange={(e) => setCapacityForm({ ...capacityForm, airline_id: e.target.value })}
              required
              autoFocus
            >
              <option value="">Select airline</option>
              {airlines.map((airline) => (
                <option key={airline.id} value={airline.id}>{airline.name}</option>
              ))}
            </select>
          </label>

          <div className="admin-modal-row">
            <label className="admin-modal-label">
              <span className="admin-modal-label-text">Flight Date <span className="required">*</span></span>
              <input
                type="date"
                value={capacityForm.flight_date}
                onChange={(e) => setCapacityForm({ ...capacityForm, flight_date: e.target.value })}
                required
              />
            </label>

            <label className="admin-modal-label">
              <span className="admin-modal-label-text">Destination <span className="required">*</span></span>
              <select
                value={capacityForm.destination}
                onChange={(e) => setCapacityForm({ ...capacityForm, destination: e.target.value })}
                required
              >
                <option value="">Select destination</option>
                {directions.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="admin-modal-row">
            <label className="admin-modal-label">
              <span className="admin-modal-label-text">Total skids <span className="required">*</span></span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={capacityForm.total_skids}
                onChange={(e) => setCapacityForm({ ...capacityForm, total_skids: e.target.value })}
                placeholder="e.g. 12"
                required
              />
            </label>
            <label className="admin-modal-label">
              <span className="admin-modal-label-text">Total weight (kg) <span className="required">*</span></span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={capacityForm.total_kg}
                onChange={(e) => setCapacityForm({ ...capacityForm, total_kg: e.target.value })}
                placeholder="e.g. 15000"
                required
              />
            </label>
          </div>

          <label className="admin-modal-label">
            <span className="admin-modal-label-text">Notes (optional)</span>
            <input
              type="text"
              value={capacityForm.pmc_details}
              onChange={(e) => setCapacityForm({ ...capacityForm, pmc_details: e.target.value })}
              placeholder="e.g. Manual publish — winter schedule"
            />
          </label>

          <div className="admin-modal-info">
            <span className="admin-modal-info-icon">ℹ️</span>
            <p>Totals are entered manually (no automatic conversion from exporter accounts). Booked skids and kg are tracked separately when exporters reserve space.</p>
          </div>

          <div className="admin-modal-actions">
            <button type="button" className="admin-modal-btn admin-modal-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="admin-modal-btn admin-modal-btn-primary" disabled={loading}>
              {loading ? 'Saving...' : pmcSpace ? 'Update Space' : 'Create Space'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
