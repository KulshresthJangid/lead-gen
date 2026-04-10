import { useState, useCallback } from 'react';
import { Play, Settings } from 'lucide-react';
import StatsCards from '../components/StatsCards.jsx';
import FiltersPanel from '../components/FiltersPanel.jsx';
import LeadTable from '../components/LeadTable.jsx';
import ExportButton from '../components/ExportButton.jsx';
import ManualCategoryModal from '../components/ManualCategoryModal.jsx';
import PipelineVisualizer from '../components/PipelineVisualizer.jsx';
import { useLeads } from '../hooks/useLeads.js';
import { useSocket } from '../hooks/useSocket.js';
import { usePipeline } from '../hooks/usePipeline.js';
import { useCampaign } from '../context/CampaignContext.jsx';
import { Link } from 'react-router-dom';

const DEFAULT_FILTERS = { page: 1, limit: 25, sortBy: 'created_at', sortDir: 'desc' };

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ trigger, triggerLoading, pipelineRunning }) {
  const checks = [
    { label: 'Ollama running', done: true, hint: 'localhost:11434' },
    { label: 'ICP configured', done: true, hint: 'from setup wizard' },
    { label: 'Sources selected', done: true, hint: 'GitHub, HackerNews etc.' },
  ];

  return (
    <div
      className="relative rounded-3xl overflow-hidden flex flex-col items-center justify-center py-20 px-8 text-center"
      style={{ background: 'var(--card)', border: '1.5px dashed var(--border-strong)' }}
    >
      {/* Animated decorative orb */}
      <div
        className="absolute top-12 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full opacity-20 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
          animation: 'float 4s ease-in-out infinite',
          filter: 'blur(18px)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-6 max-w-md">
        {/* Animated icon */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl animate-float"
          style={{ background: 'var(--accent-subtle)', border: '2px solid var(--accent-muted)' }}
        >
          💧
        </div>

        <div>
          <h3 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>
            No leads yet — ready to drip
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
            Drip is configured and ready. Hit <strong>Run Pipeline</strong> to start scraping, enriching, and scoring your first batch of leads.
          </p>
        </div>

        {/* Config checklist */}
        <div className="w-full rounded-2xl p-4 space-y-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {checks.map(({ label, done, hint }) => (
            <div key={label} className="flex items-center gap-3">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                style={{ background: done ? 'var(--success-bg)' : 'var(--border-md)', color: done ? 'var(--success)' : 'var(--text-3)' }}
              >
                {done ? '✓' : '?'}
              </div>
              <span className="text-sm flex-1 text-left" style={{ color: done ? 'var(--text-1)' : 'var(--text-3)' }}>{label}</span>
              <span className="text-[11px]" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{hint}</span>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex flex-col items-center gap-3 w-full">
          <button
            onClick={trigger}
            disabled={triggerLoading || pipelineRunning}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl font-bold text-sm transition-all duration-200"
            style={{
              background: 'linear-gradient(135deg, var(--accent) 0%, #ff8855 100%)',
              color: '#ffffff',
              fontFamily: 'var(--font-display)',
              boxShadow: '0 4px 20px rgba(255,85,51,0.30)',
              opacity: (triggerLoading || pipelineRunning) ? 0.7 : 1,
            }}
          >
            <Play className="w-4 h-4" />
            {pipelineRunning ? 'Pipeline running…' : 'Run Pipeline'}
          </button>
          <Link
            to="/settings"
            className="text-xs flex items-center gap-1"
            style={{ color: 'var(--text-3)' }}
          >
            <Settings className="w-3.5 h-3.5" /> Adjust settings
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedLead, setSelectedLead] = useState(null);
  const { currentCampaign } = useCampaign();
  const { data: pipelineData, trigger, triggerLoading } = usePipeline();

  const effectiveFilters = currentCampaign
    ? { ...filters, campaignId: currentCampaign.id }
    : filters;

  const { data, isLoading } = useLeads(effectiveFilters);

  useSocket({
    onNewLeads: () => setFilters((f) => ({ ...f, _refresh: Date.now() })),
    onPipelineDone: () => setFilters((f) => ({ ...f })),
  });

  const handleFiltersChange = useCallback((next) => setFilters(next), []);
  const handleCategorize = useCallback((lead) => setSelectedLead(lead), []);

  const hasLeads = !isLoading && (data?.total ?? 0) > 0;
  const isEmpty  = !isLoading && (data?.total ?? 0) === 0;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>Dashboard</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            {isLoading ? 'Loading…' : hasLeads ? `${data.total.toLocaleString()} leads collected` : 'Ready to drip'}
          </p>
        </div>
        {hasLeads && <ExportButton filters={effectiveFilters} />}
      </div>

      {/* Pipeline Visualizer (always shown) */}
      <PipelineVisualizer />

      {/* Empty state OR data view */}
      {isEmpty ? (
        <EmptyState trigger={trigger} triggerLoading={triggerLoading} pipelineRunning={!!pipelineData?.running} />
      ) : (
        <>
          <StatsCards campaignId={currentCampaign?.id} />
          <FiltersPanel filters={filters} onChange={handleFiltersChange} />
          <LeadTable
            leads={data?.leads ?? []}
            total={data?.total ?? 0}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onCategorize={handleCategorize}
            newLeadIds={new Set()}
            loading={isLoading}
          />
        </>
      )}

      <ManualCategoryModal
        lead={selectedLead}
        isOpen={!!selectedLead}
        onClose={() => setSelectedLead(null)}
      />
    </div>
  );
}
