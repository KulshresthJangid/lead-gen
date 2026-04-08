import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import {
  LayoutDashboard, BarChart2, Settings, Zap, LogOut, Bot,
} from 'lucide-react';
import Dashboard from './pages/Dashboard.jsx';
import Analytics from './pages/Analytics.jsx';
import LeadDetail from './pages/LeadDetail.jsx';
import SettingsPage from './pages/Settings.jsx';
import AiLogs from './pages/AiLogs.jsx';
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
    { to: '/ai-logs', icon: Bot, label: 'AI Logs' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <aside className="w-60 bg-[#09091a]/80 backdrop-blur-2xl flex flex-col flex-shrink-0 border-r border-white/[0.06]">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/40 animate-float">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-black gradient-text tracking-tight">LeadGen Pro</span>
        </div>
        <p className="text-[11px] text-slate-600 mt-1 font-medium pl-11">B2B pipeline ✨</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                isActive
                  ? 'bg-gradient-to-r from-violet-600/25 to-fuchsia-600/15 text-violet-300 border border-violet-500/20 shadow-sm shadow-violet-500/10'
                  : 'text-slate-500 hover:bg-white/[0.06] hover:text-slate-200'
              }`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/[0.06] flex items-center justify-between">
        <p className="text-[10px] text-slate-700 font-medium">© 2026 LeadGen Pro</p>
        <button
          onClick={logout}
          title="Sign out"
          className="text-slate-600 hover:text-red-400 transition-all duration-200 p-1.5 rounded-lg hover:bg-red-500/10"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────
function Layout({ children }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#06060f]">
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
      <div className="flex items-center justify-center h-screen bg-[#06060f]">
        <div className="text-slate-600 text-sm animate-pulse font-medium">Loading…</div>
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
                <div className="flex items-center justify-center h-screen bg-[#06060f]">
                  <div className="text-slate-600 text-sm animate-pulse font-medium">Loading…</div>
                </div>
              ) : (
                <Layout><Dashboard /></Layout>
              )}
            </ProtectedRoute>
          }
        />
        <Route path="/analytics" element={<ProtectedRoute><Layout><Analytics /></Layout></ProtectedRoute>} />
        <Route path="/leads/:id" element={<ProtectedRoute><Layout><LeadDetail /></Layout></ProtectedRoute>} />
        <Route path="/ai-logs"   element={<ProtectedRoute><Layout><AiLogs /></Layout></ProtectedRoute>} />
        <Route path="/settings"  element={<ProtectedRoute><Layout><SettingsPage /></Layout></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
    </BrowserRouter>
  );
}
