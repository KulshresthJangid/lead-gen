import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import {
  LayoutDashboard, BarChart2, Settings, Zap, LogOut,
} from 'lucide-react';
import Dashboard from './pages/Dashboard.jsx';
import Analytics from './pages/Analytics.jsx';
import LeadDetail from './pages/LeadDetail.jsx';
import SettingsPage from './pages/Settings.jsx';
import Login from './pages/Login.jsx';
import SetupWizard from './components/SetupWizard.jsx';
import PipelineStatusBar from './components/PipelineStatusBar.jsx';
import apiClient from './api/client.js';
import { useAuth } from './context/AuthContext.jsx';

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar() {
  const { logout } = useAuth();
  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/analytics', icon: BarChart2, label: 'Analytics' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <aside className="w-60 bg-gray-900 flex flex-col flex-shrink-0">
      <div className="px-6 py-5 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Zap className="w-6 h-6 text-indigo-400" />
          <span className="text-lg font-bold text-white">LeadGen Pro</span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">B2B Enrichment Pipeline</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-gray-700 flex items-center justify-between">
        <p className="text-xs text-gray-600">© 2026 LeadGen Pro</p>
        <button
          onClick={logout}
          title="Sign out"
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────
function Layout({ children }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
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
  if (authenticated === null) return null; // still verifying token
  if (!authenticated) return <Navigate to="/login" replace />;
  return children;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const { authenticated } = useAuth();
  const [setupComplete, setSetupComplete] = useState(null);

  useEffect(() => {
    if (!authenticated) return; // don't fetch settings until logged in
    apiClient
      .get('/settings')
      .then((res) => setSetupComplete(res.data.is_setup_complete === 'true'))
      .catch(() => setSetupComplete(false));
  }, [authenticated]);

  // Still verifying stored token
  if (authenticated === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="text-gray-500 text-sm animate-pulse">Loading…</div>
      </div>
    );
  }

  // Strip trailing slash so React Router v6 is happy (/lead-client/ → /lead-client)
  const basename = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/';

  return (
    <BrowserRouter basename={basename}>
      <Routes>
        {/* Public */}
        <Route
          path="/login"
          element={authenticated ? <Navigate to="/" replace /> : <Login />}
        />

        {/* Protected */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              {setupComplete === false ? (
                <SetupWizard onComplete={() => setSetupComplete(true)} />
              ) : setupComplete === null ? (
                <div className="flex items-center justify-center h-screen bg-gray-950">
                  <div className="text-gray-500 text-sm animate-pulse">Loading…</div>
                </div>
              ) : (
                <Layout><Dashboard /></Layout>
              )}
            </ProtectedRoute>
          }
        />
        <Route path="/analytics" element={<ProtectedRoute><Layout><Analytics /></Layout></ProtectedRoute>} />
        <Route path="/leads/:id" element={<ProtectedRoute><Layout><LeadDetail /></Layout></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Layout><SettingsPage /></Layout></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
    </BrowserRouter>
  );
}
