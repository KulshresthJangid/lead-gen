import { useState, useEffect } from 'react';
import {
  Users, UserPlus, Building2, Shield, Trash2, Crown,
  Eye, EyeOff, KeyRound,
} from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import RoleBadge from '../components/RoleBadge.jsx';

const ROLE_OPTIONS = ['admin', 'member', 'viewer'];

const SCREENS = [
  { key: 'dashboard',  label: 'Dashboard' },
  { key: 'campaigns',  label: 'Campaigns' },
  { key: 'analytics',  label: 'Analytics' },
  { key: 'outreach',   label: 'Outreach' },
  { key: 'ai-logs',    label: 'AI Logs' },
  { key: 'settings',   label: 'Settings' },
  { key: 'team',       label: 'Team' },
];

const DEPT_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B',
  '#10B981', '#3B82F6', '#EF4444', '#64748B',
];

// ── Tab: Members ─────────────────────────────────────────────────────────────
function MembersTab({ user, members, departments, onRefresh }) {
  const canManage = ['owner', 'admin'].includes(user?.role);

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'member', department_id: '' });
  const [showPw, setShowPw]     = useState(false);
  const [creating, setCreating] = useState(false);

  const [resetTarget, setResetTarget] = useState(null);
  const [resetPw, setResetPw]         = useState('');
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetting, setResetting]     = useState(false);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await apiClient.post('/users/create', form);
      toast.success(`User ${form.email} created`);
      setForm({ name: '', email: '', password: '', role: 'member', department_id: '' });
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  }

  async function handleRoleChange(member, newRole) {
    try {
      await apiClient.put(`/users/${member.id}/role`, { role: newRole });
      toast.success('Role updated');
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update role');
    }
  }

  async function handleDeptChange(member, deptId) {
    try {
      await apiClient.put(`/users/${member.id}/department`, { department_id: deptId || null });
      toast.success('Department updated');
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update department');
    }
  }

  async function handleToggleActive(member) {
    try {
      await apiClient.put(`/users/${member.id}/active`, { is_active: !member.is_active });
      toast.success(member.is_active ? 'User deactivated' : 'User activated');
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update status');
    }
  }

  async function handleRemove(member) {
    if (!confirm(`Remove ${member.name || member.email} from the team?`)) return;
    try {
      await apiClient.delete(`/users/${member.id}`);
      toast.success('Member removed');
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove member');
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setResetting(true);
    try {
      await apiClient.put(`/users/${resetTarget.id}/password`, { password: resetPw });
      toast.success('Password updated');
      setResetTarget(null);
      setResetPw('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="rounded-2xl border p-5" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-md)' }}>
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
            <UserPlus className="w-4 h-4" />
            Add team member
          </h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required placeholder="Full name" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }} />
            <input required type="email" placeholder="Email address" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }} />
            <div className="relative">
              <input required minLength={8} type={showPw ? 'text' : 'password'}
                placeholder="Temporary password (min 8 chars)" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 pr-9 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }} />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-2.5 top-2.5" style={{ color: 'var(--text-3)' }}>
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }}>
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}
              className="rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }}>
              <option value="">No department</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button type="submit" disabled={creating}
              className="sm:col-span-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors">
              {creating ? 'Creating…' : 'Create member'}
            </button>
          </form>
          <p className="mt-2 text-xs" style={{ color: 'var(--text-3)' }}>
            Share the email and password with the team member directly.
          </p>
        </div>
      )}

      <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-md)' }}>
        <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
          <Users className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Members ({members.length})</h2>
        </div>
        <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {members.map(m => (
            <li key={m.id} className={`px-5 py-3.5 ${!m.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>
                      {m.name || m.email}
                      {m.id === user?.id && <span className="ml-1 text-xs" style={{ color: 'var(--text-3)' }}>(you)</span>}
                      {!m.is_active && <span className="ml-2 text-xs text-red-400">(deactivated)</span>}
                    </p>
                    {m.role === 'owner' && <Crown className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                    {m.email}
                    {m.department_name && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium"
                        style={{ backgroundColor: m.department_color + '33', color: m.department_color }}>
                        {m.department_name}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {canManage && m.role !== 'owner' && m.id !== user?.id ? (
                    <>
                      <select value={m.role} onChange={e => handleRoleChange(m, e.target.value)}
                        className="rounded-lg px-2 py-1 text-xs border focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }}>
                        {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <select value={m.department_id || ''} onChange={e => handleDeptChange(m, e.target.value)}
                        className="rounded-lg px-2 py-1 text-xs border focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }}>
                        <option value="">No dept</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <button onClick={() => { setResetTarget(m); setResetPw(''); }}
                        className="p-1.5 rounded-lg border transition-colors hover:bg-indigo-900/20"
                        style={{ borderColor: 'var(--border-md)', color: 'var(--text-3)' }} title="Reset password">
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleToggleActive(m)}
                        className="p-1.5 rounded-lg border transition-colors hover:bg-yellow-900/20"
                        style={{ borderColor: 'var(--border-md)', color: 'var(--text-3)' }}
                        title={m.is_active ? 'Deactivate' : 'Activate'}>
                        {m.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => handleRemove(m)}
                        className="p-1.5 rounded-lg border transition-colors hover:bg-red-900/20"
                        style={{ borderColor: 'var(--border-md)', color: 'var(--text-3)' }} title="Remove">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <RoleBadge role={m.role} />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-2xl border p-6 w-full max-w-sm"
            style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-md)' }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-1)' }}>
              Reset password for {resetTarget.name || resetTarget.email}
            </h3>
            <form onSubmit={handleResetPassword} className="space-y-3">
              <div className="relative">
                <input required minLength={8} type={showResetPw ? 'text' : 'password'}
                  placeholder="New password (min 8 chars)" value={resetPw}
                  onChange={e => setResetPw(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 pr-9 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }} />
                <button type="button" onClick={() => setShowResetPw(v => !v)}
                  className="absolute right-2.5 top-2.5" style={{ color: 'var(--text-3)' }}>
                  {showResetPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setResetTarget(null)}
                  className="flex-1 px-3 py-2 rounded-lg text-sm border transition-colors"
                  style={{ borderColor: 'var(--border-md)', color: 'var(--text-2)' }}>Cancel</button>
                <button type="submit" disabled={resetting}
                  className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors">
                  {resetting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Departments ──────────────────────────────────────────────────────────
function DepartmentsTab({ departments, onRefresh }) {
  const [name, setName]     = useState('');
  const [color, setColor]   = useState(DEPT_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [editId, setEditId]     = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await apiClient.post('/departments', { name, color });
      toast.success('Department created');
      setName('');
      setColor(DEPT_COLORS[0]);
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create department');
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdate(dept) {
    try {
      await apiClient.put(`/departments/${dept.id}`, { name: editName, color: editColor });
      toast.success('Department updated');
      setEditId(null);
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update department');
    }
  }

  async function handleDelete(dept) {
    if (!confirm(`Delete "${dept.name}"? Members will be unassigned.`)) return;
    try {
      await apiClient.delete(`/departments/${dept.id}`);
      toast.success('Department deleted');
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete department');
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border p-5" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-md)' }}>
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
          <Building2 className="w-4 h-4" />
          New department
        </h2>
        <form onSubmit={handleCreate} className="flex gap-2 items-center flex-wrap">
          <input required placeholder="Department name" value={name} onChange={e => setName(e.target.value)}
            className="flex-1 rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }} />
          <div className="flex gap-1.5">
            {DEPT_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)}
                className="w-6 h-6 rounded-full border-2 transition-all"
                style={{ backgroundColor: c, borderColor: color === c ? 'white' : 'transparent' }} />
            ))}
          </div>
          <button type="submit" disabled={creating}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors">
            {creating ? 'Creating…' : 'Create'}
          </button>
        </form>
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-md)' }}>
        <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {departments.length === 0 && (
            <li className="px-5 py-8 text-sm text-center" style={{ color: 'var(--text-3)' }}>No departments yet</li>
          )}
          {departments.map(d => (
            <li key={d.id} className="px-5 py-3.5 flex items-center gap-3">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
              {editId === d.id ? (
                <div className="flex-1 flex gap-2 items-center flex-wrap">
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    className="flex-1 rounded-lg px-2 py-1 text-sm border focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }} />
                  <div className="flex gap-1">
                    {DEPT_COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setEditColor(c)}
                        className="w-5 h-5 rounded-full border-2 transition-all"
                        style={{ backgroundColor: c, borderColor: editColor === c ? 'white' : 'transparent' }} />
                    ))}
                  </div>
                  <button onClick={() => handleUpdate(d)}
                    className="px-3 py-1 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white">Save</button>
                  <button onClick={() => setEditId(null)}
                    className="px-3 py-1 text-xs rounded-lg border" style={{ borderColor: 'var(--border-md)', color: 'var(--text-2)' }}>Cancel</button>
                </div>
              ) : (
                <>
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{d.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>{d.member_count} member{d.member_count !== 1 ? 's' : ''}</p>
                  </div>
                  <button onClick={() => { setEditId(d.id); setEditName(d.name); setEditColor(d.color); }}
                    className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'var(--border-md)', color: 'var(--text-2)' }}>Edit</button>
                  <button onClick={() => handleDelete(d)}
                    className="p-1.5 rounded-lg border transition-colors hover:bg-red-900/20"
                    style={{ borderColor: 'var(--border-md)', color: 'var(--text-3)' }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Tab: Permissions ──────────────────────────────────────────────────────────
function PermissionsTab({ members }) {
  const [perms, setPerms]   = useState({});
  const [saving, setSaving] = useState({});
  const [loaded, setLoaded] = useState({});

  async function loadPerms(userId) {
    if (loaded[userId]) return;
    try {
      const { data } = await apiClient.get(`/users/${userId}/permissions`);
      setPerms(p => ({ ...p, [userId]: data }));
      setLoaded(l => ({ ...l, [userId]: true }));
    } catch {
      toast.error('Failed to load permissions');
    }
  }

  async function toggleScreen(userId, screen, currentVal) {
    const newVal = !currentVal;
    setPerms(p => ({ ...p, [userId]: { ...(p[userId] || {}), [screen]: newVal } }));
    setSaving(s => ({ ...s, [`${userId}:${screen}`]: true }));
    try {
      await apiClient.put(`/users/${userId}/permissions`, { [screen]: newVal });
    } catch {
      toast.error('Failed to save');
      setPerms(p => ({ ...p, [userId]: { ...(p[userId] || {}), [screen]: currentVal } }));
    } finally {
      setSaving(s => ({ ...s, [`${userId}:${screen}`]: false }));
    }
  }

  const nonOwners = members.filter(m => m.role !== 'owner');

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'var(--text-3)' }}>
        Override screen access per user. Owners and admins always have full access. Click a row to load, then toggle.
      </p>
      <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-md)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                <th className="text-left px-5 py-3 font-medium" style={{ color: 'var(--text-3)' }}>Member</th>
                {SCREENS.map(s => (
                  <th key={s.key} className="px-3 py-3 text-center font-medium text-xs" style={{ color: 'var(--text-3)' }}>{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {nonOwners.map(m => {
                const userPerms = perms[m.id] || {};
                const isLoaded  = loaded[m.id];
                return (
                  <tr key={m.id} onClick={() => !isLoaded && loadPerms(m.id)}
                    className="cursor-pointer hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium" style={{ color: 'var(--text-1)' }}>{m.name || m.email}</p>
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>{m.role}</p>
                    </td>
                    {SCREENS.map(s => {
                      const isSaving = saving[`${m.id}:${s.key}`];
                      const val = userPerms[s.key];
                      return (
                        <td key={s.key} className="px-3 py-3 text-center">
                          {!isLoaded ? (
                            <span className="text-xs" style={{ color: 'var(--text-3)' }}>–</span>
                          ) : (
                            <button
                              onClick={e => { e.stopPropagation(); toggleScreen(m.id, s.key, val !== false); }}
                              disabled={isSaving}
                              className={`w-4 h-4 rounded border transition-colors ${val === false ? '' : 'bg-indigo-600 border-indigo-600'}`}
                              style={val === false ? { borderColor: 'var(--border-md)' } : {}}
                              title={val === false ? 'Denied — click to grant' : 'Granted — click to deny'}
                            >
                              {val !== false && <span className="text-white text-[10px] font-bold">✓</span>}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {nonOwners.length === 0 && (
                <tr>
                  <td colSpan={SCREENS.length + 1} className="px-5 py-8 text-sm text-center" style={{ color: 'var(--text-3)' }}>
                    No members to configure
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'members',     label: 'Members',     icon: Users },
  { key: 'departments', label: 'Departments',  icon: Building2 },
  { key: 'permissions', label: 'Permissions',  icon: Shield },
];

export default function TeamSettings() {
  const { user } = useAuth();
  const [tab,         setTab]         = useState('members');
  const [members,     setMembers]     = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading,     setLoading]     = useState(true);

  async function fetchAll() {
    try {
      const [{ data: m }, { data: d }] = await Promise.all([
        apiClient.get('/users'),
        apiClient.get('/departments'),
      ]);
      setMembers(m);
      setDepartments(d);
    } catch {
      toast.error('Failed to load team data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm" style={{ color: 'var(--text-3)' }}>
        Loading…
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>Team</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
          Manage members, departments, and screen access
        </p>
      </div>

      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: 'var(--surface)' }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                active ? 'bg-indigo-600 text-white' : 'hover:text-[var(--text-1)]'
              }`}
              style={active ? {} : { color: 'var(--text-2)' }}>
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'members'     && <MembersTab     user={user} members={members} departments={departments} onRefresh={fetchAll} />}
      {tab === 'departments' && <DepartmentsTab departments={departments} onRefresh={fetchAll} />}
      {tab === 'permissions' && <PermissionsTab members={members} />}
    </div>
  );
}
