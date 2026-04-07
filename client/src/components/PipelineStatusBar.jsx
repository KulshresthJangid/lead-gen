import { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { Activity, PlayCircle, CheckCircle, AlertCircle } from 'lucide-react';
import { usePipeline } from '../hooks/usePipeline.js';
import { useSocket } from '../hooks/useSocket.js';

function StatusDot({ status }) {
  if (status === 'running') {
    return <span className="flex h-2.5 w-2.5 relative">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500" />
    </span>;
  }
  return <span className="h-2.5 w-2.5 rounded-full bg-green-400 inline-block" />;
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
    <div className="bg-white border-b border-gray-200 px-6 py-2.5 flex items-center justify-between text-sm flex-shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <span className="font-medium text-gray-700">
            {status === 'running' ? 'Pipeline running…' : 'Pipeline idle'}
          </span>
        </div>

        {data?.lastRunAt && (
          <span className="text-gray-400 hidden sm:inline">
            Last run:{' '}
            {formatDistanceToNow(new Date(data.lastRunAt), { addSuffix: true })}
          </span>
        )}

        {data?.lastRun && (
          <span className="text-gray-400 hidden md:inline">
            +{data.lastRun.inserted} inserted · {data.lastRun.dupesSkipped} dupes skipped
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        {data?.nextRunAt && status !== 'running' && (
          <span className="text-gray-400 hidden sm:inline">
            Next: {format(new Date(data.nextRunAt), 'HH:mm')}
          </span>
        )}

        {ollamaOnline !== null && (
          <span
            className={`flex items-center gap-1 text-xs font-medium ${
              ollamaOnline ? 'text-green-600' : 'text-red-500'
            }`}
          >
            {ollamaOnline ? (
              <CheckCircle className="w-3.5 h-3.5" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5" />
            )}
            Ollama {ollamaOnline ? 'online' : 'offline'}
          </span>
        )}

        <button
          onClick={trigger}
          disabled={triggerLoading || status === 'running'}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <PlayCircle className="w-3.5 h-3.5" />
          Run now
        </button>
      </div>
    </div>
  );
}
