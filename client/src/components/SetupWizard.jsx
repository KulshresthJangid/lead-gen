import { useState } from 'react';
import { CheckCircle, Circle, ChevronRight, ChevronLeft, Loader2, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../api/client.js';

const STEPS = [
  { id: 1, title: 'Welcome', desc: 'Before you begin' },
  { id: 2, title: 'Product', desc: 'What you sell' },
  { id: 3, title: 'ICP', desc: 'Who you target' },
  { id: 4, title: 'Scraper', desc: 'First target URL' },
  { id: 5, title: 'Ollama', desc: 'AI enrichment check' },
  { id: 6, title: 'Done', desc: 'All set!' },
];

const CHECKLIST = [
  'Ollama installed & running on localhost:11434',
  'Mistral model pulled (ollama pull mistral)',
  'Node.js 20+ installed',
];

export default function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState(null); // null | 'checking' | 'ok' | 'fail'
  const [form, setForm] = useState({
    product_description: '',
    icp_description: '',
    scraper_url: '',
    scraper_name: '',
    ollama_endpoint: 'http://localhost:11434',
    ollama_model: 'mistral',
    scraping_interval: '30',
  });

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function checkOllama() {
    setOllamaStatus('checking');
    try {
      await apiClient.get('/pipeline/status'); // server checks Ollama internally
      const res = await apiClient.get('/pipeline/status');
      if (res.data.ollamaOnline) {
        setOllamaStatus('ok');
        toast.success('Ollama is online!');
      } else {
        setOllamaStatus('fail');
        toast.error('Ollama not reachable — check if it is running');
      }
    } catch {
      setOllamaStatus('fail');
      toast.error('Could not reach the server');
    }
  }

  async function finish() {
    setSaving(true);
    try {
      const targets = [];
      if (form.scraper_url) {
        targets.push({ name: form.scraper_name || 'Custom source', url: form.scraper_url, selectors: {} });
      }

      await apiClient.put('/settings', {
        product_description: form.product_description,
        icp_description: form.icp_description,
        ollama_endpoint: form.ollama_endpoint,
        ollama_model: form.ollama_model,
        scraping_interval: form.scraping_interval,
        scraper_targets: targets,
      });

      await apiClient.post('/settings/setup/complete');
      toast.success('Setup complete! Welcome to LeadGen Pro.');
      onComplete();
    } catch {
      toast.error('Setup failed — please try again');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-600 rounded-xl mb-4">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">LeadGen Pro</h1>
          <p className="text-gray-500 mt-1">B2B Lead Generation & Enrichment Platform</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-colors ${
                  s.id < step
                    ? 'bg-green-500 text-white'
                    : s.id === step
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {s.id < step ? <CheckCircle className="w-4 h-4" /> : s.id}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 mx-1 ${s.id < step ? 'bg-green-300' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="card p-8">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Welcome — Quick Checklist</h2>
              <p className="text-gray-500">Make sure these are ready before continuing:</p>
              <ul className="space-y-3">
                {CHECKLIST.map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <span className="text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Describe Your Product</h2>
              <p className="text-gray-500">This helps the AI understand what outcomes you deliver.</p>
              <div>
                <label className="label">Product / Service Description *</label>
                <textarea
                  className="input min-h-[120px] resize-none"
                  placeholder="e.g. A SaaS analytics platform that helps e-commerce teams reduce churn by 30% through behavioral cohort analysis…"
                  value={form.product_description}
                  onChange={(e) => update('product_description', e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Define Your ICP</h2>
              <p className="text-gray-500">Who is your ideal customer? Be specific — the AI uses this to score leads.</p>
              <div>
                <label className="label">Ideal Customer Profile (ICP) *</label>
                <textarea
                  className="input min-h-[120px] resize-none"
                  placeholder="e.g. Head of Growth or VP Marketing at Series A-C SaaS companies (50-500 employees) in the US/EU, tech-savvy, using Mixpanel or Amplitude, ARR $2M-$20M…"
                  value={form.icp_description}
                  onChange={(e) => update('icp_description', e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Add a Scraper Target</h2>
              <p className="text-gray-500">
                Add your first lead source. You can add more later in Settings. Leave blank to use the
                built-in GitHub demo source.
              </p>
              <div>
                <label className="label">Source Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Company Blog, Open Source Contributors"
                  value={form.scraper_name}
                  onChange={(e) => update('scraper_name', e.target.value)}
                />
              </div>
              <div>
                <label className="label">URL to scrape</label>
                <input
                  type="url"
                  className="input"
                  placeholder="https://example.com/team"
                  value={form.scraper_url}
                  onChange={(e) => update('scraper_url', e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">AI Enrichment Check</h2>
              <p className="text-gray-500">Verify Ollama is running and accessible.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Ollama Endpoint</label>
                  <input
                    type="url"
                    className="input"
                    value={form.ollama_endpoint}
                    onChange={(e) => update('ollama_endpoint', e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Model</label>
                  <input
                    type="text"
                    className="input"
                    value={form.ollama_model}
                    onChange={(e) => update('ollama_model', e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="label">Scraping Interval</label>
                <select
                  className="input"
                  value={form.scraping_interval}
                  onChange={(e) => update('scraping_interval', e.target.value)}
                >
                  <option value="15">Every 15 minutes</option>
                  <option value="30">Every 30 minutes</option>
                  <option value="60">Every hour</option>
                  <option value="360">Every 6 hours</option>
                </select>
              </div>
              <button
                onClick={checkOllama}
                disabled={ollamaStatus === 'checking'}
                className="btn-secondary gap-2"
              >
                {ollamaStatus === 'checking' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Circle className="w-4 h-4" />
                )}
                Test Connection
              </button>
              {ollamaStatus === 'ok' && (
                <p className="text-green-600 text-sm font-medium">✓ Ollama is online</p>
              )}
              {ollamaStatus === 'fail' && (
                <p className="text-red-500 text-sm">
                  ✗ Cannot reach Ollama. You can still continue — enrichment will be skipped until Ollama is
                  online.
                </p>
              )}
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-2">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900">You're all set!</h2>
              <p className="text-gray-500">
                Click <strong>Launch Dashboard</strong> to start the platform. The pipeline will run on
                schedule and enrich leads automatically.
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 1}
            className="btn-secondary gap-2 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          {step < 6 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={
                (step === 2 && !form.product_description.trim()) ||
                (step === 3 && !form.icp_description.trim())
              }
              className="btn-primary gap-2 disabled:opacity-40"
            >
              Continue
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={finish} disabled={saving} className="btn-primary gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Launch Dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
