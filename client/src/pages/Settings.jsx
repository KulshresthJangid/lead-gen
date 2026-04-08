import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, Save, Trash2, Plus, GripVertical, X, CheckCircle, AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../api/client.js';

function Section({ title, desc, children }) {
  return (
    <div className="card p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {desc && <p className="text-sm text-gray-500 mt-0.5">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await apiClient.get('/settings');
      return res.data;
    },
  });

  const [form, setForm] = useState(null);
  const [ollamaStatus, setOllamaStatus] = useState(null);

  useEffect(() => {
    if (config && !form) {
      setForm({
        ollama_endpoint: config.ollama_endpoint || 'http://localhost:11434',
        ollama_model: config.ollama_model || 'mistral',
        scraping_interval: config.scraping_interval || '30',
        product_description: config.product_description || '',
        icp_description: config.icp_description || '',
        scraper_targets: Array.isArray(config.scraper_targets)
          ? config.scraper_targets
          : [],
      });
    }
  }, [config, form]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiClient.put('/settings', form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Settings saved!');
    },
    onError: () => toast.error('Failed to save settings'),
  });

  const dangerMutation = useMutation({
    mutationFn: async (action) => {
      await apiClient.delete(`/settings/${action}`, {
        data: { confirmation: 'DELETE' },
      });
    },
    onSuccess: (_, action) => {
      toast.success(`${action === 'leads' ? 'All leads' : 'Pipeline logs'} deleted`);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['pipelineStatus'] });
    },
    onError: () => toast.error('Delete failed'),
  });

  async function checkOllama() {
    setOllamaStatus('checking');
    try {
      const res = await apiClient.get('/pipeline/status');
      setOllamaStatus(res.data.ollamaOnline ? 'ok' : 'fail');
    } catch {
      setOllamaStatus('fail');
    }
  }

  function updateForm(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function addTarget() {
    setForm((f) => ({
      ...f,
      scraper_targets: [
        ...f.scraper_targets,
        { name: '', url: '', query: '', selectors: {} },
      ],
    }));
  }

  function updateTarget(i, key, value) {
    setForm((f) => {
      const targets = [...f.scraper_targets];
      targets[i] = { ...targets[i], [key]: value };
      return { ...f, scraper_targets: targets };
    });
  }

  function removeTarget(i) {
    setForm((f) => ({
      ...f,
      scraper_targets: f.scraper_targets.filter((_, idx) => idx !== i),
    }));
  }

  function confirmDanger(action) {
    const label = action === 'leads' ? 'ALL leads' : 'all pipeline logs';
    if (window.confirm(`This will permanently delete ${label}. Are you sure?`)) {
      dangerMutation.mutate(action);
    }
  }

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Configure pipeline, AI, and scraper behaviour</p>
      </div>

      {/* AI Config */}
      <Section title="AI Enrichment" desc="Configure the Ollama endpoint and model for lead enrichment.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Ollama Endpoint</label>
            <input
              type="url"
              className="input"
              value={form.ollama_endpoint}
              onChange={(e) => updateForm('ollama_endpoint', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Model</label>
            <input
              type="text"
              className="input"
              value={form.ollama_model}
              onChange={(e) => updateForm('ollama_model', e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={checkOllama} disabled={ollamaStatus === 'checking'} className="btn-secondary gap-2">
            {ollamaStatus === 'checking' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : ollamaStatus === 'ok' ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : ollamaStatus === 'fail' ? (
              <AlertCircle className="w-4 h-4 text-red-500" />
            ) : null}
            Test Connection
          </button>
          {ollamaStatus === 'ok' && <span className="text-sm text-green-600 font-medium">Ollama is online</span>}
          {ollamaStatus === 'fail' && <span className="text-sm text-red-500">Not reachable</span>}
        </div>
      </Section>

      {/* ICP */}
      <Section title="Ideal Customer Profile (ICP)" desc="Used by the AI to score and qualify leads.">
        <div>
          <label className="label">Product / Service Description</label>
          <textarea
            className="input min-h-[80px] resize-none"
            value={form.product_description}
            onChange={(e) => updateForm('product_description', e.target.value)}
          />
        </div>
        <div>
          <label className="label">ICP Description</label>
          <textarea
            className="input min-h-[80px] resize-none"
            value={form.icp_description}
            onChange={(e) => updateForm('icp_description', e.target.value)}
          />
        </div>
      </Section>

      {/* Scraper */}
      <Section title="Scraper Config" desc="Target URLs and schedule for the automated lead pipeline.">
        <div>
          <label className="label">Scraping Interval</label>
          <select
            className="input w-48"
            value={form.scraping_interval}
            onChange={(e) => updateForm('scraping_interval', e.target.value)}
          >
            <option value="0">Continuous (run back-to-back)</option>
            <option value="15">Every 15 min</option>
            <option value="30">Every 30 min</option>
            <option value="60">Every hour</option>
            <option value="360">Every 6 hours</option>
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Scraper Targets</label>
            <button onClick={addTarget} className="btn-secondary text-xs gap-1 py-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Target
            </button>
          </div>
          <div className="space-y-2">
            {form.scraper_targets.length === 0 && (
              <p className="text-sm text-gray-400 italic">
                No targets — the pipeline uses the GitHub built-in source as a fallback.
              </p>
            )}
            {form.scraper_targets.map((target, i) => (
              <div key={i} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <GripVertical className="w-4 h-4 text-gray-300 mt-2.5 flex-shrink-0" />
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    className="input py-1.5 text-sm"
                    placeholder="Source name"
                    value={target.name}
                    onChange={(e) => updateTarget(i, 'name', e.target.value)}
                  />
                  <select
                    className="input py-1.5 text-sm"
                    value={target.type || 'github'}
                    onChange={(e) => {
                      const type = e.target.value;
                      const urlMap = { github: 'https://github.com', gitlab: 'https://gitlab.com', hackernews: 'https://news.ycombinator.com', google: 'https://www.googleapis.com/customsearch/v1', custom: '' };
                      updateTarget(i, 'type', type);
                      updateTarget(i, 'url', urlMap[type] ?? '');
                    }}
                  >
                    <option value="github">GitHub</option>
                    <option value="gitlab">GitLab</option>
                    <option value="hackernews">HackerNews (Who wants to be hired?)</option>
                    <option value="google">Google Custom Search</option>
                    <option value="custom">Custom URL</option>
                  </select>
                  {(target.type === 'custom' || (!target.type && target.url && !['https://github.com','https://gitlab.com','https://news.ycombinator.com','https://www.googleapis.com/customsearch/v1'].includes(target.url))) && (
                    <input
                      type="url"
                      className="input py-1.5 text-sm sm:col-span-2"
                      placeholder="https://example.com/team"
                      value={target.url}
                      onChange={(e) => updateTarget(i, 'url', e.target.value)}
                    />
                  )}
                  <input
                    type="text"
                    className="input py-1.5 text-sm sm:col-span-2"
                    placeholder={target.type === 'hackernews' ? 'Keyword filter (e.g. India, React, remote) — leave blank for all' : target.type === 'google' ? 'e.g. site:linkedin.com/in "founder" "India" "SaaS"' : 'Search query (e.g. founder location:India followers:>5)'}
                    value={target.query || ''}
                    onChange={(e) => updateTarget(i, 'query', e.target.value)}
                  />
                </div>
                <button
                  onClick={() => removeTarget(i)}
                  className="p-1.5 hover:bg-red-50 rounded text-red-400 hover:text-red-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="btn-primary gap-2"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Settings
        </button>
      </div>

      {/* Danger Zone */}
      <Section title="Danger Zone" desc="Irreversible destructive operations.">
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-xl">
            <div>
              <p className="text-sm font-medium text-red-800">Delete all leads</p>
              <p className="text-xs text-red-600">Permanently removes all lead records from the database.</p>
            </div>
            <button
              onClick={() => confirmDanger('leads')}
              disabled={dangerMutation.isPending}
              className="btn-danger gap-2 text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
          <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-xl">
            <div>
              <p className="text-sm font-medium text-red-800">Delete pipeline history</p>
              <p className="text-xs text-red-600">Clears all pipeline run logs and analytics history.</p>
            </div>
            <button
              onClick={() => confirmDanger('pipeline-logs')}
              disabled={dangerMutation.isPending}
              className="btn-danger gap-2 text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>
      </Section>
    </div>
  );
}
