import { useState, useEffect } from 'react';
import { Plus, Pencil, Play, Trash2, Layers, Users, X, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../api/client.js';
import { useCampaign } from '../context/CampaignContext.jsx';
import CampaignFormModal from '../components/CampaignFormModal.jsx';
import { usePermissions } from '../hooks/usePermissions.js';

// ── Campaign access panel ─────────────────────────────────────────────────────
function AccessPanel({ campaign, onClose }) {
  const [members,    setMembers]    = useState([]);
  const [allUsers,   setAllUsers]   = useState([]);
  const [departments, setDepts]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [grantUserId,  setGrantUserId]  = useState('');
  const [grantDeptId,  setGrantDeptId]  = useState('');
  const [grantAccess,  setGrantAccess]  = useState('viewer');
  const [granting,     setGranting]     = useState(false);

  async function fetchData() {
    try {
      const [{ data: m }, { data: u }, { data: d }] = await Promise.all([
        apiClient.get(`/campaigns/${campaign.id}/members`),
        apiClient.get('/users'),
        apiClient.get('/departments'),
      ]);
      setMembers(m);
      setAllUsers(u.filter(u => !['owner', 'admin'].includes(u.role)));
      setDepts(d);
    } catch {
      toast.error('Failed to load access data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [campaign.id]);

  async function handleGrant(e) {
    e.preventDefault();
    if (!grantUserId && !grantDeptId) return toast.error('Select a user or department');
    setGranting(true);
    try {
      const body = grantDeptId
        ? { department_id: grantDeptId, access: grantAccess }
        : { user_id: grantUserId, access: grantAccess };
      await apiClient.post(`/campaigns/${campaign.id}/members`, body);
      toast.success('Access granted');
      setGrantUserId(''); setGrantDeptId('');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to grant access');
    } finally {
      setGranting(false);
    }
  }

  async function handleRevoke(userId) {
    try {
      await apiClient.delete(`/campaigns/${campaign.id}/members/${userId}`);
      toast.success('Access revoked');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to revoke access');
    }
  }

  const ACCESS_LEVELS = ['viewer', 'editor', 'manager'];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md h-full overflow-y-auto flex flex-col"
        style={{ backgroundColor: 'var(--card)', borderLeft: '1px solid var(--border-md)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Campaign Access</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{campaign.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: 'var(--text-3)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 flex-1">
          {/* Grant access form */}
          <form onSubmit={handleGrant} className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Grant Access</h3>
            <select value={grantUserId} onChange={e => { setGrantUserId(e.target.value); setGrantDeptId(''); }}
              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }}>
              <option value="">— Select user —</option>
              {allUsers.map(u => <option key={u.id} value={u.id}>{u.name || u.email} ({u.role})</option>)}
            </select>
            <p className="text-xs text-center" style={{ color: 'var(--text-3)' }}>or grant to entire department</p>
            <select value={grantDeptId} onChange={e => { setGrantDeptId(e.target.value); setGrantUserId(''); }}
              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }}>
              <option value="">— Select department —</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={grantAccess} onChange={e => setGrantAccess(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }}>
              {ACCESS_LEVELS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button type="submit" disabled={granting || (!grantUserId && !grantDeptId)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors">
              <UserPlus className="w-3.5 h-3.5" />
              {granting ? 'Granting…' : 'Grant access'}
            </button>
          </form>

          {/* Current members */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>
              Current access ({members.length})
            </h3>
            {loading ? (
              <p className="text-sm text-center py-4" style={{ color: 'var(--text-3)' }}>Loading…</p>
            ) : members.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: 'var(--text-3)' }}>No explicit access granted — only owners and admins can view this campaign</p>
            ) : (
              <ul className="space-y-2">
                {members.map(m => (
                  <li key={m.user_id} className="flex items-center justify-between gap-3 rounded-xl p-3"
                    style={{ backgroundColor: 'var(--surface)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{m.name || m.email}</p>
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                        {m.department_name && <span className="mr-2">{m.department_name}</span>}
                        <span className="capitalize">{m.access}</span>
                      </p>
                    </div>
                    <button onClick={() => handleRevoke(m.user_id)}
                      className="p-1.5 rounded-lg border transition-colors hover:bg-red-900/20 flex-shrink-0"
                      style={{ borderColor: 'var(--border-md)', color: 'var(--text-3)' }} title="Revoke">
                      <X className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Campaigns() {
  const { campaigns, currentCampaign, selectCampaign, refetch } = useCampaign();
  const { hasRole } = usePermissions();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [triggering, setTriggering] = useState(null);
  const [accessCampaign, setAccessCampaign] = useState(null);

  const canManage = hasRole('owner', 'admin');

  async function handleTrigger(campaign) {
    setTriggering(campaign.id);
    try {
      await apiClient.post(`/campaigns/${campaign.id}/trigger`);
      toast.success(`Pipeline triggered for "${campaign.name}"`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to trigger pipeline');
    } finally {
      setTriggering(null);
    }
  }

  async function handleArchive(campaign) {
    if (!confirm(`Archive "${campaign.name}"? This will stop scraping.`)) return;
    try {
      await apiClient.delete(`/campaigns/${campaign.id}`);
      toast.success('Campaign archived');
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to archive campaign');
    }
  }

  const statusColor = {
    active:   'text-green-400 bg-green-900/30',
    paused:   'text-yellow-400 bg-yellow-900/30',
    archived: 'text-gray-500 bg-gray-800',
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>Campaigns</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            Manage scraping campaigns for your workspace
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          New campaign
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-20 rounded-2xl border" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
          <Layers className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No campaigns yet</p>
          <button
            onClick={() => { setEditing(null); setShowModal(true); }}
            className="mt-3 text-indigo-400 text-xs hover:text-indigo-300 transition-colors"
          >
            Create your first campaign →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl border p-4 transition-colors cursor-pointer"
              style={{
                backgroundColor: 'var(--card)',
                borderColor: currentCampaign?.id === c.id ? 'rgb(99,102,241)' : 'var(--border-md)',
              }}
              onClick={() => selectCampaign(c)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>
                      {c.name}
                    </h3>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusColor[c.status] || statusColor.archived}`}>
                      {c.status}
                    </span>
                    {currentCampaign?.id === c.id && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-900/40 text-indigo-300">
                        active
                      </span>
                    )}
                  </div>
                  {c.description && (
                    <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-3)' }}>{c.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
                    <span>{c.leadCount ?? 0} leads</span>
                    <span>·</span>
                    <span>Every {c.scrapingInterval || 30} min</span>
                    {c.lastRunAt && (
                      <>
                        <span>·</span>
                        <span>Last run {new Date(c.lastRunAt).toLocaleDateString()}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleTrigger(c)}
                    disabled={triggering === c.id || c.status === 'archived'}
                    className="p-2 rounded-lg border transition-colors hover:bg-green-900/20 disabled:opacity-40"
                    style={{ borderColor: 'var(--border-md)', color: 'var(--text-3)' }}
                    title="Trigger pipeline"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => { setEditing(c); setShowModal(true); }}
                    className="p-2 rounded-lg border transition-colors hover:bg-white/5"
                    style={{ borderColor: 'var(--border-md)', color: 'var(--text-3)' }}
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {canManage && (
                    <button
                      onClick={() => setAccessCampaign(c)}
                      className="p-2 rounded-lg border transition-colors hover:bg-indigo-900/20"
                      style={{ borderColor: 'var(--border-md)', color: 'var(--text-3)' }}
                      title="Manage access"
                    >
                      <Users className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleArchive(c)}
                    className="p-2 rounded-lg border transition-colors hover:bg-red-900/20"
                    style={{ borderColor: 'var(--border-md)', color: 'var(--text-3)' }}
                    title="Archive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <CampaignFormModal
          campaign={editing}
          onClose={() => setShowModal(false)}
          onSaved={refetch}
        />
      )}

      {accessCampaign && (
        <AccessPanel campaign={accessCampaign} onClose={() => setAccessCampaign(null)} />
      )}
    </div>
  );
}
