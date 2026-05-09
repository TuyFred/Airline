import { useEffect, useState } from 'react';
import './App.css';
import Home from './pages/Home';
import AuthPage from './pages/AuthPage';
import AvailabilityPage from './pages/AvailabilityPage';
import ExporterDashboard from './pages/dashboards/ExporterDashboard';
import AirlineDashboard from './pages/dashboards/AirlineDashboard';
import SupervisorDashboard from './pages/dashboards/SupervisorDashboard';
import ClearingAgentDashboard from './pages/dashboards/ClearingAgentDashboard';
import AdminDashboard from './pages/dashboards/AdminDashboard';
import MaintenancePage from './pages/MaintenancePage';
import SupportWidget from './components/SupportWidget';
import api from './services/api';

const routeMap = {
  home: Home,
  availability: AvailabilityPage,
  login: AuthPage,
  register: AuthPage,
  maintenance: MaintenancePage,
  'dashboard/exporter': ExporterDashboard,
  'dashboard/airline': AirlineDashboard,
  'dashboard/supervisor': SupervisorDashboard,
  'dashboard/agent': ClearingAgentDashboard,
  'dashboard/admin': AdminDashboard
};

const routeRoles = {
  'dashboard/exporter': 'exporter',
  'dashboard/airline': 'airline_analyst',
  'dashboard/supervisor': 'airline_supervisor',
  'dashboard/agent': 'clearing_agent',
  'dashboard/admin': 'admin'
};

function routeForRole(role) {
  if (role === 'airline_analyst') return 'dashboard/airline';
  if (role === 'airline_supervisor') return 'dashboard/supervisor';
  if (role === 'clearing_agent') return 'dashboard/agent';
  if (role === 'admin') return 'dashboard/admin';
  return 'dashboard/exporter';
}

function resolveRoute(hash) {
  const cleaned = (hash.replace(/^#/, '').split('?')[0] || 'home').trim();
  return routeMap[cleaned] ? cleaned : 'home';
}

function App() {
  const [route, setRoute] = useState(() => resolveRoute(window.location.hash));
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('sbu_user') || 'null');
    } catch {
      return null;
    }
  });
  const [bootstrap, setBootstrap] = useState({ ready: false, maintenance: false, message: '' });

  useEffect(() => {
    const handleHashChange = () => setRoute(resolveRoute(window.location.hash));
    const handleAuthChange = () => {
      try {
        setUser(JSON.parse(localStorage.getItem('sbu_user') || 'null'));
      } catch {
        setUser(null);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('storage', handleAuthChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('storage', handleAuthChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadBootstrap = async () => {
      const token = localStorage.getItem('sbu_token');

      const statusPromise = api.apiGet('/api/public/system-status').then(
        (status) => ({
          maintenance: !!status?.maintenance,
          message: String(status?.message || '')
        }),
        () => ({ maintenance: false, message: '' })
      );

      const mePromise = (async () => {
        if (!token) {
          localStorage.removeItem('sbu_user');
          return null;
        }
        try {
          const response = await api.apiGet('/api/auth/me');
          return response?.user ?? null;
        } catch {
          localStorage.removeItem('sbu_token');
          localStorage.removeItem('sbu_user');
          return null;
        }
      })();

      const [meUser, status] = await Promise.all([mePromise, statusPromise]);
      if (cancelled) return;

      setUser(meUser);
      if (meUser) {
        localStorage.setItem('sbu_token', token);
        localStorage.setItem('sbu_user', JSON.stringify(meUser));
      }

      setBootstrap({
        ready: true,
        maintenance: status.maintenance,
        message: status.message
      });
    };

    loadBootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!bootstrap.ready) return;
    const id = window.setInterval(async () => {
      try {
        const s = await api.apiGet('/api/public/system-status');
        setBootstrap((prev) => ({
          ...prev,
          maintenance: !!s?.maintenance,
          message: String(s?.message || prev.message)
        }));
      } catch {
        /* ignore */
      }
    }, 45000);
    return () => window.clearInterval(id);
  }, [bootstrap.ready]);

  useEffect(() => {
    if (!bootstrap.ready || !bootstrap.maintenance || user?.role === 'admin') return;
    if (route.startsWith('dashboard/') || route === 'availability') {
      window.location.hash = '#maintenance';
    }
  }, [bootstrap.ready, bootstrap.maintenance, user, route]);

  if (!bootstrap.ready) {
    return null;
  }

  const bannerMessage = bootstrap.maintenance ? bootstrap.message : '';
  const publicBannerProps =
    route === 'home' || route === 'login' || route === 'register' ? { maintenanceMessage: bannerMessage } : {};

  if ((route === 'login' || route === 'register') && user) {
    const nextRoute = routeForRole(user.role);
    window.location.hash = `#${nextRoute}`;
    const ActivePage = routeMap[nextRoute] || Home;
    return (
      <>
        <ActivePage onAuth={setUser} />
        <SupportWidget />
      </>
    );
  }

  if (route === 'availability') {
    if (!user) {
      window.location.hash = '#login';
      return null;
    }
    if (bootstrap.maintenance && user.role !== 'admin') {
      window.location.hash = '#maintenance';
      return null;
    }
  }

  if (route.startsWith('dashboard/')) {
    if (!user) {
      window.location.hash = '#login';
      return null;
    }
    if (bootstrap.maintenance && user.role !== 'admin') {
      window.location.hash = '#maintenance';
      return null;
    }

    const requiredRole = routeRoles[route];
    if (requiredRole && user.role !== requiredRole) {
      const fallbackRoute = routeForRole(user.role);
      window.location.hash = `#${fallbackRoute}`;
      const ActivePage = routeMap[fallbackRoute] || Home;
      return (
        <>
          <ActivePage onAuth={setUser} />
          <SupportWidget />
        </>
      );
    }
  }

  if (route === 'register') {
    return (
      <>
        <AuthPage mode="register" redirectTo="dashboard/exporter" onAuth={setUser} {...publicBannerProps} />
        <SupportWidget />
      </>
    );
  }

  if (route === 'login') {
    return (
      <>
        <AuthPage mode="login" redirectTo="dashboard/exporter" onAuth={setUser} {...publicBannerProps} />
        <SupportWidget />
      </>
    );
  }

  const ActivePage = routeMap[route] || Home;

  return (
    <>
      <ActivePage onAuth={setUser} {...(route === 'home' ? publicBannerProps : {})} />
      <SupportWidget />
    </>
  );
}

export default App;
