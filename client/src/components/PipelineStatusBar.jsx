import { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { Activity, PlayCircle, CheckCircle, AlertCircle, Zap } from 'lucide-react';
import { usePipeline } from '../hooks/usePipeline.js';
import { useSocket } from '../hooks/useSocket.js';

function StatusDot({ status }) {
  if (status === 'running') {
    return (
      <span className="flex h-2.5 w-2.5 relative">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-violet-500" />
      </span>
    );
  }
  return <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 inline-block" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.8)' }} />;
}

export default function PipelineStatusBar() {
  const { data, trigger, triggerLoading } = usePipeline();
  const [liveStatus, setLiveStatus] = useState('idle');

  useSocket({
    onPipelineStart: () => setLiveStatus('running'),
    onPipelineDone: () => setLiveStatus('idle'),
  });

  const status = liveStatus === 'running' ? 'running' : (data?.status || 'idle');
  const ollamaOnline = data?.ollamaOnline ?? null;

  return (
    <div className={`border-b border-white/[0.06] px-6 py-2.5 flex items-center justify-between text-sm flex-shrink-0 transition-all duration-500 ${
      status === 'running'
        ? 'bg-gradient-to-r from-violet-600/10 via-fuchsia-600/5 to-transparent'
        : 'bg-[#09091a]/60 backdrop-blur-xl'
    }`}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <span className={`font-semibold text-xs uppercase tracking-wider ${
            status === 'running' ? 'text-violet-300' : 'text-slate-500'
          }`}>
            {status === 'running' ? '⚡ Running…' : 'Idle'}
          </span>
        </div>

        {data?.lastRunAt && (
          <span className="text-slate-600 hidden sm:inline text-xs">
            Last: {formatDistanceToNow(new Date(data.lastRunAt), { addSuffix: true })}
          </span>
        )}

        {data?.lastRun && (
          <span className="text-slate-600 hidden md:inline text-xs font-mono">
            +{data.lastRun.inserted} in · {data.lastRun.dupesSkipped} skip
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {data?.nextRunAt && status !== 'running' && (
          <span className="text-slate-600 hidden sm:inline text-xs">
            next: {format(new Date(data.nextRunAt), 'HH:mm')}
          </span>
        )}

        {ollamaOnline !== null && (
          <span className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide ${
            ollamaOnline ? 'text-emerald-500' : 'text-red-400'
          }`}>
            {ollamaOnline ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
            Ollama {ollamaOnline ? 'on' : 'off'}
          </span>
        )}

        <button
          onClick={trigger}
          disabled={triggerLoading || status === 'running'}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide
            bg-violet-500/15 text-violet-400 rounded-lg border border-violet-500/25
            hover:bg-violet-500/25 hover:text-violet-300
            disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200
            hover:shadow-sm hover:shadow-violet-500/20"
        >
          <Zap className="w-3 h-3" />
          Run now
        </button>
      </div>
    </div>
  );
}
