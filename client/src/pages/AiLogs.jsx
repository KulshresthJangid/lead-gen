import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bot, Clock, AlertTriangle, CheckCircle2, Wrench,
  RefreshCw, ChevronDown, ChevronUp, Zap,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import apiClient from '../api/client.js';

const FILTERS = [
  { key: 'all',       label: 'All Calls' },
  { key: 'truncated', label: '✂️ Truncated' },
  { key: 'repaired',  label: '🔧 Repaired'  },
  { key: 'failed',    label: '💀 Failed'    },
];

function StatPill({ label, value, gradient, icon: Icon, delay = 0 }) {
  return (
    <div
      className="card p-4 flex items-center gap-3 hover:scale-[1.03] hover:-translate-y-0.5 transition-all duration-300 animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`p-2 rounded-xl bg-gradient-to-br ${gradient} flex-shrink-0 shadow-lg`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div>
        <p className={`text-xl font-black bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}>
          {value ?? '—'}
        </p>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mt-0.5">{label}</p>
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

  const borderColor = isFailed   ? 'border-l-red-500'
    : isRepaired                 ? 'border-l-blue-500'
    : isTrunc                    ? 'border-l-amber-500'
    : 'border-l-emerald-500';

  const rowBg = isFailed   ? 'from-red-500/[0.05]'
    : isRepaired            ? 'from-blue-500/[0.05]'
    : isTrunc               ? 'from-amber-500/[0.05]'
    : 'from-emerald-500/[0.03]';

  return (
    <div
      className={`card border-l-2 ${borderColor} bg-gradient-to-r ${rowBg} to-transparent
        hover:scale-[1.004] transition-all duration-200 animate-slide-up`}
      style={{ animationDelay: `${Math.min(idx * 25, 400)}ms` }}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-xs font-mono font-bold text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-md border border-violet-500/20 shrink-0">
              {event.context || 'unknown'}
            </span>
            <span className="text-xs text-slate-600 font-mono shrink-0">{event.model}</span>
            {event.attempt > 1 && (
              <span className="text-[10px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-md font-bold border border-amber-500/20 shrink-0">
                retry #{event.attempt}
              </span>
            )}
          </div>

          {/* Status badges */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {isFailed && (
              <span className="text-[10px] bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full border border-red-500/20 font-bold">
                💀 failed
              </span>
            )}
            {isRepaired && (
              <span className="text-[10px] bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20 font-bold flex items-center gap-0.5">
                <Wrench className="w-2.5 h-2.5" /> repaired
              </span>
            )}
            {isTrunc && (
              <span className="text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/20 font-bold flex items-center gap-0.5">
                <AlertTriangle className="w-2.5 h-2.5" /> cut off
              </span>
            )}
            {isOk && (
              <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-bold flex items-center gap-0.5">
                <CheckCircle2 className="w-2.5 h-2.5" /> ok
              </span>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-600 font-mono flex-wrap">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {event.duration_ms ? `${(event.duration_ms / 1000).toFixed(1)}s` : '—'}
          </span>
          <span>{event.prompt_length?.toLocaleString() ?? 0} ch in</span>
          <span>{event.raw_length?.toLocaleString() ?? 0} ch out</span>
          {event.lead_ids?.length > 0 && (
            <span className="text-slate-700">{event.lead_ids.length} lead{event.lead_ids.length > 1 ? 's' : ''}</span>
          )}
          {event.ts && (
            <span className="ml-auto text-slate-700">
              {formatDistanceToNow(new Date(event.ts), { addSuffix: true })}
            </span>
          )}
        </div>

        {/* Collapsible prompt/response */}
        {(event.prompt_preview || event.raw_preview) && (
          <div className="mt-2.5">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-[11px] text-slate-600 hover:text-slate-400 flex items-center gap-1 transition-colors font-medium"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? 'collapse' : 'show preview'}
            </button>

            {expanded && (
              <div className="mt-2 space-y-2">
                {event.prompt_preview && (
                  <div>
                    <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest mb-1">
                      Prompt
                    </p>
                    <pre className="text-[11px] text-slate-400 bg-black/40 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-36 overflow-y-auto border border-white/[0.05]">
                      {event.prompt_preview}
                    </pre>
                  </div>
                )}
                {event.raw_preview && (
                  <div>
                    <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest mb-1">
                      Response
                    </p>
                    <pre className={`text-[11px] bg-black/40 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-36 overflow-y-auto border ${
                      isFailed ? 'text-red-400 border-red-500/20' : 'text-emerald-400 border-white/[0.05]'
                    }`}>
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
    <div className="space-y-5" style={{ animation: 'slideUp 0.35s ease-out' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black gradient-text">AI Event Logs</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Every call sent to Ollama · Mistral 7B
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatPill label="Total Calls"  value={s?.total ?? '—'}  gradient="from-violet-500 to-purple-600"  icon={Bot}           delay={0}   />
        <StatPill label="Truncated"    value={`${truncPct}%`}   gradient="from-amber-500 to-orange-600"  icon={AlertTriangle}  delay={60}  />
        <StatPill label="Auto-Repaired" value={`${repairPct}%`} gradient="from-sky-500 to-blue-600"      icon={Wrench}        delay={120} />
        <StatPill label="Avg Duration" value={avgSec}           gradient="from-emerald-500 to-teal-600"  icon={Clock}         delay={180} />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => {
          const count = f.key === 'all' ? s?.total
            : f.key === 'truncated' ? s?.truncated
            : f.key === 'failed'    ? s?.failed
            : s?.repaired;
          return (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); setPage(1); }}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all duration-200 border ${
                filter === f.key
                  ? 'bg-gradient-to-r from-violet-600/25 to-fuchsia-600/15 text-violet-300 border-violet-500/30 shadow-sm shadow-violet-500/10'
                  : 'bg-white/[0.04] text-slate-500 border-white/[0.06] hover:bg-white/[0.07] hover:text-slate-300'
              }`}
            >
              {f.label}
              {count !== undefined && (
                <span className="ml-1.5 opacity-60 font-mono">({count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Events list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card h-20 animate-pulse" style={{ animationDelay: `${i * 50}ms` }} />
          ))}
        </div>
      ) : !data?.events?.length ? (
        <div className="card p-16 text-center animate-pop-in">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
            <Bot className="w-7 h-7 text-violet-400" />
          </div>
          <p className="text-slate-300 font-bold text-lg">No AI events yet</p>
          <p className="text-xs text-slate-600 mt-1">
            Events appear here once the pipeline runs enrichment. Start the pipeline to see logs.
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
          <p className="text-xs text-slate-600 font-mono">
            {(page - 1) * 50 + 1}–{Math.min(page * 50, data.total)} of {data.total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
              className="btn-secondary text-xs py-1 px-3 disabled:opacity-30"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * 50 >= data.total}
              className="btn-secondary text-xs py-1 px-3 disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
