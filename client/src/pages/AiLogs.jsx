import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot, Clock, AlertTriangle, CheckCircle2, Wrench,
  RefreshCw, ChevronDown, ChevronUp, Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import apiClient from '../api/client.js';

const FILTERS = [
  { key: 'all',       label: 'All Calls' },
  { key: 'truncated', label: 'Truncated' },
  { key: 'repaired',  label: 'Repaired'  },
  { key: 'failed',    label: 'Failed'    },
];

function StatPill({ label, value, icon: Icon, delay = 0 }) {
  return (
    <div
      className="card p-4 flex items-center gap-3 hover:-translate-y-0.5 transition-all duration-200 animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className="p-2 rounded-xl flex-shrink-0"
        style={{ backgroundColor: 'var(--hover)', color: 'var(--text-2)' }}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xl font-black" style={{ color: 'var(--text-1)' }}>{value ?? '—'}</p>
        <p className="text-[10px] uppercase tracking-wider font-semibold mt-0.5" style={{ color: 'var(--text-3)' }}>{label}</p>
      </div>
    </div>
  );
}

function EventCard({ event, idx }) {
  const [expanded, setExpanded] = useState(false);

  const isFailed   = event.parsed_ok === false;
  const isRepaired = event.repaired;
  const isTrunc    = event.truncated && !isRepaired;
  const isOk       = event.parsed_ok === true && !event.truncated;

  // B&W status indicator via left border weight + background
  const leftBorderStyle = isFailed
    ? { borderLeftColor: 'var(--text-1)', borderLeftWidth: '3px' }
    : isRepaired
    ? { borderLeftColor: 'var(--text-2)', borderLeftWidth: '2px' }
    : isTrunc
    ? { borderLeftColor: 'var(--text-2)', borderLeftWidth: '2px', borderLeftStyle: 'dashed' }
    : { borderLeftColor: 'var(--border-md)', borderLeftWidth: '2px' };

  return (
    <div
      className="card animate-slide-up"
      style={{ ...leftBorderStyle, borderRadius: '12px', animationDelay: `${Math.min(idx * 20, 300)}ms` }}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span
              className="text-xs font-mono font-bold px-2 py-0.5 rounded-md border"
              style={{ color: 'var(--text-1)', backgroundColor: 'var(--hover)', borderColor: 'var(--border-md)' }}
            >
              {event.context || 'unknown'}
            </span>
            <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>{event.model}</span>
            {event.attempt > 1 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-md font-bold border"
                style={{ color: 'var(--text-2)', backgroundColor: 'var(--active)', borderColor: 'var(--border-md)' }}
              >
                retry #{event.attempt}
              </span>
            )}
          </div>

          {/* Status badges */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {isFailed && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full border font-bold"
                style={{ backgroundColor: 'var(--btn-bg)', color: 'var(--btn-text)', borderColor: 'var(--btn-bg)' }}
              >
                failed
              </span>
            )}
            {isRepaired && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full border font-bold flex items-center gap-0.5"
                style={{ backgroundColor: 'var(--active)', color: 'var(--text-1)', borderColor: 'var(--border-md)' }}
              >
                <Wrench className="w-2.5 h-2.5" /> repaired
              </span>
            )}
            {isTrunc && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full border font-bold flex items-center gap-0.5"
                style={{ backgroundColor: 'var(--active)', color: 'var(--text-2)', borderColor: 'var(--border-md)' }}
              >
                <AlertTriangle className="w-2.5 h-2.5" /> cut off
              </span>
            )}
            {isOk && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full border font-bold flex items-center gap-0.5"
                style={{ backgroundColor: 'var(--hover)', color: 'var(--text-3)', borderColor: 'var(--border)' }}
              >
                <CheckCircle2 className="w-2.5 h-2.5" /> ok
              </span>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-4 mt-2 text-[11px] font-mono flex-wrap" style={{ color: 'var(--text-3)' }}>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {event.duration_ms ? `${(event.duration_ms / 1000).toFixed(1)}s` : '—'}
          </span>
          <span>{event.prompt_length?.toLocaleString() ?? 0} ch in</span>
          <span>{event.raw_length?.toLocaleString() ?? 0} ch out</span>
          {event.lead_ids?.length > 0 && (
            <span>{event.lead_ids.length} lead{event.lead_ids.length > 1 ? 's' : ''}</span>
          )}
          {event.run_id && (
            <span
              className="px-1.5 py-0.5 rounded border text-[10px]"
              style={{ backgroundColor: 'var(--hover)', borderColor: 'var(--border-md)', color: 'var(--text-3)' }}
              title="Pipeline run ID"
            >
              run:{event.run_id.slice(0, 8)}
            </span>
          )}
          {event.campaign_id && (
            <span
              className="px-1.5 py-0.5 rounded border text-[10px]"
              style={{ backgroundColor: 'var(--hover)', borderColor: 'var(--border-md)', color: 'var(--text-2)' }}
              title="Campaign"
            >
              campaign:{event.campaign_id}
            </span>
          )}
          {event.org_id && (
            <span
              className="px-1.5 py-0.5 rounded border text-[10px]"
              style={{ backgroundColor: 'var(--hover)', borderColor: 'var(--border-md)', color: 'var(--text-2)' }}
              title="Organisation"
            >
              org:{event.org_id}
            </span>
          )}
          {event.ts && (
            <span className="ml-auto">
              {formatDistanceToNow(new Date(event.ts), { addSuffix: true })}
            </span>
          )}
        </div>

        {/* Collapsible preview */}
        {(event.prompt_preview || event.raw_preview) && (
          <div className="mt-2.5">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-[11px] flex items-center gap-1 transition-colors font-medium"
              style={{ color: 'var(--text-3)' }}
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? 'collapse' : 'preview'}
            </button>

            {expanded && (
              <div className="mt-2 space-y-2">
                {event.prompt_preview && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-3)' }}>Prompt</p>
                    <pre
                      className="text-[11px] rounded-xl p-3 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-36 overflow-y-auto border text-xs"
                      style={{ backgroundColor: 'var(--bg)', color: 'var(--text-2)', borderColor: 'var(--border)' }}
                    >
                      {event.prompt_preview}
                    </pre>
                  </div>
                )}
                {event.raw_preview && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-3)' }}>Response</p>
                    <pre
                      className="text-[11px] rounded-xl p-3 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-36 overflow-y-auto border"
                      style={{
                        backgroundColor: 'var(--bg)',
                        color: isFailed ? 'var(--text-2)' : 'var(--text-1)',
                        borderColor: 'var(--border)',
                        opacity: isFailed ? 0.7 : 1,
                      }}
                    >
                      {event.raw_preview}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AiLogs() {
  const [filter, setFilter] = useState('all');
  const [page, setPage]     = useState(1);
  const queryClient = useQueryClient();

  const clearMutation = useMutation({
    mutationFn: () => apiClient.delete('/ai-logs'),
    onSuccess: () => {
      toast.success('AI logs cleared');
      queryClient.invalidateQueries({ queryKey: ['ai-logs'] });
    },
    onError: () => toast.error('Failed to clear logs'),
  });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['ai-logs', filter, page],
    queryFn: async () => {
      const res = await apiClient.get(`/ai-logs?filter=${filter}&page=${page}&limit=50`);
      return res.data;
    },
    refetchInterval: 15_000,
  });

  const s = data?.stats;
  const truncPct  = s?.total    > 0 ? Math.round((s.truncated / s.total)    * 100) : 0;
  const repairPct = s?.truncated > 0 ? Math.round((s.repaired  / s.truncated) * 100) : 0;
  const avgSec    = s?.avgDuration > 0 ? `${(s.avgDuration / 1000).toFixed(1)}s` : '—';

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--text-1)' }}>AI Event Logs</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            Every call sent to Ollama · Mistral 7B
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { if (window.confirm('Clear all AI logs?')) clearMutation.mutate(); }}
            disabled={clearMutation.isPending}
            className="btn-secondary flex items-center gap-2 text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4" />
            Clear logs
          </button>
          <button onClick={() => refetch()} className="btn-secondary flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatPill label="Total Calls"    value={s?.total ?? '—'} icon={Bot}           delay={0}   />
        <StatPill label="Truncated"      value={`${truncPct}%`}  icon={AlertTriangle} delay={60}  />
        <StatPill label="Auto-Repaired"  value={`${repairPct}%`} icon={Wrench}        delay={120} />
        <StatPill label="Avg Duration"   value={avgSec}          icon={Clock}         delay={180} />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => {
          const count = f.key === 'all' ? s?.total
            : f.key === 'truncated' ? s?.truncated
            : f.key === 'failed'    ? s?.failed
            : s?.repaired;
          const isActive = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); setPage(1); }}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all duration-150 border"
              style={isActive
                ? { backgroundColor: 'var(--btn-bg)', color: 'var(--btn-text)', borderColor: 'var(--btn-bg)' }
                : { backgroundColor: 'var(--hover)', color: 'var(--text-2)', borderColor: 'var(--border)' }
              }
            >
              {f.label}
              {count !== undefined && (
                <span className="ml-1.5 font-mono opacity-50">({count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Events list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="card h-20 animate-pulse"
              style={{ animationDelay: `${i * 50}ms`, opacity: 1 - i * 0.1 }}
            />
          ))}
        </div>
      ) : !data?.events?.length ? (
        <div className="card p-16 text-center animate-pop-in">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'var(--hover)', color: 'var(--text-3)' }}
          >
            <Bot className="w-6 h-6" />
          </div>
          <p className="font-bold text-lg" style={{ color: 'var(--text-1)' }}>No AI events yet</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
            Events appear once the pipeline runs enrichment.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.events.map((event, i) => (
            <EventCard key={`${event.ts}-${i}`} event={event} idx={i} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {(data?.total ?? 0) > 50 && (
        <div className="flex items-center justify-between">
          <p className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>
            {(page - 1) * 50 + 1}–{Math.min(page * 50, data.total)} of {data.total}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => p - 1)} disabled={page === 1} className="btn-secondary text-xs py-1 px-3 disabled:opacity-30">← Prev</button>
            <button onClick={() => setPage((p) => p + 1)} disabled={page * 50 >= data.total} className="btn-secondary text-xs py-1 px-3 disabled:opacity-30">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

