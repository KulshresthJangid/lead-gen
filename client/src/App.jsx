import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import {
  LayoutDashboard, BarChart2, Settings, LogOut, Bot,
  Layers, Send, Users, Info, Sun, Moon,
} from 'lucide-react';
import Dashboard from './pages/Dashboard.jsx';
import Analytics from './pages/Analytics.jsx';
import LeadDetail from './pages/LeadDetail.jsx';
import SettingsPage from './pages/Settings.jsx';
import AiLogs from './pages/AiLogs.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Campaigns from './pages/Campaigns.jsx';
import TeamSettings from './pages/TeamSettings.jsx';
import Outreach from './pages/Outreach.jsx';
import AboutPage from './pages/AboutPage.jsx';
import SetupWizard from './components/SetupWizard.jsx';
import PipelineStatusBar from './components/PipelineStatusBar.jsx';
import CampaignFormModal from './components/CampaignFormModal.jsx';
import apiClient from './api/client.js';
import { useAuth } from './context/AuthContext.jsx';
import { ThemeProvider, useTheme } from './context/ThemeContext.jsx';
import { CampaignProvider } from './context/CampaignContext.jsx';
import { usePipeline } from './hooks/usePipeline.js';
import { useSocket } from './hooks/useSocket.js';

// ── Page title map ────────────────────────────────────────────────────────────
const PAGE_TITLES = {
  '/':          'Dashboard',
  '/campaigns': 'Campaigns',
  '/analytics': 'Analytics',
  '/outreach':  'Outreach',
  '/ai-logs':   'AI Logs',
  '/settings':  'Settings',
  '/team':      'Team',
  '/about':     'About Drip',
};

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar() {
  const [expanded, setExpanded]       = useState(false);
  const [showLabels, setShowLabels]   = useState(false);
  const [newLeadsCount, setNewLeads]  = useState(0);
  const [pipelineRunning, setPRun]    = useState(false);
  const timerRef = useRef(null);

  const location  = useLocation();
  const { logout, user } = useAuth();
  const { theme, toggle } = useTheme();
  const { data: pipelineData } = usePipeline();

  useSocket({
    onNewLeads:     ({ count }) => setNewLeads((p) => p + count),
    onPipelineStart: ()         => setPRun(true),
    onPipelineDone:  ()         => setPRun(false),
  });

  useEffect(() => {
    if (pipelineData?.status === 'running') setPRun(true);
  }, [pipelineData?.status]);

  useEffect(() => {
    if (location.pathname === '/') setNewLeads(0);
  }, [location.pathname]);

  function onEnter() {
    setExpanded(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowLabels(true), 80);
  }
  function onLeave() {
    setShowLabels(false);
    setExpanded(false);
    clearTimeout(timerRef.current);
  }

  const navItems = [
    { to: '/',          icon: LayoutDashboard, label: 'Dashboard',  end: true, badge: newLeadsCount },
    { to: '/campaigns', icon: Layers,          label: 'Campaigns'  },
    { to: '/analytics', icon: BarChart2,       label: 'Analytics'  },
    { to: '/outreach',  icon: Send,            label: 'Outreach'   },
    { to: '/ai-logs',   icon: Bot,             label: 'AI Logs',   pulse: pipelineRunning },
    { to: '/settings',  icon: Settings,        label: 'Settings'   },
    { to: '/team',      icon: Users,           label: 'Team'       },
  ];

  const initials = user?.name
    ? user.name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2)
    : (user?.email?.[0] || 'U').toUpperCase();

  const itemBase = (isActive) => ({
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '7px 10px',
    borderRadius: '6px',
    borderLeft: `3px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
    backgroundColor: isActive ? 'var(--active)' : 'transparent',
    color: isActive ? 'var(--accent)' : 'var(--text-2)',
    cursor: 'pointer',
    transition: 'background-color 150ms, color 150ms',
    position: 'relative',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  });

  return (
    <aside
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        width: expanded ? '220px' : '56px',
        transition: 'width 200ms cubic-bezier(0.4,0,0.2,1)',
        flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        zIndex: 20,
      }}
    >
      {/* ── Logo ─────────────────────────────────────────────────────────── */}
      <div style={{
        height: '52px', display: 'flex', alignItems: 'center',
        padding: '0 16px', borderBottom: '1px solid var(--border)',
        gap: '10px', flexShrink: 0,
      }}>
        <div style={{
          width: '24px', height: '24px', borderRadius: '6px',
          background: 'var(--accent)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', boxShadow: '0 0 14px rgba(99,102,241,0.45)',
        }}>
          💧
        </div>
        <span style={{
          fontWeight: 800, fontSize: '15px', letterSpacing: '-0.4px',
          color: 'var(--text-1)', whiteSpace: 'nowrap',
          opacity: showLabels ? 1 : 0, transition: 'opacity 100ms',
        }}>
          Drip
        </span>
      </div>

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav style={{
        flex: 1, padding: '8px 6px',
        display: 'flex', flexDirection: 'column', gap: '2px',
        overflowY: 'auto', overflowX: 'hidden',
      }}>
        {navItems.map(({ to, icon: Icon, label, end, badge, pulse }) => (
          <NavLink key={to} to={to} end={end ?? false}
            title={!expanded ? label : undefined}
            style={{ textDecoration: 'none' }}
          >
            {({ isActive }) => (
              <div
                style={itemBase(isActive)}
                onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.backgroundColor = 'var(--hover)'; e.currentTarget.style.color = 'var(--text-1)'; } }}
                onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-2)'; } }}
              >
                {/* Icon + optional pulse dot */}
                <div style={{ position: 'relative', flexShrink: 0, lineHeight: 0 }}>
                  <Icon size={16} />
                  {pulse && (
                    <span style={{
                      position: 'absolute', top: '-2px', right: '-3px',
                      width: '6px', height: '6px', borderRadius: '50%',
                      backgroundColor: '#22c55e', boxShadow: '0 0 6px #22c55e',
                      animation: 'pulsePing 1.5s ease-in-out infinite',
                    }} />
                  )}
                </div>

                {/* Label */}
                <span style={{
                  fontSize: '13px', fontWeight: isActive ? 600 : 400,
                  flex: 1,
                  opacity: showLabels ? 1 : 0, transition: 'opacity 100ms',
                }}>
                  {label}
                </span>

                {/* Badge — expanded */}
                {badge > 0 && showLabels && (
                  <span style={{
                    fontSize: '10px', fontWeight: 700,
                    background: 'var(--accent)', color: '#fff',
                    borderRadius: '10px', padding: '1px 6px',
                    minWidth: '18px', textAlign: 'center',
                    animation: 'badgePop 0.35s cubic-bezier(0.34,1.56,0.64,1)',
                  }}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}

                {/* Badge dot — collapsed */}
                {badge > 0 && !showLabels && (
                  <span style={{
                    position: 'absolute', top: '5px', right: '5px',
                    width: '7px', height: '7px', borderRadius: '50%',
                    background: 'var(--accent)',
                    animation: 'badgePop 0.35s cubic-bezier(0.34,1.56,0.64,1)',
                  }} />
                )}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Bottom ───────────────────────────────────────────────────────── */}
      <div style={{ padding: '6px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        {/* About link */}
        <NavLink to="/about" title={!expanded ? 'About Drip' : undefined} style={{ textDecoration: 'none' }}>
          {({ isActive }) => (
            <div
              style={{ ...itemBase(isActive), color: isActive ? 'var(--accent)' : 'var(--text-3)' }}
              onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.backgroundColor = 'var(--hover)'; } }}
              onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.backgroundColor = 'transparent'; } }}
            >
              <Info size={14} style={{ flexShrink: 0, color: 'inherit' }} />
              <span style={{ fontSize: '13px', opacity: showLabels ? 1 : 0, transition: 'opacity 100ms' }}>
                About Drip
              </span>
            </div>
          )}
        </NavLink>

        {/* User row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 10px', whiteSpace: 'nowrap',
        }}>
          <div title={user?.name || user?.email} style={{
            width: '24px', height: '24px', borderRadius: '6px',
            background: 'var(--accent-subtle)', border: '1px solid var(--accent-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '10px', fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0, opacity: showLabels ? 1 : 0, transition: 'opacity 100ms' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>
              {user?.name || user?.email || 'User'}
            </p>
            {user?.role && (
              <p style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'capitalize', margin: 0 }}>
                {user.role}
              </p>
            )}
          </div>
          {showLabels && (
            <button
              onClick={logout}
              title="Sign out"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center', transition: 'color 150ms' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--error)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)'; }}
            >
              <LogOut size={13} />
            </button>
          )}
        </div>

        {/* Theme toggle */}
        <div style={{ padding: '2px 7px 4px' }}>
          <button
            onClick={toggle}
            title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center', transition: 'color 150ms' }}
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        </div>
      </div>
    </aside>
  );
}

// ── TopBar ────────────────────────────────────────────────────────────────────
function TopBar() {
  const location = useLocation();
  const { user } = useAuth();

  const path  = location.pathname;
  const title = PAGE_TITLES[path] || (path.startsWith('/leads/') ? 'Lead Detail' : 'Drip');

  const initials = user?.name
    ? user.name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2)
    : (user?.email?.[0] || 'U').toUpperCase();

  return (
    <header style={{
      height: '52px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', padding: '0 24px',
      borderBottom: '1px solid var(--border)',
      backgroundColor: 'var(--surface)', flexShrink: 0,
    }}>
      <h1 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.2px', margin: 0 }}>
        {title}
      </h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {user?.tenantName && (
          <span style={{
            fontSize: '11px', color: 'var(--text-3)', padding: '2px 9px',
            borderRadius: '5px', border: '1px solid var(--border-md)',
            backgroundColor: 'var(--hover)', letterSpacing: '0.01em',
          }}>
            {user.tenantName}
          </span>
        )}
        <div title={user?.name || user?.email} style={{
          width: '28px', height: '28px', borderRadius: '7px',
          background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontWeight: 700, color: '#fff',
          cursor: 'default', boxShadow: '0 0 0 2px var(--accent-subtle)',
        }}>
          {initials}
        </div>
      </div>
    </header>
  );
}

// ── Page transition wrapper ───────────────────────────────────────────────────
function AnimatedPage({ children }) {
  const location = useLocation();
  return (
    <div key={location.key} className="page-enter" style={{ height: '100%' }}>
      {children}
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────
function Layout({ children }) {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: 'var(--bg)' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <TopBar />
        <PipelineStatusBar />
        <main style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <AnimatedPage>{children}</AnimatedPage>
        </main>
      </div>
    </div>
  );
}

// ── Protected route ───────────────────────────────────────────────────────────
function ProtectedRoute({ children }) {
  const { authenticated } = useAuth();
  if (authenticated === null) return null;
  if (!authenticated) return <Navigate to="/login" replace />;
  return children;
}

// ── Splash ────────────────────────────────────────────────────────────────────
function Splash() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'var(--bg)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '10px',
          background: 'var(--accent)', fontSize: '20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 24px rgba(99,102,241,0.50)',
          animation: 'pulsePing 1.5s ease-in-out infinite',
        }}>
          💧
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-3)', letterSpacing: '0.06em' }}>Loading…</p>
      </div>
    </div>
  );
}

// ── App routes ────────────────────────────────────────────────────────────────
function AppRoutes() {
  const { authenticated } = useAuth();
  const [setupComplete, setSetupComplete] = useState(null);

  useEffect(() => {
    if (!authenticated) return;
    apiClient
      .get('/settings')
      .then((res) => setSetupComplete(res.data.is_setup_complete === 'true'))
      .catch(() => setSetupComplete(false));
  }, [authenticated]);

  if (authenticated === null) return <Splash />;

  const basename = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/';

  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/login"    element={authenticated ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/register" element={authenticated ? <Navigate to="/" replace /> : <Register />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              {setupComplete === false ? (
                <SetupWizard onComplete={() => setSetupComplete(true)} />
              ) : setupComplete === null ? (
                <Splash />
              ) : (
                <Layout><Dashboard /></Layout>
              )}
            </ProtectedRoute>
          }
        />
        <Route path="/analytics"  element={<ProtectedRoute><Layout><Analytics /></Layout></ProtectedRoute>} />
        <Route path="/leads/:id"  element={<ProtectedRoute><Layout><LeadDetail /></Layout></ProtectedRoute>} />
        <Route path="/ai-logs"    element={<ProtectedRoute><Layout><AiLogs /></Layout></ProtectedRoute>} />
        <Route path="/settings"   element={<ProtectedRoute><Layout><SettingsPage /></Layout></ProtectedRoute>} />
        <Route path="/campaigns"  element={<ProtectedRoute><Layout><Campaigns /></Layout></ProtectedRoute>} />
        <Route path="/team"       element={<ProtectedRoute><Layout><TeamSettings /></Layout></ProtectedRoute>} />
        <Route path="/outreach"   element={<ProtectedRoute><Layout><Outreach /></Layout></ProtectedRoute>} />
        <Route path="/about"      element={<ProtectedRoute><Layout><AboutPage /></Layout></ProtectedRoute>} />
        <Route path="*"           element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'var(--card)',
            color: 'var(--text-1)',
            borderLeft: '3px solid var(--accent)',
            borderRadius: '8px',
            fontSize: '13px',
            boxShadow: 'var(--shadow-md)',
            padding: '10px 14px',
          },
          success: { iconTheme: { primary: '#4ADE80', secondary: 'var(--card)' } },
          error:   { iconTheme: { primary: '#F87171', secondary: 'var(--card)' } },
        }}
      />
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <CampaignProvider>
        <AppRoutes />
      </CampaignProvider>
    </ThemeProvider>
  );
}
