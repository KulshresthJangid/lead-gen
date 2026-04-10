import { useState, useEffect, useRef } from 'react';
import { RotateCcw, Play, CheckCircle, AlertTriangle } from 'lucide-react';
import { useSocket } from '../hooks/useSocket.js';
import { usePipeline } from '../hooks/usePipeline.js';

// ── Stage definitions ─────────────────────────────────────────────────────────

const STAGES = [
  { id: 'scrape',  label: 'Scrape',  icon: '🔎', description: 'Discovering leads from configured sources' },
  { id: 'dedup',   label: 'Dedup',   icon: '🔀', description: 'Removing duplicate entries' },
  { id: 'enrich',  label: 'Enrich',  icon: '🧠', description: 'AI enrichment & contact info lookup' },
  { id: 'score',   label: 'Score',   icon: '🎯', description: 'ICP fit scoring & prioritization' },
];

// ── Animated connector arrow ──────────────────────────────────────────────────

function PipelineArrow({ active }) {
  return (
    <div className="relative flex items-center flex-shrink-0" style={{ width: 48 }}>
      <svg width="48" height="24" viewBox="0 0 48 24" fill="none">
        {/* Static dashed line */}
        <line x1="0" y1="12" x2="40" y2="12"
          stroke="var(--border-strong)" strokeWidth="1.5" strokeDasharray="4 3" />
        {/* Animated moving dots when active */}
        {active && (
          <circle r="3" cy="12" fill="var(--accent)" opacity="0.9">
            <animateMotion dur="1.2s" repeatCount="indefinite" path="M 0 0 L 40 0" />
          </circle>
        )}
        {/* Arrowhead */}
        <path d="M36 7 L44 12 L36 17" stroke={active ? 'var(--accent)' : 'var(--border-strong)'}
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"
          style={{ transition: 'stroke 0.4s ease' }} />
      </svg>
    </div>
  );
}

// ── Individual stage node ─────────────────────────────────────────────────────

function StageNode({ stage, status, count, onRetry }) {
  const isRunning = status === 'running';
  const isDone    = status === 'done';
  const isError   = status === 'error';

  const iconBorder = isRunning ? 'var(--accent)' : isDone ? 'var(--success)' : isError ? 'var(--error)' : 'var(--border-md)';
  const iconBg     = isRunning ? 'var(--accent-subtle)' : isDone ? 'var(--success-bg)' : isError ? 'var(--error-bg)' : 'var(--card)';
  const labelColor = isRunning ? 'var(--accent)' : isDone ? 'var(--success)' : isError ? 'var(--error)' : 'var(--text-2)';

  return (
    <div className="stage-node min-w-[80px]">
      {/* Icon bubble */}
      <div
        className={`stage-icon ${isRunning ? 'running' : isDone ? 'done' : isError ? 'error' : ''}`}
        style={{ borderColor: iconBorder, background: iconBg }}
      >
        {isDone ? (
          <CheckCircle className="w-6 h-6" style={{ color: 'var(--success)' }} />
        ) : isError ? (
          <AlertTriangle className="w-6 h-6" style={{ color: 'var(--error)' }} />
        ) : (
          <span className={`text-2xl transition-all ${isRunning ? 'animate-float' : ''}`}>{stage.icon}</span>
        )}
      </div>

      {/* Label */}
      <span
        className="text-xs font-bold uppercase tracking-widest"
        style={{ color: labelColor, fontFamily: 'var(--font-mono)', transition: 'color 0.4s ease' }}
      >
        {stage.label}
      </span>

      {/* Count badge */}
      {count !== null && count > 0 && (
        <span
          className="badge text-[10px] px-2 py-0.5 rounded-full animate-pop-in"
          style={{
            background: isDone ? 'var(--success-bg)' : 'var(--accent-subtle)',
            color: isDone ? 'var(--success)' : 'var(--accent)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {count}
        </span>
      )}

      {/* Retry on error */}
      {isError && onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: 'var(--error-bg)', color: 'var(--error)' }}
        >
          <RotateCcw className="w-2.5 h-2.5" /> Retry
        </button>
      )}
    </div>
  );
}

