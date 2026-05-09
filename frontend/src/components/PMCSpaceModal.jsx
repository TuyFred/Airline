import React, { useEffect, useState } from 'react';
import '../styles/AdminModals.css';

const PMC_STANDARD_KG = 800;
const PMC_STANDARD_SKIDS = 4;

export default function PMCSpaceModal({ open, onClose, onSave, pmcSpace = null, airlines = [], directions = [], loading = false }) {
  const [capacityForm, setCapacityForm] = useState({
    airline_id: '',
    flight_date: '',
    destination: '',
    pmc_count: ''
  });

  useEffect(() => {
    if (!open) return;
    
    if (pmcSpace) {
      setCapacityForm({
        airline_id: pmcSpace.airline_id || '',
        flight_date: pmcSpace.flight_date || '',
        destination: pmcSpace.destination || '',
        pmc_count: pmcSpace.pmc_count || ''
      });
    } else {
      setCapacityForm({
        airline_id: '',
        flight_date: '',
        destination: '',
        pmc_count: ''
      });
    }
  }, [open, pmcSpace]);

  const calculateTotals = (pmcCount) => {
    const count = parseFloat(pmcCount) || 0;
    return {
      skids: (count * PMC_STANDARD_SKIDS).toFixed(2),
      kg: (count * PMC_STANDARD_KG).toFixed(2)
    };
  };

  const totals = calculateTotals(capacityForm.pmc_count);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(capacityForm);
  };

  if (!open) return null;

  return (
    <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-label={pmcSpace ? "Edit PMC Space" : "Add PMC Space"}>
      <div className="admin-modal">
        <header className="admin-modal-header">
          <div>
            <h2>{pmcSpace ? 'Edit PMC Space' : 'Add New PMC Space'}</h2>
            <p className="admin-modal-subtitle">
              {pmcSpace ? 'Update PMC space allocation' : 'Create a new PMC space allocation for an airline'}
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

          <label className="admin-modal-label">
            <span className="admin-modal-label-text">PMC Count <span className="required">*</span></span>
            <input
              type="number"
              step="0.5"
              min="0.5"
              value={capacityForm.pmc_count}
              onChange={(e) => setCapacityForm({ ...capacityForm, pmc_count: e.target.value })}
              placeholder="e.g. 10"
              required
            />
          </label>

          <div className="admin-modal-calculations">
            <div className="admin-modal-calc-card">
              <span className="admin-modal-calc-label">Calculated Skids</span>
              <span className="admin-modal-calc-value">{totals.skids}</span>
            </div>
            <div className="admin-modal-calc-card">
              <span className="admin-modal-calc-label">Calculated KG</span>
              <span className="admin-modal-calc-value">{totals.kg}</span>
            </div>
          </div>

          <div className="admin-modal-info">
            <span className="admin-modal-info-icon">ℹ️</span>
            <p>PMC planning standard: 1 PMC = {PMC_STANDARD_KG.toLocaleString('en-US')} kg and {PMC_STANDARD_SKIDS} skids.</p>
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
