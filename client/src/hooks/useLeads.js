import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client.js';

/**
 * useLeads — paginated, filtered lead fetching.
 * filters: { page, limit, search, quality, category, source, dateFrom, dateTo, sortBy, sortDir }
 */
export function useLeads(filters = {}) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
      });
      const res = await apiClient.get(`/leads?${params.toString()}`);
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
}

/**
 * useLead — single lead by ID.
 */
export function useLead(id) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: async () => {
      const res = await apiClient.get(`/leads/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}
