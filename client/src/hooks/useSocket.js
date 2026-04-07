import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

const SOCKET_URL  = import.meta.env.VITE_SOCKET_URL  || '';
// In production (sub-path deploy) set VITE_SOCKET_PATH=/lead-server/socket.io/
const SOCKET_PATH = import.meta.env.VITE_SOCKET_PATH || '/socket.io/';

let socket = null;

function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      path: SOCKET_PATH,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

/**
 * useSocket — subscribe to server-side Socket.IO events.
 * callbacks: { onNewLeads, onPipelineStart, onPipelineDone, onOllamaOffline }
 */
export function useSocket(callbacks = {}) {
  const queryClient = useQueryClient();
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  useEffect(() => {
    const s = getSocket();

    function onNewLeads(data) {
      toast.success(`🎯 ${data.count} new lead${data.count !== 1 ? 's' : ''} added!`);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      cbRef.current.onNewLeads?.(data);
    }

    function onOllamaOffline() {
      toast.error('⚠ Ollama offline — enrichment paused', { duration: 6000 });
      cbRef.current.onOllamaOffline?.();
    }

    function onPipelineStart(data) {
      cbRef.current.onPipelineStart?.(data);
    }

    function onPipelineDone(data) {
      queryClient.invalidateQueries({ queryKey: ['pipelineStatus'] });
      cbRef.current.onPipelineDone?.(data);
    }

    function onPipelineError(data) {
      toast.error(`Pipeline error: ${data.error}`);
    }

    s.on('new_leads', onNewLeads);
    s.on('ollama_offline', onOllamaOffline);
    s.on('pipeline_start', onPipelineStart);
    s.on('pipeline_done', onPipelineDone);
    s.on('pipeline_error', onPipelineError);

    return () => {
      s.off('new_leads', onNewLeads);
      s.off('ollama_offline', onOllamaOffline);
      s.off('pipeline_start', onPipelineStart);
      s.off('pipeline_done', onPipelineDone);
      s.off('pipeline_error', onPipelineError);
    };
  }, [queryClient]);

  return getSocket();
}
