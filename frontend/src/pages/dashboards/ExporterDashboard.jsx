import React, { useEffect, useMemo, useRef, useState } from 'react';
import DashboardShell from '../../components/DashboardShell';
import Pagination, { usePagination } from '../../components/Pagination';
import api from '../../services/api';
import '../../styles/DashboardPages.css';
function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename, headerRow, dataRows) {
  const lines = [headerRow.map(csvEscape).join(',')];
  for (const row of dataRows) {
    lines.push(row.map(csvEscape).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const COMMODITY_OPTIONS = ['Vegetables', 'Flowers', 'Chilli', 'Fruits', 'Others'];

const initialForm = {
  capacity_id: '',
  airline_id: '',
  flight_date: '',
  destination: '',
  transit_airport: '',
  skids: '',
  tonnage_kg: '',
  commodity: '',
  bsa_type: ''
};

function toNumber(value) {
  return Number(value || 0);
}

function normalizeDate(value) {
  return String(value || '').slice(0, 10);
}

function normalizeText(value) {
  return String(value || '').trim().toUpperCase();
}

function destinationMatches(candidate, selected) {
  const candidateText = normalizeText(candidate);
  const selectedText = normalizeText(selected);

  if (!candidateText || !selectedText) return false;
  if (candidateText === selectedText) return true;
  return candidateText.includes(selectedText) || selectedText.includes(candidateText);
}

function canCancelBefore24h(flightDate) {
  const departureAt = new Date(`${String(flightDate || '').slice(0, 10)}T23:59:59`);
  const hoursUntilDeparture = (departureAt.getTime() - Date.now()) / (1000 * 60 * 60);
  return Number.isFinite(hoursUntilDeparture) && hoursUntilDeparture >= 24;
}

function canModifyApprovedBefore24h(flightDate) {
  return canCancelBefore24h(flightDate);
}

function canEditPendingBooking(booking) {
  if (booking.status === 'pending') {
    return true;
  }
  return canModifyApprovedBefore24h(booking.flight_date);
}

function canCancelPendingBooking(booking) {
  // For pending bookings, always allow cancellation since they're not approved yet
  if (booking.status === 'pending') {
    return true;
  }
  // For approved bookings, use the 24h rule
  return canCancelBefore24h(booking.flight_date);
}

export default function ExporterDashboard() {
  const [activeView, setActiveView] = useState('bookings');
  const [summary, setSummary] = useState({});
  const [availability, setAvailability] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [upliftNotifications, setUpliftNotifications] = useState([]);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const [markingNotificationId, setMarkingNotificationId] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [performance, setPerformance] = useState({ summary: [], weekly: [] });
  const [perfFilters, setPerfFilters] = useState({ start_date: '', end_date: '' });
  const [airlines, setAirlines] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const bookingHashRef = useRef('');
  const [weightUnit, setWeightUnit] = useState('kg');
  const [customCommodity, setCustomCommodity] = useState('');
  const [selectedCapacityId, setSelectedCapacityId] = useState('');
  const [savedBookingDrafts, setSavedBookingDrafts] = useState([]);
  const [allocationDrafts, setAllocationDrafts] = useState({});
  const [activeAllocationBooking, setActiveAllocationBooking] = useState(null);
  const [editingBookingId, setEditingBookingId] = useState(null);
  const [exportFilter, setExportFilter] = useState({
    startDate: '',
    endDate: '',
    statuses: { pending: true, approved: true, cancelled: false }
  });
  const [shareLinkModal, setShareLinkModal] = useState(null);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const todayIso = new Date().toISOString().slice(0, 10);

  const activeAvailability = useMemo(() => {
    return availability.filter((row) => {
      if (Number(row?.is_closed) === 1) return false;
      return normalizeDate(row?.flight_date) >= todayIso;
    });
  }, [availability, todayIso]);

  const allowedPublicationDates = useMemo(() => {
    const set = new Set();
    for (const row of activeAvailability) {
      const d = normalizeDate(row?.flight_date);
      if (d) set.add(d);
    }
    return Array.from(set).sort();
  }, [activeAvailability]);

  const flightDateSelectOptions = useMemo(() => {
    const base = [...allowedPublicationDates];
    if (editingBookingId) {
      const b = bookings.find((x) => String(x.id) === String(editingBookingId));
      const d = b ? normalizeDate(b.flight_date) : '';
      if (d && !base.includes(d)) base.push(d);
      base.sort();
    }
    return base;
  }, [allowedPublicationDates, editingBookingId, bookings]);

  const mySevenDayPerformance = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
    return days.map((day) => {
      const dayBookings = bookings.filter(
        (b) =>
          normalizeDate(b.flight_date) === day &&
          String(b.status || '').toLowerCase() === 'approved'
      );
      const plannedKg = dayBookings.reduce((s, b) => s + toNumber(b.tonnage_kg), 0);
      const usedKg = dayBookings.reduce((s, b) => s + toNumber(b.kg_confirmation || b.actual_kg), 0);
      return {
        day,
        label: new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        rows: dayBookings,
        plannedKg,
        usedKg,
        performance: plannedKg > 0 ? Math.round((usedKg / plannedKg) * 100) : 0
      };
    });
  }, [bookings]);

  const airlineOptions = useMemo(() => {
    const unique = new Map();

    for (const row of activeAvailability) {
      if (row?.airline_id && row?.airline) {
        unique.set(String(row.airline_id), { id: row.airline_id, name: row.airline });
      }
    }

    for (const airline of airlines) {
      if (airline && typeof airline === 'object' && airline.id) {
        unique.set(String(airline.id), airline);
      }
    }

    return Array.from(unique.values());
  }, [activeAvailability, airlines]);

  const selectedCapacity = useMemo(() => {
    const selectedDestination = normalizeText(form.destination);
    const selectedDate = normalizeDate(form.flight_date);

    return activeAvailability.find(
      (row) =>
        Number(row.airline_id) === Number(form.airline_id) &&
        normalizeDate(row.flight_date) === selectedDate &&
        destinationMatches(row.destination, selectedDestination)
    ) || null;
  }, [activeAvailability, form.airline_id, form.flight_date, form.destination]);

  const selectedCapacityById = useMemo(() => {
    if (!form.capacity_id) return null;
    return activeAvailability.find((row) => Number(row.id) === Number(form.capacity_id)) || null;
  }, [activeAvailability, form.capacity_id]);

  const effectiveCapacity = selectedCapacity || selectedCapacityById;

  const destinationOptions = useMemo(() => {
    const unique = new Set();
    const selectedAirline = Number(form.airline_id);
    const selectedDate = normalizeDate(form.flight_date);

    for (const row of activeAvailability) {
      const matchesAirline = selectedAirline ? Number(row.airline_id) === selectedAirline : true;
      const matchesDate = selectedDate ? normalizeDate(row.flight_date) === selectedDate : true;

      if (matchesAirline && matchesDate && row.destination) {
        unique.add(normalizeText(row.destination));
      }
    }

    return Array.from(unique.values()).sort();
  }, [activeAvailability, form.airline_id, form.flight_date]);

  const tonnageInKgValue = useMemo(() => {
    const numeric = Number(form.tonnage_kg || 0);
    return weightUnit === 'tonne' ? numeric * 1000 : numeric;
  }, [form.tonnage_kg, weightUnit]);

  const selectedAirlineName = useMemo(() => {
    const found = airlineOptions.find((item) => Number(item.id) === Number(form.airline_id));
    return found?.name || effectiveCapacity?.airline || '';
  }, [airlineOptions, form.airline_id, effectiveCapacity]);

  const exceedsCapacityMidWeek = useMemo(() => {
    if (!effectiveCapacity) return false;
    return Number(form.skids || 0) > Number(effectiveCapacity.free_skids || 0) || tonnageInKgValue > Number(effectiveCapacity.free_kg || 0);
  }, [effectiveCapacity, form.skids, form.flight_date, tonnageInKgValue]);

  const bookingHistoryRows = useMemo(() => {
    return [...bookings]
      .filter((row) => String(row?.status || '').toLowerCase() !== 'cancelled')
      .sort((a, b) => {
        const d1 = new Date(b.flight_date || b.created_at || 0).getTime();
        const d2 = new Date(a.flight_date || a.created_at || 0).getTime();
        return d1 - d2;
      });
  }, [bookings]);

  const canSubmit = useMemo(() => {
    const { bsa_type, capacity_id, transit_airport, ...requiredFields } = form;
    const baseValid = Object.values(requiredFields).every((value) => String(value).trim().length > 0);
    const commodityValid = form.commodity !== 'Others' || customCommodity.trim().length > 0;
    const bsaValid = Boolean(bsa_type);
    return baseValid && commodityValid && bsaValid;
  }, [form, customCommodity]);

  const exporterPerformance = useMemo(() => {
    const activeBookings = bookings.filter((row) => !['cancelled', 'rejected'].includes(String(row.status || '').toLowerCase()));
    const approvedBookings = bookings.filter((row) => String(row.status || '').toLowerCase() === 'approved');
    const totalRequestedKg = activeBookings.reduce((sum, row) => sum + toNumber(row.tonnage_kg), 0);
    const approvedKg = approvedBookings.reduce((sum, row) => sum + toNumber(row.tonnage_kg), 0);
    const totalPublishedKg = activeAvailability.reduce((sum, row) => sum + toNumber(row.total_kg), 0);
    const publicFreeKg = activeAvailability.reduce((sum, row) => sum + toNumber(row.free_kg), 0);
    const productTotalKg = totalRequestedKg || 1;
    const products = Object.values(activeBookings.reduce((acc, row) => {
      const key = row.commodity || 'Other';
      if (!acc[key]) {
        acc[key] = { commodity: key, kg: 0, skids: 0, count: 0 };
      }
      acc[key].kg += toNumber(row.tonnage_kg);
      acc[key].skids += toNumber(row.skids);
      acc[key].count += 1;
      return acc;
    }, {}))
      .map((row) => ({ ...row, percent: Math.round((row.kg / productTotalKg) * 100) }))
      .sort((left, right) => right.kg - left.kg)
      .slice(0, 5);

    return {
      approvedKg,
      totalRequestedKg,
      publicFreeKg,
      capacityUtilization: totalPublishedKg ? Math.round((approvedKg / totalPublishedKg) * 100) : toNumber(summary.utilization),
      products
    };
  }, [activeAvailability, bookings, summary.utilization]);

  const unreadNotificationsCount = useMemo(() => {
    const unreadGeneral = notifications.filter((row) => Number(row.is_read) !== 1).length;
    const unreadUplift = upliftNotifications.filter((row) => Number(row.is_read) !== 1).length;
    return unreadGeneral + unreadUplift;
  }, [notifications, upliftNotifications]);

  const pendingBookings = useMemo(
    () => bookings.filter((b) => b.status === 'pending'),
    [bookings]
  );

  const pendingPager = usePagination(pendingBookings, 5);
  const availabilityPager = usePagination(activeAvailability, 5);
  const historyPager = usePagination(bookingHistoryRows, 5);
  const documentsPager = usePagination(documents, 5);
  const upliftPager = usePagination(upliftNotifications, 5);

  const loadPerformance = async () => {
    try {
      const params = new URLSearchParams();
      if (perfFilters.start_date) params.set('start_date', perfFilters.start_date);
      if (perfFilters.end_date) params.set('end_date', perfFilters.end_date);
      const qs = params.toString();
      const data = await api.apiGet(`/api/analytics/exporter-performance${qs ? `?${qs}` : ''}`);
      setPerformance(data || { summary: [], weekly: [] });
    } catch (err) {
      setPerformance({ summary: [], weekly: [] });
    }
  };

  useEffect(() => {
    if (activeView !== 'performance') return;
    loadPerformance();
  }, [activeView, perfFilters.start_date, perfFilters.end_date]);

  const downloadMyPerformanceSummaryCsv = () => {
    const rows = (performance.summary || []).map((row) => [
      row.exporter_name,
      row.bookings,
      row.asked_kg,
      row.approved_kg,
      row.used_kg,
      row.performance_pct
    ]);
    downloadCsv(
      `my-performance-summary-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Scope', 'Bookings', 'Asked_kg', 'Approved_kg', 'Used_kg', 'Performance_pct'],
      rows
    );
  };

  const downloadMyPerformanceWeeklyCsv = () => {
    const rows = (performance.weekly || []).map((row) => [
      row.week,
      row.exporter_name,
      row.asked_kg,
      row.approved_kg,
      row.used_kg,
      row.performance_pct
    ]);
    downloadCsv(
      `my-performance-weekly-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Week', 'Exporter', 'Asked_kg', 'Approved_kg', 'Used_kg', 'Performance_pct'],
      rows
    );
  };

  const downloadMySevenDayCsv = () => {
    const header = ['Day', 'Label', 'Planned_kg', 'Used_kg', 'Performance_pct', 'Booking_id', 'Airline', 'Destination', 'Skids', 'Tonnage_kg'];
    const dataRows = [];
    for (const day of mySevenDayPerformance) {
      if (!day.rows.length) {
        dataRows.push([day.day, day.label, day.plannedKg, day.usedKg, day.performance, '', '', '', '', '']);
      } else {
        for (const b of day.rows) {
          dataRows.push([
            day.day,
            day.label,
            day.plannedKg,
            day.usedKg,
            day.performance,
            b.id,
            b.airline || '',
            b.destination || '',
            b.skids,
            b.tonnage_kg
          ]);
        }
      }
    }
    downloadCsv(`my-seven-day-performance-${new Date().toISOString().slice(0, 10)}.csv`, header, dataRows);
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      const [publicSummary, myBookings, airlinesList, availabilityRows, notificationRows, upliftRows, documentRows] = await Promise.all([
        api.apiGet('/api/public/dashboards/exporter'),
        api.apiGet('/api/bookings/my'),
        api.apiGet('/api/public/airlines'),
        api.apiGet('/api/public/availability'),
        api.apiGet('/api/notifications'),
        api.apiGet('/api/bookings/uplift-notifications').catch(() => []),
        api.apiGet('/api/documents').catch(() => [])
      ]);

      setSummary(publicSummary.summary || {});
      setBookings(myBookings || []);
      setAirlines(airlinesList || []);
      setAvailability(availabilityRows || []);
      setNotifications(notificationRows || []);
      setUpliftNotifications(upliftRows || []);
      setDocuments(documentRows || []);
    } catch (error) {
      setMessage(error.message || 'Failed to load exporter dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const syncViewFromHash = () => {
      const hash = window.location.hash || '';
      const queryPart = hash.includes('?') ? hash.split('?')[1] : '';
      const params = new URLSearchParams(queryPart);
      const view = params.get('view');
      const allowedViews = ['overview', 'bookings', 'capacity', 'history', 'documents', 'notifications', 'performance'];

      if (!view || !allowedViews.includes(view)) {
        window.location.hash = '#dashboard/exporter?view=bookings';
        return;
      }

      setActiveView(view);
    };

    syncViewFromHash();
    window.addEventListener('hashchange', syncViewFromHash);
    return () => window.removeEventListener('hashchange', syncViewFromHash);
  }, []);

  const setView = (view) => {
    setActiveView(view);
    window.location.hash = `#dashboard/exporter?view=${view}`;
  };

  const markUpliftNotificationAsRead = async (id) => {
    if (!id) return;
    try {
      await api.apiPatch(`/api/bookings/uplift-notifications/${id}/read`, {});
      setUpliftNotifications((prev) => prev.map((row) => (Number(row.id) === Number(id) ? { ...row, is_read: 1 } : row)));
    } catch (error) {
      setMessage(error.message || 'Failed to mark uplift notification as read');
    }
  };

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

  const deleteNotification = async (id) => {
    if (!id) return;
    try {
      await api.apiDelete(`/api/notifications/${id}`);
    } catch (error) {
      if (!String(error.message || '').includes('404') && !String(error.message || '').toLowerCase().includes('not found')) {
        setMessage(error.message || 'Failed to delete notification');
        return;
      }
    }

    try {
      setNotifications((prev) => prev.filter((row) => Number(row.id) !== Number(id)));
      setMessage('Notification deleted.');
    } catch {
      setNotifications((prev) => prev.filter((row) => Number(row.id) !== Number(id)));
    }
  };

  const deleteUpliftNotification = async (id) => {
    if (!id) return;
    try {
      await api.apiDelete(`/api/bookings/uplift-notifications/${id}`);
    } catch (error) {
      if (!String(error.message || '').includes('404') && !String(error.message || '').toLowerCase().includes('not found')) {
        setMessage(error.message || 'Failed to delete notification');
        return;
      }
    }

    try {
      setUpliftNotifications((prev) => prev.filter((row) => Number(row.id) !== Number(id)));
      setMessage('Notification deleted.');
    } catch {
      setUpliftNotifications((prev) => prev.filter((row) => Number(row.id) !== Number(id)));
    }
  };

  const applyQuickBookSelection = (row) => {
    if (!row) return;

    const normalizedFlightDate = normalizeDate(row.flight_date);

    setForm({
      capacity_id: String(row.id || ''),
      airline_id: String(row.airline_id || ''),
      flight_date: normalizedFlightDate,
      destination: normalizeText(row.destination || ''),
      transit_airport: '',
      skids: '',
      tonnage_kg: '',
      commodity: '',
      bsa_type: ''
    });
    setWeightUnit('kg');
    setCustomCommodity('');
    setSelectedCapacityId(String(row.id || ''));
    setShowBookingModal(true);
  };

  useEffect(() => {
    const syncBookingFromHash = () => {
      const hash = window.location.hash || '';
      const queryPart = hash.includes('?') ? hash.split('?')[1] : '';
      const params = new URLSearchParams(queryPart);
      const bookingId = params.get('book');

      if (!bookingId || bookingHashRef.current === bookingId || !availability.length) {
        return;
      }

      const selectedRow = availability.find((row) => String(row.id) === String(bookingId));
      if (selectedRow) {
        bookingHashRef.current = bookingId;
        setView('bookings');
        applyQuickBookSelection(selectedRow);
      }
    };

    syncBookingFromHash();
    window.addEventListener('hashchange', syncBookingFromHash);
    return () => window.removeEventListener('hashchange', syncBookingFromHash);
  }, [availability]);

  const buildBookingPayload = () => {
    const finalCommodity = form.commodity === 'Others' && customCommodity ? customCommodity : form.commodity;
    const tonnageInKg = weightUnit === 'tonne' ? Number(form.tonnage_kg) * 1000 : Number(form.tonnage_kg);
    const resolvedAirlineId = Number(effectiveCapacity?.airline_id || form.airline_id);
    const resolvedFlightDate = normalizeDate(effectiveCapacity?.flight_date || form.flight_date);
    const resolvedDestination = normalizeText(effectiveCapacity?.destination || form.destination);
    const resolvedCapacityId = Number(effectiveCapacity?.id || form.capacity_id || selectedCapacityId || 0) || undefined;

    return {
      capacity_id: resolvedCapacityId,
      airline_id: resolvedAirlineId,
      airline_name: selectedAirlineName,
      flight_date: resolvedFlightDate,
      destination: resolvedDestination,
      transit_airport: String(form.transit_airport || '').trim().toUpperCase() || undefined,
      skids: Number(form.skids),
      tonnage_kg: tonnageInKg,
      commodity: finalCommodity,
      bsa_type: form.bsa_type || null,
      booking_mode: 'midweek'
    };
  };

  const resetBookingForm = () => {
    setForm(initialForm);
    setCustomCommodity('');
    setWeightUnit('kg');
    setSelectedCapacityId('');
    setEditingBookingId(null);
  };

  const handleBook = (event) => {
    event.preventDefault();

    if (!canSubmit) {
      setMessage('Fill all form fields. If commodity is "Others", please enter a custom value.');
      return;
    }

    const payload = buildBookingPayload();
    setSavedBookingDrafts((prev) => [
      ...prev,
      {
        ...payload,
        draft_id: `${Date.now()}-${prev.length + 1}`
      }
    ]);
    setMessage('Booking saved. You can choose another date and save again, or submit saved bookings below.');
    resetBookingForm();
  };

  const handleSubmitCurrentBooking = async () => {
    if (!canSubmit) {
      setMessage('Fill all form fields. If commodity is "Others", please enter a custom value.');
      return;
    }

    const ok = await submitBookingPayload({
      ...buildBookingPayload(),
      draft_id: `current-${Date.now()}`
    });
    resetBookingForm();
    if (ok) {
      setShowBookingModal(false);
      setView('history');
    }
  };

  const submitBookingPayload = async (payload) => {
    const { draft_id, airline_name, ...bookingPayload } = payload;
    try {
      await api.apiPost('/api/bookings', bookingPayload);
      setSavedBookingDrafts((prev) => prev.filter((row) => row.draft_id !== draft_id));
      setMessage('Booking submitted. Airline analyst notified — track status in Booking History.');
      await loadAll();
      return true;
    } catch (error) {
      setMessage(error.message || 'Failed to submit booking');
      return false;
    }
  };

  const deleteSavedBookingDraft = (draftId) => {
    setSavedBookingDrafts((prev) => prev.filter((row) => row.draft_id !== draftId));
    setMessage('Saved booking removed.');
  };

  const submitAllSavedBookings = async () => {
    if (!savedBookingDrafts.length) {
      setMessage('No saved bookings to submit.');
      return;
    }

    let any = false;
    for (const draft of [...savedBookingDrafts]) {
      const ok = await submitBookingPayload(draft);
      if (ok) any = true;
    }
    if (any) setView('history');
  };

  const handleConfirmUplift = async (bookingId) => {
    try {
      await api.apiPatch(`/api/bookings/${bookingId}/confirm-uplift`, {});
      setMessage(`Uplift confirmed for booking #${bookingId}.`);
      await loadAll();
    } catch (error) {
      setMessage(error.message || 'Failed to confirm uplift');
    }
  };

  const handleCancelBooking = async (booking) => {
    // For pending bookings, always allow cancellation
    // For approved bookings, check the 24h rule
    if (booking.status === 'approved') {
      const allowed = canCancelBefore24h(booking.flight_date);
      if (!allowed) {
        setMessage('You can only cancel approved bookings more than 24 hours before flight.');
        return;
      }
    }

    const confirmMessage = booking.status === 'pending' 
      ? `Cancel pending booking #${booking.id}? This will remove your booking request.`
      : `Cancel booking #${booking.id}? This will release space back to public space availability.`;
    
    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;

    try {
      await api.apiPatch(`/api/bookings/${booking.id}/cancel`, {});
      setMessage(`Booking #${booking.id} cancelled successfully.`);
      await loadAll();
    } catch (error) {
      setMessage(error.message || 'Failed to cancel booking');
    }
  };

  const openEditBookingModal = (booking) => {
    console.log('Opening edit modal for booking:', booking.id);
    
    const capacity = activeAvailability.find(
      (row) =>
        Number(row.airline_id) === Number(booking.airline_id) &&
        normalizeDate(row.flight_date) === normalizeDate(booking.flight_date) &&
        destinationMatches(row.destination, booking.destination)
    );

    setForm({
      capacity_id: String(capacity?.id || ''),
      airline_id: String(booking.airline_id || ''),
      flight_date: normalizeDate(booking.flight_date),
      destination: normalizeText(booking.destination || ''),
      transit_airport: String(booking.transit_airport || '').trim().toUpperCase(),
      skids: String(booking.skids || ''),
      tonnage_kg: String(booking.tonnage_kg || ''),
      commodity: String(booking.commodity || ''),
      bsa_type: String(booking.bsa_type || '')
    });
    
    if (capacity) {
      setSelectedCapacityId(String(capacity.id));
    }
    
    setWeightUnit('kg');
    setCustomCommodity(booking.commodity && !COMMODITY_OPTIONS.includes(booking.commodity) ? booking.commodity : '');
    if (booking.commodity && !COMMODITY_OPTIONS.includes(booking.commodity)) {
      setForm(prev => ({ ...prev, commodity: 'Others' }));
    }
    setEditingBookingId(booking.id);
    setShowBookingModal(true);
    console.log('Modal opened on current page');
  };

  const handleUpdatePendingBooking = async (bookingId) => {
    const confirmMessage = `Update booking #${bookingId}?\n\n` +
      `Flight Date: ${form.flight_date}\n` +
      `Skids: ${form.skids}\n` +
      `Weight: ${tonnageInKgValue.toLocaleString('en-US')} kg`;
    
    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;

    try {
      // Update the booking directly (not creating a new one)
      // This keeps the same booking ID and doesn't duplicate
      await api.apiPatch(`/api/bookings/${bookingId}/edit-pending`, {
        flight_date: form.flight_date,
        skids: Number(form.skids),
        tonnage_kg: tonnageInKgValue
      });
      
      setMessage(`Booking #${bookingId} updated successfully.`);
      setShowBookingModal(false);
      resetBookingForm();
      await loadAll();
    } catch (error) {
      setMessage(error.message || 'Failed to update booking');
    }
  };

  const openSmartGrid = () => {
    setView('bookings');
    setForm(initialForm);
    setSelectedCapacityId('');
    setShowBookingModal(true);
    setWeightUnit('kg');
    setCustomCommodity('');
  };

  const openAllocationEditor = (booking) => {
    setAllocationDrafts((prev) => ({
      ...prev,
      [booking.id]: {
        skids: String(Math.round(toNumber(booking.skids))),
        tonnage_kg: String(toNumber(booking.tonnage_kg))
      }
    }));
    setActiveAllocationBooking(booking);
  };

  const closeAllocationEditor = () => {
    setActiveAllocationBooking(null);
  };

  const submitAllocationAdjustment = async (bookingId) => {
    const row = allocationDrafts[bookingId];
    if (!row || !String(row.skids).trim() || !String(row.tonnage_kg).trim()) {
      setMessage('Enter whole-number skids and total weight (kg) for this booking.');
      return;
    }
    try {
      const payload = await api.apiPatch(`/api/bookings/${bookingId}/allocation-exporter`, {
        skids: Math.round(Number(row.skids)),
        tonnage_kg: Number(row.tonnage_kg)
      });
      setMessage(
        payload?.status === 'pending_approval'
          ? 'Additional space request sent to airline analyst for approval.'
          : 'Space reduced and released for other exporters.'
      );
      setAllocationDrafts((prev) => {
        const next = { ...prev };
        delete next[bookingId];
        return next;
      });
      setActiveAllocationBooking(null);
      await loadAll();
    } catch (error) {
      setMessage(error.message || 'Failed to update allocation');
    }
  };

  const copyDocumentShareLink = async (doc) => {
    try {
      const data = await api.apiPost(`/api/documents/${doc.id}/share-link`, { expires_in_hours: 72 });
      const url = data?.share_url || '';
      if (!url) {
        setMessage('Could not create share link');
        return;
      }
      setShareLinkCopied(false);
      setShareLinkModal({ url, fileName: getDocumentFileName(doc) });
    } catch (error) {
      setMessage(error.message || 'Could not create share link');
    }
  };

  const handleCopyShareLinkToClipboard = async () => {
    if (!shareLinkModal?.url) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLinkModal.url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = shareLinkModal.url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setShareLinkCopied(true);
    } catch (error) {
      setMessage(error.message || 'Could not copy link');
    }
  };

  const closeShareLinkModal = () => {
    setShareLinkModal(null);
    setShareLinkCopied(false);
  };

  const getDocumentFileName = (doc) => {
    return doc?.file_name || doc?.doc_name_pattern || `document-${doc?.id || 'file'}`;
  };

  const openDocument = async (doc) => {
    try {
      // Show loading indicator
      const loadingToast = document.createElement('div');
      loadingToast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
        z-index: 10000;
        font-weight: 600;
      `;
      loadingToast.innerHTML = '🔄 Opening document...';
      document.body.appendChild(loadingToast);

      const token = localStorage.getItem('sbu_token');
      const response = await fetch(`${api.API_BASE}/api/documents/${doc.id}/content?disposition=inline`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : ''
        }
      });

      if (!response.ok) {
        throw new Error('Could not open document');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);

      loadingToast.innerHTML = '✓ Document opened in new tab';
      loadingToast.style.background = 'linear-gradient(135deg, #00c853 0%, #00a843 100%)';
      setTimeout(() => {
        loadingToast.style.opacity = '0';
        loadingToast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => document.body.removeChild(loadingToast), 300);
      }, 2000);
    } catch (error) {
      setMessage(error.message || 'Could not open document');
      const toasts = document.querySelectorAll('[style*="Opening document"]');
      toasts.forEach(t => document.body.removeChild(t));
    }
  };

  const downloadDocument = async (doc) => {
    try {
      // Show downloading indicator
      const downloadToast = document.createElement('div');
      downloadToast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(156, 39, 176, 0.3);
        z-index: 10000;
        font-weight: 600;
      `;
      downloadToast.innerHTML = '⬇️ Downloading document...';
      document.body.appendChild(downloadToast);

      await api.downloadAuthorizedFile(`/api/documents/${doc.id}/content?disposition=attachment`, getDocumentFileName(doc));
      
      downloadToast.innerHTML = '✓ Document downloaded successfully';
      downloadToast.style.background = 'linear-gradient(135deg, #00c853 0%, #00a843 100%)';
      setTimeout(() => {
        downloadToast.style.opacity = '0';
        downloadToast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => document.body.removeChild(downloadToast), 300);
      }, 2000);
    } catch (error) {
      setMessage(error.message || 'Could not download document');
      const toasts = document.querySelectorAll('[style*="Downloading document"]');
      toasts.forEach(t => t.parentNode && document.body.removeChild(t));
    }
  };

  const handleExportBookings = async () => {
    try {
      if (exportFilter.startDate && exportFilter.endDate && exportFilter.startDate > exportFilter.endDate) {
        setMessage('Start date must be before end date.');
        return;
      }
      const selectedStatuses = Object.entries(exportFilter.statuses)
        .filter(([, on]) => on)
        .map(([k]) => k);
      if (!selectedStatuses.length) {
        setMessage('Select at least one status to export.');
        return;
      }

      const params = new URLSearchParams();
      if (exportFilter.startDate) params.set('startDate', exportFilter.startDate);
      if (exportFilter.endDate) params.set('endDate', exportFilter.endDate);
      params.set('statuses', selectedStatuses.join(','));

      const token = localStorage.getItem('sbu_token');
      const response = await fetch(`${api.API_BASE}/api/bookings/my/export?${params.toString()}`, {
        method: 'GET',
        headers: { Authorization: token ? `Bearer ${token}` : '' }
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const fileName = response.headers
        .get('content-disposition')
        ?.split('filename=')[1]
        ?.replace(/"/g, '') || `Bookings-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setMessage(`Bookings exported (${selectedStatuses.join(', ')}).`);
    } catch (error) {
      setMessage(error.message || 'Failed to export bookings');
    }
  };

  const openQuickBook = (row) => {
    setView('bookings');
    applyQuickBookSelection(row);
  };

  return (
    <DashboardShell
      role="Exporter"
      title="Exporter Dashboard"
      subtitle=""
      accent="dashboard-exporter"
      sidebarSummary=""
    >
      <div className="dashboard-alert-strip">
        <button
          type="button"
          className="notify-bell-btn"
          onClick={() => setShowNotificationsPanel((prev) => !prev)}
          aria-label="Toggle notification center"
        >
          <span className="notify-bell-icon" aria-hidden="true">🔔</span>
          <span className="notify-bell-label">Notifications</span>
          <span className="notify-bell-count">{unreadNotificationsCount}</span>
        </button>

        {showNotificationsPanel ? (
          <div className="notify-panel">
            <div className="notify-panel-head">
              <h4>Notifications</h4>
              <button type="button" className="table-action" onClick={() => setShowNotificationsPanel(false)}>Close</button>
            </div>

            <div className="notify-panel-list">
              {notifications.length ? notifications.slice(0, 8).map((notif) => (
                <article className={`notify-item ${Number(notif.is_read) === 1 ? 'read' : ''}`} key={`general-notif-${notif.id}`}>
                  <div>
                    <strong>{notif.title || 'Notification'}</strong>
                    <p>{notif.message || '-'}</p>
                    <small>{notif.created_at ? new Date(notif.created_at).toLocaleString('en-US') : '-'}</small>
                  </div>
                  {Number(notif.is_read) !== 1 ? (
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="table-action"
                        disabled={Number(markingNotificationId) === Number(notif.id)}
                        onClick={() => markNotificationAsRead(notif.id)}
                      >
                        {Number(markingNotificationId) === Number(notif.id) ? 'Saving...' : 'Mark read'}
                      </button>
                      <button type="button" className="table-action danger" onClick={() => deleteNotification(notif.id)}>Delete</button>
                    </div>
                  ) : (
                    <div className="inline-actions">
                      <span className="status-pill confirmed">Read</span>
                      <button type="button" className="table-action danger" onClick={() => deleteNotification(notif.id)}>Delete</button>
                    </div>
                  )}
                </article>
              )) : <p>No direct notifications yet.</p>}

              {upliftNotifications.length ? upliftNotifications.slice(0, 6).map((notif) => (
                <article className={`notify-item ${Number(notif.is_read) === 1 ? 'read' : ''}`} key={`uplift-notif-${notif.id}`}>
                  <div>
                    <strong>Booking #{notif.booking_id}</strong>
                    <p>{notif.message || notif.explanation || notif.reason || 'Operational update.'}</p>
                    <small>{new Date(notif.updated_at || notif.created_at).toLocaleString('en-US')}</small>
                  </div>
                  {Number(notif.is_read) !== 1 ? (
                    <div className="inline-actions">
                      <button type="button" className="table-action" onClick={() => markUpliftNotificationAsRead(notif.id)}>Mark read</button>
                      <button type="button" className="table-action danger" onClick={() => deleteUpliftNotification(notif.id)}>Delete</button>
                    </div>
                  ) : (
                    <div className="inline-actions">
                      <span className="status-pill confirmed">Read</span>
                      <button type="button" className="table-action danger" onClick={() => deleteUpliftNotification(notif.id)}>Delete</button>
                    </div>
                  )}
                </article>
              )) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="sheet-tabs" role="tablist" aria-label="Exporter dashboard views">
        <button className={activeView === 'overview' ? 'active' : ''} onClick={() => setView('overview')}>Overview</button>
        <button className={activeView === 'bookings' ? 'active' : ''} onClick={() => setView('bookings')}>Weekly Booking</button>
        <button className={activeView === 'capacity' ? 'active' : ''} onClick={() => setView('capacity')}>Space Availability</button>
        <button className={activeView === 'history' ? 'active' : ''} onClick={() => setView('history')}>Booking History</button>
        <button className={activeView === 'documents' ? 'active' : ''} onClick={() => setView('documents')}>Documents</button>
        <button className={activeView === 'notifications' ? 'active' : ''} onClick={() => setView('notifications')}>Notifications</button>
        <button className={activeView === 'performance' ? 'active' : ''} onClick={() => setView('performance')}>Performance</button>
      </div>

      {activeView === 'overview' ? (
        <div className="dashboard-grid metrics-grid exporter-overview-grid">
          <article className="metric-card">
            <span>Open Requests</span>
            <strong>{bookings.filter((row) => row.status === 'pending').length}</strong>
          </article>
          <article className="metric-card">
            <span>Capacity Utilization</span>
            <strong>{exporterPerformance.capacityUtilization}%</strong>
          </article>
          <article className="metric-card">
            <span>Approved Supply</span>
            <strong>{exporterPerformance.approvedKg.toLocaleString('en-US')} kg</strong>
          </article>
          <article className="metric-card">
            <span>Available Space</span>
            <strong>{exporterPerformance.publicFreeKg.toLocaleString('en-US')} kg</strong>
          </article>
          <article className="panel-card exporter-product-card">
            <h3>Product Performance</h3>
            <div className="product-performance-list">
              {exporterPerformance.products.length ? exporterPerformance.products.map((item) => (
                <div className="product-performance-row" key={item.commodity}>
                  <div>
                    <strong>{item.commodity}</strong>
                    <span>{item.kg.toLocaleString('en-US')} kg • {Math.round(item.skids)} skids</span>
                  </div>
                  <div className="product-performance-bar" aria-label={`${item.commodity} ${item.percent}%`}>
                    <span style={{ width: `${Math.min(100, item.percent)}%` }} />
                  </div>
                  <strong>{item.percent}%</strong>
                </div>
              )) : <p className="muted-cell">No product data yet.</p>}
            </div>
          </article>
        </div>
      ) : null}

      {activeView === 'bookings' ? (
        <div className="dashboard-grid single-panel-grid">
          <article className="panel-card highlight-card exporter-main-panel">
            <h3>Exporter Booking</h3>

            <div className="calendar-inline">
              <div>
                <strong>Create booking request</strong>
              </div>
              <button className="table-action" onClick={openSmartGrid}>Start booking</button>
            </div>

            {pendingBookings.length > 0 && (
              <div className="saved-bookings-panel" style={{ 
                marginTop: '1rem', 
                background: 'linear-gradient(135deg, #fff9e6 0%, #fffbf0 100%)', 
                border: '2px solid #ffc107',
                boxShadow: '0 4px 12px rgba(255, 193, 7, 0.15)'
              }}>
                <div className="saved-bookings-head">
                  <div>
                    <h4 style={{ fontSize: '1.1rem', color: '#f57c00' }}>⏳ Pending Bookings - Awaiting Approval</h4>
                    <span style={{ fontSize: '0.85rem', color: '#666' }}>
                      ✓ Edit date, skids & weight freely • ✓ Cancel anytime • Changes await airline approval
                    </span>
                  </div>
                  <span style={{ 
                    background: '#ffc107', 
                    color: '#000', 
                    padding: '0.3rem 0.8rem', 
                    borderRadius: '12px', 
                    fontWeight: '700',
                    fontSize: '0.85rem'
                  }}>
                    {pendingBookings.length} Pending
                  </span>
                </div>
                <div className="saved-bookings-list">
                  {pendingPager.pagedItems.map((booking) => (
                    <div className="saved-booking-row" key={`pending-${booking.id}`} style={{
                      background: 'white',
                      border: '1px solid #ffe082',
                      borderRadius: '8px',
                      padding: '1rem'
                    }}>
                      <div>
                        <strong style={{ fontSize: '1rem', color: '#f57c00' }}>
                          📋 Booking #{booking.id} • {String(booking.flight_date || '').slice(0, 10)} • {booking.destination}
                        </strong>
                        <span style={{ display: 'block', marginTop: '0.3rem', color: '#555' }}>
                          ✈️ {booking.airline || `Airline #${booking.airline_id}`} • 
                          📦 {booking.skids} skids • 
                          ⚖️ {toNumber(booking.tonnage_kg).toLocaleString('en-US')} kg • 
                          🌾 {booking.commodity}
                        </span>
                      </div>
                      <div className="inline-actions" style={{ gap: '0.6rem' }}>
                        <button 
                          type="button" 
                          className="search-submit" 
                          onClick={() => openEditBookingModal(booking)}
                          style={{ 
                            fontSize: '0.95rem',
                            padding: '0.6rem 1.2rem',
                            background: 'linear-gradient(135deg, #00c853 0%, #00a843 100%)',
                            boxShadow: '0 3px 10px rgba(0, 200, 83, 0.3)'
                          }}
                        >
                          ✏️ Edit Booking
                        </button>
                        <button 
                          type="button" 
                          className="table-action danger" 
                          onClick={() => handleCancelBooking(booking)}
                          title="Cancel this pending booking"
                          style={{
                            fontSize: '0.95rem',
                            padding: '0.6rem 1.2rem'
                          }}
                        >
                          ✕ Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <Pagination {...pendingPager} label="pending bookings" />
              </div>
            )}

            {savedBookingDrafts.length ? (
              <div className="saved-bookings-panel">
                <div className="saved-bookings-head">
                  <h4>Saved bookings</h4>
                  <button type="button" className="search-submit" onClick={submitAllSavedBookings}>Submit all saved</button>
                </div>
                <div className="saved-bookings-list">
                  {savedBookingDrafts.map((draft) => (
                    <div className="saved-booking-row" key={draft.draft_id}>
                      <div>
                        <strong>{draft.flight_date} • {draft.destination}</strong>
                        <span>{draft.airline_name || `Airline #${draft.airline_id}`} • {draft.skids} skids • {toNumber(draft.tonnage_kg).toLocaleString('en-US')} kg • {draft.commodity}</span>
                      </div>
                      <div className="inline-actions">
                        <button type="button" className="table-action" onClick={() => submitBookingPayload(draft)}>Submit</button>
                        <button type="button" className="table-action danger" onClick={() => deleteSavedBookingDraft(draft.draft_id)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </article>
        </div>
      ) : null}

      {activeView === 'capacity' ? (
        <div className="dashboard-grid single-panel-grid">
          <article className="panel-card">
            <h3>Space Availability</h3>
            <div className="capacity-list">
              {activeAvailability.length ? availabilityPager.pagedItems.map((row) => (
                <div className="capacity-row" key={`${row.id}-${row.flight_date}`}>
                  <div className="capacity-row-info">
                    <strong>✈️ {row.airline} • {row.destination}</strong>
                    <p>📅 {row.flight_date} | Managed by Airline Analyst</p>
                  </div>
                  <div className="capacity-values">
                    <div className="capacity-detail">
                      <span className="label">Available Weight:</span>
                      <strong>{toNumber(row.free_kg).toLocaleString('en-US')} kg</strong>
                    </div>
                    <div className="capacity-detail">
                      <span className="label">Available Skids:</span>
                      <strong>{toNumber(row.free_skids)}</strong>
                    </div>
                    <span className={`status-pill ${row.availability_state || row.status}`}>{String(row.availability_state || row.status || '').toUpperCase()}</span>
                    <button className="table-action" onClick={() => openQuickBook(row)} type="button">Quick Book</button>
                  </div>
                </div>
              )) : <p>No available space found.</p>}
            </div>
            {activeAvailability.length ? <Pagination {...availabilityPager} label="capacity rows" /> : null}
          </article>
        </div>
      ) : null}

      {activeView === 'history' ? (
        <article className="panel-card">
          <h3>Booking History</h3>
          <div className="inline-tags" style={{ marginBottom: '0.8rem' }}>
            <span>Total: {bookingHistoryRows.length}</span>
            <span>Pending: {bookingHistoryRows.filter((row) => row.status === 'pending').length}</span>
            <span>Approved: {bookingHistoryRows.filter((row) => row.status === 'approved').length}</span>
          </div>

          <div className="export-filter-bar">
            <div className="export-filter-row">
              <label>
                <span>From</span>
                <input
                  type="date"
                  value={exportFilter.startDate}
                  onChange={(e) => setExportFilter((prev) => ({ ...prev, startDate: e.target.value }))}
                />
              </label>
              <label>
                <span>To</span>
                <input
                  type="date"
                  value={exportFilter.endDate}
                  onChange={(e) => setExportFilter((prev) => ({ ...prev, endDate: e.target.value }))}
                />
              </label>
              <div className="export-status-group" role="group" aria-label="Status filter">
                {['pending', 'approved', 'cancelled'].map((s) => (
                  <label key={`exp-status-${s}`} className="export-status-chip">
                    <input
                      type="checkbox"
                      checked={!!exportFilter.statuses[s]}
                      onChange={(e) => setExportFilter((prev) => ({
                        ...prev,
                        statuses: { ...prev.statuses, [s]: e.target.checked }
                      }))}
                    />
                    <span>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="table-action ghost"
                onClick={() => setExportFilter({
                  startDate: '',
                  endDate: '',
                  statuses: { pending: true, approved: true, cancelled: false }
                })}
              >
                Reset
              </button>
              <button type="button" className="search-submit" onClick={handleExportBookings}>
                📊 Export Excel
              </button>
            </div>
            <small className="export-filter-hint">
              Pick a date range and the statuses you want, then download only those bookings.
            </small>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Created</th>
                  <th>Airline</th>
                  <th>Flight date</th>
                  <th>Destination</th>
                  <th>Transit</th>
                  <th>Skids</th>
                  <th>KG</th>
                  <th>BSA</th>
                  <th>Commodity</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {historyPager.pagedItems.length ? historyPager.pagedItems.map((row) => (
                  <tr key={`history-${row.id}`}>
                    <td>#{row.id}</td>
                    <td>{row.created_at ? new Date(row.created_at).toLocaleString('en-US') : '-'}</td>
                    <td>{row.airline || '-'}</td>
                    <td>{String(row.flight_date || '').slice(0, 10)}</td>
                    <td>{row.destination || '-'}</td>
                    <td>{row.transit_airport || '—'}</td>
                    <td>{Math.round(toNumber(row.skids))}</td>
                    <td>{toNumber(row.tonnage_kg).toLocaleString('en-US')}</td>
                    <td>{row.bsa_type || '—'}</td>
                    <td>{row.commodity || '-'}</td>
                    <td><span className={`status-pill ${row.status}`}>{String(row.status || '').toUpperCase()}</span></td>
                    <td>
                      {row.status === 'approved' ? (
                        <div className="history-actions">
                          <button
                            type="button"
                            className="table-action"
                            onClick={() => openAllocationEditor(row)}
                            disabled={!canModifyApprovedBefore24h(row.flight_date)}
                          >
                            Edit space
                          </button>
                          <button type="button" className="table-action" onClick={() => handleConfirmUplift(row.id)}>Confirm uplift</button>
                          <button
                            type="button"
                            className="table-action danger"
                            onClick={() => handleCancelBooking(row)}
                            disabled={!canCancelBefore24h(row.flight_date)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : row.status === 'pending' ? (
                        <div className="history-actions">
                          <button
                            type="button"
                            className="search-submit"
                            onClick={() => openEditBookingModal(row)}
                            title="Edit pending booking before airline approval"
                          >
                            ✏️ Edit Booking
                          </button>
                          <button
                            type="button"
                            className="table-action danger"
                            onClick={() => handleCancelBooking(row)}
                            title="Cancel this pending booking (not yet approved)"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <span className="muted-cell">—</span>
                      )}
                    </td>
                  </tr>
                )) : <tr><td colSpan="12">No booking history yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination {...historyPager} label="bookings" />

          {activeAllocationBooking ? (
            <div className="allocation-editor-overlay" role="dialog" aria-label="Edit booking space">
              <div className="allocation-editor-card">
                <div className="allocation-editor-head">
                  <div>
                    <h4>Edit Space</h4>
                    <p>Booking #{activeAllocationBooking.id} • {activeAllocationBooking.airline} • {activeAllocationBooking.destination}</p>
                  </div>
                  <button type="button" className="close-btn" onClick={closeAllocationEditor} aria-label="Close edit space form">✕</button>
                </div>

                <div className="allocation-current-grid">
                  <div>
                    <span>Current skids</span>
                    <strong>{Math.round(toNumber(activeAllocationBooking.skids))}</strong>
                  </div>
                  <div>
                    <span>Current kg</span>
                    <strong>{toNumber(activeAllocationBooking.tonnage_kg).toLocaleString('en-US')}</strong>
                  </div>
                </div>

                <div className="allocation-form-grid">
                  <label>
                    New skids
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={allocationDrafts[activeAllocationBooking.id]?.skids ?? String(Math.round(toNumber(activeAllocationBooking.skids)))}
                      onChange={(event) => setAllocationDrafts((prev) => ({
                        ...prev,
                        [activeAllocationBooking.id]: {
                          ...prev[activeAllocationBooking.id],
                          skids: event.target.value,
                          tonnage_kg: prev[activeAllocationBooking.id]?.tonnage_kg ?? String(activeAllocationBooking.tonnage_kg)
                        }
                      }))}
                    />
                  </label>
                  <label>
                    New kg
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={allocationDrafts[activeAllocationBooking.id]?.tonnage_kg ?? String(activeAllocationBooking.tonnage_kg)}
                      onChange={(event) => setAllocationDrafts((prev) => ({
                        ...prev,
                        [activeAllocationBooking.id]: {
                          ...prev[activeAllocationBooking.id],
                          tonnage_kg: event.target.value,
                          skids: prev[activeAllocationBooking.id]?.skids ?? String(Math.round(toNumber(activeAllocationBooking.skids)))
                        }
                      }))}
                    />
                  </label>
                </div>

                <div className="allocation-editor-actions">
                  <button type="button" className="cancel-btn" onClick={closeAllocationEditor}>Cancel</button>
                  <button type="button" className="search-submit" onClick={() => submitAllocationAdjustment(activeAllocationBooking.id)}>Submit update</button>
                </div>
              </div>
            </div>
          ) : null}

          <h3 style={{ marginTop: '1.25rem' }}>7-day grid (approved)</h3>
          {(() => {
            const approvedRows = bookings.filter((r) => r.status === 'approved');
            if (!approvedRows.length) return <p className="muted-cell">No approved bookings.</p>;
            const today = new Date();
            const days = Array.from({ length: 7 }, (_, i) => {
              const d = new Date(today);
              d.setDate(today.getDate() + i);
              return d.toISOString().slice(0, 10);
            });
            const byDate = {};
            for (const row of approvedRows) {
              const dateKey = String(row.flight_date || '').slice(0, 10);
              if (!byDate[dateKey]) byDate[dateKey] = [];
              byDate[dateKey].push(row);
            }
            return (
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))', gap: '0.5rem', minWidth: '600px' }}>
                  {days.map((day) => {
                    const dayRows = byDate[day] || [];
                    const dayLabel = new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    return (
                      <div key={day} style={{ background: dayRows.length ? '#e8f5e9' : '#f9f9f9', border: '1px solid #ddd', borderRadius: '8px', padding: '0.5rem', minHeight: '80px' }}>
                        <strong style={{ display: 'block', fontSize: '0.78rem', marginBottom: '0.35rem', color: '#333' }}>{dayLabel}</strong>
                        {dayRows.length ? dayRows.map((br) => (
                          <div key={br.id} style={{ fontSize: '0.75rem', background: '#fff', borderRadius: '4px', padding: '0.25rem 0.4rem', marginBottom: '0.3rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                            <div>{br.airline} — {br.destination}</div>
                            <div>{Math.round(toNumber(br.skids))} skids / {toNumber(br.tonnage_kg).toLocaleString('en-US')} kg</div>
                          </div>
                        )) : <span style={{ fontSize: '0.75rem', color: '#aaa' }}>—</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </article>
      ) : null}

      {activeView === 'documents' ? (
        <article className="panel-card">
          <h3>📁 Document Vault</h3>
          <div className="capacity-list">
            {documents.length ? documentsPager.pagedItems.map((doc) => {
              const getFileIcon = (mimeType, fileName) => {
                const mime = String(mimeType || '').toLowerCase();
                const ext = String(fileName || '').split('.').pop().toLowerCase();
                
                if (mime.includes('pdf') || ext === 'pdf') return '📄';
                if (mime.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return '🖼️';
                if (mime.includes('word') || ['doc', 'docx'].includes(ext)) return '📝';
                if (mime.includes('excel') || mime.includes('spreadsheet') || ['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
                if (mime.includes('zip') || mime.includes('rar') || ['zip', 'rar', '7z'].includes(ext)) return '📦';
                if (mime.includes('text') || ext === 'txt') return '📃';
                return '📎';
              };

              const formatFileSize = (bytes) => {
                if (!bytes) return 'Unknown size';
                const kb = bytes / 1024;
                if (kb < 1024) return `${Math.round(kb)} KB`;
                return `${(kb / 1024).toFixed(2)} MB`;
              };

              const getFileExtension = (fileName) => {
                const ext = String(fileName || '').split('.').pop().toUpperCase();
                return ext || 'FILE';
              };

              return (
                <div className="capacity-row document-row" key={doc.id} style={{
                  background: 'linear-gradient(135deg, #ffffff 0%, #f8f9ff 100%)',
                  border: '1px solid #e3e8ef',
                  borderRadius: '12px',
                  padding: '1rem 1.2rem',
                  marginBottom: '0.75rem',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  transition: 'all 0.2s ease'
                }}>
                  <div className="capacity-row-info" style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '2rem', lineHeight: 1 }}>
                        {getFileIcon(doc.mime_type, doc.file_name)}
                      </span>
                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: '1.05rem', color: '#1a1a1a', display: 'block', marginBottom: '0.25rem' }}>
                          {doc.file_name || doc.doc_name_pattern || 'Unnamed document'}
                        </strong>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.9rem' }}>
                          <span style={{ 
                            background: '#e3f2fd', 
                            color: '#1976d2', 
                            padding: '0.15rem 0.5rem', 
                            borderRadius: '4px',
                            fontWeight: '600',
                            fontSize: '0.8rem'
                          }}>
                            {getFileExtension(doc.file_name)}
                          </span>
                          <span style={{ color: '#666' }}>
                            {formatFileSize(doc.size_bytes)}
                          </span>
                          <span style={{ color: '#666' }}>
                            Booking #{doc.booking_id || '—'}
                          </span>
                          {doc.awb_code && (
                            <span style={{ color: '#666' }}>
                              AWB: {doc.awb_code}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginLeft: '3.5rem', fontSize: '0.875rem' }}>
                      <p style={{ margin: '0.25rem 0', color: '#777' }}>
                        📋 Type: <strong>{doc.doc_type}</strong>
                      </p>
                      <p style={{ margin: '0.25rem 0', color: '#999' }}>
                        🕒 Uploaded: {new Date(doc.created_at).toLocaleString('en-US', { 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                      {doc.exporter_name && (
                        <p style={{ margin: '0.25rem 0', color: '#999' }}>
                          🏢 Exporter: {doc.exporter_name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="capacity-values" style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '0.5rem',
                    minWidth: '150px'
                  }}>
                    {doc.file_path ? (
                      <button 
                        type="button" 
                        className="table-action" 
                        onClick={() => openDocument(doc)}
                        style={{
                          background: 'linear-gradient(135deg, #2196f3 0%, #1976d2 100%)',
                          color: 'white',
                          border: 'none',
                          padding: '0.6rem 1rem',
                          borderRadius: '8px',
                          fontWeight: '600',
                          fontSize: '0.9rem',
                          cursor: 'pointer',
                          boxShadow: '0 2px 8px rgba(33, 150, 243, 0.3)',
                          transition: 'all 0.2s ease',
                          width: '100%'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                        onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                      >
                        👁️ Open
                      </button>
                    ) : null}
                    <button 
                      type="button" 
                      className="table-action" 
                      onClick={() => copyDocumentShareLink(doc)}
                      style={{
                        background: 'linear-gradient(135deg, #00c853 0%, #00a843 100%)',
                        color: 'white',
                        border: 'none',
                        padding: '0.6rem 1rem',
                        borderRadius: '8px',
                        fontWeight: '600',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(0, 200, 83, 0.3)',
                        transition: 'all 0.2s ease',
                        width: '100%'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                      onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                      🔗 Share Link
                    </button>
                    {doc.file_path ? (
                      <button 
                        type="button" 
                        className="table-action" 
                        onClick={() => downloadDocument(doc)}
                        style={{
                          background: 'linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%)',
                          color: 'white',
                          border: 'none',
                          padding: '0.6rem 1rem',
                          borderRadius: '8px',
                          fontWeight: '600',
                          fontSize: '0.9rem',
                          cursor: 'pointer',
                          boxShadow: '0 2px 8px rgba(156, 39, 176, 0.3)',
                          transition: 'all 0.2s ease',
                          width: '100%'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                        onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                      >
                        ⬇️ Download
                      </button>
                    ) : (
                      <span className="muted-cell" style={{ 
                        textAlign: 'center', 
                        padding: '0.6rem',
                        color: '#999',
                        fontSize: '0.85rem'
                      }}>
                        No file
                      </span>
                    )}
                  </div>
                </div>
              );
            }) : (
              <div style={{
                textAlign: 'center',
                padding: '3rem 1rem',
                color: '#999'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
                <p style={{ fontSize: '1.1rem', fontWeight: '500' }}>No documents yet</p>
                <p style={{ fontSize: '0.9rem' }}>Upload your first document to get started</p>
              </div>
            )}
          </div>
          {documents.length ? <Pagination {...documentsPager} label="documents" /> : null}
        </article>
      ) : null}

      {activeView === 'notifications' ? (
        <article className="panel-card">
          <h3>Notifications</h3>
          <div className="capacity-list">
            {upliftNotifications.length ? upliftPager.pagedItems.map((notif) => (
              <div className={`capacity-row ${Number(notif.is_read) === 1 ? 'read' : ''}`} key={notif.id}>
                <div className="capacity-row-info">
                  <strong>✈️ {notif.airline} • Flight {notif.flight_number || '—'} → {notif.onward_destination || 'Destination'}</strong>
                  <p>Booking #{notif.booking_id} | AWB {notif.awb_number || 'N/A'}</p>
                  <p>
                    📊 {notif.tonnage_kg ? `${notif.tonnage_kg.toLocaleString('en-US')} kg` : 'N/A'}
                    {notif.skids ? ` • ${notif.skids} skids` : ''}
                  </p>
                  {notif.awb_type && <p>🏷️ AWB type: {notif.awb_type}</p>}
                  {notif.kg_confirmation && <p>✓ Confirmed weight: {notif.kg_confirmation.toLocaleString('en-US')} kg</p>}
                  {notif.message && <p className="muted-cell">{notif.message}</p>}
                  {notif.explanation && <p className="muted-cell">{notif.explanation}</p>}
                  {notif.reason && <p className="muted-cell">{notif.reason}</p>}
                  {notif.onward_flight && (
                    <p>🔗 Onward: {notif.onward_flight} to {notif.onward_destination}</p>
                  )}
                  <p className="muted-cell">Updated: {new Date(notif.updated_at || notif.created_at).toLocaleString('en-US')}</p>
                </div>
                <div className="capacity-values">
                  <span className={`status-pill ${notif.status}`}>{notif.status || 'received'}</span>
                  {Number(notif.is_read) !== 1 ? (
                    <button type="button" className="table-action" onClick={() => markUpliftNotificationAsRead(notif.id)}>Mark read</button>
                  ) : null}
                  <button type="button" className="table-action danger" onClick={() => deleteUpliftNotification(notif.id)}>Delete</button>
                </div>
              </div>
            )) : <p>No operational notifications.</p>}
          </div>
          {upliftNotifications.length ? <Pagination {...upliftPager} label="notifications" /> : null}
        </article>
      ) : null}

      {activeView === 'performance' ? (
        <article className="panel-card">
          <h3>My Performance — KG asked vs KG used</h3>

          <div className="invoice-filter-bar">
            <label>
              From
              <input
                type="date"
                value={perfFilters.start_date}
                onChange={(e) => setPerfFilters({ ...perfFilters, start_date: e.target.value })}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={perfFilters.end_date}
                onChange={(e) => setPerfFilters({ ...perfFilters, end_date: e.target.value })}
              />
            </label>
            <button
              type="button"
              className="table-action ghost"
              onClick={() => setPerfFilters({ start_date: '', end_date: '' })}
            >Reset</button>
            <select
              aria-label="Download performance report"
              className="table-action ghost"
              style={{ maxWidth: 220 }}
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value;
                e.target.value = '';
                if (v === 'summary') downloadMyPerformanceSummaryCsv();
                if (v === 'weekly') downloadMyPerformanceWeeklyCsv();
                if (v === 'seven') downloadMySevenDayCsv();
              }}
            >
              <option value="">Download report…</option>
              <option value="summary">Summary totals (CSV)</option>
              <option value="weekly">Weekly breakdown (CSV)</option>
              <option value="seven">7-day outlook (CSV)</option>
            </select>
          </div>

          <div className="perf-graph">
            {(performance.summary || []).length ? (performance.summary || []).map((row) => {
              const asked = Number(row.asked_kg) || 0;
              const used = Number(row.used_kg) || 0;
              const max = Math.max(...(performance.summary || []).map((r) => Math.max(Number(r.asked_kg) || 0, Number(r.used_kg) || 0)), 1);
              const askedPct = Math.max(2, Math.round((asked / max) * 100));
              const usedPct = Math.max(0, Math.round((used / max) * 100));
              const perfClass = row.performance_pct >= 80 ? 'perf-good' : row.performance_pct >= 50 ? 'perf-mid' : 'perf-low';
              return (
                <div key={row.exporter_id} className="perf-graph-row">
                  <div className="perf-graph-name">
                    <strong>Total ({row.exporter_name})</strong>
                    <small>{Number(row.bookings || 0)} booking{Number(row.bookings || 0) === 1 ? '' : 's'}</small>
                  </div>
                  <div className="perf-graph-bars">
                    <div className="perf-graph-bar perf-asked"><i style={{ width: `${askedPct}%` }} /><span>Asked {asked.toLocaleString('en-US')} kg</span></div>
                    <div className="perf-graph-bar perf-used"><i style={{ width: `${usedPct}%` }} /><span>Used {used.toLocaleString('en-US')} kg</span></div>
                  </div>
                  <div className={`perf-graph-pct ${perfClass}`}>{row.performance_pct}%</div>
                </div>
              );
            }) : <p className="muted-cell">No performance data yet — submit and uplift bookings to populate this view.</p>}
          </div>

          {(performance.weekly || []).length ? (
            <>
              <h4 style={{ marginTop: '1.5rem' }}>Weekly breakdown</h4>
              <div className="perf-graph">
                {(performance.weekly || []).map((row) => {
                  const asked = Number(row.asked_kg) || 0;
                  const used = Number(row.used_kg) || 0;
                  const max = Math.max(...(performance.weekly || []).map((r) => Math.max(Number(r.asked_kg) || 0, Number(r.used_kg) || 0)), 1);
                  const askedPct = Math.max(2, Math.round((asked / max) * 100));
                  const usedPct = Math.max(0, Math.round((used / max) * 100));
                  const perfClass = row.performance_pct >= 80 ? 'perf-good' : row.performance_pct >= 50 ? 'perf-mid' : 'perf-low';
                  return (
                    <div key={`${row.exporter_id}-${row.week}`} className="perf-graph-row">
                      <div className="perf-graph-name">
                        <strong>Week {row.week}</strong>
                        <small>{row.exporter_name}</small>
                      </div>
                      <div className="perf-graph-bars">
                        <div className="perf-graph-bar perf-asked"><i style={{ width: `${askedPct}%` }} /><span>Asked {asked.toLocaleString('en-US')} kg</span></div>
                        <div className="perf-graph-bar perf-used"><i style={{ width: `${usedPct}%` }} /><span>Used {used.toLocaleString('en-US')} kg</span></div>
                      </div>
                      <div className={`perf-graph-pct ${perfClass}`}>{row.performance_pct}%</div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          <h4 style={{ marginTop: '1.5rem' }}>7-day outlook (your approved bookings)</h4>
          <p className="muted-cell" style={{ marginBottom: '0.75rem' }}>
            Same rolling view as airline analysts: each day shows planned vs uplift-used weight for flights on that calendar date.
          </p>
          <div className="seven-day-scroll" style={{ maxHeight: 320, overflow: 'auto' }}>
            <div className="seven-day-grid">
              {mySevenDayPerformance.map((day) => (
                <div key={day.day} className={`seven-day-card${day.rows.length ? '' : ' empty'}`}>
                  <strong className="seven-day-label">{day.label}</strong>
                  <div className="seven-day-stats">
                    <div><span>Planned</span><strong>{day.plannedKg.toLocaleString('en-US')} kg</strong></div>
                    <div><span>Used</span><strong>{day.usedKg.toLocaleString('en-US')} kg</strong></div>
                    <div><span>Perf.</span><strong>{day.performance}%</strong></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </article>
      ) : null}

      {showBookingModal ? (
        <div className="smart-grid-modal-overlay">
          <div className="smart-grid-modal" role="dialog" aria-label="Booking Smart Grid">
            <div className="smart-grid-head">
              <h4>{editingBookingId ? `✏️ Edit Booking #${editingBookingId}` : 'Create Booking Request'}</h4>
              <button 
                className="close-btn" 
                onClick={() => {
                  setShowBookingModal(false);
                  resetBookingForm();
                }}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {editingBookingId && (
              <div style={{ 
                background: 'linear-gradient(135deg, #e3f2fd 0%, #f0f7ff 100%)', 
                padding: '1rem 1.2rem', 
                borderRadius: '10px', 
                marginBottom: '1rem',
                border: '2px solid #2196f3',
                boxShadow: '0 2px 8px rgba(33, 150, 243, 0.15)'
              }}>
                <strong style={{ color: '#1976d2', fontSize: '1.05rem' }}>✏️ Edit Booking #{editingBookingId}</strong>
                <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.95rem', color: '#333', fontWeight: '500' }}>
                  You can modify flight date (published dates only), skids, and weight. Approved bookings: changes allowed only until 24 hours before the flight date.
                </p>
              </div>
            )}

            {effectiveCapacity && !editingBookingId && (
              <div className="capacity-info-strip">
                <div className="capacity-info-item">
                  <strong>{effectiveCapacity.airline}</strong>
                </div>
                <div className="capacity-info-item">
                  <span className="label">Managed By</span>
                  <strong>Airline Analyst Upload</strong>
                </div>
                <div className="capacity-info-item">
                  <span className="label">Available Skids:</span>
                  <strong>{toNumber(effectiveCapacity.free_skids)}</strong>
                </div>
                <div className="capacity-info-item">
                  <span className="label">Available Weight:</span>
                  <strong>{toNumber(effectiveCapacity.free_kg).toLocaleString('en-US')} kg</strong>
                </div>
                {exceedsCapacityMidWeek && (
                  <div className="capacity-warning-inline">
                    Requested space is above current published availability.
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleBook}>
              <div className="booking-form-container">
                <div className="form-group">
                  <label htmlFor="flight_date">
                    Flight date * {editingBookingId && <span style={{ color: '#00c853', fontWeight: '600' }}>(editable)</span>}
                  </label>
                  <select
                    id="flight_date"
                    value={form.flight_date}
                    onChange={(event) => {
                      setSelectedCapacityId('');
                      setForm({ ...form, flight_date: event.target.value, capacity_id: '' });
                    }}
                    required
                    style={editingBookingId ? {
                      border: '2px solid #00c853',
                      backgroundColor: '#f0fff4'
                    } : {}}
                  >
                    <option value="">{flightDateSelectOptions.length ? 'Select published flight date' : 'No published dates — check Space Availability'}</option>
                    {flightDateSelectOptions.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="transit_airport">Transit airport {editingBookingId && '(not editable)'}</label>
                  <input
                    id="transit_airport"
                    type="text"
                    value={form.transit_airport}
                    onChange={(event) => setForm({ ...form, transit_airport: normalizeText(event.target.value) })}
                    placeholder="e.g. ADD"
                    disabled={!!editingBookingId}
                    style={editingBookingId ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="destination">Destination * {editingBookingId && '(not editable)'}</label>
                  <input
                    id="destination"
                    type="text"
                    list="live-destination-options"
                    value={form.destination}
                    onChange={(event) => {
                      setSelectedCapacityId('');
                      setForm({ ...form, destination: normalizeText(event.target.value), capacity_id: '' });
                    }}
                    placeholder="e.g., BRU, DXB, CDG"
                    required
                    disabled={!!editingBookingId}
                    style={editingBookingId ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
                  />
                  <datalist id="live-destination-options">
                    {destinationOptions.map((destination) => (
                      <option key={destination} value={destination} />
                    ))}
                  </datalist>
                </div>

                <div className="form-group">
                  <label htmlFor="airline_id">Airline * {editingBookingId && '(not editable)'}</label>
                  <select
                    id="airline_id"
                    value={form.airline_id}
                    onChange={(event) => {
                      setSelectedCapacityId('');
                      setForm({ ...form, airline_id: event.target.value, capacity_id: '' });
                    }}
                    required
                    disabled={!!editingBookingId}
                    style={editingBookingId ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
                  >
                    <option value="">Select airline</option>
                    {airlineOptions.map((airline) => (
                      <option key={airline.id} value={airline.id}>{airline.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="skids">
                    Number of skids (whole numbers only) * {editingBookingId && <span style={{ color: '#00c853', fontWeight: '600' }}>(editable)</span>}
                  </label>
                  <input
                    id="skids"
                    type="number"
                    min="1"
                    step="1"
                    value={form.skids}
                    onChange={(event) => {
                      const v = event.target.value;
                      if (v === '') {
                        setForm({ ...form, skids: '' });
                        return;
                      }
                      const n = Math.max(1, Math.round(Number(v)));
                      setForm({ ...form, skids: String(Number.isFinite(n) ? n : '') });
                    }}
                    required
                    style={editingBookingId ? { 
                      border: '2px solid #00c853',
                      backgroundColor: '#f0fff4'
                    } : {}}
                  />
                </div>

                <div className="form-group weight-group">
                  <label htmlFor="tonnage_kg">
                    Weight ({weightUnit.toUpperCase()}) * {editingBookingId && <span style={{ color: '#00c853', fontWeight: '600' }}>(editable)</span>}
                  </label>
                  <div className="weight-input-row">
                    <input
                      id="tonnage_kg"
                      type="number"
                      min="1"
                      step="0.1"
                      value={form.tonnage_kg}
                      onChange={(event) => setForm({ ...form, tonnage_kg: event.target.value })}
                      required
                      style={editingBookingId ? { 
                        border: '2px solid #00c853',
                        backgroundColor: '#f0fff4'
                      } : {}}
                    />
                    <div className="weight-unit-buttons">
                      <button
                        type="button"
                        className={`unit-btn ${weightUnit === 'kg' ? 'active' : ''}`}
                        onClick={() => {
                          if (weightUnit !== 'kg' && form.tonnage_kg) {
                            setForm({ ...form, tonnage_kg: String(Number(form.tonnage_kg) * 1000) });
                          }
                          setWeightUnit('kg');
                        }}
                        title="Switch to kilograms"
                      >
                        KG
                      </button>
                      <button
                        type="button"
                        className={`unit-btn ${weightUnit === 'tonne' ? 'active' : ''}`}
                        onClick={() => {
                          if (weightUnit !== 'tonne' && form.tonnage_kg) {
                            setForm({ ...form, tonnage_kg: String(Number(form.tonnage_kg) / 1000) });
                          }
                          setWeightUnit('tonne');
                        }}
                        title="Switch to tonnes"
                      >
                        TONNE
                      </button>
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="commodity">Commodity * {editingBookingId && '(not editable)'}</label>
                  <select
                    id="commodity"
                    value={form.commodity}
                    onChange={(event) => setForm({ ...form, commodity: event.target.value })}
                    required
                    disabled={!!editingBookingId}
                    style={editingBookingId ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
                  >
                    <option value="">— Select —</option>
                    {COMMODITY_OPTIONS.map((commodity) => (
                      <option key={commodity} value={commodity}>{commodity}</option>
                    ))}
                  </select>
                </div>

                {form.commodity === 'Others' && (
                  <div className="form-group">
                    <label htmlFor="custom_commodity">Specify commodity * {editingBookingId && '(not editable)'}</label>
                    <input
                      id="custom_commodity"
                      type="text"
                      placeholder="e.g. Medical supplies"
                      value={customCommodity}
                      onChange={(event) => setCustomCommodity(event.target.value)}
                      required={form.commodity === 'Others'}
                      disabled={!!editingBookingId}
                      style={editingBookingId ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="bsa_type">BSA / Non-BSA * {editingBookingId && '(not editable)'}</label>
                  <select
                    id="bsa_type"
                    value={form.bsa_type}
                    onChange={(event) => setForm({ ...form, bsa_type: event.target.value })}
                    required
                    disabled={!!editingBookingId}
                    style={editingBookingId ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
                  >
                    <option value="">— Select —</option>
                    <option value="BSA">BSA</option>
                    <option value="Non-BSA">Non-BSA</option>
                  </select>
                </div>
              </div>

              {message && (
                <div className={`form-message ${message.includes('error') || message.includes('Error') ? 'error' : 'success'}`}>
                  {message}
                </div>
              )}

              <div className="smart-grid-footer">
                <button 
                  type="button" 
                  className="cancel-btn"
                  onClick={() => {
                    setShowBookingModal(false);
                    resetBookingForm();
                  }}
                >
                  Cancel
                </button>
                {editingBookingId ? (
                  <button
                    type="button"
                    className="search-submit"
                    onClick={() => handleUpdatePendingBooking(editingBookingId)}
                    style={{ 
                      fontSize: '1.05rem', 
                      padding: '0.85rem 2rem',
                      background: '#00c853',
                      boxShadow: '0 4px 15px rgba(0, 200, 83, 0.4)'
                    }}
                  >
                    ✓ Update Booking #{editingBookingId}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="table-action"
                      disabled={!canSubmit}
                      onClick={handleSubmitCurrentBooking}
                    >
                      Submit booking
                    </button>
                    <button 
                      className="search-submit" 
                      type="submit" 
                      disabled={!canSubmit}
                    >
                      Save booking
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {shareLinkModal ? (
        <div className="share-link-overlay" role="dialog" aria-label="Shareable document link" onClick={closeShareLinkModal}>
          <div className="share-link-card" onClick={(e) => e.stopPropagation()}>
            <div className="share-link-head">
              <div>
                <h4>🔗 Shareable link ready</h4>
                <p className="muted-cell">{shareLinkModal.fileName}</p>
              </div>
              <button type="button" className="close-btn" onClick={closeShareLinkModal} aria-label="Close share link">✕</button>
            </div>

            <p className="share-link-hint">
              Anyone with this link can open the document in a browser. Valid for 72 hours.
            </p>

            <div className="share-link-row">
              <input
                type="text"
                className="share-link-input"
                value={shareLinkModal.url}
                readOnly
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                className={`share-link-copy-btn${shareLinkCopied ? ' copied' : ''}`}
                onClick={handleCopyShareLinkToClipboard}
                aria-label="Copy link to clipboard"
                title="Copy link"
              >
                {shareLinkCopied ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>

            <div className="share-link-actions">
              <a
                className="table-action"
                href={shareLinkModal.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                👁️ Open in new tab
              </a>
              <button type="button" className="search-submit" onClick={closeShareLinkModal}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
