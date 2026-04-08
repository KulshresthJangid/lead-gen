import { useQuery } from '@tanstack/react-query';
import { Users, Flame, Thermometer, Snowflake, Clock } from 'lucide-react';
import apiClient from '../api/client.js';

const CARD_CONFIG = [
  {
    label: 'Total Leads',
    key: 'totalLeads',
    icon: Users,
    gradient: 'from-violet-500 to-purple-600',
    textGradient: 'from-violet-400 to-purple-300',
    glow: 'hover:shadow-violet-500/20',
  },
  {
    label: 'Hot 🔥',
    key: 'hotCount',
    icon: Flame,
    gradient: 'from-emerald-500 to-teal-600',
    textGradient: 'from-emerald-400 to-teal-300',
    glow: 'hover:shadow-emerald-500/20',
  },
  {
    label: 'Warm ✨',
    key: 'warmCount',
    icon: Thermometer,
    gradient: 'from-amber-500 to-orange-600',
    textGradient: 'from-amber-400 to-orange-300',
    glow: 'hover:shadow-amber-500/20',
  },
  {
    label: 'Cold 🧊',
    key: 'coldCount',
    icon: Snowflake,
    gradient: 'from-sky-500 to-blue-600',
    textGradient: 'from-sky-400 to-blue-300',
    glow: 'hover:shadow-sky-500/20',
  },
  {
    label: 'Pending Review',
    key: 'pendingReview',
    icon: Clock,
    gradient: 'from-fuchsia-500 to-pink-600',
    textGradient: 'from-fuchsia-400 to-pink-300',
    glow: 'hover:shadow-fuchsia-500/20',
  },
];

function StatCard({ label, value, icon: Icon, gradient, textGradient, glow, loading, delay }) {
  return (
    <div
      className={`card p-4 flex items-start gap-3.5 cursor-default
        hover:scale-[1.03] hover:-translate-y-1 transition-all duration-300
        hover:shadow-xl ${glow} animate-slide-up`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`p-2.5 rounded-xl bg-gradient-to-br ${gradient} flex-shrink-0
        shadow-lg group-hover:scale-110 transition-transform`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="min-w-0">
        {loading ? (
          <div className="h-7 w-16 bg-white/10 animate-pulse rounded-lg mb-1" />
        ) : (
          <p className={`text-2xl font-black tracking-tight bg-gradient-to-r ${textGradient} bg-clip-text text-transparent`}>
            {value?.toLocaleString?.() ?? value ?? '—'}
          </p>
        )}
        <p className="text-[11px] text-slate-500 mt-0.5 uppercase tracking-wider font-semibold">
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
