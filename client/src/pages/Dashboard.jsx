import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import StatsCards from '../components/StatsCards.jsx';
import FiltersPanel from '../components/FiltersPanel.jsx';
import LeadTable from '../components/LeadTable.jsx';
import ExportButton from '../components/ExportButton.jsx';
import ManualCategoryModal from '../components/ManualCategoryModal.jsx';
import { useLeads } from '../hooks/useLeads.js';
import { useSocket } from '../hooks/useSocket.js';
import { usePipeline } from '../hooks/usePipeline.js';

const DEFAULT_FILTERS = { page: 1, limit: 25, sortBy: 'created_at', sortDir: 'desc' };

export default function Dashboard() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedLead, setSelectedLead] = useState(null);
  const [newLeadIds, setNewLeadIds] = useState(new Set());

  const { data, isLoading } = useLeads(filters);

  useSocket({
    onNewLeads: ({ count }) => {
      // Refetch and mark first `count` leads as new for highlighting
      setFilters((f) => ({ ...f, _refresh: Date.now() }));
    },
    onPipelineDone: () => {
      setFilters((f) => ({ ...f })); // trigger refetch
    },
  });

  const handleFiltersChange = useCallback((next) => setFilters(next), []);
  const handleCategorize = useCallback((lead) => setSelectedLead(lead), []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black gradient-text">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {data?.total != null ? `${data.total.toLocaleString()} leads collected` : 'Loading…'}
          </p>
        </div>
        <ExportButton filters={filters} />
      </div>

      <StatsCards />
      <FiltersPanel filters={filters} onChange={handleFiltersChange} />
      <LeadTable
        leads={data?.leads ?? []}
        total={data?.total ?? 0}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onCategorize={handleCategorize}
        newLeadIds={newLeadIds}
        loading={isLoading}
      />

      <ManualCategoryModal
        lead={selectedLead}
        isOpen={!!selectedLead}
        onClose={() => setSelectedLead(null)}
      />
    </div>
  );
}
