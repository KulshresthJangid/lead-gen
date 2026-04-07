import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client.js';
import toast from 'react-hot-toast';

export function usePipeline() {
  const queryClient = useQueryClient();
  const [triggerLoading, setTriggerLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['pipelineStatus'],
    queryFn: async () => {
      const res = await apiClient.get('/pipeline/status');
      return res.data;
    },
    refetchInterval: 10_000,
  });

  const trigger = useCallback(async () => {
    if (triggerLoading) return;
    setTriggerLoading(true);
    try {
      const res = await apiClient.post('/pipeline/trigger');
      toast.success('Pipeline started manually');
      queryClient.invalidateQueries({ queryKey: ['pipelineStatus'] });
      return res.data;
    } catch (err) {
      if (err.response?.status === 409) {
        toast.error('Pipeline is already running');
      } else {
        toast.error('Failed to trigger pipeline');
      }
    } finally {
      setTriggerLoading(false);
    }
  }, [triggerLoading, queryClient]);

  return { data, isLoading, trigger, triggerLoading };
}
