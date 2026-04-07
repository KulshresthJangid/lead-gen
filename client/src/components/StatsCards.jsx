import { useQuery } from '@tanstack/react-query';
import { Users, Flame, Thermometer, Snowflake, Clock } from 'lucide-react';
import apiClient from '../api/client.js';

function StatCard({ label, value, icon: Icon, colorClass, loading }) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <div className={`p-2 rounded-lg ${colorClass}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        {loading ? (
          <div className="h-8 w-16 bg-gray-200 animate-pulse rounded" />
        ) : (
          <p className="text-2xl font-bold text-gray-900">{value?.toLocaleString?.() ?? value}</p>
        )}
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
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

  const cards = [
    { label: 'Total Leads', value: stats?.totalLeads, icon: Users, colorClass: 'bg-indigo-500' },
    { label: 'Hot Leads', value: stats?.hotCount, icon: Flame, colorClass: 'bg-green-500' },
    { label: 'Warm Leads', value: stats?.warmCount, icon: Thermometer, colorClass: 'bg-amber-500' },
    { label: 'Cold Leads', value: stats?.coldCount, icon: Snowflake, colorClass: 'bg-slate-500' },
    { label: 'Pending Review', value: stats?.pendingReview, icon: Clock, colorClass: 'bg-purple-500' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <StatCard key={card.label} {...card} loading={isLoading} />
      ))}
    </div>
  );
}