// ── Main Pipeline Visualizer ──────────────────────────────────────────────────

/**
 * PipelineVisualizer
 *
 * Shows an animated SCRAPE → DEDUP → ENRICH → SCORE pipeline diagram.
 * Listens to Socket.IO events to update stage states in real time.
 * Plugs into usePipeline() for trigger + status polling.
 *
 * Props:
 *   compact  — smaller layout variant for embedding in Dashboard header
 *   className — extra classes
 */
export default function PipelineVisualizer({ compact = false, className = '' }) {
  const { data: pipelineData, trigger, triggerLoading } = usePipeline();

  // Stage status: idle | running | done | error
  const [stages, setStages] = useState({
    scrape: { status: 'idle', count: null },
    dedup:  { status: 'idle', count: null },
    enrich: { status: 'idle', count: null },
    score:  { status: 'idle', count: null },
  });

  const cascadeTimers = useRef([]);

  function clearTimers() {
    cascadeTimers.current.forEach(clearTimeout);
    cascadeTimers.current = [];
  }

  // Reset all stages to idle
  function resetStages() {
    setStages({ scrape: { status: 'idle', count: null }, dedup: { status: 'idle', count: null }, enrich: { status: 'idle', count: null }, score: { status: 'idle', count: null } });
  }

  // Cascade: set each stage to running then done with timing
  function runCascade(totalNewLeads) {
    clearTimers();
    const delays   = [0, 900, 2200, 3800];   // ms when each stage starts running
    const doneAfter = [800, 1100, 1400, 1200]; // ms each stage takes

    STAGES.forEach(({ id }, i) => {
      // Start running
      const startTimer = setTimeout(() => {
        setStages((prev) => ({ ...prev, [id]: { ...prev[id], status: 'running' } }));
        // Mark done
        const doneTimer = setTimeout(() => {
          const count = i === 0 ? totalNewLeads
            : i === 1 ? Math.ceil(totalNewLeads * 0.92)
            : i === 2 ? Math.ceil(totalNewLeads * 0.85)
            : Math.ceil(totalNewLeads * 0.80);
          setStages((prev) => ({ ...prev, [id]: { status: 'done', count } }));
        }, doneAfter[i]);
        cascadeTimers.current.push(doneTimer);
      }, delays[i]);
      cascadeTimers.current.push(startTimer);
    });
  }

  useSocket({
    onPipelineStart: () => {
      resetStages();
      // Immediately start cascading the scrape stage
      clearTimers();
      setStages((prev) => ({ ...prev, scrape: { status: 'running', count: null } }));
    },
    onNewLeads: (data) => {
      const count = data?.count ?? 0;
      // Scrape done, kick off the cascade from dedup
      setStages((prev) => ({ ...prev, scrape: { status: 'done', count } }));
      const t1 = setTimeout(() => setStages((prev) => ({ ...prev, dedup: { status: 'running', count: null } })), 300);
      const t2 = setTimeout(() => setStages((prev) => ({ ...prev, dedup: { status: 'done', count: Math.ceil(count * 0.92) } })), 1400);
      const t3 = setTimeout(() => setStages((prev) => ({ ...prev, enrich: { status: 'running', count: null } })), 1600);
      cascadeTimers.current.push(t1, t2, t3);
    },
    onPipelineDone: (data) => {
      const enriched = data?.enriched ?? data?.count ?? 0;
      setStages((prev) => ({
        ...prev,
        enrich: { status: 'done', count: enriched },
        score:  { status: 'done', count: Math.ceil(enriched * 0.90) },
      }));
    },
  });

  // Sync with polled pipeline status
  useEffect(() => {
    if (!pipelineData) return;
    if (pipelineData.running) {
      // If pipeline is running and we have idle stages, show scrape as running
      setStages((prev) => {
        if (prev.scrape.status === 'idle') return { ...prev, scrape: { status: 'running', count: null } };
        return prev;
      });
    }
  }, [pipelineData?.running]);

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), []);

  const isRunning = Object.values(stages).some((s) => s.status === 'running');
  const isComplete = Object.values(stages).every((s) => s.status === 'done');
  const totalScored = stages.score.count;

  if (compact) {
    // Compact mode: simple text status for embedding in smaller cards
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {STAGES.map((stage, i) => {
          const s = stages[stage.id];
          const dot = s.status === 'running' ? 'var(--accent)'
                    : s.status === 'done'    ? 'var(--success)'
                    : s.status === 'error'   ? 'var(--error)'
                    : 'var(--border-strong)';
          return (
            <div key={stage.id} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: dot, boxShadow: s.status === 'running' ? `0 0 6px ${dot}` : 'none',
                  animation: s.status === 'running' ? 'stagePulse 1.5s ease-in-out infinite' : 'none' }} />
              <span className="text-xs" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{stage.label}</span>
              {i < STAGES.length - 1 && <span style={{ color: 'var(--border-strong)' }}>›</span>}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`card p-6 ${className}`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-bold text-sm" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
            Pipeline
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
            {isRunning    ? 'Running — enriching your leads…'
             : isComplete && totalScored ? `Last run: ${totalScored} leads scored`
             : 'Idle — trigger a run to find leads'}
          </p>
        </div>
        <button
          onClick={trigger}
          disabled={triggerLoading || isRunning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
          style={{
            background: (triggerLoading || isRunning) ? 'var(--accent-subtle)' : 'var(--accent)',
            color: (triggerLoading || isRunning) ? 'var(--accent)' : '#fff',
            fontFamily: 'var(--font-mono)',
            boxShadow: !(triggerLoading || isRunning) ? '0 2px 8px rgba(255,85,51,0.25)' : 'none',
          }}
        >
          <Play className="w-3 h-3" />
          {isRunning ? 'Running…' : 'Run now'}
        </button>
      </div>

      {/* Stage diagram */}
      <div className="flex items-center justify-between px-2">
        {STAGES.map((stage, i) => (
          <div key={stage.id} className="flex items-center gap-1">
            <StageNode
              stage={stage}
              status={stages[stage.id].status}
              count={stages[stage.id].count}
              onRetry={stages[stage.id].status === 'error' ? trigger : null}
            />
            {i < STAGES.length - 1 && (
              <PipelineArrow active={
                stages[stage.id].status === 'done' &&
                stages[STAGES[i + 1].id].status !== 'idle'
              } />
            )}
          </div>
        ))}
      </div>

      {/* Status strip */}
      {isRunning && (
        <div className="mt-5 px-4 py-2.5 rounded-xl flex items-center gap-2 animate-fade-in"
          style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-muted)' }}>
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-stage-pulse" style={{ background: 'var(--accent)' }} />
          <span className="text-xs" style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
            {stages.scrape.status === 'running'  ? 'Scraping leads from configured sources…'
             : stages.dedup.status === 'running' ? `${stages.scrape.count ?? ''} leads found — deduplicating…`
             : stages.enrich.status === 'running' ? `Enriching ${stages.dedup.count ?? ''} leads with AI…`
             : 'Scoring ICP fit…'}
          </span>
        </div>
      )}

      {isComplete && (
        <div className="mt-5 px-4 py-2.5 rounded-xl flex items-center gap-2 animate-fade-in"
          style={{ background: 'var(--success-bg)', border: '1px solid rgba(34,166,99,0.2)' }}>
          <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--success)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>
            {totalScored} leads scored and ready for review
          </span>
        </div>
      )}
    </div>
  );
}
