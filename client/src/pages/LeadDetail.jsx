import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Copy, ExternalLink, Loader2, Tag, Sparkles,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useLead } from '../hooks/useLeads.js';
import CategoryBadge from '../components/CategoryBadge.jsx';
import apiClient from '../api/client.js';

const CATEGORIES = ['hot', 'warm', 'cold', 'disqualified', 'pending'];

function Field({ label, value, mono = false }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-3)' }}>{label}</dt>
      <dd className={`text-sm ${mono ? 'font-mono' : ''}`} style={{ color: 'var(--text-1)' }}>{value}</dd>
    </div>
  );
}

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: lead, isLoading, isError } = useLead(id);

  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');

  const [synced, setSynced] = useState(false);
  if (lead && !synced) {
    setCategory(lead.manual_category || 'pending');
    setNotes(lead.manual_notes || '');
    setSynced(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.put(`/leads/${id}/categorize`, {
        manual_category: category,
        manual_notes: notes,
      });
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['lead', id], updated);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      toast.success('Lead updated');
    },
    onError: () => toast.error('Failed to save'),
  });

  const enrichMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post(`/leads/${id}/enrich`);
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['lead', id], updated);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead enriched by AI');
    },
    onError: () => toast.error('Enrichment failed — is Ollama running?'),
  });

  function copyEmail() {
    if (!lead?.email) return;
    navigator.clipboard.writeText(lead.email).then(() => toast.success('Email copied!'));
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-3)' }} />
      </div>
    );
  }

  if (isError || !lead) {
    return (
      <div className="text-center py-16">
        <p className="mb-4" style={{ color: 'var(--text-3)' }}>Lead not found.</p>
        <Link to="/" className="btn-secondary">← Back to Dashboard</Link>
      </div>
    );
  }

  const isEnriched = !!lead.enriched_at;

  return (
    <div className="max-w-4xl space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg transition-colors"
          style={{ color: 'var(--text-2)' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ''; }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-black truncate" style={{ color: 'var(--text-1)' }}>{lead.full_name}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            {lead.job_title && `${lead.job_title} · `}
            {lead.company_name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CategoryBadge value={lead.lead_quality} type="quality" size="md" />
          <CategoryBadge value={lead.manual_category} type="category" size="md" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Lead info */}
        <div className="lg:col-span-2 space-y-4">
          {/* Contact */}
          <div className="card p-5">
            <h2 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-3)' }}>Contact Information</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full Name" value={lead.full_name} />
              <Field label="Job Title" value={lead.job_title} />
              <Field label="Company" value={lead.company_name} />
              <Field label="Domain" value={lead.company_domain} />
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-3)' }}>Email</dt>
                <dd className="mt-1 flex items-center gap-2">
                  <span className="text-sm font-mono" style={{ color: 'var(--text-1)' }}>{lead.email}</span>
                  <button
                    onClick={copyEmail}
                    className="p-1 rounded transition-colors"
                    style={{ color: 'var(--text-3)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)'; }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </dd>
              </div>
              <Field label="Location" value={lead.location} />
              {lead.linkedin_url && (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-3)' }}>LinkedIn</dt>
                  <dd className="mt-1">
                    <a
                      href={lead.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm hover:underline flex items-center gap-1"
                      style={{ color: 'var(--text-1)' }}
                    >
                      Open profile <ExternalLink className="w-3 h-3" />
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* AI Enrichment */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>AI Enrichment</h2>
              {!isEnriched && (
                <button
                  onClick={() => enrichMutation.mutate()}
                  disabled={enrichMutation.isPending}
                  className="btn-primary flex items-center gap-1.5 text-xs py-1.5 px-3 disabled:opacity-50"
                >
                  {enrichMutation.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Sparkles className="w-3.5 h-3.5" />
                  }
                  {enrichMutation.isPending ? 'Enriching…' : 'Enrich now'}
                </button>
              )}
            </div>

            {isEnriched ? (
              <dl className="space-y-4">
                <Field label="Pain Points" value={lead.pain_points} />
                <Field label="Reason for Outreach" value={lead.reason_for_outreach} />
              </dl>
            ) : (
              <p className="text-sm italic" style={{ color: 'var(--text-3)' }}>
                Not yet enriched. Click "Enrich now" or wait for the next auto-sweep (every 5 min).
              </p>
            )}
          </div>

          {/* Metadata */}
          <div className="card p-5">
            <h2 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--text-3)' }}>Metadata</h2>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Source" value={lead.source} />
              <Field label="Status" value={lead.status} />
              <Field
                label="Added"
                value={lead.created_at ? format(new Date(lead.created_at), 'MMM d, yyyy HH:mm') : undefined}
              />
              <Field
                label="Enriched"
                value={lead.enriched_at ? format(new Date(lead.enriched_at), 'MMM d, yyyy HH:mm') : 'Not enriched'}
              />
            </dl>
          </div>
        </div>

        {/* Right — categorization panel */}
        <div className="space-y-4">
          {lead.confidence_score != null && (
            <div className="card p-4 text-center">
              <p className="text-3xl font-black" style={{ color: 'var(--text-1)' }}>{lead.confidence_score}%</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>AI Confidence Score</p>
            </div>
          )}

          <div className="card p-4 space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
              <Tag className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
              Manual Category
            </h2>

            <div className="grid grid-cols-1 gap-1.5">
              {CATEGORIES.map((cat) => {
                const isActive = category === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className="px-3 py-2 rounded-lg text-sm text-left capitalize transition-all border"
                    style={isActive
                      ? { backgroundColor: 'var(--btn-bg)', color: 'var(--btn-text)', borderColor: 'var(--btn-bg)', fontWeight: 600 }
                      : { backgroundColor: 'var(--hover)', color: 'var(--text-2)', borderColor: 'var(--border)' }
                    }
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest block mb-1" style={{ color: 'var(--text-3)' }}>Notes</label>
              <textarea
                className="input min-h-[80px] resize-none text-sm"
                placeholder="Add notes…"
                maxLength={1000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="btn-primary w-full gap-2 justify-center flex items-center"
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
