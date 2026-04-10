import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../api/client.js';

const SOURCE_TYPES = [
  { value: 'github',      label: 'GitHub' },
  { value: 'google',      label: 'Google (LinkedIn CSE)' },
  { value: 'gitlab',      label: 'GitLab' },
  { value: 'hackernews',  label: 'Hacker News' },
  { value: 'custom',      label: 'Custom URL' },
];

function blankSource() {
  return { type: 'github', query: '', url: '' };
}

export default function CampaignFormModal({ campaign, onClose, onSaved }) {
  const isEdit = !!campaign?.id;
  const [form, setForm] = useState({
    name: '',
    description: '',
    product_description: '',
    icp_description: '',
    scraping_interval: '30',
    daily_lead_target: 50,
    color: '#6366f1',
  });
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (campaign) {
      setForm({
        name: campaign.name || '',
        description: campaign.description || '',
        product_description: campaign.product_description || '',
        icp_description: campaign.icp_description || '',
        scraping_interval: String(campaign.scraping_interval || 30),
        daily_lead_target: campaign.daily_lead_target || 50,
        color: campaign.color || '#6366f1',
      });
      try {
        const raw = campaign.scraper_targets;
        setSources(Array.isArray(raw) ? raw : JSON.parse(raw || '[]'));
      } catch {
        setSources([]);
      }
    }
  }, [campaign]);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function addSource() {
    setSources((s) => [...s, blankSource()]);
  }

  function removeSource(i) {
    setSources((s) => s.filter((_, idx) => idx !== i));
  }

  function updateSource(i, field, value) {
    setSources((s) => s.map((src, idx) => idx === i ? { ...src, [field]: value } : src));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        scraping_interval: Number(form.scraping_interval),
        daily_lead_target: Number(form.daily_lead_target),
        scraper_targets: sources,
      };
      if (isEdit) {
        await apiClient.put(`/campaigns/${campaign.id}`, payload);
        toast.success('Campaign updated');
      } else {
        await apiClient.post('/campaigns', payload);
        toast.success('Campaign created');
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save campaign');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-md)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            {isEdit ? 'Edit campaign' : 'New campaign'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:bg-white/5">
            <X className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-3)' }}>Campaign name *</label>
            <input required value={form.name} onChange={set('name')}
              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }}
              placeholder="Q3 SaaS Outreach"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-3)' }}>Description</label>
            <input value={form.description} onChange={set('description')}
              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }}
              placeholder="Optional description"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-3)' }}>Product / service description</label>
            <textarea rows={3} value={form.product_description} onChange={set('product_description')}
              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }}
              placeholder="What do you sell?"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-3)' }}>Ideal customer profile</label>
            <textarea rows={3} value={form.icp_description} onChange={set('icp_description')}
              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }}
              placeholder="Who is your ideal customer?"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-3)' }}>Scraping interval</label>
              <select value={form.scraping_interval} onChange={set('scraping_interval')}
                className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }}>
                <option value="0">Continuous</option>
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="60">1 hour</option>
                <option value="360">6 hours</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-3)' }}>Daily lead target</label>
              <input type="number" min={0} max={100000} value={form.daily_lead_target} onChange={set('daily_lead_target')}
                className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }}
              />
            </div>
          </div>

          {/* ── Sources ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>
                Sources <span className="text-indigo-400 ml-1">({sources.length})</span>
              </label>
              <button type="button" onClick={addSource}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
                <Plus className="w-3 h-3" /> Add source
              </button>
            </div>

            {sources.length === 0 && (
              <p className="text-xs py-3 text-center rounded-lg border border-dashed"
                style={{ color: 'var(--text-3)', borderColor: 'var(--border-md)' }}>
                No sources — AI will use generic query pools. Add sources to focus this campaign.
              </p>
            )}

            <div className="space-y-2">
              {sources.map((src, i) => (
                <div key={i} className="flex gap-2 items-start p-2 rounded-lg border"
                  style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-md)' }}>
                  <select value={src.type}
                    onChange={(e) => updateSource(i, 'type', e.target.value)}
                    className="rounded-md px-2 py-1.5 text-xs border focus:outline-none focus:ring-1 focus:ring-indigo-500 shrink-0"
                    style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }}>
                    {SOURCE_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>

                  {src.type === 'custom' ? (
                    <input value={src.url}
                      onChange={(e) => updateSource(i, 'url', e.target.value)}
                      className="flex-1 rounded-md px-2 py-1.5 text-xs border focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }}
                      placeholder="https://example.com/leads"
                    />
                  ) : src.type === 'hackernews' ? (
                    <input value={src.query}
                      onChange={(e) => updateSource(i, 'query', e.target.value)}
                      className="flex-1 rounded-md px-2 py-1.5 text-xs border focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }}
                      placeholder="Keyword filter (optional)"
                    />
                  ) : (
                    <input value={src.query}
                      onChange={(e) => updateSource(i, 'query', e.target.value)}
                      className="flex-1 rounded-md px-2 py-1.5 text-xs border focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-md)', color: 'var(--text-1)' }}
                      placeholder={
                        src.type === 'github' ? 'e.g. founder location:India followers:>10' :
                        src.type === 'google'  ? 'e.g. site:linkedin.com/in CTO SaaS startup' :
                        'e.g. devops startup'
                      }
                    />
                  )}

                  <button type="button" onClick={() => removeSource(i)}
                    className="p-1 rounded hover:bg-red-500/10 transition-colors shrink-0">
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm border transition-colors hover:bg-white/5"
              style={{ borderColor: 'var(--border-md)', color: 'var(--text-2)' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors">
              {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Create campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
