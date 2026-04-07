import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import LeadRow from './LeadRow.jsx';

const COLUMNS = [
  { key: 'full_name', label: 'Name', sortable: false },
  { key: 'company_name', label: 'Company', sortable: false },
  { key: 'email', label: 'Email', sortable: false },
  { key: 'lead_quality', label: 'AI Quality', sortable: true },
  { key: 'manual_category', label: 'Category', sortable: false },
  { key: 'confidence_score', label: 'Score', sortable: true },
  { key: 'created_at', label: 'Added', sortable: true },
  { key: 'actions', label: '', sortable: false },
];

function SortIcon({ column, sortBy, sortDir }) {
  if (column !== sortBy) return <ChevronUp className="w-3 h-3 text-gray-300" />;
  return sortDir === 'asc' ? (
    <ChevronUp className="w-3 h-3 text-indigo-500" />
  ) : (
    <ChevronDown className="w-3 h-3 text-indigo-500" />
  );
}

export default function LeadTable({
  leads = [],
  total = 0,
  filters,
  onFiltersChange,
  onCategorize,
  newLeadIds = new Set(),
  loading = false,
}) {
  const { page = 1, limit = 25, sortBy = 'created_at', sortDir = 'desc' } = filters;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  function toggleSort(key) {
    if (sortBy === key) {
      onFiltersChange({ ...filters, sortDir: sortDir === 'desc' ? 'asc' : 'desc', page: 1 });
    } else {
      onFiltersChange({ ...filters, sortBy: key, sortDir: 'desc', page: 1 });
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left font-semibold text-gray-500 ${
                    col.sortable ? 'cursor-pointer select-none hover:text-gray-900' : ''
                  }`}
                  onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      <SortIcon column={col.key} sortBy={sortBy} sortDir={sortDir} />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  {COLUMNS.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 animate-pulse rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-12 text-center text-gray-400">
                  No leads found. Try adjusting your filters or run the pipeline.
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  onCategorize={onCategorize}
                  isNew={newLeadIds.has(lead.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-600">
          <span>
            {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onFiltersChange({ ...filters, page: page - 1 })}
              className="px-3 py-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >
              ← Prev
            </button>
            <span className="px-2">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => onFiltersChange({ ...filters, page: page + 1 })}
              className="px-3 py-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
