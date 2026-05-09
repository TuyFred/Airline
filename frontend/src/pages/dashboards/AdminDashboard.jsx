import React, { useEffect, useMemo, useState } from 'react';
import DashboardShell from '../../components/DashboardShell';
import AdminVideoUpload from '../../components/AdminVideoUpload';
import AirlineModal from '../../components/AirlineModal';
import PMCSpaceModal from '../../components/PMCSpaceModal';
import Pagination, { usePagination } from '../../components/Pagination';
import api from '../../services/api';
import '../../styles/DashboardPages.css';
import { PMC_STANDARD_KG, PMC_STANDARD_SKIDS, getDirectionOptions, toPmcTotals } from '../../utils/pmcPlanning';

const initialUserForm = {
  full_name: '',
  email: '',
  password: '',
  role: 'exporter',
  linked_airline: '',
  linked_exporter_id: ''
};

const initialAdminEmailForm = {
  recipientEmail: '',
  subject: '',
  issueDescription: ''
};

function sumCount(rows) {
  return (rows || []).reduce((total, item) => total + Number(item.count || 0), 0);
}

export default function AdminDashboard() {
  const [currentUserId, setCurrentUserId] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [summary, setSummary] = useState({});
  const [users, setUsers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [capacities, setCapacities] = useState([]);
  const [analytics, setAnalytics] = useState({ users: [], bookings: [], invoices: [] });
  const [invoiceRows, setInvoiceRows] = useState([]);
  const [financeRows, setFinanceRows] = useState({ uplift: [], invoiceStatus: [] });
  const [lockHistory, setLockHistory] = useState([]);
  const [airlines, setAirlines] = useState([]);
  const [exporterCompanies, setExporterCompanies] = useState([]);
  const [capacitiesForManager, setCapacitiesForManager] = useState([]);
  const [managementMode, setManagementMode] = useState('airlines');
  const [capacityDateFilter, setCapacityDateFilter] = useState('');
  const [userForm, setUserForm] = useState(initialUserForm);
  const [adminEmailForm, setAdminEmailForm] = useState(initialAdminEmailForm);
  const [airlineForm, setAirlineForm] = useState({ id: '', name: '', code: '', from_destination: '' });
  const [capacityForm, setCapacityForm] = useState({ id: '', airline_id: '', flight_date: '', destination: '', pmc_count: '' });
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingAirlineId, setEditingAirlineId] = useState(null);
  const [editingCapacityId, setEditingCapacityId] = useState(null);
  const [message, setMessage] = useState('');
  const [showMessagePopup, setShowMessagePopup] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [lockingUser, setLockingUser] = useState(null);
  const [whatsappContact, setWhatsappContact] = useState('');
  const [lockReason, setLockReason] = useState('Policy review / compliance');
  const [lockMessage, setLockMessage] = useState('Your account was temporarily locked by admin. Please contact support for reactivation steps.');
  const [maintenanceForm, setMaintenanceForm] = useState({ enabled: false, message: '' });
  const [maintenancePanelLoading, setMaintenancePanelLoading] = useState(false);
  const [invoiceFilters, setInvoiceFilters] = useState({
    exporter_id: '',
    status: '',
    start_date: '',
    end_date: '',
    q: ''
  });
  const [exporterPerformance, setExporterPerformance] = useState({ summary: [], weekly: [] });
  const [perfFilters, setPerfFilters] = useState({ exporter_id: '', start_date: '', end_date: '' });
  const [exporterPricing, setExporterPricing] = useState([]);
  const [pricingForm, setPricingForm] = useState({ exporter_id: '', price_per_kg: '', currency: 'USD', notes: '' });
  const [capacityCrunch, setCapacityCrunch] = useState({ daily: [], weekly: [] });
  const [airlineFormDestinations, setAirlineFormDestinations] = useState([]);
  const [destinationDraft, setDestinationDraft] = useState('');
  const [isMainAdmin, setIsMainAdmin] = useState(false);
  const [weeklyReportFilters, setWeeklyReportFilters] = useState({ exporter_id: '', start_date: '', end_date: '' });
  const [customers, setCustomers] = useState([]);
  const [customerForm, setCustomerForm] = useState({ id: '', name: '', description: '', website: '', sort_order: '0', is_active: true });
  const [customerLogoFile, setCustomerLogoFile] = useState(null);
  const [removeCustomerLogo, setRemoveCustomerLogo] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const customerFileInputKey = `customer-file-${editingCustomerId || 'new'}`;
  const [resetLogs, setResetLogs] = useState([]);
  const [resetLogsLoading, setResetLogsLoading] = useState(false);
  const [resetLogFilters, setResetLogFilters] = useState({ q: '', action: '' });
  const [showAirlineModal, setShowAirlineModal] = useState(false);
  const [showPMCModal, setShowPMCModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  const paidInvoices = invoiceRows.filter((item) => (item.computed_status || item.status) === 'paid').length;
  const overdueInvoices = invoiceRows.filter((item) => (item.computed_status || item.status) === 'overdue').length;
  const pendingInvoices = invoiceRows.filter((item) => {
    const s = item.computed_status || item.status;
    return s !== 'paid' && s !== 'overdue';
  }).length;
  const managerAirlineName = useMemo(() => {
    const found = airlines.find((row) => Number(row.id) === Number(capacityForm.airline_id));
    return found?.name || '';
  }, [airlines, capacityForm.airline_id]);

  const managerDirectionOptions = useMemo(() => {
    const fallback = capacitiesForManager
      .filter((row) => Number(row.airline_id) === Number(capacityForm.airline_id))
      .map((row) => row.destination);
    return getDirectionOptions(managerAirlineName, fallback);
  }, [capacitiesForManager, managerAirlineName, capacityForm.airline_id]);

  const filteredCapacitiesForManager = useMemo(() => (
    capacitiesForManager.filter((c) => !capacityDateFilter || String(c.flight_date || '').slice(0, 10) === capacityDateFilter)
  ), [capacitiesForManager, capacityDateFilter]);

  const airlinesPager = usePagination(airlines, 5);
  const capacitiesManagerPager = usePagination(filteredCapacitiesForManager, 5);
  const invoiceRowsPager = usePagination(invoiceRows, 5);
  const upliftPager = usePagination(financeRows.uplift || [], 5);
  const usersPager = usePagination(users, 5);
  const lockHistoryPager = usePagination(lockHistory, 5);
  const reallocationsPager = usePagination(capacities, 5);

  useEffect(() => {
    try {
      const rawUser = localStorage.getItem('sbu_user');
      const parsedUser = rawUser ? JSON.parse(rawUser) : null;
      setCurrentUserId(parsedUser?.id ? Number(parsedUser.id) : null);
      setIsMainAdmin(!!parsedUser?.is_main_admin);
    } catch {
      setCurrentUserId(null);
      setIsMainAdmin(false);
    }

    const syncTabFromHash = () => {
      const hash = window.location.hash || '';
      const queryPart = hash.includes('?') ? hash.split('?')[1] : '';
      const params = new URLSearchParams(queryPart);
      const tab = params.get('tab');
      if (!tab) {
        window.location.hash = '#dashboard/admin?tab=overview';
        return;
      }
      if (tab && ['overview', 'airlines', 'finance', 'analytics', 'users', 'reallocations', 'media', 'operations'].includes(tab)) {
        setActiveTab(tab);
      }
    };

    syncTabFromHash();
    window.addEventListener('hashchange', syncTabFromHash);
    return () => window.removeEventListener('hashchange', syncTabFromHash);
  }, []);

  const setTab = (tab) => {
    setActiveTab(tab);
    window.location.hash = `#dashboard/admin?tab=${tab}`;
  };

  const loadAll = async () => {
    try {
      const [adminSummary, adminUsers, lockHistoryRows, adminAnalytics, invoiceList, financeDashboard] = await Promise.all([
        api.apiGet('/api/public/dashboards/admin'),
        api.apiGet('/api/users'),
        api.apiGet('/api/users/lock-history').catch(() => []),
        api.apiGet('/api/analytics/admin'),
        api.apiGet('/api/finance/invoices'),
        api.apiGet('/api/finance/dashboard')
      ]);

      const [airlineRows, capacityRows, exporterRows] = await Promise.all([
        api.apiGet('/api/airlines').catch(() => []),
        api.apiGet('/api/capacity').catch(() => []),
        api.apiGet('/api/public/exporters').catch(() => [])
      ]);

      setSummary(adminSummary.summary || {});
      setUsers(adminUsers || []);
      setLockHistory(lockHistoryRows || []);
      setAirlines(airlineRows || []);
      setExporterCompanies(exporterRows || []);
      setCapacitiesForManager(capacityRows || []);
      setBookings(adminSummary.bookings || []);
      setInvoices(adminSummary.invoices || []);
      setCapacities(adminSummary.capacities || []);
      setAnalytics(adminAnalytics || { users: [], bookings: [], invoices: [] });
      setInvoiceRows(invoiceList || []);
      setFinanceRows(financeDashboard || { uplift: [], invoiceStatus: [] });
    } catch (error) {
      setMessage(error.message || 'Failed to load admin dashboard data');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const loadInvoicesWithFilters = async () => {
    try {
      const params = new URLSearchParams();
      if (invoiceFilters.exporter_id) params.set('exporter_id', invoiceFilters.exporter_id);
      if (invoiceFilters.status) params.set('status', invoiceFilters.status);
      if (invoiceFilters.start_date) params.set('start_date', invoiceFilters.start_date);
      if (invoiceFilters.end_date) params.set('end_date', invoiceFilters.end_date);
      if (invoiceFilters.q) params.set('q', invoiceFilters.q);
      const qs = params.toString();
      const rows = await api.apiGet(`/api/finance/invoices${qs ? `?${qs}` : ''}`);
      setInvoiceRows(rows || []);
    } catch (error) {
      setMessage(error.message || 'Failed to refresh invoices');
    }
  };

  useEffect(() => {
    if (activeTab !== 'finance') return;
    loadInvoicesWithFilters();
  }, [invoiceFilters.exporter_id, invoiceFilters.status, invoiceFilters.start_date, invoiceFilters.end_date, invoiceFilters.q, activeTab]);

  const loadExporterPerformance = async () => {
    try {
      const params = new URLSearchParams();
      if (perfFilters.exporter_id) params.set('exporter_id', perfFilters.exporter_id);
      if (perfFilters.start_date) params.set('start_date', perfFilters.start_date);
      if (perfFilters.end_date) params.set('end_date', perfFilters.end_date);
      const qs = params.toString();
      const data = await api.apiGet(`/api/analytics/exporter-performance${qs ? `?${qs}` : ''}`);
      setExporterPerformance(data || { summary: [], weekly: [] });
    } catch (error) {
      setExporterPerformance({ summary: [], weekly: [] });
    }
  };

  useEffect(() => {
    if (activeTab !== 'analytics' && activeTab !== 'finance') return;
    loadExporterPerformance();
  }, [perfFilters.exporter_id, perfFilters.start_date, perfFilters.end_date, activeTab]);

  const loadExporterPricing = async () => {
    try {
      const rows = await api.apiGet('/api/finance/exporter-pricing');
      setExporterPricing(rows || []);
    } catch (err) {
      console.error('Failed to load exporter pricing', err);
    }
  };

  const loadCapacityCrunch = async () => {
    try {
      const data = await api.apiGet('/api/analytics/capacity-crunch');
      setCapacityCrunch(data || { daily: [], weekly: [] });
    } catch (err) {
      setCapacityCrunch({ daily: [], weekly: [] });
    }
  };

  useEffect(() => {
    if (activeTab !== 'finance') return;
    loadExporterPricing();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'analytics') return;
    loadCapacityCrunch();
  }, [activeTab]);

  const loadCustomers = async () => {
    try {
      const rows = await api.apiGet('/api/customers');
      setCustomers(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error('Failed to load customers', error);
      setCustomers([]);
    }
  };

  useEffect(() => {
    if (activeTab !== 'customers') return;
    loadCustomers();
  }, [activeTab]);

  const loadResetLogs = async () => {
    try {
      setResetLogsLoading(true);
      const params = new URLSearchParams();
      if (resetLogFilters.q) params.set('q', resetLogFilters.q);
      if (resetLogFilters.action) params.set('action', resetLogFilters.action);
      params.set('limit', '300');
      const rows = await api.apiGet(`/api/auth/password-reset-logs?${params.toString()}`);
      setResetLogs(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error('Failed to load password-reset logs', error);
      setResetLogs([]);
    } finally {
      setResetLogsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'security') return;
    loadResetLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, resetLogFilters.action]);

  const resetCustomerForm = () => {
    setCustomerForm({ id: '', name: '', description: '', website: '', sort_order: '0', is_active: true });
    setCustomerLogoFile(null);
    setRemoveCustomerLogo(false);
    setEditingCustomerId(null);
  };

  const startEditCustomer = (customer) => {
    setEditingCustomerId(customer.id);
    setCustomerForm({
      id: customer.id,
      name: customer.name || '',
      description: customer.description || '',
      website: customer.website || '',
      sort_order: String(customer.sort_order || 0),
      is_active: !!customer.is_active
    });
    setCustomerLogoFile(null);
    setRemoveCustomerLogo(false);
  };

  const submitCustomerForm = async (event) => {
    event.preventDefault();
    if (!customerForm.name.trim()) {
      setMessage('Customer name is required.');
      return;
    }

    try {
      const payload = new FormData();
      payload.append('name', customerForm.name.trim());
      payload.append('description', customerForm.description || '');
      payload.append('website', customerForm.website || '');
      payload.append('sort_order', String(customerForm.sort_order || 0));
      payload.append('is_active', customerForm.is_active ? 'true' : 'false');
      if (customerLogoFile) payload.append('logo', customerLogoFile);
      if (editingCustomerId && removeCustomerLogo && !customerLogoFile) {
        payload.append('remove_logo', 'true');
      }

      if (editingCustomerId) {
        await api.apiPatch(`/api/customers/${editingCustomerId}`, payload);
        setMessage(`Customer "${customerForm.name.trim()}" updated.`);
      } else {
        await api.apiPost('/api/customers', payload);
        setMessage(`Customer "${customerForm.name.trim()}" added.`);
      }

      resetCustomerForm();
      await loadCustomers();
      window.dispatchEvent(new Event('customers-updated'));
    } catch (error) {
      setMessage(error.message || 'Failed to save customer');
    }
  };

  const removeCustomer = async (customer) => {
    if (!window.confirm(`Remove "${customer.name}" from the homepage?`)) return;
    try {
      await api.apiDelete(`/api/customers/${customer.id}`);
      setMessage(`Customer "${customer.name}" removed.`);
      if (editingCustomerId === customer.id) {
        resetCustomerForm();
      }
      await loadCustomers();
      window.dispatchEvent(new Event('customers-updated'));
    } catch (error) {
      setMessage(error.message || 'Failed to remove customer');
    }
  };

  const toggleCustomerActive = async (customer) => {
    try {
      const payload = new FormData();
      payload.append('name', customer.name);
      payload.append('description', customer.description || '');
      payload.append('website', customer.website || '');
      payload.append('sort_order', String(customer.sort_order || 0));
      payload.append('is_active', customer.is_active ? 'false' : 'true');
      await api.apiPatch(`/api/customers/${customer.id}`, payload);
      await loadCustomers();
      window.dispatchEvent(new Event('customers-updated'));
    } catch (error) {
      setMessage(error.message || 'Failed to update customer visibility');
    }
  };

  const submitPricingForm = async (event) => {
    event.preventDefault();
    if (!pricingForm.exporter_id || !pricingForm.price_per_kg) {
      setMessage('Pick an exporter and enter the agreed price per KG.');
      return;
    }
    try {
      await api.apiPost('/api/finance/exporter-pricing', {
        exporter_id: Number(pricingForm.exporter_id),
        price_per_kg: Number(pricingForm.price_per_kg),
        currency: pricingForm.currency || 'USD',
        notes: pricingForm.notes || ''
      });
      setMessage(`Price saved. New invoices for this exporter will use ${pricingForm.currency || 'USD'} ${Number(pricingForm.price_per_kg).toFixed(2)} / kg.`);
      setPricingForm({ exporter_id: '', price_per_kg: '', currency: 'USD', notes: '' });
      await loadExporterPricing();
    } catch (error) {
      setMessage(error.message || 'Failed to save exporter price');
    }
  };

  const downloadWeeklyInvoiceExcel = async () => {
    try {
      const params = new URLSearchParams();
      if (weeklyReportFilters.exporter_id) params.set('exporter_id', weeklyReportFilters.exporter_id);
      if (weeklyReportFilters.start_date) params.set('start_date', weeklyReportFilters.start_date);
      if (weeklyReportFilters.end_date) params.set('end_date', weeklyReportFilters.end_date);
      const qs = params.toString();
      await api.downloadAuthorizedFile(
        `/api/finance/weekly-invoice-report.xlsx${qs ? `?${qs}` : ''}`,
        `Weekly-Invoices-${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch (error) {
      setMessage(error.message || 'Failed to download weekly invoice report');
    }
  };

  const loadMaintenancePanel = async () => {
    setMaintenancePanelLoading(true);
    try {
      const row = await api.apiGet('/api/admin/maintenance');
      setMaintenanceForm({
        enabled: !!row.maintenance,
        message: row.maintenance_message || ''
      });
    } catch (error) {
      setMessage(error.message || 'Failed to load maintenance settings');
    } finally {
      setMaintenancePanelLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'operations') return;
    loadMaintenancePanel();
  }, [activeTab]);

  const saveMaintenancePanel = async (event) => {
    event.preventDefault();
    try {
      await api.apiPatch('/api/admin/maintenance', {
        maintenance_mode: maintenanceForm.enabled,
        maintenance_message: maintenanceForm.message
      });
      setMessage('Maintenance settings saved. Public users now see updated status.');
      await loadMaintenancePanel();
    } catch (error) {
      setMessage(error.message || 'Failed to save maintenance settings');
    }
  };

  useEffect(() => {
    if (!message) return;
    setShowMessagePopup(true);
    const timer = window.setTimeout(() => setShowMessagePopup(false), 3200);
    return () => window.clearTimeout(timer);
  }, [message]);

  const toggleLock = async (user) => {
    if (Number(user.id) === Number(currentUserId) && !user.is_locked) {
      setMessage('You cannot lock your own account.');
      return;
    }

    // If locking (not unlocking), ask for WhatsApp contact
    if (!user.is_locked) {
      setLockingUser(user);
      setWhatsappContact('');
      setLockReason('Policy review / compliance');
      setLockMessage('Your account was temporarily locked by admin. Please contact support for reactivation steps.');
      setMessage('Enter contact number and lock message for the selected user.');
      return;
    }

    // Proceed with unlock
    try {
      await api.apiPatch(`/api/users/${user.id}/lock`, { is_locked: !user.is_locked });
      setMessage(`${user.full_name} unlocked successfully.`);
      await loadAll();
    } catch (error) {
      setMessage(error.message || 'Failed to update user lock status');
    }
  };

  const confirmLockAccount = async () => {
    if (!lockingUser) return;

    try {
      if (!String(whatsappContact || '').trim()) {
        setMessage('Contact number is required to lock this account.');
        return;
      }

      const result = await api.apiPatch(`/api/users/${lockingUser.id}/lock`, {
        is_locked: true,
        whatsapp_contact: whatsappContact || null,
        lock_reason: lockReason || null,
        admin_message: lockMessage || null
      });
      const waInfo = whatsappContact
        ? (result?.whatsapp_notified ? ' WhatsApp delivered.' : ` WhatsApp pending (${result?.whatsapp_status || 'not sent'}).`)
        : '';
      setMessage(`${lockingUser.full_name} locked. Email notification sent to ${lockingUser.email || 'user'} .${waInfo}`);
      setLockingUser(null);
      setWhatsappContact('');
      setLockReason('Policy review / compliance');
      setLockMessage('Your account was temporarily locked by admin. Please contact support for reactivation steps.');
      await loadAll();
    } catch (error) {
      setMessage(error.message || 'Failed to lock account');
    }
  };

  const cancelLock = () => {
    setLockingUser(null);
    setWhatsappContact('');
    setLockReason('Policy review / compliance');
    setLockMessage('Your account was temporarily locked by admin. Please contact support for reactivation steps.');
    setMessage('');
  };

  const markPaid = async (invoiceId) => {
    try {
      await api.apiPatch(`/api/finance/invoices/${invoiceId}/pay`, {});
      setMessage(`Invoice #${invoiceId} marked as paid.`);
      await loadInvoicesWithFilters();
    } catch (error) {
      setMessage(error.message || 'Failed to mark invoice as paid');
    }
  };

  const setInvoiceStatus = async (invoiceId, newStatus) => {
    try {
      if (newStatus === 'paid') {
        await api.apiPatch(`/api/finance/invoices/${invoiceId}/pay`, {});
        setMessage(`Invoice #${invoiceId} marked as paid.`);
      } else {
        // Local optimistic update for unpaid (we don't currently have an unpay endpoint).
        setInvoiceRows((prev) => prev.map((inv) => (
          Number(inv.id) === Number(invoiceId)
            ? { ...inv, status: 'pending', computed_status: 'unpaid', paid_at: null }
            : inv
        )));
        setMessage(`Invoice #${invoiceId} marked as unpaid (local view).`);
        return;
      }
      await loadInvoicesWithFilters();
    } catch (error) {
      setMessage(error.message || 'Failed to update invoice status');
    }
  };

  const exporterInvoiceTotals = useMemo(() => {
    const map = new Map();
    for (const inv of invoiceRows) {
      const key = inv.exporter_name || `Exporter #${inv.exporter_id || '?'}`;
      if (!map.has(key)) {
        map.set(key, { exporter_name: key, paid: 0, unpaid: 0, overdue: 0, count: 0 });
      }
      const entry = map.get(key);
      const status = inv.computed_status || inv.status || 'unpaid';
      const amount = Number(inv.total_amount) || 0;
      entry.count += 1;
      if (status === 'paid') entry.paid += amount;
      else if (status === 'overdue') entry.overdue += amount;
      else entry.unpaid += amount;
    }
    return Array.from(map.values()).sort((a, b) => (b.unpaid + b.overdue) - (a.unpaid + a.overdue));
  }, [invoiceRows]);

  const runWeeklyInvoice = async () => {
    try {
      await api.apiPost('/api/finance/invoices/run-weekly', {});
      setMessage('Weekly invoice process executed.');
      await loadAll();
    } catch (error) {
      setMessage(error.message || 'Failed to run weekly invoice process');
    }
  };

  const downloadInvoicePdf = async (invoice) => {
    try {
      const safe = String(invoice.invoice_number || `invoice-${invoice.id}`).replace(/[^\w.-]+/g, '_');
      await api.downloadAuthorizedFile(`/api/finance/invoices/${invoice.id}/pdf`, `${safe}.pdf`);
    } catch (error) {
      setMessage(error.message || 'Failed to download invoice PDF');
    }
  };

  const downloadInvoiceExcel = async (invoice) => {
    try {
      const safe = String(invoice.invoice_number || `invoice-${invoice.id}`).replace(/[^\w.-]+/g, '_');
      await api.downloadAuthorizedFile(`/api/finance/invoices/${invoice.id}/excel`, `${safe}.xlsx`);
    } catch (error) {
      setMessage(error.message || 'Failed to download invoice Excel');
    }
  };

  const submitUserForm = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        full_name: userForm.full_name,
        email: userForm.email,
        role: userForm.role,
        linked_airline: ['airline_analyst', 'airline_supervisor'].includes(userForm.role) ? userForm.linked_airline : null,
        linked_exporter_id: ['clearing_agent', 'exporter'].includes(userForm.role) && userForm.linked_exporter_id ? Number(userForm.linked_exporter_id) : null
      };

      if (editingUserId) {
        if (String(userForm.password || '').trim().length) {
          payload.password = userForm.password;
        }
        await api.apiPatch(`/api/users/${editingUserId}`, payload);
        setMessage('User updated successfully.');
      } else {
        payload.password = userForm.password;
        await api.apiPost('/api/users', payload);
        setMessage('New user created successfully.');
      }

      setEditingUserId(null);
      setUserForm(initialUserForm);
      setShowUserModal(false);
      await loadAll();
    } catch (error) {
      setMessage(error.message || 'Failed to save user');
    }
  };

  const startEditUser = (user) => {
    setEditingUserId(user.id);
    setUserForm({
      full_name: user.full_name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'exporter',
      linked_airline: user.linked_airline || '',
      linked_exporter_id: user.linked_exporter_id || ''
    });
    setShowUserModal(true);
    setMessage(`Editing ${user.full_name}. Update fields and click Save Changes.`);
  };

  const startCreateUser = () => {
    setEditingUserId(null);
    setUserForm(initialUserForm);
    setShowUserModal(true);
  };

  const cancelEditUser = () => {
    setEditingUserId(null);
    setUserForm(initialUserForm);
    setShowUserModal(false);
    setMessage('Edit cancelled.');
  };

  const resetAirlineForm = () => {
    setEditingAirlineId(null);
    setAirlineForm({ id: '', name: '', code: '', from_destination: '' });
    setAirlineFormDestinations([]);
    setDestinationDraft('');
  };

  const startEditAirline = (airline) => {
    setEditingAirlineId(airline.id);
    setAirlineForm({
      id: airline.id,
      name: airline.name || '',
      code: airline.code || '',
      from_destination: airline.from_destination || ''
    });
    const destList = Array.isArray(airline.destinations)
      ? airline.destinations.map((d) => ({
          destination: typeof d === 'string' ? d : d.destination,
          is_transit: !!(typeof d === 'object' && d.is_transit)
        }))
      : [];
    setAirlineFormDestinations(destList);
    setDestinationDraft('');
    setShowAirlineModal(true);
  };

  const openAirlineModal = () => {
    resetAirlineForm();
    setShowAirlineModal(true);
  };

  const addDestinationToAirlineForm = () => {
    const value = String(destinationDraft || '').trim();
    if (!value) return;
    if (airlineFormDestinations.some((d) => d.destination.toUpperCase() === value.toUpperCase())) {
      setDestinationDraft('');
      return;
    }
    setAirlineFormDestinations((prev) => [...prev, { destination: value, is_transit: false }]);
    setDestinationDraft('');
  };

  const removeDestinationFromAirlineForm = (destination) => {
    setAirlineFormDestinations((prev) => prev.filter((d) => d.destination !== destination));
  };

  const toggleDestinationTransit = (destination) => {
    setAirlineFormDestinations((prev) => prev.map((d) => (
      d.destination === destination ? { ...d, is_transit: !d.is_transit } : d
    )));
  };

  const submitAirlineForm = async (formData) => {
    setModalLoading(true);
    try {
      const payload = {
        name: formData.name,
        code: formData.code,
        from_destination: formData.from_destination,
        destinations: formData.destinations
      };
      if (editingAirlineId) {
        await api.apiPatch(`/api/airlines/${editingAirlineId}`, payload);
        setMessage('Airline updated successfully.');
      } else {
        await api.apiPost('/api/airlines', payload);
        setMessage('Airline created successfully.');
      }
      resetAirlineForm();
      setShowAirlineModal(false);
      await loadAll();
    } catch (error) {
      setMessage(error.message || 'Failed to save airline');
    } finally {
      setModalLoading(false);
    }
  };

  const deleteAirline = async (airline) => {
    const ok = window.confirm(`Delete airline ${airline.name}? This will also remove related capacity rows.`);
    if (!ok) return;

    try {
      await api.apiDelete(`/api/airlines/${airline.id}`);
      setMessage('Airline deleted successfully.');
      if (editingAirlineId === airline.id) resetAirlineForm();
      await loadAll();
    } catch (error) {
      setMessage(error.message || 'Failed to delete airline');
    }
  };

  const resetCapacityForm = () => {
    setEditingCapacityId(null);
    setCapacityForm({ id: '', airline_id: '', flight_date: '', destination: '', pmc_count: '' });
  };

  const startEditCapacityRecord = (capacity) => {
    setEditingCapacityId(capacity.id);
    setCapacityForm({
      id: capacity.id,
      airline_id: capacity.airline_id,
      flight_date: String(capacity.flight_date || '').slice(0, 10),
      destination: capacity.destination || '',
      pmc_count: String(capacity.total_kg ? (Number(capacity.total_kg) / PMC_STANDARD_KG) : '')
    });
    setShowPMCModal(true);
  };

  const openPMCModal = () => {
    resetCapacityForm();
    setShowPMCModal(true);
  };

  const submitCapacityForm = async (formData) => {
    setModalLoading(true);
    try {
      const totals = toPmcTotals(formData.pmc_count);
      const payload = {
        airline_id: Number(formData.airline_id),
        flight_date: formData.flight_date,
        destination: formData.destination,
        total_skids: totals.skids,
        total_kg: totals.kg,
        pmc_details: `${Number(formData.pmc_count)} PMC`
      };

      if (!payload.airline_id || !payload.flight_date || !payload.destination || !totals.kg || !totals.skids) {
        setMessage('Please select airline and direction, then enter a valid PMC count.');
        setModalLoading(false);
        return;
      }

      await api.apiPost('/api/capacity/upsert', payload);
      setMessage(editingCapacityId ? 'PMC space updated successfully.' : 'PMC space created successfully.');
      resetCapacityForm();
      setShowPMCModal(false);
      await loadAll();
    } catch (error) {
      setMessage(error.message || 'Failed to save PMC space');
    } finally {
      setModalLoading(false);
    }
  };

  const deleteCapacityRecord = async (capacity) => {
    const ok = window.confirm(`Delete PMC space for ${capacity.airline} on ${String(capacity.flight_date).slice(0, 10)}?`);
    if (!ok) return;

    try {
      await api.apiDelete(`/api/capacity/${capacity.id}`);
      setMessage('PMC space deleted successfully.');
      if (editingCapacityId === capacity.id) resetCapacityForm();
      await loadAll();
    } catch (error) {
      setMessage(error.message || 'Failed to delete PMC space');
    }
  };

  const removeUser = async (user) => {
    if (Number(user.id) === Number(currentUserId)) {
      setMessage('You cannot delete your own account.');
      return;
    }

    const ok = window.confirm(`Delete user ${user.full_name} (${user.email})? This cannot be undone.`);
    if (!ok) return;

    try {
      await api.apiDelete(`/api/users/${user.id}`);
      setMessage('User deleted successfully.');
      if (editingUserId === user.id) {
        cancelEditUser();
      }
      await loadAll();
    } catch (error) {
      setMessage(error.message || 'Failed to delete user');
    }
  };

  const sendEmailToUser = async (event) => {
    event.preventDefault();
    try {
      await api.apiPost('/api/support/admin-email', {
        recipientEmail: adminEmailForm.recipientEmail,
        subject: adminEmailForm.subject || undefined,
        issueDescription: adminEmailForm.issueDescription
      });
      setMessage(`Email sent successfully to ${adminEmailForm.recipientEmail}.`);
      setAdminEmailForm(initialAdminEmailForm);
      setShowReplyModal(false);
    } catch (error) {
      setMessage(error.message || 'Failed to send email to target user');
    }
  };

  const prepareReply = (email) => {
    setAdminEmailForm((prev) => ({ ...prev, recipientEmail: email }));
    setShowReplyModal(true);
    setMessage(`Ready to reply to ${email}. Write your response and click Send Email.`);
  };

  return (
    <DashboardShell
      role="Admin"
      title="Executive Command Center"
      subtitle=""
      accent="dashboard-admin"
      sidebarSummary=""
    >
      {activeTab === 'overview' ? (
        <div className="admin-overview-grid" aria-label="Admin dashboard highlights">
          <article className="admin-overview-card blue">
            <span>Bookings</span>
            <strong>{Number(summary.bookingCount || 0)}</strong>
            <p>Total booking records currently tracked.</p>
          </article>
          <article className="admin-overview-card green">
            <span>Invoice Success</span>
            <strong>{paidInvoices}</strong>
            <p>Paid invoices recorded in finance vault.</p>
          </article>
          <article className="admin-overview-card yellow">
            <span>User Registrations</span>
            <strong>{Number(summary.userCount || 0)}</strong>
            <p>Active user accounts in the platform.</p>
          </article>
          <article className="admin-overview-card red">
            <span>Pending Invoices</span>
            <strong>{pendingInvoices}</strong>
            <p>Outstanding invoices requiring follow-up.</p>
          </article>
        </div>
      ) : null}

      <div className="sheet-tabs admin-tabs" role="tablist" aria-label="Admin vault tabs">
        <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Overview</button>
        <button className={activeTab === 'airlines' ? 'active' : ''} onClick={() => setTab('airlines')}>Airlines</button>
        <button className={activeTab === 'customers' ? 'active' : ''} onClick={() => setTab('customers')}>Customers</button>
        <button className={activeTab === 'finance' ? 'active' : ''} onClick={() => setTab('finance')}>Finance</button>
        <button className={activeTab === 'analytics' ? 'active' : ''} onClick={() => setTab('analytics')}>Analytics</button>
        <button className={activeTab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Users</button>
        <button className={activeTab === 'reallocations' ? 'active' : ''} onClick={() => setTab('reallocations')}>Available Space</button>
        <button className={activeTab === 'operations' ? 'active' : ''} onClick={() => setTab('operations')}>Platform</button>
        <button className={activeTab === 'media' ? 'active' : ''} onClick={() => setTab('media')}>🎬 Media</button>
        <button className={activeTab === 'security' ? 'active' : ''} onClick={() => setTab('security')}>🔒 Security</button>
      </div>

      {activeTab === 'airlines' ? (
        <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr' }}>
          <article className="panel-card admin-panel">
            <div className="admin-toolbar" style={{ marginBottom: '1rem', borderBottom: '2px solid rgba(11, 99, 206, 0.1)', paddingBottom: '1rem' }}>
              <div>
                <h3 style={{ marginBottom: '0.5rem' }}>Airline Manager</h3>
                <div className="sheet-tabs" style={{ marginTop: '0.75rem' }}>
                  <button className={managementMode === 'airlines' ? 'active' : ''} onClick={() => setManagementMode('airlines')}>Airlines</button>
                  <button className={managementMode === 'pmc' ? 'active' : ''} onClick={() => setManagementMode('pmc')}>PMC Space</button>
                </div>
              </div>
              <div>
                {managementMode === 'airlines' ? (
                  <button className="search-submit" onClick={openAirlineModal} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>✈️</span> Add Airline
                  </button>
                ) : (
                  <button className="search-submit" onClick={openPMCModal} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>📦</span> Add PMC Space
                  </button>
                )}
              </div>
            </div>

            {managementMode === 'airlines' ? (
              <>
                <div className="admin-toolbar">
                  <div>
                    <h3>Airline Directory</h3>
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="admin-management-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Code</th>
                        <th>From</th>
                        <th>To Destinations</th>
                        <th>Active spaces</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {airlinesPager.pagedItems.map((airline) => (
                        <tr key={airline.id}>
                          <td><strong>{airline.name}</strong></td>
                          <td>{airline.code || '—'}</td>
                          <td>{airline.from_destination || '—'}</td>
                          <td>
                            {(airline.destinations || []).length ? (
                              <div className="destination-chips compact">
                                {(airline.destinations || []).map((d) => (
                                  <span key={d.destination} className={`destination-chip small ${d.is_transit ? 'transit' : ''}`}>
                                    {d.destination}{d.is_transit ? ' (transit)' : ''}
                                  </span>
                                ))}
                              </div>
                            ) : <span className="muted-cell">—</span>}
                          </td>
                          <td>{airline.capacity_count || 0}</td>
                          <td>
                            <div className="inline-actions">
                              <button className="table-action admin-action" onClick={() => startEditAirline(airline)}>Edit</button>
                              <button className="table-action danger admin-action" onClick={() => deleteAirline(airline)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!airlines.length ? <tr><td colSpan="6">No airlines found.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
                {airlines.length ? <Pagination {...airlinesPager} label="airlines" compact /> : null}
              </>
            ) : (
              <>
                <div className="admin-toolbar">
                  <div>
                    <h3>PMC Space Directory</h3>
                  </div>
                  <div>
                    <input
                      type="date"
                      value={capacityDateFilter}
                      onChange={(event) => setCapacityDateFilter(event.target.value)}
                      style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.9rem' }}
                    />
                    {capacityDateFilter ? (
                      <button className="table-action" onClick={() => setCapacityDateFilter('')} style={{ marginLeft: '0.4rem' }}>Clear</button>
                    ) : null}
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="admin-management-table">
                    <thead>
                      <tr>
                        <th>Airline</th>
                        <th>Date</th>
                        <th>Destination</th>
                        <th>Total KG</th>
                        <th>Total Skids</th>
                        <th>Booked KG</th>
                        <th>Booked Skids</th>
                        <th>Available KG</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {capacitiesManagerPager.pagedItems.map((capacity) => (
                        <tr key={capacity.id}>
                          <td>{capacity.airline}</td>
                          <td>{String(capacity.flight_date || '').slice(0, 10)}</td>
                          <td>{capacity.destination}</td>
                          <td>{Number(capacity.total_kg || 0).toLocaleString('en-US')}</td>
                          <td>{Number(capacity.total_skids || 0)}</td>
                          <td>{Number(capacity.booked_kg || 0).toLocaleString('en-US')}</td>
                          <td>{Number(capacity.booked_skids || 0)}</td>
                          <td><strong>{Math.max(0, Number(capacity.total_kg || 0) - Number(capacity.booked_kg || 0)).toLocaleString('en-US')}</strong></td>
                          <td><span className={`status-pill ${capacity.status}`}>{String(capacity.status || '').toUpperCase()}</span></td>
                          <td>
                            <div className="inline-actions">
                              <button className="table-action admin-action" onClick={() => startEditCapacityRecord(capacity)}>Edit</button>
                              <button className="table-action danger admin-action" onClick={() => deleteCapacityRecord(capacity)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!filteredCapacitiesForManager.length
                        ? <tr><td colSpan="10">{capacityDateFilter ? `No capacity records for ${capacityDateFilter}.` : 'No PMC space records found.'}</td></tr> : null}
                    </tbody>
                  </table>
                </div>
                {filteredCapacitiesForManager.length ? <Pagination {...capacitiesManagerPager} label="capacity records" compact /> : null}
              </>
            )}
          </article>
        </div>
      ) : null}

      {activeTab === 'overview' ? (
        <article className="panel-card admin-panel">
          <h3>Admin Overview</h3>
        </article>
      ) : null}

      {activeTab === 'customers' ? (
        <div className="dashboard-grid admin-customers-layout">
          <article className="panel-card admin-panel admin-customer-form-card">
            <div className="admin-toolbar">
              <h3>{editingCustomerId ? 'Edit Customer' : 'Add a Customer'}</h3>
              {editingCustomerId ? (
                <button type="button" className="table-action" onClick={resetCustomerForm}>
                  + New customer
                </button>
              ) : null}
            </div>

            <form className="booking-form compact-form" onSubmit={submitCustomerForm}>
              <label>
                Brand name *
                <input
                  type="text"
                  required
                  value={customerForm.name}
                  onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })}
                  placeholder="e.g., Garden Fresh"
                />
              </label>

              <label>
                Website
                <input
                  type="url"
                  value={customerForm.website}
                  onChange={(event) => setCustomerForm({ ...customerForm, website: event.target.value })}
                  placeholder="https://www.example.com"
                />
              </label>

              <label className="full-width">
                Brand description
                <textarea
                  rows="3"
                  value={customerForm.description}
                  onChange={(event) => setCustomerForm({ ...customerForm, description: event.target.value })}
                  placeholder="Short description shown on the homepage card"
                />
              </label>

              <label>
                Sort order
                <input
                  type="number"
                  min="0"
                  value={customerForm.sort_order}
                  onChange={(event) => setCustomerForm({ ...customerForm, sort_order: event.target.value })}
                />
              </label>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={customerForm.is_active}
                  onChange={(event) => setCustomerForm({ ...customerForm, is_active: event.target.checked })}
                />
                <span>Visible on homepage</span>
              </label>

              <label className="full-width">
                Brand logo {editingCustomerId ? '(leave empty to keep current)' : ''}
                <input
                  key={customerFileInputKey}
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    setCustomerLogoFile(event.target.files?.[0] || null);
                    setRemoveCustomerLogo(false);
                  }}
                />
              </label>

              {editingCustomerId ? (
                <label className="checkbox-row full-width">
                  <input
                    type="checkbox"
                    checked={removeCustomerLogo}
                    onChange={(event) => {
                      setRemoveCustomerLogo(event.target.checked);
                      if (event.target.checked) setCustomerLogoFile(null);
                    }}
                  />
                  <span>Remove existing logo</span>
                </label>
              ) : null}

              <div className="modal-button-group full-width">
                <button type="submit" className="search-submit">
                  {editingCustomerId ? 'Save changes' : 'Add customer'}
                </button>
                {editingCustomerId ? (
                  <button type="button" className="table-action" onClick={resetCustomerForm}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </article>

          <article className="panel-card admin-panel admin-customer-list-card">
            <div className="admin-toolbar">
              <h3>Homepage Customers</h3>
              <span className="status-pill">{customers.length} total</span>
            </div>

            {customers.length === 0 ? (
              <p className="muted-cell">No customers yet — add one on the left.</p>
            ) : (
              <div className="admin-customer-grid">
                {customers.map((customer) => (
                  <article key={customer.id} className={`admin-customer-card${customer.is_active ? '' : ' is-hidden'}`}>
                    <div className="admin-customer-logo">
                      {customer.logo ? (
                        <img src={customer.logo} alt={`${customer.name} logo`} />
                      ) : (
                        <div className="admin-customer-logo-placeholder">
                          {String(customer.name || '?').slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="admin-customer-body">
                      <div className="admin-customer-head">
                        <strong>{customer.name}</strong>
                        <span className={`status-pill ${customer.is_active ? 'live' : 'pending'}`}>
                          {customer.is_active ? 'Visible' : 'Hidden'}
                        </span>
                      </div>
                      {customer.description ? <p>{customer.description}</p> : null}
                      {customer.website ? (
                        <a className="admin-customer-link" href={customer.website} target="_blank" rel="noopener noreferrer">
                          {customer.website}
                        </a>
                      ) : null}
                      <div className="admin-customer-actions">
                        <button type="button" className="table-action" onClick={() => startEditCustomer(customer)}>Edit</button>
                        <button type="button" className="table-action" onClick={() => toggleCustomerActive(customer)}>
                          {customer.is_active ? 'Hide' : 'Show'}
                        </button>
                        <button type="button" className="admin-action danger" onClick={() => removeCustomer(customer)}>Remove</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </article>
        </div>
      ) : null}

      {activeTab === 'finance' ? (
        <div className="dashboard-grid finance-layout">
          <article className="panel-card admin-panel finance-pricing-card">
            <h3>Exporter Pricing</h3>
            <form className="booking-form compact-form" onSubmit={submitPricingForm}>
              <label>
                Exporter *
                <select
                  value={pricingForm.exporter_id}
                  onChange={(e) => {
                    const selected = exporterPricing.find((row) => Number(row.exporter_id) === Number(e.target.value));
                    setPricingForm({
                      ...pricingForm,
                      exporter_id: e.target.value,
                      price_per_kg: selected?.price_per_kg ? String(selected.price_per_kg) : pricingForm.price_per_kg,
                      currency: selected?.currency || 'USD',
                      notes: selected?.notes || ''
                    });
                  }}
                  required
                >
                  <option value="">Select an exporter…</option>
                  {(exporterCompanies || []).map((ex) => (
                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Price per KG *
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pricingForm.price_per_kg}
                  onChange={(e) => setPricingForm({ ...pricingForm, price_per_kg: e.target.value })}
                  placeholder="e.g. 5.00"
                  required
                />
              </label>
              <label>
                Currency
                <select
                  value={pricingForm.currency}
                  onChange={(e) => setPricingForm({ ...pricingForm, currency: e.target.value })}
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="RWF">RWF</option>
                  <option value="KES">KES</option>
                </select>
              </label>
              <label className="full-width">
                Notes (optional)
                <input
                  type="text"
                  value={pricingForm.notes}
                  onChange={(e) => setPricingForm({ ...pricingForm, notes: e.target.value })}
                  placeholder="e.g. Q3 contract, valid until Dec"
                />
              </label>
              <div className="modal-button-group full-width">
                <button type="submit" className="search-submit">💾 Save price</button>
                <button type="button" className="table-action" onClick={() => setPricingForm({ exporter_id: '', price_per_kg: '', currency: 'USD', notes: '' })}>Clear</button>
              </div>
            </form>

            {exporterPricing.length ? (
              <div className="pricing-list">
                <h4>Saved rates</h4>
                <ul>
                  {exporterPricing.map((row) => (
                    <li key={row.exporter_id}>
                      <strong>{row.exporter_name}</strong>
                      <span>{row.currency || 'USD'} {Number(row.price_per_kg).toFixed(2)} / kg</span>
                      {row.notes ? <small className="muted-cell">{row.notes}</small> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>

          <article className="panel-card admin-panel finance-weekly-card">
            <h3>Run Weekly Invoices</h3>
            <div className="invoice-filter-bar">
              <label>
                Exporter
                <select
                  value={weeklyReportFilters.exporter_id}
                  onChange={(e) => setWeeklyReportFilters({ ...weeklyReportFilters, exporter_id: e.target.value })}
                >
                  <option value="">All exporters</option>
                  {(exporterCompanies || []).map((ex) => (
                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                  ))}
                </select>
              </label>
              <label>
                From
                <input
                  type="date"
                  value={weeklyReportFilters.start_date}
                  onChange={(e) => setWeeklyReportFilters({ ...weeklyReportFilters, start_date: e.target.value })}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={weeklyReportFilters.end_date}
                  onChange={(e) => setWeeklyReportFilters({ ...weeklyReportFilters, end_date: e.target.value })}
                />
              </label>
            </div>
            <div className="modal-button-group">
              <button type="button" className="search-submit" onClick={downloadWeeklyInvoiceExcel}>📊 Download as Excel</button>
              <button type="button" className="table-action admin-action" onClick={runWeeklyInvoice}>⚡ Run Weekly Invoice job</button>
              <button type="button" className="table-action ghost" onClick={() => setWeeklyReportFilters({ exporter_id: '', start_date: '', end_date: '' })}>Reset</button>
            </div>
          </article>

          <article className="panel-card admin-panel full-span-card">
            <h3>Invoice Control</h3>

            <div className="invoice-filter-bar">
              <label>
                Exporter
                <select
                  value={invoiceFilters.exporter_id}
                  onChange={(e) => setInvoiceFilters({ ...invoiceFilters, exporter_id: e.target.value })}
                >
                  <option value="">All exporters</option>
                  {(exporterCompanies || []).map((ex) => (
                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  value={invoiceFilters.status}
                  onChange={(e) => setInvoiceFilters({ ...invoiceFilters, status: e.target.value })}
                >
                  <option value="">All statuses</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </label>
              <label>
                From
                <input
                  type="date"
                  value={invoiceFilters.start_date}
                  onChange={(e) => setInvoiceFilters({ ...invoiceFilters, start_date: e.target.value })}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={invoiceFilters.end_date}
                  onChange={(e) => setInvoiceFilters({ ...invoiceFilters, end_date: e.target.value })}
                />
              </label>
              <label className="invoice-search-field">
                Search
                <input
                  type="search"
                  placeholder="Invoice # or exporter..."
                  value={invoiceFilters.q}
                  onChange={(e) => setInvoiceFilters({ ...invoiceFilters, q: e.target.value })}
                />
              </label>
              <button
                type="button"
                className="table-action ghost"
                onClick={() => setInvoiceFilters({ exporter_id: '', status: '', start_date: '', end_date: '', q: '' })}
              >Reset</button>
            </div>

            <div className="invoice-stat-row">
              <span className="status-pill confirmed">Paid: {paidInvoices}</span>
              <span className="status-pill pending">Unpaid: {pendingInvoices}</span>
              <span className="status-pill full">Overdue: {overdueInvoices}</span>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Exporter</th>
                    <th>Bookings</th>
                    <th>AWB code(s)</th>
                    <th>KG</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Due</th>
                    <th>PDF</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceRowsPager.pagedItems.map((invoice) => {
                    const status = invoice.computed_status || invoice.status || 'unpaid';
                    return (
                      <tr key={invoice.id}>
                        <td><strong>{invoice.invoice_number || `#${invoice.id}`}</strong></td>
                        <td>{invoice.exporter_name}</td>
                        <td>{invoice.booking_ids ? `#${invoice.booking_ids}` : '—'}</td>
                        <td className="awb-cell" title={invoice.awb_numbers || ''}>{invoice.awb_numbers || '—'}</td>
                        <td>{Number(invoice.total_kg || 0).toLocaleString('en-US')}</td>
                        <td>{Number(invoice.total_amount || 0).toLocaleString('en-US')}</td>
                        <td><span className={`status-pill ${status}`}>{status}</span></td>
                        <td>{invoice.due_date ? String(invoice.due_date).slice(0, 10) : '—'}</td>
                        <td className="invoice-action-cell">
                          <button type="button" className="table-action admin-action" onClick={() => downloadInvoicePdf(invoice)} title="Download PDF">
                            📄 PDF
                          </button>
                          <button type="button" className="table-action admin-action invoice-action-excel" onClick={() => downloadInvoiceExcel(invoice)} title="Download Excel">
                            🟢 Excel
                          </button>
                        </td>
                        <td>
                          <select
                            className={`invoice-status-select ${status}`}
                            value={status === 'paid' ? 'paid' : 'unpaid'}
                            onChange={(e) => setInvoiceStatus(invoice.id, e.target.value)}
                          >
                            <option value="paid">Paid</option>
                            <option value="unpaid">Unpaid</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                  {!invoiceRows.length ? <tr><td colSpan="10">No invoices match the current filters.</td></tr> : null}
                </tbody>
              </table>
            </div>
            {invoiceRows.length ? <Pagination {...invoiceRowsPager} label="invoices" compact /> : null}
          </article>

          <article className="panel-card admin-panel full-span-card">
            <h3>Invoice Status</h3>

            {exporterInvoiceTotals.some((row) => row.unpaid + row.overdue > 0) ? (
              <div className="invoice-alert-banner">
                ⚠️ {exporterInvoiceTotals.filter((row) => row.unpaid + row.overdue > 0).length} exporter(s) have outstanding balances. Follow up with their finance teams.
              </div>
            ) : null}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Exporter</th>
                    <th>Invoices</th>
                    <th>Paid</th>
                    <th>Unpaid</th>
                    <th>Overdue</th>
                    <th>Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {exporterInvoiceTotals.length ? exporterInvoiceTotals.map((row) => {
                    const outstanding = row.unpaid + row.overdue;
                    return (
                      <tr key={row.exporter_name} className={outstanding > 0 ? 'row-outstanding' : ''}>
                        <td><strong>{row.exporter_name}</strong></td>
                        <td>{row.count}</td>
                        <td className="amount-paid">{row.paid.toLocaleString('en-US')}</td>
                        <td className="amount-unpaid">{row.unpaid.toLocaleString('en-US')}</td>
                        <td className="amount-overdue">{row.overdue.toLocaleString('en-US')}</td>
                        <td><strong>{outstanding.toLocaleString('en-US')}</strong></td>
                      </tr>
                    );
                  }) : <tr><td colSpan="6">No invoices yet — totals will appear once invoices are auto-generated.</td></tr>}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      ) : null}

      {activeTab === 'analytics' ? (
        <div className="dashboard-grid analytics-layout">
          <article className="panel-card admin-panel">
            <h3>Role Distribution</h3>
            <div className="inline-tags">
              {(analytics.users || []).map((item) => (
                <span key={item.role}>{item.role}: {item.count}</span>
              ))}
            </div>
            <h3 className="subsection-title">Booking States</h3>
            <div className="inline-tags">
              {(analytics.bookings || []).map((item) => (
                <span key={item.status}>{item.status}: {item.count}</span>
              ))}
            </div>
            <h3 className="subsection-title">Invoice States</h3>
            <div className="inline-tags">
              {(analytics.invoices || []).map((item, index) => (
                <span key={`${item.status}-${index}`}>{item.status}: {item.count}</span>
              ))}
            </div>

            <div className="admin-mini-chart">
              {(capacities || []).slice(0, 6).map((row, index) => {
                const total = Number(row.total_kg || 0);
                const booked = Number(row.booked_kg || 0);
                const pct = total > 0 ? Math.round((booked / total) * 100) : 0;
                return (
                  <div className="admin-bar-row" key={`${row.airline}-${index}`}>
                    <span>{row.airline}</span>
                    <div><i style={{ width: `${Math.max(8, pct)}%` }} /></div>
                    <strong>{pct}%</strong>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="panel-card admin-panel">
            <h3>Exporter Performance Percentage</h3>
            <div className="invoice-filter-bar">
              <label>
                Exporter
                <select
                  value={perfFilters.exporter_id}
                  onChange={(e) => setPerfFilters({ ...perfFilters, exporter_id: e.target.value })}
                >
                  <option value="">All exporters</option>
                  {(exporterCompanies || []).map((ex) => (
                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                  ))}
                </select>
              </label>
              <label>
                From
                <input type="date" value={perfFilters.start_date} onChange={(e) => setPerfFilters({ ...perfFilters, start_date: e.target.value })} />
              </label>
              <label>
                To
                <input type="date" value={perfFilters.end_date} onChange={(e) => setPerfFilters({ ...perfFilters, end_date: e.target.value })} />
              </label>
              <button type="button" className="table-action ghost" onClick={() => setPerfFilters({ exporter_id: '', start_date: '', end_date: '' })}>Reset</button>
            </div>
            <div className="perf-graph">
              {(exporterPerformance.summary || []).length ? (exporterPerformance.summary || []).map((row) => {
                const asked = Number(row.asked_kg) || 0;
                const used = Number(row.used_kg) || 0;
                const max = Math.max(...(exporterPerformance.summary || []).map((r) => Math.max(Number(r.asked_kg) || 0, Number(r.used_kg) || 0)), 1);
                const askedPct = Math.max(2, Math.round((asked / max) * 100));
                const usedPct = Math.max(0, Math.round((used / max) * 100));
                const perfClass = row.performance_pct >= 80 ? 'perf-good' : row.performance_pct >= 50 ? 'perf-mid' : 'perf-low';
                return (
                  <div key={row.exporter_id} className="perf-graph-row">
                    <div className="perf-graph-name">
                      <strong>{row.exporter_name}</strong>
                      <small>{Number(row.bookings || 0)} booking{Number(row.bookings || 0) === 1 ? '' : 's'}</small>
                    </div>
                    <div className="perf-graph-bars">
                      <div className="perf-graph-bar perf-asked"><i style={{ width: `${askedPct}%` }} /><span>Asked {asked.toLocaleString('en-US')} kg</span></div>
                      <div className="perf-graph-bar perf-used"><i style={{ width: `${usedPct}%` }} /><span>Used {used.toLocaleString('en-US')} kg</span></div>
                    </div>
                    <div className={`perf-graph-pct ${perfClass}`}>{row.performance_pct}%</div>
                  </div>
                );
              }) : <p className="muted-cell">No performance data for the current filters.</p>}
            </div>
          </article>

          <article className="panel-card admin-panel full-span-card">
            <h3>Capacity Crunch — Airline Capacity vs Used Capacity</h3>

            <h4 className="subsection-title">Daily breakdown</h4>
            <div className="capacity-crunch-grid">
              {(capacityCrunch.daily || []).slice(0, 14).map((row, index) => (
                <div key={`d-${index}`} className={`capacity-crunch-card crunch-${row.crunch_level}`}>
                  <div className="capacity-crunch-head">
                    <strong>{String(row.day || '').slice(0, 10)}</strong>
                    <span>{row.airline}</span>
                  </div>
                  <div className="capacity-crunch-bar">
                    <i style={{ width: `${Math.min(100, row.utilization_pct)}%` }} />
                  </div>
                  <div className="capacity-crunch-meta">
                    <span>{Number(row.booked_kg).toLocaleString('en-US')} / {Number(row.total_kg).toLocaleString('en-US')} kg</span>
                    <strong>{row.utilization_pct}%</strong>
                  </div>
                </div>
              ))}
              {!(capacityCrunch.daily || []).length ? <p className="muted-cell">No capacity data yet.</p> : null}
            </div>

            <h4 className="subsection-title">Weekly breakdown</h4>
            <div className="capacity-crunch-grid">
              {(capacityCrunch.weekly || []).slice(0, 12).map((row, index) => (
                <div key={`w-${index}`} className={`capacity-crunch-card crunch-${row.crunch_level}`}>
                  <div className="capacity-crunch-head">
                    <strong>Week {row.week}</strong>
                    <span>{row.airline}</span>
                  </div>
                  <div className="capacity-crunch-bar">
                    <i style={{ width: `${Math.min(100, row.utilization_pct)}%` }} />
                  </div>
                  <div className="capacity-crunch-meta">
                    <span>{Number(row.booked_kg).toLocaleString('en-US')} / {Number(row.total_kg).toLocaleString('en-US')} kg</span>
                    <strong>{row.utilization_pct}%</strong>
                  </div>
                </div>
              ))}
              {!(capacityCrunch.weekly || []).length ? <p className="muted-cell">No weekly data yet.</p> : null}
            </div>
          </article>
        </div>
      ) : null}

      {activeTab === 'users' ? (
        <div className="dashboard-grid single-panel-grid">
          <article className="panel-card admin-panel">
            <div className="admin-toolbar">
              <div>
                <h3>User Vault</h3>
              </div>
              <div className="admin-toolbar-actions">
                <button className="table-action admin-action" onClick={startCreateUser}>Add User</button>
                <button className="table-action admin-action" onClick={() => setShowReplyModal(true)}>Send Email</button>
              </div>
            </div>
            <div className="table-wrap">
              <table className="admin-management-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Lock</th>
                    <th>Edit</th>
                    <th>Delete</th>
                    <th>Reply</th>
                  </tr>
                </thead>
                <tbody>
                  {usersPager.pagedItems.map((user) => (
                    <tr key={user.id}>
                      <td>{user.id}</td>
                      <td>{user.full_name}</td>
                      <td>{user.email}</td>
                      <td><span className="status-pill">{String(user.role || '').replace('_', ' ')}</span></td>
                      <td>
                        <button
                          className={`table-action admin-action ${user.is_locked ? 'success' : 'danger'}`}
                          onClick={() => toggleLock(user)}
                          disabled={Number(user.id) === Number(currentUserId) && !user.is_locked}
                        >
                          {user.is_locked ? 'Unlock' : 'Lock'}
                        </button>
                      </td>
                      <td>
                        <button className="table-action admin-action" onClick={() => startEditUser(user)}>
                          Edit
                        </button>
                      </td>
                      <td>
                        <button
                          className="table-action danger admin-action"
                          onClick={() => removeUser(user)}
                          disabled={Number(user.id) === Number(currentUserId)}
                        >
                          Delete
                        </button>
                      </td>
                      <td>
                        <button className="table-action admin-action" onClick={() => prepareReply(user.email)}>
                          Reply
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!users.length ? <tr><td colSpan="8">No users found.</td></tr> : null}
                </tbody>
              </table>
            </div>
            {users.length ? <Pagination {...usersPager} label="users" compact /> : null}

            <h3 className="subsection-title">Lock / Unlock History</h3>
            <div className="table-wrap">
              <table className="admin-management-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Reason</th>
                    <th>Message</th>
                    <th>Admin</th>
                    <th>Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {lockHistory.length ? lockHistoryPager.pagedItems.map((row) => (
                    <tr key={row.id}>
                      <td>{new Date(row.created_at).toLocaleString('en-US')}</td>
                      <td>{row.target_name || '-'}<br /><span className="muted-cell">{row.target_email || ''}</span></td>
                      <td><span className={`status-pill ${row.action === 'lock' ? 'full' : 'confirmed'}`}>{String(row.action || '').toUpperCase()}</span></td>
                      <td>{row.lock_reason || '-'}</td>
                      <td>{row.admin_message || '-'}</td>
                      <td>{row.admin_name || '-'}<br /><span className="muted-cell">{row.admin_email || ''}</span></td>
                      <td>{row.contact_number || '-'}</td>
                    </tr>
                  )) : <tr><td colSpan="7">No lock history records yet.</td></tr>}
                </tbody>
              </table>
            </div>
            {lockHistory.length ? <Pagination {...lockHistoryPager} label="lock entries" compact /> : null}
          </article>
        </div>
      ) : null}

      {activeTab === 'reallocations' ? (
        <article className="panel-card admin-panel">
          <h3>Available Space</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Airline</th>
                  <th>Destination</th>
                  <th>Booked Kg</th>
                  <th>Total Kg</th>
                  <th>Free Kg</th>
                  <th>Utilization</th>
                </tr>
              </thead>
              <tbody>
                {reallocationsPager.pagedItems.map((row, index) => {
                  const total = Number(row.total_kg || 0);
                  const booked = Number(row.booked_kg || 0);
                  const free = Math.max(0, total - booked);
                  const utilization = total > 0 ? Math.round((booked / total) * 100) : 0;
                  return (
                    <tr key={`${row.airline}-${index}`}>
                      <td>{String(row.flight_date || '').slice(0, 10) || '-'}</td>
                      <td>{row.airline}</td>
                      <td>{row.destination || '-'}</td>
                      <td>{booked.toLocaleString('en-US')}</td>
                      <td>{total.toLocaleString('en-US')}</td>
                      <td>{free.toLocaleString('en-US')}</td>
                      <td>{utilization}%</td>
                    </tr>
                  );
                })}
                {!capacities.length ? <tr><td colSpan="7">No capacity rows found.</td></tr> : null}
              </tbody>
            </table>
          </div>
          {capacities.length ? <Pagination {...reallocationsPager} label="capacity rows" compact /> : null}

          <div className="inline-tags">
            <span>Total roles: {sumCount(analytics.users)}</span>
            <span>Total booking states: {sumCount(analytics.bookings)}</span>
            <span>Total invoice states: {sumCount(analytics.invoices)}</span>
            <span>Summary bookings: {bookings.reduce((sum, row) => sum + Number(row.count || 0), 0)}</span>
            <span>Summary invoices: {invoices.reduce((sum, row) => sum + Number(row.count || 0), 0)}</span>
          </div>
        </article>
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

      {showUserModal ? (
        <div className="admin-modal-overlay">
          <div className="admin-modal admin-form-modal compact-modal">
            <h3>{editingUserId ? 'Edit User' : 'Create User'}</h3>
            <form className="booking-form" onSubmit={submitUserForm}>
              <label>
                Full Name
                <input
                  value={userForm.full_name}
                  onChange={(event) => setUserForm({ ...userForm, full_name: event.target.value })}
                  placeholder="Jane Doe"
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(event) => setUserForm({ ...userForm, email: event.target.value })}
                  placeholder="jane@company.com"
                />
              </label>
              <label>
                Password {editingUserId ? '(optional)' : ''}
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
                  placeholder={editingUserId ? 'Set a new password' : 'minimum 6 characters'}
                  required={!editingUserId}
                />
              </label>
              <label>
                Role
                <select
                  value={userForm.role}
                  onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}
                >
                  <option value="exporter">Exporter</option>
                  <option value="airline_analyst">Airline Analyst</option>
                  <option value="airline_supervisor">Airline Supervisor</option>
                  <option value="clearing_agent">Clearing Agent</option>
                  {isMainAdmin ? <option value="admin">Admin</option> : null}
                </select>
                {!isMainAdmin ? (
                  <small className="muted-cell">Only the main administrator can create or assign the Admin role.</small>
                ) : null}
              </label>

              {['airline_analyst', 'airline_supervisor'].includes(userForm.role) ? (
                <label className="full-width">
                  Linked Airline *
                  <select
                    value={userForm.linked_airline}
                    onChange={(event) => setUserForm({ ...userForm, linked_airline: event.target.value })}
                    required
                  >
                    <option value="">-- Select airline --</option>
                    {airlines.map((a) => (
                      <option key={a.id} value={a.name}>{a.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}

              {['exporter', 'clearing_agent'].includes(userForm.role) ? (
                <label className="full-width">
                  {userForm.role === 'exporter' ? 'Exporter Company *' : 'Linked Exporter Company'}
                  <select
                    value={userForm.linked_exporter_id}
                    onChange={(event) => setUserForm({ ...userForm, linked_exporter_id: event.target.value })}
                    required={userForm.role === 'exporter'}
                  >
                    <option value="">-- Select exporter company --</option>
                    {exporterCompanies.map((exp) => (
                      <option key={exp.id} value={exp.id}>{exp.name}</option>
                    ))}
                  </select>
                  {userForm.role === 'clearing_agent' && (
                    <small style={{ color: '#64748b', marginTop: '0.3rem', display: 'block' }}>
                      Clearing agents linked to an exporter company can manage that exporter's documents and bookings.
                    </small>
                  )}
                </label>
              ) : null}

              <div className="modal-button-group full-width">
                <button className="search-submit admin-submit" type="submit">{editingUserId ? 'Save Changes' : 'Create User'}</button>
                <button className="table-action admin-action" type="button" onClick={cancelEditUser}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showReplyModal ? (
        <div className="admin-modal-overlay">
          <div className="admin-modal admin-form-modal compact-modal">
            <h3>Reply to User Email</h3>
            <form className="booking-form" onSubmit={sendEmailToUser}>
              <label>
                Recipient Email
                <input
                  type="email"
                  value={adminEmailForm.recipientEmail}
                  onChange={(event) => setAdminEmailForm({ ...adminEmailForm, recipientEmail: event.target.value })}
                  placeholder="exporter@company.com"
                  required
                />
              </label>
              <label>
                Subject
                <input
                  value={adminEmailForm.subject}
                  onChange={(event) => setAdminEmailForm({ ...adminEmailForm, subject: event.target.value })}
                  placeholder="Support update"
                />
              </label>
              <label className="full-width">
                Message
                <textarea
                  value={adminEmailForm.issueDescription}
                  onChange={(event) => setAdminEmailForm({ ...adminEmailForm, issueDescription: event.target.value })}
                  placeholder="Write the message you want to send"
                  required
                />
              </label>
              <div className="modal-button-group full-width">
                <button className="search-submit admin-submit" type="submit">Send Reply Email</button>
                <button className="table-action admin-action" type="button" onClick={() => setShowReplyModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {lockingUser ? (
        <div className="admin-modal-overlay">
          <div className="admin-modal compact-modal">
            <h3>Lock Account: {lockingUser.full_name}</h3>
            <form onSubmit={(e) => { e.preventDefault(); confirmLockAccount(); }}>
              <label>
                WhatsApp / Contact Number (required, e.g., +250788352452)
                <input
                  type="tel"
                  value={whatsappContact}
                  onChange={(event) => setWhatsappContact(event.target.value)}
                  placeholder="+250788352452"
                  required
                />
              </label>
              {whatsappContact && whatsappContact.length >= 10 ? (
                <div style={{ margin: '0.25rem 0 0.5rem' }}>
                  <a
                    href={`https://wa.me/${whatsappContact.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(lockMessage || 'Your account has been locked. Please contact admin support.')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="table-action admin-action"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none' }}
                  >
                    Open WhatsApp Chat
                  </a>
                  <span style={{ fontSize: '0.78rem', color: '#666', marginLeft: '0.5rem' }}>Opens pre-filled message in WhatsApp</span>
                </div>
              ) : null}
              <label>
                Lock Reason
                <input
                  type="text"
                  value={lockReason}
                  onChange={(event) => setLockReason(event.target.value)}
                  placeholder="Reason for locking"
                />
              </label>
              <label>
                Message to User (sent via email and WhatsApp)
                <textarea
                  value={lockMessage}
                  onChange={(event) => setLockMessage(event.target.value)}
                  placeholder="Write the lock message user should receive"
                  rows={4}
                />
              </label>
              <div className="modal-button-group">
                <button className="search-submit" type="submit">Lock Account &amp; Notify (Email + WhatsApp)</button>
                <button className="table-action" type="button" onClick={cancelLock}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {activeTab === 'operations' ? (
        <section className="panel-card admin-maintenance-panel" aria-labelledby="plat-maint-heading">
          <div className="admin-toolbar" style={{ marginBottom: '1rem' }}>
            <div>
              <h3 id="plat-maint-heading">Platform maintenance</h3>
              <p style={{ marginTop: '0.35rem', color: '#475569', maxWidth: '42rem', lineHeight: 1.5 }}>
                When maintenance mode is enabled, non-administrator users cannot log in or call protected APIs.
                Only administrators retain full access including this dashboard.
                The homepage and authentication screen show your public notice to visitors.
              </p>
            </div>
          </div>
          {maintenancePanelLoading ? (
            <p style={{ color: '#64748b' }}>Loading current settings…</p>
          ) : (
            <form className="booking-form compact-form admin-maintenance-form" onSubmit={saveMaintenancePanel}>
              <label className="admin-maintenance-switch">
                <input
                  type="checkbox"
                  checked={maintenanceForm.enabled}
                  onChange={(event) =>
                    setMaintenanceForm((previous) => ({ ...previous, enabled: event.target.checked }))
                  }
                />
                <span>
                  <strong>Maintenance mode enabled</strong>
                  <small>Blocks non-admin sessions, registration, dashboards, and public schedule APIs.</small>
                </span>
              </label>
              <label>
                Public announcement (optional, max 500 characters)
                <textarea
                  value={maintenanceForm.message}
                  onChange={(event) =>
                    setMaintenanceForm((previous) => ({ ...previous, message: event.target.value }))
                  }
                  maxLength={500}
                  rows={5}
                  placeholder="Example: We are deploying finance updates tonight from 22:00–02:00. Please finalize bookings before cutoff."
                />
              </label>
              <p className="admin-maintenance-hint">
                If you leave this empty, visitors see the default SBU maintenance copy. You can still customize tone and timelines here for clarity.
              </p>
              <div className="modal-button-group full-width">
                <button type="submit" className="search-submit">
                  Save maintenance settings
                </button>
                <button type="button" className="table-action" onClick={() => loadMaintenancePanel()}>
                  Reload
                </button>
              </div>
            </form>
          )}
        </section>
      ) : null}

      {activeTab === 'media' ? (
        <div style={{ margin: '0 -1.5rem' }}>
          <AdminVideoUpload />
        </div>
      ) : null}

      {activeTab === 'security' ? (
        <div className="admin-security-panel">
          <div className="card-header">
            <div>
              <h3>Password reset audit log</h3>
              <p className="card-subtitle">
                Every reset request, verification and password change is recorded with timestamp, IP and device.
              </p>
            </div>
            <div className="security-stats">
              <div className="security-stat security-stat--blue">
                <span className="security-stat-num">{resetLogs.filter((l) => l.action === 'request').length}</span>
                <span className="security-stat-lbl">Requests</span>
              </div>
              <div className="security-stat security-stat--green">
                <span className="security-stat-num">{resetLogs.filter((l) => l.action === 'reset' && l.success).length}</span>
                <span className="security-stat-lbl">Completed</span>
              </div>
              <div className="security-stat security-stat--amber">
                <span className="security-stat-num">{resetLogs.filter((l) => l.action === 'failed').length}</span>
                <span className="security-stat-lbl">Failed</span>
              </div>
              <div className="security-stat security-stat--red">
                <span className="security-stat-num">{resetLogs.filter((l) => l.action === 'cooldown').length}</span>
                <span className="security-stat-lbl">Cooldowns</span>
              </div>
            </div>
          </div>

          <div className="security-toolbar">
            <input
              type="text"
              placeholder="Search by email, user or IP…"
              value={resetLogFilters.q}
              onChange={(e) => setResetLogFilters((p) => ({ ...p, q: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') loadResetLogs(); }}
              className="security-search"
            />
            <select
              value={resetLogFilters.action}
              onChange={(e) => setResetLogFilters((p) => ({ ...p, action: e.target.value }))}
              className="security-filter"
            >
              <option value="">All actions</option>
              <option value="request">Request</option>
              <option value="verify">Verify</option>
              <option value="reset">Reset</option>
              <option value="failed">Failed</option>
              <option value="cooldown">Cooldown / rate-limit</option>
              <option value="captcha">Captcha challenge</option>
            </select>
            <button type="button" className="btn-primary" onClick={loadResetLogs} disabled={resetLogsLoading}>
              {resetLogsLoading ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>

          <div className="table-wrap">
            <table className="data-table admin-data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Email</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>IP address</th>
                  <th>Device</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {resetLogsLoading ? (
                  <tr><td colSpan={8} className="muted-cell">Loading…</td></tr>
                ) : resetLogs.length === 0 ? (
                  <tr><td colSpan={8} className="muted-cell">No password-reset activity recorded yet.</td></tr>
                ) : (
                  resetLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{log.created_at ? new Date(log.created_at).toLocaleString() : '—'}</td>
                      <td>{log.user_name || '—'}{log.user_role ? <span className="muted-cell"> · {log.user_role}</span> : null}</td>
                      <td>{log.email || '—'}</td>
                      <td>
                        <span className={`status-pill log-action log-action--${log.action}`}>{log.action}</span>
                      </td>
                      <td>
                        <span className={`status-pill ${log.success ? 'paid' : 'unpaid'}`}>
                          {log.success ? '✓ ok' : '✕ failed'}
                        </span>
                      </td>
                      <td>{log.ip_address || '—'}</td>
                      <td className="cell-truncate" title={log.user_agent || ''}>{log.user_agent ? String(log.user_agent).slice(0, 40) + (log.user_agent.length > 40 ? '…' : '') : '—'}</td>
                      <td>{log.details || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="security-help">
            <strong>Built-in protections:</strong> codes expire in 10 min and are single-use; up to 5 wrong attempts invalidate them;
            after 4 requests in 15 min the account is rate-limited; multiple failed attempts from one IP trigger a captcha and a 1-hour cooldown.
            New passwords must include upper-case, lower-case, number and special character.
          </div>
        </div>
      ) : null}

      <AirlineModal
        open={showAirlineModal}
        onClose={() => {
          setShowAirlineModal(false);
          resetAirlineForm();
        }}
        onSave={submitAirlineForm}
        airline={
          editingAirlineId
            ? {
                ...airlineForm,
                destinations: airlineFormDestinations
              }
            : null
        }
        loading={modalLoading}
      />

      <PMCSpaceModal
        open={showPMCModal}
        onClose={() => {
          setShowPMCModal(false);
          resetCapacityForm();
        }}
        onSave={submitCapacityForm}
        pmcSpace={editingCapacityId ? capacityForm : null}
        airlines={airlines}
        directions={managerDirectionOptions}
        loading={modalLoading}
      />
    </DashboardShell>
  );
}
