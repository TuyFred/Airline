import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import '../styles/SupportWidget.css';

const WHATSAPP_NUMBER = '250782519559';
const DISPLAY_WHATSAPP = '+250 782 519 559';

export default function SupportWidget() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('sbu_user') || 'null');
    } catch {
      return null;
    }
  });
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    issue: '',
    companyName: '',
    flightDate: '',
    issueDescription: '',
    contactNumber: ''
  });
  const [status, setStatus] = useState({ type: '', text: '' });

  useEffect(() => {
    if (!localStorage.getItem('sbu_token')) return;
    api.apiGet('/api/auth/me')
      .then((response) => setUser(response.user || null))
      .catch(() => {});
  }, []);

  const whatsappMessage = useMemo(() => {
    const senderName = user?.full_name || form.fullName || '[Your Name]';
    return `Hello 👋,\n\nI hope you are doing well.\n\nI am an exporter currently using the system, and I would like to request assistance regarding ${form.issue || '[briefly describe the issue, e.g., booking cargo space / confirming uplift / accessing my dashboard]'}.\n\nHere are my details:\n• Name: ${senderName}\n• Company/Exporter Name: ${form.companyName || '[Company Name]'}\n• Date/Flight (if applicable): ${form.flightDate || '[Details]'}\n\nKindly assist me at your earliest convenience.\n\nThank you 🙏`;
  }, [form.issue, form.companyName, form.flightDate, form.fullName, user?.full_name]);

  const emailBody = useMemo(() => {
    const senderName = user?.full_name || form.fullName || '[Your Full Name]';
    return `I hope this message finds you well.\n\nI am writing to request assistance regarding ${form.issue || '[clearly describe the issue, e.g., cargo space booking, uplift confirmation, document upload, or system access]'}.\n\nPlease find my details below:\n• Name: ${senderName}\n• Exporter/Company Name: ${form.companyName || '[Company Name]'}\n• Flight/Date (if applicable): ${form.flightDate || '[Details]'}\n• Issue Description: ${form.issueDescription || '[Explain briefly but clearly]'}\n\nI would appreciate your support in resolving this matter as soon as possible.\n\nThank you for your time and assistance.\n\nKind regards,\n${senderName}\n${form.contactNumber || '[Your Contact Number]'}`;
  }, [form.issue, form.companyName, form.flightDate, form.issueDescription, form.contactNumber, form.fullName, user?.full_name]);

  const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMessage)}`;

  const handleSendEmail = async () => {
    try {
      const hasToken = !!localStorage.getItem('sbu_token');
      if (!hasToken) {
        if (!form.fullName.trim()) {
          setStatus({ type: 'error', text: 'Please enter your name.' });
          return;
        }
        if (!form.email.trim()) {
          setStatus({ type: 'error', text: 'Please enter your email.' });
          return;
        }
      }
      if (!form.issueDescription.trim()) {
        setStatus({ type: 'error', text: 'Please enter your question in Ask your question.' });
        return;
      }

      setStatus({ type: 'info', text: 'Sending support email...' });
      const endpoint = hasToken ? '/api/support/email' : '/api/support/public-email';
      await api.apiPost(endpoint, {
        fullName: user?.full_name || form.fullName || undefined,
        email: user?.email || form.email || undefined,
        subject: 'I hope this message finds you well.',
        issue: form.issue,
        companyName: form.companyName,
        flightDate: form.flightDate,
        issueDescription: form.issueDescription,
        contactNumber: form.contactNumber,
        emailMessage: emailBody
      });
      setStatus({ type: 'success', text: 'Support email sent successfully.' });
    } catch (error) {
      setStatus({ type: 'error', text: error.message || 'Failed to send support email' });
    }
  };

  return (
    <div className="support-widget">
      <button className="support-fab" onClick={() => setOpen((value) => !value)}>
        Help & Chat
      </button>

      {open ? (
        <div className="support-panel">
          <div className="support-header">
            <div>
              <h3>Support Center</h3>
              <p>WhatsApp: {DISPLAY_WHATSAPP}</p>
            </div>
            <button className="support-close" onClick={() => setOpen(false)} aria-label="Close support panel">×</button>
          </div>

          <div className="support-form">
            {!user ? (
              <>
                <label>
                  Your name *
                  <input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="Your Full Name" required />
                </label>
                <label>
                  Your email *
                  <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" required />
                </label>
              </>
            ) : null}
            <label>
              Issue
              <input value={form.issue} onChange={(event) => setForm({ ...form, issue: event.target.value })} placeholder="booking cargo space" />
            </label>
            <label>
              Company / Exporter name
              <input value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} placeholder="Souk Farms" />
            </label>
            <label>
              Flight / Date
              <input value={form.flightDate} onChange={(event) => setForm({ ...form, flightDate: event.target.value })} placeholder="BRU - 2026-04-14" />
            </label>
            <label>
              Contact number
              <input value={form.contactNumber} onChange={(event) => setForm({ ...form, contactNumber: event.target.value })} placeholder="07XXXXXXXX" />
            </label>
            <label>
              Ask your question *
              <textarea value={form.issueDescription} onChange={(event) => setForm({ ...form, issueDescription: event.target.value })} placeholder="Explain briefly but clearly" required />
            </label>
          </div>

          <div className="support-actions">
            <a className="support-btn whatsapp" href={whatsappHref} target="_blank" rel="noopener noreferrer">Send WhatsApp Message</a>
            <button className="support-btn email" onClick={handleSendEmail}>Send via Email</button>
          </div>

          {status.text ? <p className={`support-status ${status.type}`}>{status.text}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
