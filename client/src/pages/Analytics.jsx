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

function Card({ title, children }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">{title}</h3>
      {children}
    </div>
  );
}

export default function Analytics() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const res = await apiClient.get('/stats');
      return res.data;
    },
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card p-5">
            <div className="h-6 w-32 bg-gray-200 animate-pulse rounded mb-4" />
            <div className="h-64 bg-gray-100 animate-pulse rounded" />
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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-0.5">Pipeline performance and lead breakdown</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Avg AI Score', value: `${stats?.avgConfidenceScore ?? 0}%` },
          { label: 'Enrichment Rate', value: `${stats?.enrichmentSuccessRate ?? 0}%` },
          { label: 'Dupe Skip Rate', value: `${stats?.duplicateSkipRate ?? 0}%` },
          { label: 'Total Pipeline Runs', value: stats?.totalPipelineRuns ?? 0 },
        ].map(({ label, value }) => (
          <div key={label} className="card p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
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
