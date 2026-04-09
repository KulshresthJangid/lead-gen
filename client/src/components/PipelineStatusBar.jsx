import { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { CheckCircle, AlertCircle, Play, Loader2 } from 'lucide-react';
import { usePipeline } from '../hooks/usePipeline.js';
import { useSocket } from '../hooks/useSocket.js';

function StatusDot({ status }) {
  if (status === 'running') {
    return (
      <span className="flex h-2 w-2 relative">
        <span
          className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
          style={{ backgroundColor: 'var(--text-1)' }}
        />
        <span
          className="relative inline-flex rounded-full h-2 w-2"
          style={{ backgroundColor: 'var(--text-1)' }}
        />
      </span>
    );
  }
  return (
    <span
      className="h-2 w-2 rounded-full inline-block"
      style={{ backgroundColor: 'var(--text-3)' }}
    />
  );
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
  const isRunning = status === 'running';
  const targetReached = status === 'target_reached';
  const todayInserted = data?.todayInserted ?? 0;
  const dailyTarget = data?.dailyTarget ?? 0;

  return (
    <div
      className="px-5 py-2 flex items-center justify-between text-xs flex-shrink-0 transition-colors duration-300"
      style={{
        backgroundColor: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        color: 'var(--text-3)',
      }}
    >
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <span
            className="font-semibold uppercase tracking-wider text-[11px]"
            style={{ color: isRunning ? 'var(--text-1)' : targetReached ? '#f59e0b' : 'var(--text-3)' }}
          >
            {isRunning ? 'Running' : targetReached ? 'Target Reached' : 'Idle'}
          </span>
        </div>

        {dailyTarget > 0 && (
          <span className="hidden sm:inline font-mono" style={{ color: targetReached ? '#f59e0b' : 'var(--text-3)' }}>
            {todayInserted}/{dailyTarget} today
          </span>
        )}

        {data?.lastRunAt && (
          <span className="hidden sm:inline" style={{ color: 'var(--text-3)' }}>
            Last: {formatDistanceToNow(new Date(data.lastRunAt), { addSuffix: true })}
          </span>
        )}

        {data?.lastRun && (
          <span className="hidden md:inline font-mono" style={{ color: 'var(--text-3)' }}>
            +{data.lastRun.inserted} in · {data.lastRun.dupesSkipped} skip
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {data?.nextRunAt && !isRunning && (
          <span className="hidden sm:inline" style={{ color: 'var(--text-3)' }}>
            next: {format(new Date(data.nextRunAt), 'HH:mm')}
          </span>
        )}

        {ollamaOnline !== null && (
          <span
            className="flex items-center gap-1 font-semibold uppercase tracking-wide text-[11px]"
            style={{ color: ollamaOnline ? '#22c55e' : '#ef4444' }}
          >
            {ollamaOnline
              ? <CheckCircle className="w-3 h-3" />
              : <AlertCircle className="w-3 h-3" />
            }
            Ollama {ollamaOnline ? 'on' : 'off'}
          </span>
        )}

        <button
          onClick={trigger}
          disabled={triggerLoading || isRunning}
          className="btn-secondary flex items-center gap-1.5 py-1 px-2.5 text-[11px] font-semibold"
        >
          {triggerLoading || isRunning
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <Play className="w-3 h-3" />
          }
          Run
        </button>
      </div>
    </div>
  );
}

