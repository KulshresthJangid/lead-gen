import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, Save, Trash2, CheckCircle, AlertCircle, ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../api/client.js';

// ── Provider metadata ─────────────────────────────────────────────────────────
const PROVIDERS = [
  {
    id: 'ollama',
    label: 'Ollama (local)',
    needsKey: false,
    needsBaseUrl: true,
    baseUrlLabel: 'Ollama endpoint',
    baseUrlPlaceholder: 'http://localhost:11434',
    modelPlaceholder: 'mistral',
    modelHint: 'e.g. mistral, llama3, phi3, gemma2',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    needsKey: true,
    needsBaseUrl: false,
    modelPlaceholder: 'anthropic/claude-3-haiku',
    modelHint: 'e.g. anthropic/claude-3-haiku, openai/gpt-4o-mini, google/gemini-flash-1.5',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    needsKey: true,
    needsBaseUrl: false,
    modelPlaceholder: 'claude-3-haiku-20240307',
    modelHint: 'e.g. claude-3-haiku-20240307, claude-3-5-sonnet-20241022',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    needsKey: true,
    needsBaseUrl: false,
    modelPlaceholder: 'gemini-2.0-flash',
    modelHint: 'e.g. gemini-2.0-flash, gemini-1.5-pro',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    needsKey: true,
    needsBaseUrl: false,
    modelPlaceholder: 'gpt-4o-mini',
    modelHint: 'e.g. gpt-4o-mini, gpt-4o',
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot',
    needsKey: true,
    keyLabel: 'GitHub Token',
    needsBaseUrl: false,
    modelPlaceholder: 'gpt-4o',
    modelHint: 'e.g. gpt-4o, gpt-4o-mini, claude-3-5-sonnet',
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    needsKey: false,
    needsBaseUrl: true,
    baseUrlLabel: 'Base URL',
    baseUrlPlaceholder: 'http://localhost:1234/v1',
    modelPlaceholder: 'your-model',
    modelHint: 'Any OpenAI-compatible endpoint (LM Studio, vLLM, Together, etc.)',
  },
];

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
  const [aiStatus, setAiStatus] = useState(null); // null | 'checking' | 'ok' | 'fail'
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    if (config && !form) {
      setForm({
        ai_provider: config.ai_provider || 'ollama',
        ai_api_key: config.ai_api_key || '',
        ai_model: config.ai_model || '',
        ai_base_url: config.ai_base_url || '',
        // keep legacy ollama fields so other pages stay backward compat
        ollama_endpoint: config.ollama_endpoint || 'http://localhost:11434',
        ollama_model: config.ollama_model || 'mistral',
      });
    }
  }, [config, form]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Sync legacy ollama fields when ollama provider is selected
      const payload = { ...form };
      if (form.ai_provider === 'ollama') {
        payload.ollama_endpoint = form.ai_base_url || form.ollama_endpoint || 'http://localhost:11434';
        payload.ollama_model = form.ai_model || form.ollama_model || 'mistral';
      }
      await apiClient.put('/settings', payload);
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

  async function testAI() {
    setAiStatus('checking');
    setAiError('');
    try {
      const res = await apiClient.post('/settings/test-ai', form);
      if (res.data.ok) {
        setAiStatus('ok');
      } else {
        setAiStatus('fail');
        setAiError(res.data.error || 'Provider unreachable');
      }
    } catch (err) {
      setAiStatus('fail');
      setAiError(err?.response?.data?.error || err.message || 'Connection failed');
    }
  }

  function updateForm(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    // Reset test status whenever settings change
    setAiStatus(null);
    setAiError('');
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

  const provider = PROVIDERS.find((p) => p.id === form.ai_provider) || PROVIDERS[0];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Configure your AI provider and workspace settings.{' '}
          <Link to="/campaigns" className="text-indigo-600 hover:text-indigo-800 underline underline-offset-2">
            Manage campaigns
          </Link>{' '}
          for pipeline targets and ICP.
        </p>
      </div>

      {/* AI Config */}
      <Section
        title="AI Provider"
        desc="Bring your own AI — choose any provider for lead enrichment and query generation."
      >
        {/* Provider selector */}
        <div>
          <label className="label">Provider</label>
          <div className="relative">
            <select
              className="input appearance-none pr-8 cursor-pointer"
              value={form.ai_provider}
              onChange={(e) => updateForm('ai_provider', e.target.value)}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
        </div>

        {/* API Key — shown for cloud providers */}
        {provider.needsKey && (
          <div>
            <label className="label">{provider.keyLabel || 'API Key'}</label>
            <input
              type="password"
              className="input font-mono"
              placeholder="sk-…"
              value={form.ai_api_key}
              onChange={(e) => updateForm('ai_api_key', e.target.value)}
              autoComplete="off"
            />
          </div>
        )}

        {/* Base URL — shown for ollama + custom */}
        {provider.needsBaseUrl && (
          <div>
            <label className="label">{provider.baseUrlLabel || 'Base URL'}</label>
            <input
              type="url"
              className="input"
              placeholder={provider.baseUrlPlaceholder}
              value={form.ai_base_url}
              onChange={(e) => updateForm('ai_base_url', e.target.value)}
            />
          </div>
        )}

        {/* Model */}
        <div>
          <label className="label">Model</label>
          <input
            type="text"
            className="input"
            placeholder={provider.modelPlaceholder}
            value={form.ai_model}
            onChange={(e) => updateForm('ai_model', e.target.value)}
          />
          {provider.modelHint && (
            <p className="text-xs text-gray-400 mt-1">{provider.modelHint}</p>
          )}
        </div>

        {/* Test connection */}
        <div className="flex items-center gap-3">
          <button
            onClick={testAI}
            disabled={aiStatus === 'checking'}
            className="btn-secondary gap-2"
          >
            {aiStatus === 'checking' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : aiStatus === 'ok' ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : aiStatus === 'fail' ? (
              <AlertCircle className="w-4 h-4 text-red-500" />
            ) : null}
            Test Connection
          </button>
          {aiStatus === 'ok' && (
            <span className="text-sm text-green-600 font-medium">
              {provider.label} is reachable
            </span>
          )}
          {aiStatus === 'fail' && (
            <span className="text-sm text-red-500">{aiError || 'Not reachable'}</span>
          )}
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

