import { useState, useEffect } from 'react';
import { Plus, Pencil, Play, Trash2, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../api/client.js';
import { useCampaign } from '../context/CampaignContext.jsx';
import CampaignFormModal from '../components/CampaignFormModal.jsx';

export default function Campaigns() {
  const { campaigns, currentCampaign, selectCampaign, refetch } = useCampaign();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [triggering, setTriggering] = useState(null);

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
    </div>
  );
}
