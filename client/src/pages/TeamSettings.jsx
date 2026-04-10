import { useState, useEffect } from 'react';
import { Users, Mail, Trash2, Crown } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import RoleBadge from '../components/RoleBadge.jsx';

const ROLE_OPTIONS = ['admin', 'member', 'viewer'];

export default function TeamSettings() {
  const { user } = useAuth();
  const [members, setMembers]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole]   = useState('member');
  const [inviting, setInviting]       = useState(false);
  const [inviteUrl, setInviteUrl]     = useState(null);

  async function fetchMembers() {
    try {
      const { data } = await apiClient.get('/users');
      setMembers(data);
    } catch {
      toast.error('Failed to load team');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchMembers(); }, []);

  async function handleInvite(e) {
    e.preventDefault();
    setInviting(true);
    setInviteUrl(null);
    try {
      const { data } = await apiClient.post('/users/invite', { email: inviteEmail, role: inviteRole });
      setInviteUrl(data.inviteUrl);
      setInviteEmail('');
      toast.success('Invitation created');
      fetchMembers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to invite');
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(member, newRole) {
    try {
      await apiClient.put(`/users/${member.id}/role`, { role: newRole });
      toast.success('Role updated');
      fetchMembers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update role');
    }
  }

  async function handleRemove(member) {
    if (!confirm(`Remove ${member.name || member.email} from the team?`)) return;
    try {
      await apiClient.delete(`/users/${member.id}`);
      toast.success('Member removed');
      fetchMembers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove member');
    }
  }

  const canManage = user?.role === 'owner' || user?.role === 'admin';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>Team</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
          Manage your workspace members
        </p>
      </div>

      {/* Invite */}
      {canManage && (
        <div className="rounded-2xl border p-5" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-md)' }}>
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
            <Mail className="w-4 h-4" />
            Invite a team member
          </h2>
          <form onSubmit={handleInvite} className="flex gap-2">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="flex-1 rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }}
            >
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors"
            >
              {inviting ? 'Inviting…' : 'Invite'}
            </button>
          </form>
          {inviteUrl && (
            <div className="mt-3 rounded-lg p-3 text-xs break-all" style={{ backgroundColor: 'var(--surface)', color: 'var(--text-2)' }}>
              <p className="font-medium mb-1" style={{ color: 'var(--text-1)' }}>Share this invite link:</p>
              <a href={inviteUrl} className="text-indigo-400 hover:underline">{inviteUrl}</a>
            </div>
          )}
        </div>
      )}

      {/* Members list */}
      <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-md)' }}>
        <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
          <Users className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            Members ({members.length})
          </h2>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-sm text-center" style={{ color: 'var(--text-3)' }}>Loading…</div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-5 py-3.5 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>
                      {m.name || m.email}
                      {m.id === user?.id && <span className="ml-1 text-xs" style={{ color: 'var(--text-3)' }}>(you)</span>}
                    </p>
                    {m.role === 'owner' && <Crown className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />}
                  </div>
                  <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-3)' }}>{m.email}</p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {canManage && m.role !== 'owner' && m.id !== user?.id ? (
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m, e.target.value)}
                      className="rounded-lg px-2 py-1 text-xs border focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }}
                    >
                      {['admin', 'member', 'viewer'].map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <RoleBadge role={m.role} />
                  )}

                  {canManage && m.role !== 'owner' && m.id !== user?.id && (
                    <button
                      onClick={() => handleRemove(m)}
                      className="p-1.5 rounded-lg border transition-colors hover:bg-red-900/20"
                      style={{ borderColor: 'var(--border-md)', color: 'var(--text-3)' }}
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
