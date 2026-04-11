import { useState, useRef } from 'react';
import {
  Send, Eye, Paperclip, X, Loader2, CheckCircle, AlertCircle,
  ChevronDown, Mail,
} from 'lucide-react';
import toast from 'react-hot-toast';

const QUALITY_OPTIONS = [
  { value: 'hot',  label: '🔥 Hot',  desc: 'High-intent leads' },
  { value: 'warm', label: '☀️ Warm', desc: 'Moderate-fit leads' },
  { value: 'cold', label: '🧊 Cold', desc: 'Early-stage leads' },
];

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium" style={{ color: 'var(--text-1)' }}>
        {label}
        {hint && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-3)' }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function inputClass() {
  return 'w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all border focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)]';
}

function inputStyle() {
  return {
    backgroundColor: 'var(--bg)',
    color: 'var(--text-1)',
    borderColor: 'var(--border-md)',
  };
}

export default function Outreach() {
  const [form, setForm] = useState({
    secret: '',
    quality: 'hot',
    subject: '',
    templatePrompt: '',
    campaignId: '',
    tenantId: '',
  });
  const [files, setFiles] = useState([]);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const fileInputRef = useRef(null);

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function onFiles(e) {
    const picked = Array.from(e.target.files || []);
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...picked.filter((f) => !names.has(f.name))];
    });
    e.target.value = '';
  }

  function removeFile(name) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }

  function buildFormData(includeFiles = true) {
    const fd = new FormData();
    fd.append('secret', form.secret);
    fd.append('quality', form.quality);
    fd.append('subject', form.subject);
    fd.append('templatePrompt', form.templatePrompt);
    if (form.campaignId) fd.append('campaignId', form.campaignId);
    if (form.tenantId) fd.append('tenantId', form.tenantId);
    if (includeFiles) {
      files.forEach((f) => fd.append('attachments', f));
    }
    return fd;
  }

  const baseUrl = import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : '/api';

  async function handlePreview() {
    if (!form.secret) return toast.error('Enter the outreach secret');
    if (!form.templatePrompt.trim()) return toast.error('Add a template prompt');
    setPreviewLoading(true);
    setPreview(null);
    try {
      const res = await fetch(`${baseUrl}/outreach/preview`, {
        method: 'POST',
        body: buildFormData(false),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview failed');
      setPreview(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSend() {
    if (!form.secret) return toast.error('Enter the outreach secret');
    if (!form.subject.trim()) return toast.error('Add a subject line');
    if (!form.templatePrompt.trim()) return toast.error('Add a template prompt');
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${baseUrl}/outreach/send`, {
        method: 'POST',
        body: buildFormData(true),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Send failed');
      setResult(data);
      if (data.sent > 0) toast.success(`${data.sent} email${data.sent > 1 ? 's' : ''} sent!`);
      else toast.error('No emails sent — check errors below');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
          Outreach
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
          AI-generated personalised emails — sent directly to filtered leads via SMTP.
        </p>
      </div>

      {/* Form card */}
      <div className="card p-6 space-y-5">

        {/* Secret */}
        <Field label="Outreach Secret" hint="required">
          <input
            type="password"
            className={inputClass()}
            style={inputStyle()}
            placeholder="drip-secret-2026"
            value={form.secret}
            onChange={(e) => set('secret', e.target.value)}
          />
        </Field>

        {/* Lead quality */}
        <Field label="Lead Quality">
          <div className="grid grid-cols-3 gap-2">
            {QUALITY_OPTIONS.map(({ value, label, desc }) => (
              <button
                key={value}
                type="button"
                onClick={() => set('quality', value)}
                className="flex flex-col items-start px-3.5 py-2.5 rounded-xl border text-sm transition-all"
                style={{
                  borderColor: form.quality === value ? 'var(--accent)' : 'var(--border-md)',
                  backgroundColor: form.quality === value ? 'rgba(255,85,51,0.07)' : 'var(--bg)',
                  color: form.quality === value ? 'var(--accent)' : 'var(--text-2)',
                  fontWeight: form.quality === value ? 600 : 400,
                }}
              >
                <span>{label}</span>
                <span className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)', fontWeight: 400 }}>{desc}</span>
              </button>
            ))}
          </div>
        </Field>

        {/* Subject */}
        <Field label="Email Subject" hint="required for sending">
          <input
            type="text"
            className={inputClass()}
            style={inputStyle()}
            placeholder="Quick thought on your work at {{company}}"
            value={form.subject}
            onChange={(e) => set('subject', e.target.value)}
          />
        </Field>

        {/* Template prompt */}
        <Field label="AI Prompt" hint="Ollama generates the email body from this">
          <textarea
            rows={5}
            className={inputClass()}
            style={{ ...inputStyle(), resize: 'vertical' }}
            placeholder={`Example:\nWrite a concise cold email for a B2B SaaS founder. Mention their industry or known pain points. Introduce Drip as an AI tool that automates lead generation. End with a soft CTA for a 15-min call. Keep it under 120 words.`}
            value={form.templatePrompt}
            onChange={(e) => set('templatePrompt', e.target.value)}
          />
        </Field>

        {/* Optional filters */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Campaign ID" hint="optional">
            <input
              type="text"
              className={inputClass()}
              style={inputStyle()}
              placeholder="Leave blank for all"
              value={form.campaignId}
              onChange={(e) => set('campaignId', e.target.value)}
            />
          </Field>
          <Field label="Tenant ID" hint="optional">
            <input
              type="text"
              className={inputClass()}
              style={inputStyle()}
              placeholder="Leave blank for default"
              value={form.tenantId}
              onChange={(e) => set('tenantId', e.target.value)}
            />
          </Field>
        </div>

        {/* File attachments */}
        <Field label="Attachments" hint="optional — attached to every email">
          <div
            className="rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-colors hover:opacity-80"
            style={{ borderColor: 'var(--border-md)', backgroundColor: 'var(--bg)' }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="w-4 h-4 mx-auto mb-1" style={{ color: 'var(--text-3)' }} />
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              Click to attach PDF, DOCX, images…
            </p>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFiles} />
          </div>
          {files.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {files.map((f) => (
                <div
                  key={f.name}
                  className="flex items-center justify-between px-3 py-1.5 rounded-lg text-xs"
                  style={{ backgroundColor: 'var(--active)', color: 'var(--text-2)' }}
                >
                  <span className="truncate max-w-[80%]">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(f.name)}
                    style={{ color: 'var(--text-3)' }}
                    className="ml-2 hover:opacity-70"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Field>

        {/* Actions */}
        <div className="flex gap-2.5 pt-1">
          <button
            type="button"
            onClick={handlePreview}
            disabled={previewLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all disabled:opacity-50"
            style={{ borderColor: 'var(--border-md)', color: 'var(--text-2)', backgroundColor: 'var(--bg)' }}
          >
            {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            Preview
          </button>

          <button
            type="button"
            onClick={handleSend}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)', color: '#fff', boxShadow: '0 2px 8px rgba(255,85,51,0.3)' }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {loading ? 'Sending…' : 'Send emails'}
          </button>
        </div>
      </div>

      {/* Preview result */}
      {preview && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Preview</h2>
          </div>
          <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--text-2)' }}>
            <span>
              <span className="font-semibold text-base" style={{ color: 'var(--text-1)' }}>{preview.matchingLeads}</span>
              {' '}matching leads
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'var(--active)', color: 'var(--accent)' }}>
              {preview.quality}
            </span>
          </div>
          {preview.sampleLead && (
            <div className="text-xs space-y-0.5" style={{ color: 'var(--text-3)' }}>
              <p>Sample lead: <span style={{ color: 'var(--text-2)' }}>{preview.sampleLead.name || preview.sampleLead.email}</span></p>
            </div>
          )}
          {preview.sampleBody && (
            <div
              className="mt-2 rounded-xl p-4 text-sm whitespace-pre-wrap leading-relaxed border"
              style={{ backgroundColor: 'var(--bg)', color: 'var(--text-2)', borderColor: 'var(--border-md)' }}
            >
              {preview.sampleBody}
            </div>
          )}
        </div>
      )}

      {/* Send result */}
      {result && (
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Results</h2>
          </div>
          <div className="grid grid-cols-4 gap-3 text-center">
            {[
              { label: 'Sent',    value: result.sent,    color: '#22c55e' },
              { label: 'Failed',  value: result.failed,  color: '#ef4444' },
              { label: 'Skipped', value: result.skipped, color: 'var(--text-3)' },
              { label: 'Total',   value: result.total,   color: 'var(--text-2)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg)' }}>
                <p className="text-xl font-bold" style={{ color }}>{value}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{label}</p>
              </div>
            ))}
          </div>
          {result.errors?.length > 0 && (
            <div className="space-y-1.5 mt-1">
              {result.errors.map((e, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg"
                  style={{ backgroundColor: 'rgba(239,68,68,0.07)', color: '#ef4444' }}
                >
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{e.email}: {e.error}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
