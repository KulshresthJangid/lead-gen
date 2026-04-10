import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import {
  LayoutDashboard, BarChart2, Settings, LogOut, Bot, Sun, Moon, Layers, Users,
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
import SetupWizard from './components/SetupWizard.jsx';
import PipelineStatusBar from './components/PipelineStatusBar.jsx';
import CampaignSwitcher from './components/CampaignSwitcher.jsx';
import CampaignFormModal from './components/CampaignFormModal.jsx';
import apiClient from './api/client.js';
import { useAuth } from './context/AuthContext.jsx';
import { ThemeProvider, useTheme } from './context/ThemeContext.jsx';
import { CampaignProvider, useCampaign } from './context/CampaignContext.jsx';

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar() {
  const { logout, user } = useAuth();
  const { theme, toggle } = useTheme();
  const { refetch } = useCampaign();
  const [showNewCampaign, setShowNewCampaign] = useState(false);

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/campaigns', icon: Layers, label: 'Campaigns' },
    { to: '/analytics', icon: BarChart2, label: 'Analytics' },
    { to: '/ai-logs', icon: Bot, label: 'AI Logs' },
    { to: '/settings', icon: Settings, label: 'Settings' },
    { to: '/team', icon: Users, label: 'Team' },
  ];

  return (
    <aside
      className="w-56 flex flex-col flex-shrink-0 border-r"
      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {/* Logo */}
      <div className="px-5 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm select-none"
            style={{ background: 'var(--accent)', color: '#fff', boxShadow: '0 2px 8px rgba(255,85,51,0.35)' }}
          >
            💧
          </div>
          <span className="text-sm font-black tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
            Drip
          </span>
        </div>
        {user?.tenantName && (
          <p className="text-[11px] mt-1 pl-9 truncate" style={{ color: 'var(--text-3)' }}>
            {user.tenantName}
          </p>
        )}
      </div>

      {/* Campaign switcher */}
      <div className="pt-3">
        <CampaignSwitcher onNewCampaign={() => setShowNewCampaign(true)} />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-3 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                isActive ? 'nav-active' : 'nav-idle'
              }`
            }
            style={({ isActive }) => isActive
              ? { backgroundColor: 'var(--active)', color: 'var(--text-1)', fontWeight: 600 }
              : { color: 'var(--text-2)' }
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div
        className="px-3 py-3 flex items-center justify-between"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <button
          onClick={toggle}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--text-3)' }}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark'
            ? <Sun className="w-3.5 h-3.5" />
            : <Moon className="w-3.5 h-3.5" />
          }
        </button>
        <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>© 2026</p>
        <button
          onClick={logout}
          title="Sign out"
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--text-3)' }}
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>

      {showNewCampaign && (
        <CampaignFormModal
          campaign={null}
          onClose={() => setShowNewCampaign(false)}
          onSaved={refetch}
        />
      )}
    </aside>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────
function Layout({ children }) {
  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <PipelineStatusBar />
        <main className="flex-1 overflow-auto p-6">{children}</main>
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

// ── App ───────────────────────────────────────────────────────────────────────
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

  if (authenticated === null) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="text-sm animate-pulse" style={{ color: 'var(--text-3)' }}>Loading…</div>
      </div>
    );
  }

  const basename = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/';

  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route
          path="/login"
          element={authenticated ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              {setupComplete === false ? (
                <SetupWizard onComplete={() => setSetupComplete(true)} />
              ) : setupComplete === null ? (
                <div className="flex items-center justify-center h-screen" style={{ backgroundColor: 'var(--bg)' }}>
                  <div className="text-sm animate-pulse" style={{ color: 'var(--text-3)' }}>Loading…</div>
                </div>
              ) : (
                <Layout><Dashboard /></Layout>
              )}
            </ProtectedRoute>
          }
        />
        <Route path="/analytics"  element={<ProtectedRoute><Layout><Analytics /></Layout></ProtectedRoute>} />
        <Route path="/leads/:id"   element={<ProtectedRoute><Layout><LeadDetail /></Layout></ProtectedRoute>} />
        <Route path="/ai-logs"     element={<ProtectedRoute><Layout><AiLogs /></Layout></ProtectedRoute>} />
        <Route path="/settings"    element={<ProtectedRoute><Layout><SettingsPage /></Layout></ProtectedRoute>} />
        <Route path="/campaigns"   element={<ProtectedRoute><Layout><Campaigns /></Layout></ProtectedRoute>} />
        <Route path="/team"        element={<ProtectedRoute><Layout><TeamSettings /></Layout></ProtectedRoute>} />
        <Route path="/register"    element={authenticated ? <Navigate to="/" replace /> : <Register />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'var(--card)',
            color: 'var(--text-1)',
            border: '1px solid var(--border-md)',
            borderRadius: '12px',
            fontSize: '13px',
          },
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
