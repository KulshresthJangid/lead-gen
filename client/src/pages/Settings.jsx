import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, Save, Trash2, CheckCircle, AlertCircle,
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
        <p className="text-sm text-gray-500 mt-0.5">
          Configure AI enrichment and workspace settings.{' '}
          <Link to="/campaigns" className="text-indigo-600 hover:text-indigo-800 underline underline-offset-2">
            Manage campaigns
          </Link>{' '}
          for pipeline targets and ICP.
        </p>
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
