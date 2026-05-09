import React, { useEffect, useMemo, useState } from 'react';
import DashboardShell from '../../components/DashboardShell';
import Pagination, { usePagination, PaginatedList } from '../../components/Pagination';
import api from '../../services/api';
import '../../styles/DashboardPages.css';
import { getDirectionOptions } from '../../utils/pmcPlanning';

const AIRLINES = ['RwandAir', 'Ethiopian', 'KLM', 'Qatar', 'Kenya Airways', 'Brussels', 'Turkish', 'EgyptAir'];
const ANALYST_TABS = ['requests', 'capacity', 'uplift', 'analytics', 'performance', 'daily'];

export default function AirlineDashboard() {
  const [activeAirline, setActiveAirline] = useState('RwandAir');
  const [activeTab, setActiveTab] = useState('requests');
  const [airlines, setAirlines] = useState([]);
  const [exporters, setExporters] = useState([]);
  const [selectedExporterFilter, setSelectedExporterFilter] = useState('');
  const [bookingsByExporter, setBookingsByExporter] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const [markingNotificationId, setMarkingNotificationId] = useState(null);

  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showEditCapacityModal, setShowEditCapacityModal] = useState(false);
  const [showUpliftModal, setShowUpliftModal] = useState(false);
  const [showSpacePublicationModal, setShowSpacePublicationModal] = useState(false);

  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const [upliftForm, setUpliftForm] = useState({
    bookingId: '',
    actual_kg: '',
    awb_number: '',
    awb_type: 'house',
    uplift_type: 'full',
    explanation: '',
    message: '',
    kg_confirmation: '',
    document: null,
    reason: ''
  });

  const [rescheduleForm, setRescheduleForm] = useState({
    bookingId: '',
    new_date: '',
    reason: ''
  });

  const [editCapacityForm, setEditCapacityForm] = useState({
    bookingId: '',
    tonnage_kg: '',
    skids: ''
  });

  const [spacePublicationForm, setSpacePublicationForm] = useState({
    airline_id: '',
    flight_date: '',
    destination: '',
    transit_airport: '',
    total_skids: '',
    total_kg: '',
    weight_unit: 'kg',
    pmc_count: ''
  });
  const [generalNotificationForm, setGeneralNotificationForm] = useState({
    exporter_id: '',
    title: '',
    message: '',
    send_email: true,
    send_whatsapp: true
  });
  const [rowDecisions, setRowDecisions] = useState({});

  const allBookings = useMemo(() => Object.values(bookingsByExporter).flat(), [bookingsByExporter]);
  const filteredBookingsByExporter = useMemo(() => {
    if (!selectedExporterFilter) return bookingsByExporter;
    return Object.fromEntries(
      Object.entries(bookingsByExporter).filter(([exporter]) => exporter === selectedExporterFilter)
    );
  }, [bookingsByExporter, selectedExporterFilter]);
  const filteredBookings = useMemo(() => Object.values(filteredBookingsByExporter).flat(), [filteredBookingsByExporter]);
  const pendingCount = useMemo(() => allBookings.filter((row) => row.status === 'pending').length, [allBookings]);

  const rescheduleOriginalBooking = useMemo(
    () => allBookings.find((b) => String(b.id) === String(rescheduleForm.bookingId)),
    [allBookings, rescheduleForm.bookingId]
  );
  const approvedCount = useMemo(() => allBookings.filter((row) => row.status === 'approved').length, [allBookings]);
  const rejectedCount = useMemo(() => allBookings.filter((row) => row.status === 'rejected').length, [allBookings]);
  const upliftBookingOptions = useMemo(() => {
    const source = selectedExporterFilter
      ? allBookings.filter((row) => row.exporter === selectedExporterFilter)
      : allBookings;
    return source.filter((row) => ['approved', 'pending'].includes(String(row.status || '').toLowerCase()));
  }, [allBookings, selectedExporterFilter]);
  const selectedUpliftBooking = useMemo(
    () => allBookings.find((row) => String(row.id) === String(upliftForm.bookingId)),
    [allBookings, upliftForm.bookingId]
  );
  const unreadNotifications = useMemo(() => notifications.filter((row) => Number(row.is_read) !== 1).length, [notifications]);
  const exporterPerformance = useMemo(() => {
    const source = filteredBookings.length ? filteredBookings : allBookings;
    const totalKg = source.reduce((sum, row) => sum + Number(row.tonnage_kg || 0), 0);
    const approvedKg = source.filter((row) => row.status === 'approved').reduce((sum, row) => sum + Number(row.tonnage_kg || 0), 0);
    const productTotal = totalKg || 1;
    const products = Object.values(source.reduce((acc, row) => {
      const key = row.commodity || 'Other';
      if (!acc[key]) acc[key] = { commodity: key, kg: 0, skids: 0, count: 0 };
      acc[key].kg += Number(row.tonnage_kg || 0);
      acc[key].skids += Number(row.skids || 0);
      acc[key].count += 1;
      return acc;
    }, {})).map((row) => ({ ...row, percent: Math.round((row.kg / productTotal) * 100) }));
    return {
      total: source.length,
      pending: source.filter((row) => row.status === 'pending').length,
      approved: source.filter((row) => row.status === 'approved').length,
      totalKg,
      approvedKg,
      products: products.sort((left, right) => right.kg - left.kg)
    };
  }, [allBookings, filteredBookings]);
  const spacePublicationAirlineName = useMemo(() => {
    const found = airlines.find((item) => Number(item.id) === Number(spacePublicationForm.airline_id));
    return found?.name || activeAirline || '';
  }, [airlines, spacePublicationForm.airline_id, activeAirline]);

  const exporterDistributionRows = useMemo(() => Object.entries(bookingsByExporter), [bookingsByExporter]);
  const notificationsPager = usePagination(notifications, 5);

  useEffect(() => {
    if (!showUpliftModal) return;
    if (upliftForm.bookingId) return;
    if (!upliftBookingOptions.length) return;
    const preferred = upliftBookingOptions.find((row) => String(row.status || '').toLowerCase() === 'approved') || upliftBookingOptions[0];
    setUpliftForm((prev) => ({ ...prev, bookingId: String(preferred.id) }));
  }, [showUpliftModal, upliftForm.bookingId, upliftBookingOptions]);

  useEffect(() => {
    if (!showUpliftModal || !selectedUpliftBooking?.exporter) return;
    if (selectedExporterFilter === selectedUpliftBooking.exporter) return;
    setSelectedExporterFilter(selectedUpliftBooking.exporter);
  }, [showUpliftModal, selectedUpliftBooking, selectedExporterFilter]);

  const categorizedNotifications = useMemo(() => {
    const reduced = [];
    const additional = [];
    const other = [];
    for (const n of notifications) {
      const text = `${n.title || ''} ${n.message || ''}`.toLowerCase();
      if (/reduce|reduced|release|release.*space|reduced space/.test(text)) {
        reduced.push(n);
      } else if (/additional space|increase|more capacity|extra space|pending.?inc/.test(text)) {
        additional.push(n);
      } else {
        other.push(n);
      }
    }
    return { reduced, additional, other };
  }, [notifications]);

  const reducedAlertsPager = usePagination(categorizedNotifications.reduced, 5);
  const additionalAlertsPager = usePagination(categorizedNotifications.additional, 5);
  const otherAlertsPager = usePagination(categorizedNotifications.other, 5);

  const currentWeekRange = useMemo(() => {
    const today = new Date();
    const day = today.getDay();
    const diffToMonday = (day + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - diffToMonday);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      startISO: monday.toISOString().slice(0, 10),
      endISO: sunday.toISOString().slice(0, 10),
      label: `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    };
  }, []);

  const weeklyExporterSummary = useMemo(() => {
    const inWeek = (b) => {
      const d = String(b.flight_date || '').slice(0, 10);
      return d >= currentWeekRange.startISO && d <= currentWeekRange.endISO;
    };
    const acc = {};
    for (const b of allBookings) {
      if (!inWeek(b)) continue;
      const key = b.exporter || 'Unknown';
      if (!acc[key]) {
        acc[key] = {
          exporter: key,
          allocatedKg: 0,
          approvedKg: 0,
          confirmedKg: 0,
          usedKg: 0,
          bookings: 0
        };
      }
      const tonnage = Number(b.tonnage_kg || 0);
      acc[key].allocatedKg += tonnage;
      acc[key].bookings += 1;
      if (b.status === 'approved') acc[key].approvedKg += tonnage;
      const actual = Number(b.actual_kg || 0);
      if (actual > 0) acc[key].confirmedKg += actual;
      const used = Number(b.kg_confirmation || b.actual_kg || 0);
      if (used > 0) acc[key].usedKg += used;
    }
    return Object.values(acc)
      .map((row) => ({
        ...row,
        performance: row.approvedKg > 0 ? Math.min(150, Math.round((row.usedKg / row.approvedKg) * 100)) : 0
      }))
      .sort((a, b) => b.allocatedKg - a.allocatedKg);
  }, [allBookings, currentWeekRange.startISO, currentWeekRange.endISO]);

  const sevenDayBreakdown = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
    return days.map((day) => {
      const dayBookings = allBookings.filter((b) => String(b.flight_date || '').slice(0, 10) === day);
      const approved = dayBookings.filter((b) => b.status === 'approved');
      const planned = approved.reduce((s, b) => s + Number(b.tonnage_kg || 0), 0);
      const confirmed = approved.reduce((s, b) => s + Number(b.actual_kg || 0), 0);
      const used = approved.reduce((s, b) => s + Number(b.kg_confirmation || b.actual_kg || 0), 0);
      const skids = approved.reduce((s, b) => s + Number(b.skids || 0), 0);
      const exporters = new Set(approved.map((b) => b.exporter)).size;
      return {
        day,
        label: new Date(day + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        rows: approved,
        plannedKg: planned,
        confirmedKg: confirmed,
        usedKg: used,
        skids,
        exporters,
        performance: planned > 0 ? Math.round((used / planned) * 100) : 0
      };
    });
  }, [allBookings]);

  const extractBookingIdFromNotification = (notif) => {
    const text = `${notif?.title || ''} ${notif?.message || ''}`;
    const m = text.match(/#?\s*(\d+)/);
    return m ? Number(m[1]) : null;
  };

  const openRequestFromAlert = (notif) => {
    const bookingId = extractBookingIdFromNotification(notif);
    setShowNotificationsPanel(false);
    setTab('requests');
    if (bookingId) {
      const target = allBookings.find((b) => Number(b.id) === bookingId);
      if (target?.exporter) setSelectedExporterFilter(target.exporter);
      setMessage(`Opening booking #${bookingId} from alert. Use Approve / Reject below.`);
      window.setTimeout(() => {
        const row = document.querySelector(`tr[data-booking-id="${bookingId}"]`);
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          row.classList.add('row-highlight');
          window.setTimeout(() => row.classList.remove('row-highlight'), 2400);
        }
      }, 350);
    }
  };

  const [knownCapacityDestinations, setKnownCapacityDestinations] = useState([]);

  const destinationSuggestions = useMemo(() => {
    const fromBookings = allBookings
      .filter((row) => String(row.airline || '') === String(spacePublicationAirlineName || ''))
      .map((row) => row.destination);
    const fallback = [...fromBookings, ...knownCapacityDestinations].filter(Boolean);
    return getDirectionOptions(spacePublicationAirlineName, fallback);
  }, [allBookings, spacePublicationAirlineName, knownCapacityDestinations]);

  const spaceFormDerived = useMemo(() => {
    const skids = Number(spacePublicationForm.total_skids || 0);
    const w = Number(spacePublicationForm.total_kg || 0);
    const totalKg = spacePublicationForm.weight_unit === 'tonne' ? w * 1000 : w;
    const pmc = Number(spacePublicationForm.pmc_count || 0);
    return {
      totalKg,
      kgPerSkid: skids > 0 ? Math.round(totalKg / skids) : 0,
      kgPerPmc: pmc > 0 ? Math.round(totalKg / pmc) : 0
    };
  }, [spacePublicationForm.total_skids, spacePublicationForm.total_kg, spacePublicationForm.weight_unit, spacePublicationForm.pmc_count]);

  const syncTabFromHash = () => {
    const hash = window.location.hash || '';
    const queryPart = hash.includes('?') ? hash.split('?')[1] : '';
    const params = new URLSearchParams(queryPart);
    const tab = params.get('tab') || 'requests';
    setActiveTab(ANALYST_TABS.includes(tab) ? tab : 'requests');
  };

  const setTab = (tab) => {
    const safeTab = ANALYST_TABS.includes(tab) ? tab : 'requests';
    setActiveTab(safeTab);
    window.location.hash = `#dashboard/airline?tab=${safeTab}`;
  };

  const loadBookingsForAirline = async (airline) => {
    try {
      setLoading(true);
      const [grouped, notificationRows, availabilityRows] = await Promise.all([
        api.apiGet(`/api/bookings/grouped/${airline}`),
        api.apiGet('/api/notifications').catch(() => []),
        api.apiGet('/api/public/availability').catch(() => [])
      ]);
      setBookingsByExporter(grouped || {});
      setNotifications(notificationRows || []);
      const dests = (availabilityRows || [])
        .filter((row) => String(row.airline || '') === String(airline || ''))
        .map((row) => String(row.destination || '').replace(/\s*\(via [^)]+\)\s*$/i, '').trim())
        .filter(Boolean);
      setKnownCapacityDestinations(Array.from(new Set(dests)));
      setMessage('');
    } catch (error) {
      setMessage(`Failed to load dashboard data for ${airline}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadAirlines = async () => {
    try {
      const [airlineRows, exporterRows] = await Promise.all([
        api.apiGet('/api/public/airlines'),
        api.apiGet('/api/public/exporters').catch(() => [])
      ]);
      setAirlines(airlineRows || []);
      setExporters(exporterRows || []);
    } catch {
      setAirlines([]);
      setExporters([]);
    }
  };

  useEffect(() => {
    syncTabFromHash();
    window.addEventListener('hashchange', syncTabFromHash);
    return () => window.removeEventListener('hashchange', syncTabFromHash);
  }, []);

  useEffect(() => {
    loadAirlines();
    loadBookingsForAirline(activeAirline);
  }, [activeAirline]);

  useEffect(() => {
    const matched = airlines.find((item) => String(item.name || '') === String(activeAirline || ''));
    if (matched?.id) {
      setSpacePublicationForm((prev) => ({ ...prev, airline_id: String(matched.id) }));
    }
  }, [activeAirline, airlines]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadBookingsForAirline(activeAirline);
    }, 60000);
    return () => clearInterval(timer);
  }, [activeAirline]);

  const markNotificationAsRead = async (id) => {
    if (!id) return;
    try {
      setMarkingNotificationId(id);
      await api.apiPatch(`/api/notifications/${id}/read`, {});
      setNotifications((prev) => prev.map((row) => (Number(row.id) === Number(id) ? { ...row, is_read: 1 } : row)));
    } catch (error) {
      setMessage(error.message || 'Failed to mark notification as read');
    } finally {
      setMarkingNotificationId(null);
    }
  };

  const handleUpliftSubmit = async (event) => {
    event.preventDefault();
    try {
      if (!upliftForm.bookingId || !upliftForm.actual_kg || !upliftForm.awb_number) {
        setMessage('Please fill Booking ID, Actual KG, and AWB Number.');
        return;
      }

      if (['half', 'offload'].includes(upliftForm.uplift_type) && !String(upliftForm.explanation || '').trim()) {
        setMessage('Explanation is required for half uplift or offload.');
        return;
      }

      const formData = new FormData();
      formData.append('actual_kg', String(parseFloat(upliftForm.actual_kg)));
      formData.append('awb_number', upliftForm.awb_number);
      formData.append('awb_type', upliftForm.awb_type);
      formData.append('uplift_type', upliftForm.uplift_type);
      formData.append('explanation', upliftForm.explanation || '');
      formData.append('message', upliftForm.message || '');
      formData.append('kg_confirmation', upliftForm.kg_confirmation ? String(parseFloat(upliftForm.kg_confirmation)) : '');
      formData.append('reason', upliftForm.reason || '');
      if (upliftForm.document) formData.append('document', upliftForm.document);

      const token = localStorage.getItem('sbu_token');
      const response = await fetch(`${api.API_BASE}/api/bookings/${upliftForm.bookingId}/uplift-notification`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: formData
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Failed to submit uplift notification');
      }

      setMessage('Uplift update submitted successfully.');
      setUpliftForm({
        bookingId: '',
        actual_kg: '',
        awb_number: '',
        awb_type: 'house',
        uplift_type: 'full',
        explanation: '',
        message: '',
        kg_confirmation: '',
        document: null,
        reason: ''
      });
      setShowUpliftModal(false);
      await loadBookingsForAirline(activeAirline);
    } catch (error) {
      setMessage(error.message || 'Failed to submit uplift update');
    }
  };

  const applyRowDecision = async (booking) => {
    const choice = rowDecisions[booking.id];
    if (!choice) {
      setMessage('Choose Approve or Reject, then Apply.');
      return;
    }
    try {
      if (choice === 'approve') {
        await api.apiPatch(`/api/bookings/${booking.id}/review`, { status: 'approved' });
        setMessage(`Booking #${booking.id} approved.`);
      } else {
        const reason = window.prompt('Rejection reason (optional):') || 'Rejected by analyst';
        await api.apiPatch(`/api/bookings/${booking.id}/review`, { status: 'rejected', reason });
        setMessage(`Booking #${booking.id} rejected.`);
      }
      setRowDecisions((prev) => ({ ...prev, [booking.id]: '' }));
      await loadBookingsForAirline(activeAirline);
    } catch (error) {
      setMessage(error.message || 'Action failed');
    }
  };

  const approvePendingIncrease = async (bookingId) => {
    try {
      await api.apiPatch(`/api/bookings/${bookingId}/approve-pending-allocation`, {});
      setMessage(`Allocation increase applied for #${bookingId}.`);
      await loadBookingsForAirline(activeAirline);
    } catch (error) {
      setMessage(error.message || 'Could not approve increase');
    }
  };

  const handleGeneralNotificationSubmit = async (event) => {
    event.preventDefault();
    try {
      if (!generalNotificationForm.exporter_id || !generalNotificationForm.title || !generalNotificationForm.message) {
        setMessage('Choose exporter, title, and message.');
        return;
      }
      const payload = await api.apiPost('/api/notifications/direct', {
        exporter_id: Number(generalNotificationForm.exporter_id),
        title: generalNotificationForm.title,
        message: generalNotificationForm.message,
        type: 'info',
        send_email: generalNotificationForm.send_email,
        send_whatsapp: generalNotificationForm.send_whatsapp
      });
      setMessage(`Notification sent. Dashboard: ${payload.dashboard_recipients || 0}, email: ${payload.email_recipients || 0}, WhatsApp: ${payload.whatsapp_sent ? 'sent' : 'not sent'}.`);
      setGeneralNotificationForm({ exporter_id: '', title: '', message: '', send_email: true, send_whatsapp: true });
    } catch (error) {
      setMessage(error.message || 'Failed to send notification');
    }
  };

  const exportRequestsExcel = async () => {
    try {
      const token = localStorage.getItem('sbu_token');
      const res = await fetch(`${api.API_BASE}/api/bookings/grouped/${encodeURIComponent(activeAirline)}/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeAirline}-requests.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      setMessage('Excel export downloaded.');
    } catch (error) {
      setMessage(error.message || 'Export failed');
    }
  };

  const handleReschedule = async (event) => {
    event.preventDefault();
    try {
      if (!rescheduleForm.bookingId || !rescheduleForm.new_date) {
        setMessage('Please provide booking ID and new date.');
        return;
      }

      await api.apiPatch(`/api/bookings/${rescheduleForm.bookingId}/reschedule`, {
        new_date: rescheduleForm.new_date,
        reason: rescheduleForm.reason
      });

      setMessage('Reschedule request sent.');
      setRescheduleForm({ bookingId: '', new_date: '', reason: '' });
      setShowRescheduleModal(false);
      await loadBookingsForAirline(activeAirline);
    } catch (error) {
      setMessage(error.message || 'Failed to reschedule booking');
    }
  };

  const handleEditCapacity = async (event) => {
    event.preventDefault();
    try {
      if (!editCapacityForm.bookingId || (!editCapacityForm.tonnage_kg && !editCapacityForm.skids)) {
        setMessage('Provide booking ID and at least one value (kg or skids).');
        return;
      }

      await api.apiPatch(`/api/bookings/${editCapacityForm.bookingId}/edit-capacity`, {
        tonnage_kg: editCapacityForm.tonnage_kg ? parseFloat(editCapacityForm.tonnage_kg) : undefined,
        skids: editCapacityForm.skids ? parseFloat(editCapacityForm.skids) : undefined
      });

      setMessage('Capacity adjusted successfully.');
      setEditCapacityForm({ bookingId: '', tonnage_kg: '', skids: '' });
      setShowEditCapacityModal(false);
      await loadBookingsForAirline(activeAirline);
    } catch (error) {
      setMessage(error.message || 'Failed to update booking capacity');
    }
  };

  const submitSpacePublication = async (mode) => {
    try {
      if (!spacePublicationForm.airline_id || !spacePublicationForm.flight_date || !spacePublicationForm.destination) {
        setMessage('Airline, date, and destination are required.');
        return;
      }
      const skids = Number(spacePublicationForm.total_skids);
      const w = Number(spacePublicationForm.total_kg);
      const kg = spacePublicationForm.weight_unit === 'tonne' ? w * 1000 : w;
      if (!skids || !kg) {
        setMessage('Total skids and total weight are required.');
        return;
      }
      const dest = String(spacePublicationForm.destination || '').trim().toUpperCase();
      const transit = String(spacePublicationForm.transit_airport || '').trim().toUpperCase();
      const pmcCount = Number(spacePublicationForm.pmc_count || 0);
      const pmcDetails = pmcCount
        ? `${pmcCount} PMC | ${Math.round(kg / pmcCount).toLocaleString('en-US')} kg/PMC | ${Math.round(kg / skids).toLocaleString('en-US')} kg/skid`
        : `${Math.round(kg / skids).toLocaleString('en-US')} kg/skid`;
      await api.apiPost('/api/capacity/upsert', {
        airline_id: Number(spacePublicationForm.airline_id),
        flight_date: spacePublicationForm.flight_date,
        destination: transit ? `${dest} (via ${transit})` : dest,
        total_skids: skids,
        total_kg: kg,
        pmc_details: pmcDetails,
        is_draft: mode === 'save'
      });
      setMessage(mode === 'save'
        ? 'Capacity saved as draft (not yet visible to exporters).'
        : 'Capacity published — instantly visible in Space Availability.');
      setSpacePublicationForm((prev) => ({
        ...prev,
        flight_date: '',
        destination: '',
        transit_airport: '',
        total_skids: '',
        total_kg: '',
        pmc_count: ''
      }));
      setShowSpacePublicationModal(false);
      await loadBookingsForAirline(activeAirline);
    } catch (error) {
      setMessage(error.message || 'Action failed');
    }
  };

  return (
    <DashboardShell
      role="Airline Analyst"
      title="Airline Operations Desk"
      subtitle=""
      accent="dashboard-airline"
      sidebarSummary=""
    >
      <section className="analyst-hero-card">
        <div className="analyst-hero-left">
          <h3>Flight Operations Control</h3>
          <div className="inline-tags">
            <span>Pending: {pendingCount}</span>
            <span>Approved: {approvedCount}</span>
            <span>Rejected: {rejectedCount}</span>
          </div>
        </div>
        <div className="analyst-hero-right">
          <div className="analyst-airline-select-wrap">
            <label htmlFor="analyst-airline-select">Active Airline</label>
            <select id="analyst-airline-select" value={activeAirline} onChange={(event) => setActiveAirline(event.target.value)}>
              {AIRLINES.map((airline) => <option key={airline} value={airline}>{airline}</option>)}
            </select>
          </div>

          <button type="button" className="notify-bell-btn" onClick={() => setShowNotificationsPanel((prev) => !prev)}>
            <span className="notify-bell-icon" aria-hidden="true">🔔</span>
            <span className="notify-bell-label">Alerts</span>
            <span className="notify-bell-count">{unreadNotifications}</span>
          </button>
        </div>
      </section>

      {showNotificationsPanel ? (
        <section className="notify-panel">
          <div className="notify-panel-head">
            <h4>Analyst Alerts</h4>
            <button type="button" className="table-action" onClick={() => setShowNotificationsPanel(false)}>Close</button>
          </div>

          <div className="alerts-categories">
            <div className="alerts-section alerts-reduced">
              <h5>📉 Reduced Space ({categorizedNotifications.reduced.length})</h5>
              {categorizedNotifications.reduced.length ? (
                <>
                  {reducedAlertsPager.pagedItems.map((notif) => (
                    <article key={`r-${notif.id}`} className={`notify-item ${Number(notif.is_read) === 1 ? 'read' : ''}`}>
                      <div>
                        <strong>{notif.title || 'Reduced space'}</strong>
                        <p>{notif.message || '-'}</p>
                        <small>{notif.created_at ? new Date(notif.created_at).toLocaleString('en-US') : '-'}</small>
                      </div>
                      {Number(notif.is_read) !== 1 ? (
                        <button type="button" className="table-action" onClick={() => markNotificationAsRead(notif.id)}>Mark read</button>
                      ) : <span className="status-pill confirmed">Read</span>}
                    </article>
                  ))}
                  <Pagination {...reducedAlertsPager} label="alerts" compact />
                </>
              ) : <p className="muted-cell">No reduced-space alerts.</p>}
            </div>

            <div className="alerts-section alerts-additional">
              <h5>📈 Requested Additional Space ({categorizedNotifications.additional.length})</h5>
              {categorizedNotifications.additional.length ? (
                <>
                  {additionalAlertsPager.pagedItems.map((notif) => (
                    <article key={`a-${notif.id}`} className={`notify-item clickable ${Number(notif.is_read) === 1 ? 'read' : ''}`}>
                      <div>
                        <strong>{notif.title || 'Additional space requested'}</strong>
                        <p>{notif.message || '-'}</p>
                        <small>{notif.created_at ? new Date(notif.created_at).toLocaleString('en-US') : '-'}</small>
                      </div>
                      <div className="inline-actions" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
                        <button type="button" className="search-submit" onClick={() => openRequestFromAlert(notif)}>
                          🔍 Open request
                        </button>
                        {Number(notif.is_read) !== 1 ? (
                          <button type="button" className="table-action" onClick={() => markNotificationAsRead(notif.id)}>Mark read</button>
                        ) : <span className="status-pill confirmed">Read</span>}
                      </div>
                    </article>
                  ))}
                  <Pagination {...additionalAlertsPager} label="alerts" compact />
                </>
              ) : <p className="muted-cell">No additional-space requests pending.</p>}
            </div>

            <div className="alerts-section alerts-other">
              <h5>🔔 Other Notifications ({categorizedNotifications.other.length})</h5>
              {categorizedNotifications.other.length ? (
                <>
                  {otherAlertsPager.pagedItems.map((notif) => (
                    <article key={`o-${notif.id}`} className={`notify-item ${Number(notif.is_read) === 1 ? 'read' : ''}`}>
                      <div>
                        <strong>{notif.title || 'Notification'}</strong>
                        <p>{notif.message || '-'}</p>
                        <small>{notif.created_at ? new Date(notif.created_at).toLocaleString('en-US') : '-'}</small>
                      </div>
                      {Number(notif.is_read) !== 1 ? (
                        <button type="button" className="table-action" disabled={Number(markingNotificationId) === Number(notif.id)} onClick={() => markNotificationAsRead(notif.id)}>
                          {Number(markingNotificationId) === Number(notif.id) ? 'Saving...' : 'Mark read'}
                        </button>
                      ) : <span className="status-pill confirmed">Read</span>}
                    </article>
                  ))}
                  <Pagination {...otherAlertsPager} label="notifications" compact />
                </>
              ) : <p className="muted-cell">No other notifications.</p>}
            </div>
          </div>
        </section>
      ) : null}

      <div className="sheet-tabs analyst-tabs" role="tablist" aria-label="Airline analyst tabs">
        <button className={activeTab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>Requests</button>
        <button className={activeTab === 'capacity' ? 'active' : ''} onClick={() => setTab('capacity')}>Capacity Actions</button>
        <button className={activeTab === 'uplift' ? 'active' : ''} onClick={() => setTab('uplift')}>General Notification</button>
        <button className={activeTab === 'analytics' ? 'active' : ''} onClick={() => setTab('analytics')}>Utilization</button>
        <button className={activeTab === 'performance' ? 'active' : ''} onClick={() => setTab('performance')}>Performance Insights</button>
        <button className={activeTab === 'daily' ? 'active' : ''} onClick={() => setTab('daily')}>7-Day Performance</button>
      </div>

      {activeTab === 'requests' ? (
        <div className="dashboard-grid single-panel-grid">
          <article className="panel-card analyst-table-card">
            <h3>Exporter Requests for {activeAirline}</h3>
            <div className="inline-actions" style={{ marginBottom: '0.75rem' }}>
              <button type="button" className="table-action" onClick={exportRequestsExcel}>Download Excel</button>
              <select value={selectedExporterFilter} onChange={(event) => setSelectedExporterFilter(event.target.value)}>
                <option value="">All exporters</option>
                {Object.keys(bookingsByExporter).map((exporter) => (
                  <option key={exporter} value={exporter}>{exporter}</option>
                ))}
              </select>
            </div>
            {loading ? <p>Loading bookings...</p> : null}
            {Object.keys(bookingsByExporter).length === 0 && !loading ? <p>No bookings for this airline yet.</p> : null}

            {Object.entries(filteredBookingsByExporter).map(([exporter, bookings]) => (
              <div key={exporter} style={{ marginBottom: '1rem' }}>
                <h4 className="subsection-title">{exporter} ({bookings.length})</h4>
                <PaginatedList items={bookings} pageSize={5} label="requests" compact>
                  {(paged) => (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Date</th>
                            <th>Destination</th>
                            <th>Skids</th>
                            <th>Tonnage (kg)</th>
                            <th>BSA</th>
                            <th>Commodity</th>
                            <th>Status</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paged.map((booking) => (
                            <tr key={booking.id} data-booking-id={booking.id}>
                              <td>#{booking.id}</td>
                              <td>{String(booking.flight_date).slice(0, 10)}</td>
                              <td>{booking.destination}</td>
                              <td>{Number(booking.skids || 0).toFixed(1)}</td>
                              <td>{Number(booking.tonnage_kg || 0).toFixed(2)}</td>
                              <td>{booking.bsa_type ? <span className="status-pill pending">{booking.bsa_type}</span> : '-'}</td>
                              <td>{booking.commodity || '-'}</td>
                              <td><span className={`status-pill ${booking.status}`}>{String(booking.status || 'pending').toUpperCase()}</span></td>
                              <td>
                                <div className="inline-actions" style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
                                  {booking.status === 'pending' ? (
                                    <>
                                      <select
                                        value={rowDecisions[booking.id] || ''}
                                        onChange={(e) => setRowDecisions((prev) => ({ ...prev, [booking.id]: e.target.value }))}
                                      >
                                        <option value="">— Action —</option>
                                        <option value="approve">Approve</option>
                                        <option value="reject">Reject</option>
                                      </select>
                                      <button type="button" className="table-action success" onClick={() => applyRowDecision(booking)}>Apply</button>
                                    </>
                                  ) : null}
                                  {String(booking.pending_reason || '').includes('PENDING_INC') ? (
                                    <button type="button" className="table-action" onClick={() => approvePendingIncrease(booking.id)}>
                                      Approve increase
                                    </button>
                                  ) : null}
                                  {['pending', 'approved'].includes(booking.status) ? (
                                    <button
                                      type="button"
                                      className="table-action"
                                      title="Edit booking kg/skids"
                                      onClick={() => {
                                        setEditCapacityForm({ bookingId: String(booking.id), tonnage_kg: String(booking.tonnage_kg || ''), skids: String(booking.skids || '') });
                                        setShowEditCapacityModal(true);
                                      }}
                                    >
                                      Edit booking
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="table-action"
                                    onClick={() => {
                                      setRescheduleForm({ bookingId: String(booking.id), new_date: '', reason: '' });
                                      setShowRescheduleModal(true);
                                    }}
                                  >
                                    Reschedule
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </PaginatedList>
              </div>
            ))}
          </article>
        </div>
      ) : null}

      {activeTab === 'capacity' ? (
        <div className="dashboard-grid single-panel-grid">
          <article className="panel-card analyst-action-card full-width">
            <h3>Space Publication</h3>
            <p className="space-pub-subhead"><strong>Against Available Capacity</strong></p>
            <p>
              Enter destination (free text — saved for next time), optional transit, manual skids, total weight (KG or Tonnage),
              and an optional PMC count. KG per PMC and KG per Skid are calculated automatically.
              Save as a draft, or Publish to make it instantly visible in <strong>Space Availability</strong>.
            </p>
            <button className="table-action success" type="button" onClick={() => setShowSpacePublicationModal(true)}>Open Form</button>
          </article>
        </div>
      ) : null}

      {activeTab === 'uplift' ? (
        <article className="panel-card analyst-uplift-card">
          <h3>General Notification</h3>
          <form className="booking-form compact-form" onSubmit={handleGeneralNotificationSubmit}>
            <label>
              Send to
              <select
                value={generalNotificationForm.exporter_id}
                onChange={(event) => setGeneralNotificationForm({ ...generalNotificationForm, exporter_id: event.target.value })}
                required
              >
                <option value="">Choose exporter</option>
                {exporters.map((exporter) => (
                  <option key={exporter.id} value={exporter.id}>{exporter.name}</option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input
                type="text"
                value={generalNotificationForm.title}
                onChange={(event) => setGeneralNotificationForm({ ...generalNotificationForm, title: event.target.value })}
                required
              />
            </label>
            <label className="full-width">
              Message
              <textarea
                value={generalNotificationForm.message}
                onChange={(event) => setGeneralNotificationForm({ ...generalNotificationForm, message: event.target.value })}
                required
              />
            </label>
            <label>
              <span className="inline-actions">
                <input
                  type="checkbox"
                  checked={generalNotificationForm.send_email}
                  onChange={(event) => setGeneralNotificationForm({ ...generalNotificationForm, send_email: event.target.checked })}
                />
                Send email
              </span>
            </label>
            <label>
              <span className="inline-actions">
                <input
                  type="checkbox"
                  checked={generalNotificationForm.send_whatsapp}
                  onChange={(event) => setGeneralNotificationForm({ ...generalNotificationForm, send_whatsapp: event.target.checked })}
                />
                Send WhatsApp
              </span>
            </label>
            <div className="modal-button-group full-width">
              <button className="search-submit" type="submit">Send notification</button>
              <button className="table-action" type="button" onClick={() => setShowUpliftModal(true)}>Operational uplift form</button>
            </div>
          </form>
        </article>
      ) : null}

      {activeTab === 'analytics' ? (
        <div className="dashboard-grid two-column-grid">
          <article className="panel-card full-width">
            <h3>Exporter scope</h3>
            <div className="inline-actions" style={{ flexWrap: 'wrap' }}>
              <select value={selectedExporterFilter} onChange={(event) => setSelectedExporterFilter(event.target.value)}>
                <option value="">All exporters</option>
                {Object.keys(bookingsByExporter).map((exporter) => (
                  <option key={exporter} value={exporter}>{exporter}</option>
                ))}
              </select>
              <span className="status-pill live">{selectedExporterFilter || 'All exporters'}</span>
            </div>
          </article>
          <article className="metric-card">
            <span>Total Bookings</span>
            <strong>{exporterPerformance.total}</strong>
          </article>
          <article className="metric-card">
            <span>Pending Action</span>
            <strong>{exporterPerformance.pending}</strong>
          </article>
          <article className="metric-card">
            <span>Approved</span>
            <strong>{exporterPerformance.approved}</strong>
          </article>
          <article className="metric-card">
            <span>Approved KG</span>
            <strong>{exporterPerformance.approvedKg.toLocaleString('en-US')}</strong>
          </article>
        </div>
      ) : null}

      {activeTab === 'performance' ? (
        <div className="dashboard-grid single-panel-grid performance-insights">
          <article className="panel-card full-width">
            <div className="perf-toolbar">
              <h3>Performance Insights</h3>
              <div className="perf-toolbar-controls">
                <label>
                  Exporter
                  <select value={selectedExporterFilter} onChange={(event) => setSelectedExporterFilter(event.target.value)}>
                    <option value="">All exporters</option>
                    {Object.keys(bookingsByExporter).map((exporter) => (
                      <option key={exporter} value={exporter}>{exporter}</option>
                    ))}
                  </select>
                </label>
                <span className="status-pill live">{selectedExporterFilter || 'All exporters'}</span>
              </div>
            </div>
          </article>

          <article className="panel-card full-width chart-card">
            <h4 className="chart-card-title">Product Performance</h4>
            <div className="chart-bars-vertical">
              {(exporterPerformance.products || []).length ? exporterPerformance.products.slice(0, 12).map((item) => {
                const max = Math.max(...exporterPerformance.products.map((p) => p.kg), 1);
                const heightPct = Math.max(6, Math.round((item.kg / max) * 100));
                return (
                  <div className="chart-bar-vertical" key={item.commodity} title={`${item.commodity}: ${item.kg.toLocaleString('en-US')} kg`}>
                    <span className="chart-bar-label-top">{item.percent}%</span>
                    <div className="chart-bar-track">
                      <i style={{ height: `${heightPct}%` }} />
                    </div>
                    <strong className="chart-bar-value">{item.kg.toLocaleString('en-US')} kg</strong>
                    <span className="chart-bar-label-bottom">{item.commodity}</span>
                    <small>{Math.round(item.skids)} skids • {item.count} bk</small>
                  </div>
                );
              }) : <p className="muted-cell" style={{ alignSelf: 'center' }}>No product performance yet.</p>}
            </div>
          </article>

          <article className="panel-card full-width chart-card">
            <h4 className="chart-card-title">Exporter Distribution</h4>
            <div className="chart-stacked-list">
              {(() => {
                const filtered = selectedExporterFilter
                  ? exporterDistributionRows.filter(([name]) => name === selectedExporterFilter)
                  : exporterDistributionRows;
                if (!filtered.length) {
                  return <p className="muted-cell">No bookings available for analytics.</p>;
                }
                const max = Math.max(...filtered.map(([, rows]) => rows.length), 1);
                return filtered.map(([exporter, rows]) => {
                  const pending = rows.filter((row) => row.status === 'pending').length;
                  const approved = rows.filter((row) => row.status === 'approved').length;
                  const rejected = rows.filter((row) => row.status === 'rejected').length;
                  const others = rows.length - pending - approved - rejected;
                  const widthPct = Math.max(2, Math.round((rows.length / max) * 100));
                  return (
                    <div className="chart-stacked-row" key={`dist-${exporter}`}>
                      <div className="chart-stacked-name">
                        <strong>{exporter}</strong>
                        <small>{rows.length} request{rows.length === 1 ? '' : 's'}</small>
                      </div>
                      <div className="chart-stacked-bar" style={{ width: `${widthPct}%` }}>
                        {pending > 0 ? <i className="seg-pending" style={{ flex: pending }} title={`Pending: ${pending}`} /> : null}
                        {approved > 0 ? <i className="seg-approved" style={{ flex: approved }} title={`Approved: ${approved}`} /> : null}
                        {rejected > 0 ? <i className="seg-rejected" style={{ flex: rejected }} title={`Rejected: ${rejected}`} /> : null}
                        {others > 0 ? <i className="seg-other" style={{ flex: others }} title={`Other: ${others}`} /> : null}
                      </div>
                      <div className="chart-stacked-legend">
                        <span className="legend-pending">{pending}</span>
                        <span className="legend-approved">{approved}</span>
                        <span className="legend-rejected">{rejected}</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
            <div className="chart-legend-row">
              <span><i className="seg-pending" /> Pending</span>
              <span><i className="seg-approved" /> Approved</span>
              <span><i className="seg-rejected" /> Rejected</span>
            </div>
          </article>

          <article className="panel-card full-width chart-card">
            <div className="chart-card-head">
              <h4 className="chart-card-title">Weekly Summary by Exporter</h4>
              <span className="status-pill">{currentWeekRange.label}</span>
            </div>
            <div className="chart-grouped-list">
              {(() => {
                const filtered = selectedExporterFilter
                  ? weeklyExporterSummary.filter((row) => row.exporter === selectedExporterFilter)
                  : weeklyExporterSummary;
                if (!filtered.length) {
                  return <p className="muted-cell">No bookings in the current week yet.</p>;
                }
                const max = Math.max(...filtered.map((r) => Math.max(r.allocatedKg, r.approvedKg, r.usedKg)), 1);
                return filtered.map((row) => {
                  const allocPct = Math.max(2, Math.round((row.allocatedKg / max) * 100));
                  const apprPct = Math.max(0, Math.round((row.approvedKg / max) * 100));
                  const usedPct = Math.max(0, Math.round((row.usedKg / max) * 100));
                  const perfClass = row.performance >= 80 ? 'perf-good' : row.performance >= 50 ? 'perf-mid' : 'perf-low';
                  return (
                    <div className="chart-grouped-row" key={`week-${row.exporter}`}>
                      <div className="chart-grouped-name">
                        <strong>{row.exporter}</strong>
                        <small>{row.bookings} booking{row.bookings === 1 ? '' : 's'}</small>
                      </div>
                      <div className="chart-grouped-bars">
                        <div className="chart-grouped-bar bar-alloc"><i style={{ width: `${allocPct}%` }} /><span>Allocated {row.allocatedKg.toLocaleString('en-US')} kg</span></div>
                        <div className="chart-grouped-bar bar-appr"><i style={{ width: `${apprPct}%` }} /><span>Approved {row.approvedKg.toLocaleString('en-US')} kg</span></div>
                        <div className="chart-grouped-bar bar-used"><i style={{ width: `${usedPct}%` }} /><span>Used {row.usedKg.toLocaleString('en-US')} kg</span></div>
                      </div>
                      <div className={`chart-grouped-pct ${perfClass}`}>{row.performance}%</div>
                    </div>
                  );
                });
              })()}
            </div>
            <div className="chart-legend-row">
              <span><i className="bar-alloc" /> Allocated</span>
              <span><i className="bar-appr" /> Approved</span>
              <span><i className="bar-used" /> Used</span>
            </div>
          </article>
        </div>
      ) : null}

      {activeTab === 'daily' ? (
        <div className="dashboard-grid single-panel-grid">
          <article className="panel-card full-width seven-day-panel">
            <div className="admin-toolbar">
              <h3>7-Day Approved Bookings — Daily Performance</h3>
            </div>
            <div className="seven-day-scroll">
              <div className="seven-day-grid">
                {sevenDayBreakdown.map((day) => (
                  <div key={day.day} className={`seven-day-card${day.rows.length ? '' : ' empty'}`}>
                    <strong className="seven-day-label">{day.label}</strong>
                    <div className="seven-day-stats">
                      <div><span>Planned</span><strong>{day.plannedKg.toLocaleString('en-US')} kg</strong></div>
                      <div><span>Confirmed</span><strong>{day.confirmedKg.toLocaleString('en-US')} kg</strong></div>
                      <div><span>Used</span><strong>{day.usedKg.toLocaleString('en-US')} kg</strong></div>
                      <div><span>Skids</span><strong>{Math.round(day.skids)}</strong></div>
                      <div><span>Exporters</span><strong>{day.exporters}</strong></div>
                      <div><span>Performance</span>
                        <strong className={day.performance >= 80 ? 'perf-good' : day.performance >= 50 ? 'perf-mid' : 'perf-low'}>
                          {day.performance}%
                        </strong>
                      </div>
                    </div>
                    <div className="seven-day-rows">
                      {day.rows.length ? day.rows.map((row) => (
                        <div key={row.id} className="seven-day-row">
                          <div className="seven-day-row-name">{row.exporter}</div>
                          <div>{row.destination}</div>
                          <div>{Number(row.skids || 0).toFixed(1)} skids / {Number(row.tonnage_kg || 0).toLocaleString('en-US')} kg</div>
                          {row.bsa_type ? <div className="seven-day-row-bsa">{row.bsa_type}</div> : null}
                        </div>
                      )) : <span className="seven-day-empty">No flights</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </div>
      ) : null}

      {showRescheduleModal ? (
        <div className="admin-modal-overlay" role="dialog" aria-label="Reschedule form">
          <div className="admin-modal compact-modal">
            <h3>Reschedule Booking</h3>
            <form className="booking-form compact-form" onSubmit={handleReschedule}>
              <label>
                Booking ID
                <input type="number" value={rescheduleForm.bookingId} onChange={(event) => setRescheduleForm({ ...rescheduleForm, bookingId: event.target.value })} />
              </label>
              {rescheduleOriginalBooking ? (
                <div className="reschedule-summary full-width">
                  <div className="reschedule-summary-row">
                    <span>Exporter</span>
                    <strong>{rescheduleOriginalBooking.exporter || '—'}</strong>
                  </div>
                  <div className="reschedule-summary-row">
                    <span>Original date</span>
                    <strong className="reschedule-old-date">{String(rescheduleOriginalBooking.flight_date || '').slice(0, 10)}</strong>
                  </div>
                  <div className="reschedule-summary-row">
                    <span>New date</span>
                    <strong className="reschedule-new-date">{rescheduleForm.new_date || '—'}</strong>
                  </div>
                </div>
              ) : null}
              <label>
                New date *
                <input type="date" value={rescheduleForm.new_date} onChange={(event) => setRescheduleForm({ ...rescheduleForm, new_date: event.target.value })} required />
              </label>
              <label className="full-width">
                Reason (sent to exporter)
                <textarea value={rescheduleForm.reason} onChange={(event) => setRescheduleForm({ ...rescheduleForm, reason: event.target.value })} placeholder="e.g. Flight retimed by airline ops" />
              </label>
              <div className="modal-button-group full-width">
                <button type="submit" className="search-submit">Reschedule & Notify Exporter</button>
                <button type="button" className="table-action" onClick={() => setShowRescheduleModal(false)}>Close</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showEditCapacityModal ? (
        <div className="admin-modal-overlay" role="dialog" aria-label="Edit capacity form">
          <div className="admin-modal compact-modal">
            <h3>Edit Capacity (kg/skids)</h3>
            <form className="booking-form compact-form" onSubmit={handleEditCapacity}>
              <label>
                Booking ID
                <input type="number" value={editCapacityForm.bookingId} onChange={(event) => setEditCapacityForm({ ...editCapacityForm, bookingId: event.target.value })} />
              </label>
              <label>
                Tonnage (kg)
                <input type="number" step="0.01" value={editCapacityForm.tonnage_kg} onChange={(event) => setEditCapacityForm({ ...editCapacityForm, tonnage_kg: event.target.value })} />
              </label>
              <label>
                Skids
                <input type="number" step="0.01" value={editCapacityForm.skids} onChange={(event) => setEditCapacityForm({ ...editCapacityForm, skids: event.target.value })} />
              </label>
              <div className="modal-button-group full-width">
                <button type="submit" className="search-submit">Save</button>
                <button type="button" className="table-action" onClick={() => setShowEditCapacityModal(false)}>Close</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showUpliftModal ? (
        <div className="admin-modal-overlay" role="dialog" aria-label="Uplift form">
          <div className="admin-modal compact-modal compact-modal-wide">
            <h3>Operational Uplift Update</h3>
            <form onSubmit={handleUpliftSubmit} className="booking-form compact-form">
              <label>
                Booking ID
                <select
                  value={upliftForm.bookingId}
                  onChange={(e) => setUpliftForm({ ...upliftForm, bookingId: e.target.value })}
                  required
                >
                  <option value="">Select booking</option>
                  {upliftBookingOptions.map((booking) => (
                    <option key={booking.id} value={String(booking.id)}>
                      #{booking.id} - {booking.exporter} - {booking.destination} - {String(booking.flight_date || '').slice(0, 10)}
                    </option>
                  ))}
                </select>
                {!upliftBookingOptions.length ? (
                  <span className="file-input-hint">No approved/pending bookings found for this filter.</span>
                ) : null}
              </label>
              <div className="reschedule-summary full-width">
                <div className="reschedule-summary-row">
                  <span>Exporter</span>
                  <strong>{selectedUpliftBooking?.exporter || 'Pick a booking ID to see exporter and destination.'}</strong>
                </div>
                <div className="reschedule-summary-row">
                  <span>Destination</span>
                  <strong>{selectedUpliftBooking?.destination || '—'}</strong>
                </div>
                <div className="reschedule-summary-row">
                  <span>Flight date</span>
                  <strong>{selectedUpliftBooking ? String(selectedUpliftBooking.flight_date || '').slice(0, 10) : '—'}</strong>
                </div>
              </div>
              <label>
                Actual KG
                <input type="number" step="0.01" value={upliftForm.actual_kg} onChange={(e) => setUpliftForm({ ...upliftForm, actual_kg: e.target.value })} required />
              </label>
              <label>
                AWB Number
                <input type="text" value={upliftForm.awb_number} onChange={(e) => setUpliftForm({ ...upliftForm, awb_number: e.target.value })} required />
              </label>
              <label>
                AWB Type
                <select value={upliftForm.awb_type} onChange={(e) => setUpliftForm({ ...upliftForm, awb_type: e.target.value })}>
                  <option value="house">House AWB</option>
                  <option value="master">Master AWB</option>
                  <option value="consolidation">Consolidation</option>
                </select>
              </label>
              <label>
                Update type
                <select value={upliftForm.uplift_type} onChange={(e) => setUpliftForm({ ...upliftForm, uplift_type: e.target.value })}>
                  <option value="full">Full loaded</option>
                  <option value="half">Partial offload</option>
                  <option value="offload">Offload</option>
                </select>
              </label>
              <label>
                KG Confirmation
                <input type="number" step="0.01" value={upliftForm.kg_confirmation} onChange={(e) => setUpliftForm({ ...upliftForm, kg_confirmation: e.target.value })} />
              </label>
              <label>
                Reason
                <input type="text" value={upliftForm.reason} onChange={(e) => setUpliftForm({ ...upliftForm, reason: e.target.value })} />
              </label>
              <label>
                Attachment
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setUpliftForm({ ...upliftForm, document: e.target.files?.[0] || null })} />
              </label>
              <label className="full-width">
                Operational Message
                <textarea value={upliftForm.message} onChange={(e) => setUpliftForm({ ...upliftForm, message: e.target.value })} />
              </label>
              <label className="full-width">
                Explanation for Half/Offload
                <textarea value={upliftForm.explanation} onChange={(e) => setUpliftForm({ ...upliftForm, explanation: e.target.value })} />
              </label>
              <div className="modal-button-group full-width">
                <button type="submit" className="search-submit">Submit Uplift</button>
                <button type="button" className="table-action" onClick={() => setShowUpliftModal(false)}>Close</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showSpacePublicationModal ? (
        <div className="admin-modal-overlay">
          <div className="admin-modal compact-modal compact-modal-wide">
            <div className="space-pub-header">
              <h3>Space Publication</h3>
              <p className="space-pub-subhead"><strong>Against Available Capacity</strong></p>
            </div>
            <form
              className="booking-form compact-form"
              onSubmit={(e) => { e.preventDefault(); submitSpacePublication('publish'); }}
            >
              <label>
                Airline
                <select
                  value={spacePublicationForm.airline_id}
                  onChange={(event) => setSpacePublicationForm({ ...spacePublicationForm, airline_id: event.target.value })}
                  required
                >
                  <option value="">—</option>
                  {airlines.map((airline) => (
                    <option key={airline.id} value={airline.id}>{airline.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Flight date
                <input
                  type="date"
                  value={spacePublicationForm.flight_date}
                  onChange={(event) => setSpacePublicationForm({ ...spacePublicationForm, flight_date: event.target.value })}
                  required
                />
              </label>
              <label className="full-width">
                Destination (free text — saved for next time)
                <input
                  type="text"
                  list="analyst-dest-suggestions"
                  value={spacePublicationForm.destination}
                  onChange={(event) => setSpacePublicationForm({ ...spacePublicationForm, destination: event.target.value })}
                  placeholder="e.g. BRU, DXB, AMS, DOH"
                  required
                />
                <datalist id="analyst-dest-suggestions">
                  {destinationSuggestions.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </label>
              <label>
                Transit (optional)
                <input
                  type="text"
                  value={spacePublicationForm.transit_airport}
                  onChange={(event) => setSpacePublicationForm({ ...spacePublicationForm, transit_airport: event.target.value })}
                  placeholder="e.g. ADD, DXB"
                />
              </label>
              <label>
                PMC count (optional)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={spacePublicationForm.pmc_count}
                  onChange={(event) => setSpacePublicationForm({ ...spacePublicationForm, pmc_count: event.target.value })}
                  placeholder="Any value e.g. 1, 2, 3…"
                />
              </label>
              <label>
                Skids (manual)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={spacePublicationForm.total_skids}
                  onChange={(event) => setSpacePublicationForm({ ...spacePublicationForm, total_skids: event.target.value })}
                  required
                />
              </label>
              <label>
                Total weight ({spacePublicationForm.weight_unit === 'tonne' ? 'tonnes' : 'kg'})
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={spacePublicationForm.total_kg}
                  onChange={(event) => setSpacePublicationForm({ ...spacePublicationForm, total_kg: event.target.value })}
                  required
                />
              </label>
              <label>
                Unit
                <select
                  value={spacePublicationForm.weight_unit}
                  onChange={(event) => setSpacePublicationForm({ ...spacePublicationForm, weight_unit: event.target.value })}
                >
                  <option value="kg">KG</option>
                  <option value="tonne">Tonnage</option>
                </select>
              </label>

              <div className="space-pub-derived full-width">
                <div className="space-pub-derived-row">
                  <span>Total KG</span>
                  <strong>{spaceFormDerived.totalKg.toLocaleString('en-US')} kg</strong>
                </div>
                <div className="space-pub-derived-row">
                  <span>KG per PMC</span>
                  <strong>{spaceFormDerived.kgPerPmc ? `${spaceFormDerived.kgPerPmc.toLocaleString('en-US')} kg` : '—'}</strong>
                </div>
                <div className="space-pub-derived-row">
                  <span>KG per Skid</span>
                  <strong>{spaceFormDerived.kgPerSkid ? `${spaceFormDerived.kgPerSkid.toLocaleString('en-US')} kg` : '—'}</strong>
                </div>
              </div>

              <div className="modal-button-group full-width space-pub-actions">
                <button className="table-action ghost" type="button" onClick={() => submitSpacePublication('save')}>
                  💾 Save (draft)
                </button>
                <button className="search-submit" type="submit">
                  🚀 Publish
                </button>
                <button className="table-action" type="button" onClick={() => setShowSpacePublicationModal(false)}>Close</button>
              </div>
              <small className="muted-cell full-width">Save keeps it private. Publish makes it visible in Space Availability for all exporters immediately.</small>
            </form>
          </div>
        </div>
      ) : null}

      {message ? <p className="booking-message">{message}</p> : null}
    </DashboardShell>
  );
}
