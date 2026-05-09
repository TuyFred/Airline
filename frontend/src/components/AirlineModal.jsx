import React, { useEffect, useState } from 'react';
import '../styles/AdminModals.css';

export default function AirlineModal({ open, onClose, onSave, airline = null, loading = false }) {
  const [airlineForm, setAirlineForm] = useState({
    name: '',
    code: '',
    from_destination: ''
  });
  const [destinations, setDestinations] = useState([]);
  const [destinationDraft, setDestinationDraft] = useState('');

  useEffect(() => {
    if (!open) return;
    
    if (airline) {
      setAirlineForm({
        name: airline.name || '',
        code: airline.code || '',
        from_destination: airline.from_destination || ''
      });
      setDestinations(airline.destinations || []);
    } else {
      setAirlineForm({ name: '', code: '', from_destination: '' });
      setDestinations([]);
    }
    setDestinationDraft('');
  }, [open, airline]);

  const addDestination = () => {
    const trimmed = destinationDraft.trim();
    if (!trimmed) return;
    if (destinations.some((d) => d.destination === trimmed)) return;
    setDestinations([...destinations, { destination: trimmed, is_transit: false }]);
    setDestinationDraft('');
  };

  const removeDestination = (dest) => {
    setDestinations(destinations.filter((d) => d.destination !== dest));
  };

  const toggleTransit = (dest) => {
    setDestinations(destinations.map((d) => 
      d.destination === dest ? { ...d, is_transit: !d.is_transit } : d
    ));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...airlineForm,
      destinations
    });
  };

  if (!open) return null;

  return (
    <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-label={airline ? "Edit Airline" : "Add Airline"}>
      <div className="admin-modal">
        <header className="admin-modal-header">
          <div>
            <h2>{airline ? 'Edit Airline' : 'Add New Airline'}</h2>
            <p className="admin-modal-subtitle">
              {airline ? 'Update airline information and destinations' : 'Create a new airline partner with destinations'}
            </p>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <form className="admin-modal-form" onSubmit={handleSubmit}>
          <div className="admin-modal-row">
            <label className="admin-modal-label">
              <span className="admin-modal-label-text">Airline Name <span className="required">*</span></span>
              <input
                type="text"
                value={airlineForm.name}
                onChange={(e) => setAirlineForm({ ...airlineForm, name: e.target.value })}
                placeholder="e.g. RwandAir"
                required
                autoFocus
              />
            </label>

            <label className="admin-modal-label">
              <span className="admin-modal-label-text">Airline Code</span>
              <input
                type="text"
                value={airlineForm.code}
                onChange={(e) => setAirlineForm({ ...airlineForm, code: e.target.value })}
                placeholder="e.g. WB"
                maxLength="3"
              />
            </label>
          </div>

          <label className="admin-modal-label">
            <span className="admin-modal-label-text">From Destination</span>
            <input
              type="text"
              value={airlineForm.from_destination}
              onChange={(e) => setAirlineForm({ ...airlineForm, from_destination: e.target.value })}
              placeholder="e.g. Kigali"
            />
          </label>

          <div className="admin-modal-section">
            <label className="admin-modal-label">
              <span className="admin-modal-label-text">To Destination(s)</span>
              <div className="admin-modal-input-group">
                <input
                  type="text"
                  value={destinationDraft}
                  onChange={(e) => setDestinationDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addDestination();
                    }
                  }}
                  placeholder="Type destination and press Enter or click Add"
                />
                <button type="button" className="admin-modal-add-btn" onClick={addDestination}>
                  + Add
                </button>
              </div>
            </label>

            {destinations.length > 0 && (
              <div className="admin-modal-chips">
                {destinations.map((d) => (
                  <div key={d.destination} className={`admin-modal-chip ${d.is_transit ? 'transit' : ''}`}>
                    <span className="admin-modal-chip-text">
                      <strong>{d.destination}</strong>
                      <button 
                        type="button" 
                        className="admin-modal-chip-toggle"
                        onClick={() => toggleTransit(d.destination)}
                        title="Toggle transit flag"
                      >
                        {d.is_transit ? '🛬 transit' : '✈️ direct'}
                      </button>
                    </span>
                    <button
                      type="button"
                      className="admin-modal-chip-remove"
                      onClick={() => removeDestination(d.destination)}
                      aria-label={`Remove ${d.destination}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {destinations.length === 0 && (
              <p className="admin-modal-hint">
                No destinations added yet. Add at least one destination to publish the airline as a partner.
              </p>
            )}
          </div>

          <div className="admin-modal-actions">
            <button type="button" className="admin-modal-btn admin-modal-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="admin-modal-btn admin-modal-btn-primary" disabled={loading}>
              {loading ? 'Saving...' : airline ? 'Update Airline' : 'Create Airline'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
