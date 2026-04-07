import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Copy, ExternalLink, Loader2, Tag,
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
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className={`mt-1 text-sm text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</dd>
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

  // Sync form state when lead loads
  const [synced, setSynced] = useState(false);
  if (lead && !synced) {
    setCategory(lead.manual_category || 'pending');
    setNotes(lead.manual_notes || '');
    setSynced(true);
  }

  const mutation = useMutation({
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

  function copyEmail() {
    if (!lead?.email) return;
    navigator.clipboard.writeText(lead.email).then(() => toast.success('Email copied!'));
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (isError || !lead) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 mb-4">Lead not found.</p>
        <Link to="/" className="btn-secondary">← Back to Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{lead.full_name}</h1>
          <p className="text-sm text-gray-500">
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
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Contact Information</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full Name" value={lead.full_name} />
              <Field label="Job Title" value={lead.job_title} />
              <Field label="Company" value={lead.company_name} />
              <Field label="Domain" value={lead.company_domain} />
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Email</dt>
                <dd className="mt-1 flex items-center gap-2">
                  <span className="text-sm font-mono text-gray-900">{lead.email}</span>
                  <button onClick={copyEmail} className="p-1 hover:bg-gray-100 rounded">
                    <Copy className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                </dd>
              </div>
              <Field label="Location" value={lead.location} />
              {lead.linkedin_url && (
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">LinkedIn</dt>
                  <dd className="mt-1">
                    <a
                      href={lead.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-indigo-600 hover:underline flex items-center gap-1"
                    >
                      Open profile <ExternalLink className="w-3 h-3" />
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {(lead.pain_points || lead.reason_for_outreach) && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">AI Enrichment</h2>
              <dl className="space-y-3">
                <Field label="Pain Points" value={lead.pain_points} />
                <Field label="Reason for Outreach" value={lead.reason_for_outreach} />
              </dl>
            </div>
          )}

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Metadata</h2>
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
              <p className="text-3xl font-bold text-indigo-600">{lead.confidence_score}%</p>
              <p className="text-xs text-gray-500 mt-1">AI Confidence Score</p>
            </div>
          )}

          <div className="card p-4 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Manual Category
            </h2>

            <div className="grid grid-cols-1 gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-2 rounded-lg text-sm text-left capitalize transition-all ${
                    category === cat
                      ? 'bg-indigo-600 text-white font-medium'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div>
              <label className="label text-xs">Notes</label>
              <textarea
                className="input min-h-[80px] resize-none text-sm"
                placeholder="Add notes…"
                maxLength={1000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="btn-primary w-full gap-2 justify-center"
            >
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
