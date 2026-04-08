import { useQuery } from '@tanstack/react-query';
import { Users, Flame, Thermometer, Snowflake, Clock } from 'lucide-react';
import apiClient from '../api/client.js';

const CARD_CONFIG = [
  { label: 'Total',   key: 'totalLeads',   icon: Users },
  { label: 'Hot',     key: 'hotCount',     icon: Flame },
  { label: 'Warm',    key: 'warmCount',    icon: Thermometer },
  { label: 'Cold',    key: 'coldCount',    icon: Snowflake },
  { label: 'Pending', key: 'pendingReview', icon: Clock },
];

function StatCard({ label, value, icon: Icon, loading, delay }) {
  return (
    <div
      className="card p-4 flex items-start gap-3.5 cursor-default
        hover:-translate-y-0.5 transition-all duration-200 hover:shadow-md animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className="p-2.5 rounded-xl flex-shrink-0"
        style={{ backgroundColor: 'var(--hover)', color: 'var(--text-2)' }}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        {loading ? (
          <div className="h-7 w-16 animate-pulse rounded-lg mb-1" style={{ backgroundColor: 'var(--hover)' }} />
        ) : (
          <p className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-1)' }}>
            {value?.toLocaleString?.() ?? value ?? '—'}
          </p>
        )}
        <p className="text-[11px] mt-0.5 uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>
          {label}
        </p>
      </div>
    </div>
  );
}

export default function StatsCards() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const res = await apiClient.get('/stats');
      return res.data;
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {CARD_CONFIG.map((cfg, i) => (
        <StatCard
          key={cfg.label}
          {...cfg}
          value={stats?.[cfg.key]}
          loading={isLoading}
          delay={i * 60}
        />
      ))}
    </div>
  );
}
