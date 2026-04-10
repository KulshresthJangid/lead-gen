import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { format } from 'date-fns';
import apiClient from '../api/client.js';

const QUALITY_COLORS = { hot: '#22c55e', warm: '#f59e0b', cold: '#94a3b8', null: '#e5e7eb' };
const CATEGORY_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#94a3b8', '#ef4444'];

const SOURCES = [
  { value: 'all',         label: 'All Sources' },
  { value: 'github',      label: 'GitHub' },
  { value: 'google',      label: 'Google / LinkedIn' },
  { value: 'gitlab',      label: 'GitLab' },
  { value: 'hackernews',  label: 'Hacker News' },
  { value: 'custom',      label: 'Custom URLs' },
];

function Card({ title, children }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide mb-4" style={{ color: 'var(--text-3)' }}>{title}</h3>
      {children}
    </div>
  );
}

export default function Analytics() {
  const [source, setSource] = useState('all');

  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats', source],
    queryFn: async () => {
      const params = source !== 'all' ? `?source=${source}` : '';
      const res = await apiClient.get(`/stats${params}`);
      return res.data;
    },
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card p-5">
            <div className="h-6 w-32 animate-pulse rounded mb-4" style={{ backgroundColor: 'var(--hover)' }} />
            <div className="h-64 animate-pulse rounded" style={{ backgroundColor: 'var(--hover)' }} />
          </div>
        ))}
      </div>
    );
  }

  const qualityData = [
    { name: 'Hot', value: stats?.hotCount || 0, fill: QUALITY_COLORS.hot },
    { name: 'Warm', value: stats?.warmCount || 0, fill: QUALITY_COLORS.warm },
    { name: 'Cold', value: stats?.coldCount || 0, fill: QUALITY_COLORS.cold },
  ].filter((d) => d.value > 0);

  const categoryData = Object.entries(stats?.categoryBreakdown || {}).map(
    ([name, value], i) => ({ name, value, fill: CATEGORY_COLORS[i] }),
  );

  const activeLabel = SOURCES.find((s) => s.value === source)?.label ?? 'All Sources';

  return (
    <div className="space-y-5">
      {/* Header + source picker */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--text-1)' }}>Analytics</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            Pipeline performance · <span style={{ color: 'var(--text-2)' }}>{activeLabel}</span>
          </p>
        </div>

        {/* Source filter */}
        <div className="flex items-center gap-1 flex-wrap">
          {SOURCES.map((s) => (
            <button
              key={s.value}
              onClick={() => setSource(s.value)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150"
              style={source === s.value
                ? { backgroundColor: 'var(--btn-bg)', color: 'var(--btn-text)' }
                : { backgroundColor: 'var(--hover)', color: 'var(--text-3)' }
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Leads', value: (stats?.totalLeads ?? 0).toLocaleString() },
          { label: 'Avg AI Score', value: `${stats?.avgConfidenceScore ?? 0}%` },
          { label: 'Enrichment Rate', value: `${stats?.enrichmentSuccessRate ?? 0}%` },
          { label: 'Dupe Skip Rate', value: `${stats?.duplicateSkipRate ?? 0}%` },
        ].map(({ label, value }) => (
          <div key={label} className="card p-4 text-center">
            <p className="text-2xl font-black" style={{ color: 'var(--text-1)' }}>{value}</p>
            <p className="text-xs mt-1 uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Daily lead trend */}
        <Card title="Daily Lead Trend (30 days)">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={stats?.dailyTrend || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => format(new Date(d + 'T00:00:00'), 'MMM d')}
                tick={{ fontSize: 11 }}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip
                labelFormatter={(d) => format(new Date(d + 'T00:00:00'), 'MMM d, yyyy')}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ r: 3, fill: '#6366f1' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Top companies */}
        <Card title="Top 10 Companies">
          {(stats?.topCompanies || []).length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              No data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                data={stats?.topCompanies || []}
                layout="vertical"
                margin={{ left: 8, right: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="company_name"
                  width={110}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip />
                <Bar dataKey="count" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Quality pie */}
        <Card title="Lead Quality Distribution">
          {qualityData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              No data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={qualityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {qualityData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Category pie */}
        <Card title="Manual Category Distribution">
          {categoryData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              No data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {categoryData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}
