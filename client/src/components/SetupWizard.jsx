import { useState, useEffect, useCallback } from 'react';
import { ArrowRight, ArrowLeft, Flame, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../api/client.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const PRODUCT_CATEGORIES = [
  { id: 'devops',     emoji: '⚙️',  label: 'DevOps',               template: 'We make a DevOps platform that automates infrastructure provisioning and deployment pipelines for engineering teams — reducing release cycles from days to minutes.' },
  { id: 'ai-tools',  emoji: '🤖',  label: 'AI Tools',              template: 'We build AI-powered developer tooling that helps engineering teams write better code, catch bugs earlier, and ship faster without adding headcount.' },
  { id: 'data',      emoji: '📊',  label: 'Data / Analytics',      template: 'We provide a modern data stack platform that lets data teams build reliable pipelines and dashboards without needing to manage complex infrastructure.' },
  { id: 'security',  emoji: '🔒',  label: 'Security',              template: 'We make a security platform that gives engineering teams real-time vulnerability detection and automated remediation across their entire cloud stack.' },
  { id: 'dx',        emoji: '⚡',  label: 'Dev Productivity',      template: 'We build developer productivity tooling that eliminates context-switching and automates repetitive engineering workflows — saving 5+ hours per engineer per week.' },
  { id: 'analytics', emoji: '📈',  label: 'Product Analytics',     template: 'We build product analytics that helps B2B SaaS teams understand user behaviour, reduce churn, and surface the insights that drive retention.' },
  { id: 'other',     emoji: '🧩',  label: 'Other',                 template: 'We make [your product] that helps [your audience] solve [their problem] — resulting in [measurable outcome].' },
];

const BUYER_PERSONAS = [
  { id: 'cto',       label: 'CTO',            emoji: '👨‍💻' },
  { id: 'founder',   label: 'Founder',        emoji: '🚀' },
  { id: 'vp-eng',   label: 'VP Engineering',  emoji: '🏗️' },
  { id: 'lead-dev',  label: 'Lead Dev',        emoji: '💻' },
  { id: 'growth',    label: 'Growth PM',       emoji: '📣' },
];

const COMPANY_SIZES = [
  { id: '1-10',   label: '1–10',   sub: 'Solo / Seed' },
  { id: '10-50',  label: '10–50',  sub: 'Early stage' },
  { id: '50-200', label: '50–200', sub: 'Series A/B' },
  { id: '200+',   label: '200+',   sub: 'Enterprise' },
];

const PAIN_POINTS = [
  'Manual processes taking too much time',
  'Too expensive to hire SDRs or sales team',
  'Existing lead lists are stale or low quality',
  'No visibility into who is engaging with us',
  'Tech stack is too complex or costly',
  'Long sales cycles with no pipeline visibility',
  'Hard to stand out in a crowded market',
  'Scaling engineering without adding headcount',
];

const GEOGRAPHIES = [
  { id: 'global',         label: 'Global 🌍' },
  { id: 'north-america',  label: 'North America 🇺🇸' },
  { id: 'europe',         label: 'Europe 🇪🇺' },
  { id: 'asia',           label: 'Asia 🌏' },
  { id: 'india',          label: 'India 🇮🇳' },
];

const AI_MODELS = [
  { id: 'ollama', icon: '🖥️', label: 'Local Ollama', desc: 'Runs on your server. Zero data egress. Best for privacy.', badge: 'Recommended' },
  { id: 'cloud',  icon: '☁️', label: 'Cloud API',    desc: 'OpenAI or Groq. Faster, no local setup needed.', badge: 'Easier setup' },
  { id: 'skip',   icon: '⏭️', label: 'Skip for now', desc: 'Set up enrichment later in Settings.', badge: null },
];

const LEAD_SOURCES = [
  { id: 'github',     icon: '🐙', label: 'GitHub',     desc: 'Developers, CTOs, open-source founders' },
  { id: 'hackernews', icon: '🟠', label: 'HackerNews', desc: '"Who wants to be hired" threads' },
  { id: 'gitlab',     icon: '🦊', label: 'GitLab',     desc: 'Engineering-focused profiles' },
  { id: 'google',     icon: '🔍', label: 'Google',     desc: 'Custom keyword targeting via CSE' },
];

const CLOUD_PROVIDERS = [
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { id: 'groq',   label: 'Groq',   placeholder: 'gsk_...' },
];

const INTERVALS = [
  { val: 15,  label: '15 min' },
  { val: 30,  label: '30 min' },
  { val: 60,  label: '1 hour' },
  { val: 360, label: '6 hours' },
];

const TOTAL_STEPS = 5;
const LS_KEY = 'drip_wizard_draft';

// ── ICP Quality Scorer ────────────────────────────────────────────────────────

function computeIcpScore({ productDesc, selectedPersonas, selectedPains, companySize, geography, selectedSources }) {
  let score = 0;
  if (productDesc.length >= 150) score += 20;
  else if (productDesc.length >= 80) score += 12;
  else if (productDesc.length >= 40) score += 5;
  if (selectedPersonas.length > 0) score += 15;
  if (selectedPains.length >= 3) score += 15;
  else if (selectedPains.length >= 1) score += 8;
  if (companySize) score += 10;
  score += Math.min(selectedSources.length * 10, 30);
  if (geography.length > 0 && !geography.includes('global')) score += 10;
  return Math.min(score, 100);
}

// ── Quality Gauge SVG ─────────────────────────────────────────────────────────

function QualityGauge({ score }) {
  const r   = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color  = score >= 70 ? 'var(--success)' : score >= 40 ? 'var(--warm)' : 'var(--accent)';
  const label  = score >= 70 ? 'Strong' : score >= 40 ? 'Good start' : 'Add detail';
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border-md)" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1), stroke 0.4s ease' }} />
        <text x="50" y="48" textAnchor="middle" fontSize="20" fontWeight="700" fill={color}
          style={{ fontFamily: 'var(--font-mono)' }}>{score}</text>
        <text x="50" y="63" textAnchor="middle" fontSize="8" fill="var(--text-3)"
          style={{ fontFamily: 'var(--font-mono)' }}>/100</text>
      </svg>
      <span className="text-xs font-bold uppercase tracking-widest" style={{ color, fontFamily: 'var(--font-mono)' }}>{label}</span>
    </div>
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBar({ step }) {
  return (
    <div className="px-8 pt-8 pb-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
          Step {step} of {TOTAL_STEPS}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
          {Math.round((step / TOTAL_STEPS) * 100)}%
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-md)' }}>
        <div className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${(step / TOTAL_STEPS) * 100}%`, background: 'linear-gradient(90deg,var(--accent),#ff8866)' }} />
      </div>
    </div>
  );
}

// ── Step Header ───────────────────────────────────────────────────────────────

function StepHeader({ step, title, subtitle }) {
  return (
    <div className="px-8 pt-5 pb-4 animate-slide-up">
      <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
        Step {step}
      </span>
      <h2 className="text-2xl font-bold mt-1 leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>{title}</h2>
      {subtitle && <p className="mt-1.5 text-sm" style={{ color: 'var(--text-2)' }}>{subtitle}</p>}
    </div>
  );
}

// ── Nav Buttons ───────────────────────────────────────────────────────────────

function NavButtons({ onBack, onNext, nextLabel = 'Continue', nextDisabled = false }) {
  return (
    <div className="flex items-center justify-between px-8 py-5" style={{ borderTop: '1px solid var(--border)' }}>
      {onBack
        ? <button onClick={onBack} className="btn-ghost flex items-center gap-1.5 text-sm"><ArrowLeft className="w-4 h-4" />Back</button>
        : <div />}
      <button onClick={onNext} disabled={nextDisabled}
        className="btn-accent flex items-center gap-2 px-6 py-2.5 text-sm">
        {nextLabel}<ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Confetti (pure CSS) ───────────────────────────────────────────────────────

function Confetti() {
  const pieces = Array.from({ length: 18 }, (_, i) => ({
    left: `${5 + (i * 5.5) % 90}%`,
    delay: `${(i * 0.12) % 1.6}s`,
    color: ['var(--accent)', 'var(--warm)', 'var(--success)', 'var(--cold)', '#a78bfa'][i % 5],
    size: `${6 + (i % 3) * 3}px`,
  }));
  return (
    <div className="absolute inset-x-0 top-0 h-32 pointer-events-none overflow-hidden">
      {pieces.map((p, i) => (
        <div key={i} style={{
          position: 'absolute', left: p.left, top: '-10px',
          width: p.size, height: p.size,
          borderRadius: i % 2 === 0 ? '50%' : '2px',
          backgroundColor: p.color,
          animation: `confettiFall 1.8s ease-in ${p.delay} both`,
        }} />
      ))}
    </div>
  );
}

// ── Step 1: What do you make? ─────────────────────────────────────────────────

function Step1({ data, onChange }) {
  return (
    <div className="px-8 pb-2 space-y-5 animate-slide-up">
      <div>
        <label className="label">What category best fits?</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-2">
          {PRODUCT_CATEGORIES.map((cat) => (
            <button key={cat.id}
              onClick={() => {
                onChange('category', cat.id);
                if (!data.productDesc || data.productDesc === data._lastTemplate) {
                  onChange('productDesc', cat.template);
                  onChange('_lastTemplate', cat.template);
                }
              }}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-xs font-semibold transition-all duration-150 active:scale-[0.97]"
              style={{
                border: `2px solid ${data.category === cat.id ? 'var(--accent)' : 'var(--border-md)'}`,
                background: data.category === cat.id ? 'var(--accent-subtle)' : 'var(--card)',
                color: data.category === cat.id ? 'var(--accent)' : 'var(--text-2)',
                fontFamily: 'var(--font-display)',
              }}>
              <span className="text-base">{cat.emoji}</span>{cat.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="label mb-0">Describe what you do</label>
          <span className="text-xs" style={{ color: data.productDesc.length > 50 ? 'var(--success)' : 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
            {data.productDesc.length} / 200
          </span>
        </div>
        <textarea className="textarea w-full" rows={4}
          placeholder="We make a ___ that helps ___ solve ___ — resulting in ___."
          value={data.productDesc} onChange={(e) => onChange('productDesc', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-3" style={{ background: 'var(--success-bg)', border: '1px solid rgba(34,166,99,0.2)' }}>
          <p className="text-xs font-bold mb-1" style={{ color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>✓ Strong example</p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
            "We build a DevOps platform for engineering teams at 10–100 person SaaS companies that reduces deployment time by 80%."
          </p>
        </div>
        <div className="rounded-xl p-3" style={{ background: 'var(--error-bg)', border: '1px solid rgba(229,55,58,0.2)' }}>
          <p className="text-xs font-bold mb-1" style={{ color: 'var(--error)', fontFamily: 'var(--font-mono)' }}>✗ Too vague</p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
            "We make software for businesses."
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: Who do you sell to? ───────────────────────────────────────────────

function Step2({ data, onChange }) {
  const toggle = (key, id, clearGlobal = false) => {
    const cur = data[key];
    if (clearGlobal && id === 'global') { onChange(key, ['global']); return; }
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur.filter((x) => clearGlobal ? x !== 'global' : true), id];
    onChange(key, next);
  };
  const toggleArr = (key, val) => {
    const cur = data[key];
    onChange(key, cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val]);
  };

  return (
    <div className="px-8 pb-2 space-y-6 animate-slide-up">
      <div>
        <label className="label">Who's your buyer?</label>
        <div className="flex flex-wrap gap-2 mt-2">
          {BUYER_PERSONAS.map((p) => (
            <button key={p.id} onClick={() => toggleArr('personas', p.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all duration-150"
              style={{
                border: `2px solid ${data.personas.includes(p.id) ? 'var(--accent)' : 'var(--border-md)'}`,
                background: data.personas.includes(p.id) ? 'var(--accent-subtle)' : 'var(--card)',
                color: data.personas.includes(p.id) ? 'var(--accent)' : 'var(--text-2)',
              }}>
              {p.emoji} {p.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Company size</label>
        <div className="grid grid-cols-4 gap-2 mt-2">
          {COMPANY_SIZES.map((s) => (
            <button key={s.id} onClick={() => onChange('companySize', data.companySize === s.id ? null : s.id)}
              className="flex flex-col items-center justify-center py-3 rounded-xl text-center transition-all duration-150"
              style={{
                border: `2px solid ${data.companySize === s.id ? 'var(--accent)' : 'var(--border-md)'}`,
                background: data.companySize === s.id ? 'var(--accent-subtle)' : 'var(--card)',
              }}>
              <span className="text-sm font-bold" style={{ color: data.companySize === s.id ? 'var(--accent)' : 'var(--text-1)', fontFamily: 'var(--font-mono)' }}>{s.label}</span>
              <span className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>{s.sub}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Their pain points <span style={{ color: 'var(--text-3)' }}>(pick all that apply)</span></label>
        <div className="flex flex-wrap gap-2 mt-2">
          {PAIN_POINTS.map((pain) => (
            <button key={pain} onClick={() => toggleArr('pains', pain)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150"
              style={{
                border: `1.5px solid ${data.pains.includes(pain) ? 'var(--accent)' : 'var(--border-md)'}`,
                background: data.pains.includes(pain) ? 'var(--accent-subtle)' : 'transparent',
                color: data.pains.includes(pain) ? 'var(--accent)' : 'var(--text-2)',
              }}>
              {data.pains.includes(pain) && '✓ '}{pain}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Target geography</label>
        <div className="flex flex-wrap gap-2 mt-2">
          {GEOGRAPHIES.map((g) => (
            <button key={g.id} onClick={() => toggle('geography', g.id, true)}
              className="px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-150"
              style={{
                border: `2px solid ${data.geography.includes(g.id) ? 'var(--accent)' : 'var(--border-md)'}`,
                background: data.geography.includes(g.id) ? 'var(--accent-subtle)' : 'var(--card)',
                color: data.geography.includes(g.id) ? 'var(--accent)' : 'var(--text-2)',
              }}>
              {g.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Step 3: How will Drip find them? ─────────────────────────────────────────

function Step3({ data, onChange }) {
  const toggleSource = (id) => {
    const cur = data.sources;
    onChange('sources', cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id]);
  };
  return (
    <div className="px-8 pb-2 space-y-6 animate-slide-up">
      <div>
        <label className="label">AI enrichment model</label>
        <div className="grid grid-cols-3 gap-3 mt-2">
          {AI_MODELS.map((m) => (
            <button key={m.id} onClick={() => onChange('aiModel', m.id)}
              className="relative flex flex-col items-center text-center gap-2 p-4 rounded-2xl transition-all duration-200"
              style={{
                border: `2px solid ${data.aiModel === m.id ? 'var(--accent)' : 'var(--border-md)'}`,
                background: data.aiModel === m.id ? 'var(--accent-subtle)' : 'var(--card)',
              }}>
              {m.badge && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
                  style={{ background: 'var(--accent)', color: '#fff', fontFamily: 'var(--font-mono)' }}>
                  {m.badge}
                </span>
              )}
              <span className="text-2xl">{m.icon}</span>
              <span className="text-xs font-bold" style={{ fontFamily: 'var(--font-display)', color: data.aiModel === m.id ? 'var(--accent)' : 'var(--text-1)' }}>{m.label}</span>
              <span className="text-[11px] leading-snug" style={{ color: 'var(--text-3)' }}>{m.desc}</span>
            </button>
          ))}
        </div>
      </div>
      {data.aiModel === 'ollama' && (
        <div className="grid grid-cols-2 gap-3 animate-slide-down">
          <div>
            <label className="label">Ollama endpoint</label>
            <input className="input" placeholder="http://localhost:11434" value={data.ollamaEndpoint}
              onChange={(e) => onChange('ollamaEndpoint', e.target.value)} />
          </div>
          <div>
            <label className="label">Model</label>
            <input className="input" placeholder="mistral" value={data.ollamaModel}
              onChange={(e) => onChange('ollamaModel', e.target.value)} />
          </div>
        </div>
      )}
      {data.aiModel === 'cloud' && (
        <div className="space-y-3 animate-slide-down">
          <div>
            <label className="label">Provider</label>
            <div className="flex gap-2">
              {CLOUD_PROVIDERS.map((cp) => (
                <button key={cp.id} onClick={() => onChange('cloudProvider', cp.id)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    border: `2px solid ${data.cloudProvider === cp.id ? 'var(--accent)' : 'var(--border-md)'}`,
                    background: data.cloudProvider === cp.id ? 'var(--accent-subtle)' : 'var(--card)',
                    color: data.cloudProvider === cp.id ? 'var(--accent)' : 'var(--text-2)',
                  }}>
                  {cp.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">API Key</label>
            <input type="password" className="input"
              placeholder={CLOUD_PROVIDERS.find((cp) => cp.id === data.cloudProvider)?.placeholder ?? 'sk-...'}
              value={data.cloudApiKey} onChange={(e) => onChange('cloudApiKey', e.target.value)} />
            <p className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>Stored in your backend's .env — never sent to Drip servers.</p>
          </div>
        </div>
      )}
      <div>
        <label className="label">Lead sources <span style={{ color: 'var(--text-3)' }}>(select all that apply)</span></label>
        <div className="grid grid-cols-2 gap-3 mt-2">
          {LEAD_SOURCES.map((src) => (
            <button key={src.id} onClick={() => toggleSource(src.id)}
              className="source-card text-left"
              style={{
                borderColor: data.sources.includes(src.id) ? 'var(--accent)' : 'var(--border-md)',
                background: data.sources.includes(src.id) ? 'var(--accent-subtle)' : 'var(--card)',
              }}>
              <div className="flex items-center gap-2 w-full">
                <span className="text-xl">{src.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: data.sources.includes(src.id) ? 'var(--accent)' : 'var(--text-1)' }}>{src.label}</p>
                  <p className="text-[11px] leading-snug" style={{ color: 'var(--text-3)' }}>{src.desc}</p>
                </div>
                <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                  style={{ background: data.sources.includes(src.id) ? 'var(--accent)' : 'var(--border-md)' }}>
                  {data.sources.includes(src.id) && <span className="text-white text-[9px] font-bold">✓</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Step 4: Daily goal ────────────────────────────────────────────────────────

function Step4({ data, onChange }) {
  return (
    <div className="px-8 pb-2 space-y-7 animate-slide-up">
      <div>
        <div className="flex items-baseline justify-between mb-4">
          <label className="label mb-0">Daily lead target</label>
          <span className="text-4xl font-bold" style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{data.dailyGoal}</span>
        </div>
        <input type="range" min="10" max="200" step="5" value={data.dailyGoal}
          onChange={(e) => onChange('dailyGoal', Number(e.target.value))}
          className="w-full" style={{ accentColor: 'var(--accent)' }} />
        <div className="flex justify-between mt-1">
          <span className="text-xs" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>10</span>
          <span className="text-xs" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>200</span>
        </div>
      </div>
      <div className="rounded-2xl p-5 space-y-3"
        style={{ background: 'linear-gradient(135deg,var(--accent-subtle) 0%,transparent 100%)', border: '1px solid var(--accent-muted)' }}>
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>At this rate</p>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[{ label: 'per day', value: data.dailyGoal }, { label: 'per week', value: data.dailyGoal * 7 }, { label: 'per month', value: data.dailyGoal * 30 }].map(({ label, value }) => (
            <div key={label}>
              <p className="text-2xl font-bold" style={{ color: 'var(--text-1)', fontFamily: 'var(--font-mono)' }}>{value}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{label}</p>
            </div>
          ))}
        </div>
        <p className="text-xs" style={{ color: 'var(--text-2)' }}>All automatically enriched and scored by AI.</p>
      </div>
      <div>
        <label className="label">Scraping interval</label>
        <div className="grid grid-cols-4 gap-2 mt-2">
          {INTERVALS.map((inv) => (
            <button key={inv.val} onClick={() => onChange('interval', inv.val)}
              className="py-2.5 rounded-xl text-sm font-bold transition-all duration-150"
              style={{
                border: `2px solid ${data.interval === inv.val ? 'var(--accent)' : 'var(--border-md)'}`,
                background: data.interval === inv.val ? 'var(--accent-subtle)' : 'var(--card)',
                color: data.interval === inv.val ? 'var(--accent)' : 'var(--text-2)',
                fontFamily: 'var(--font-mono)',
              }}>
              {inv.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Step 5: Confirm & Launch ──────────────────────────────────────────────────

function Step5({ data, score, saving, onSave }) {
  const summary = [
    { label: 'Product',   value: data.productDesc.slice(0, 65) + (data.productDesc.length > 65 ? '…' : ''), icon: '📦' },
    { label: 'Persona',   value: data.personas.length > 0 ? data.personas.join(', ') : 'Not set', icon: '🎯' },
    { label: 'AI Model',  value: AI_MODELS.find((m) => m.id === data.aiModel)?.label ?? 'Skip', icon: '🧠' },
    { label: 'Sources',   value: data.sources.length > 0 ? data.sources.join(' · ') : 'None', icon: '🔗' },
    { label: 'Daily',     value: `${data.dailyGoal} leads / day`, icon: '📈' },
    { label: 'Interval',  value: INTERVALS.find((i) => i.val === data.interval)?.label ?? '30 min', icon: '⏱️' },
  ];
  return (
    <div className="px-8 pb-2 space-y-5 animate-pop-in relative overflow-hidden">
      <Confetti />
      <div className="flex items-center justify-between p-5 rounded-2xl"
        style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-muted)' }}>
        <div className="flex-1">
          <p className="text-sm font-bold mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>ICP Quality Score</p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
            {score >= 70 ? 'Your ICP is well-defined. Drip will find highly relevant leads.'
              : score >= 40 ? 'Good start. Add more persona detail to improve match quality.'
              : 'Consider adding buyer role, pain points, and company size for better targeting.'}
          </p>
        </div>
        <QualityGauge score={score} />
      </div>
      <div className="space-y-2">
        {summary.map(({ label, value, icon }, i) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3 rounded-xl animate-slide-up"
            style={{ background: 'var(--card)', border: '1px solid var(--border)', animationDelay: `${i * 60}ms` }}>
            <span className="text-base w-6 text-center">{icon}</span>
            <span className="text-xs font-bold uppercase tracking-widest w-24 flex-shrink-0"
              style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{label}</span>
            <span className="text-sm truncate" style={{ color: 'var(--text-1)' }}>{value}</span>
          </div>
        ))}
      </div>
      <button onClick={onSave} disabled={saving}
        className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-bold text-base transition-all duration-200"
        style={{
          background: 'linear-gradient(135deg,var(--accent) 0%,#ff8855 100%)',
          color: '#ffffff',
          fontFamily: 'var(--font-display)',
          boxShadow: '0 4px 20px rgba(255,85,51,0.35)',
          opacity: saving ? 0.7 : 1,
        }}>
        {saving ? <><Loader2 className="w-5 h-5 animate-spin" />Saving…</> : <><Flame className="w-5 h-5" />Save &amp; Start Finding Leads</>}
      </button>
    </div>
  );
}

// ── Main Wizard ───────────────────────────────────────────────────────────────

function buildIcpDescription(data) {
  const personas = data.personas.length > 0 ? data.personas.join('/') : 'technical founders';
  const size     = data.companySize ? `at ${data.companySize}-person companies` : '';
  const geo      = data.geography.length > 0 && !data.geography.includes('global') ? `in ${data.geography.join(', ')}` : '';
  const pains    = data.pains.length > 0 ? data.pains.slice(0, 3).join('; ') : 'scaling without adding headcount';
  return `Target: ${personas} ${size} ${geo}. Key pains: ${pains}. Look for people actively building or publishing technical work.`.trim();
}


export default function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [data, setData] = useState(() => {
    try { const s = localStorage.getItem(LS_KEY); if (s) return JSON.parse(s); } catch { /* ignore */ }
    return {
      category: null, productDesc: '', _lastTemplate: '',
      personas: [], companySize: null, pains: [], geography: ['global'],
      aiModel: 'ollama', ollamaEndpoint: 'http://localhost:11434', ollamaModel: 'mistral',
      cloudProvider: 'openai', cloudApiKey: '', sources: ['github', 'hackernews'],
      dailyGoal: 30, interval: 30,
    };
  });

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* ignore */ }
  }, [data]);

  const onChange = useCallback((key, value) => setData((prev) => ({ ...prev, [key]: value })), []);

  const icpScore = computeIcpScore({
    productDesc: data.productDesc,
    selectedPersonas: data.personas,
    selectedPains: data.pains,
    companySize: data.companySize,
    geography: data.geography,
    selectedSources: data.sources,
  });

  async function handleSave() {
    setSaving(true);
    try {
      const icpDescription = buildIcpDescription(data);
      const scraperTargets = data.sources.map((src) => ({ type: src, query: '', url: '' }));

      await apiClient.put('/settings', {
        product_description: data.productDesc,
        icp_description: icpDescription,
        ollama_endpoint: data.ollamaEndpoint,
        ollama_model: data.ollamaModel,
        scraping_interval: String(data.interval),
        scraper_targets: scraperTargets,
      });

      try {
        const campaigns = await apiClient.get('/campaigns');
        const defaultCampaign = campaigns.data?.[0];
        if (defaultCampaign?.id) {
          await apiClient.put(`/campaigns/${defaultCampaign.id}`, {
            product_description: data.productDesc,
            icp_description: icpDescription,
            scraper_targets: scraperTargets,
            scraping_interval: data.interval,
            daily_lead_target: data.dailyGoal,
          });
        }
      } catch { /* non-fatal */ }

      await apiClient.post('/settings/setup/complete');
      localStorage.removeItem(LS_KEY);
      toast.success('Setup complete — pipeline starting shortly 🚀');
      onComplete();
    } catch {
      toast.error('Setup failed — please try again');
    } finally {
      setSaving(false);
    }
  }

  const canProceed = { 1: data.productDesc.trim().length >= 40, 2: data.personas.length > 0 || data.companySize !== null, 3: data.sources.length > 0, 4: true, 5: true };

  return (
    <div className="wizard-container">
      <div className="wizard-card overflow-hidden">
        {/* Brand header */}
        <div className="px-8 py-5 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg,var(--accent-subtle) 0%,transparent 100%)', borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <span className="text-xl">💧</span>
            <span className="font-bold text-sm tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>Drip</span>
          </div>
          {step < TOTAL_STEPS && (
            <button onClick={onComplete} className="text-xs font-medium underline underline-offset-2" style={{ color: 'var(--text-3)' }}>
              Skip for now
            </button>
          )}
        </div>

        <ProgressBar step={step} />

        {/* Step content */}
        <div className="min-h-[420px]">
          {step === 1 && <><StepHeader step={1} title="What does your product do?" subtitle="This becomes the AI's context for every lead it enriches." /><Step1 data={data} onChange={onChange} /></>}
          {step === 2 && <><StepHeader step={2} title="Who do you sell to?" subtitle="Define your ICP so Drip targets the right people." /><Step2 data={data} onChange={onChange} /></>}
          {step === 3 && <><StepHeader step={3} title="How will Drip find them?" subtitle="Pick your AI model and lead sources." /><Step3 data={data} onChange={onChange} /></>}
          {step === 4 && <><StepHeader step={4} title="Set your daily goal" subtitle="How many leads per day do you want Drip to find?" /><Step4 data={data} onChange={onChange} /></>}
          {step === 5 && <><StepHeader step={5} title="Ready to launch 🚀" subtitle="Here's your configuration summary." /><Step5 data={data} score={icpScore} saving={saving} onSave={handleSave} /></>}
        </div>

        {/* Navigation */}
        {step < 5 && (
          <NavButtons
            onBack={step > 1 ? () => setStep((s) => s - 1) : null}
            onNext={() => setStep((s) => s + 1)}
            nextDisabled={!canProceed[step]}
          />
        )}
        {step === 5 && (
          <div className="flex items-center justify-between px-8 py-4" style={{ borderTop: '1px solid var(--border)' }}>
            <button onClick={() => setStep(4)} className="btn-ghost flex items-center gap-1.5 text-sm"><ArrowLeft className="w-4 h-4" />Back</button>
            <button onClick={onComplete} className="text-xs" style={{ color: 'var(--text-3)' }}>I'll configure this later</button>
          </div>
        )}
      </div>
    </div>
  );
}
