import { useState } from 'react';
import { Search, Filter, X, ChevronDown } from 'lucide-react';

const QUALITY_OPTIONS = [
  { value: '', label: 'All Quality' },
  { value: 'hot', label: '🔥 Hot' },
  { value: 'warm', label: '🌡 Warm' },
  { value: 'cold', label: '❄️ Cold' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'hot', label: 'Hot' },
  { value: 'warm', label: 'Warm' },
  { value: 'cold', label: 'Cold' },
  { value: 'disqualified', label: 'Disqualified' },
  { value: 'pending', label: 'Pending' },
];

const SORT_OPTIONS = [
  { value: 'created_at', label: 'Date Added' },
  { value: 'confidence_score', label: 'AI Score' },
  { value: 'lead_quality', label: 'Quality' },
  { value: 'company_name', label: 'Company' },
];

export default function FiltersPanel({ filters, onChange }) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  function update(key, value) {
    onChange({ ...filters, [key]: value, page: 1 });
  }

  function clearAll() {
    onChange({ page: 1, limit: filters.limit || 25 });
  }

  const hasFilters = filters.search || filters.quality || filters.category ||
    filters.dateFrom || filters.dateTo;

  return (
    <div className="card p-4 space-y-3">
      {/* Search row */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            className="input pl-9 py-2"
            placeholder="Search name, company, email…"
            value={filters.search || ''}
            onChange={(e) => update('search', e.target.value)}
          />
        </div>

        <select
          className="input w-36 py-2"
          value={filters.quality || ''}
          onChange={(e) => update('quality', e.target.value)}
        >
          {QUALITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          className="input w-40 py-2"
          value={filters.category || ''}
          onChange={(e) => update('category', e.target.value)}
        >
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="btn-secondary py-2 gap-1.5 text-sm"
        >
          <Filter className="w-3.5 h-3.5" />
          More
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
        </button>

        {hasFilters && (
          <button onClick={clearAll} className="btn-secondary py-2 text-sm text-red-600 hover:bg-red-50">
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <div className="flex gap-3 flex-wrap pt-1 border-t border-gray-100">
          <div>
            <label className="label text-xs">From</label>
            <input
              type="date"
              className="input py-1.5 text-sm"
              value={filters.dateFrom || ''}
              onChange={(e) => update('dateFrom', e.target.value)}
            />
          </div>
          <div>
            <label className="label text-xs">To</label>
            <input
              type="date"
              className="input py-1.5 text-sm"
              value={filters.dateTo || ''}
              onChange={(e) => update('dateTo', e.target.value)}
            />
          </div>
          <div>
            <label className="label text-xs">Sort by</label>
            <select
              className="input py-1.5 text-sm"
              value={filters.sortBy || 'created_at'}
              onChange={(e) => update('sortBy', e.target.value)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-xs">Order</label>
            <select
              className="input py-1.5 text-sm"
              value={filters.sortDir || 'desc'}
              onChange={(e) => update('sortDir', e.target.value)}
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
