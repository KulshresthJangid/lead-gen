import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Tag, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import CategoryBadge from './CategoryBadge.jsx';
import { format } from 'date-fns';

export default function LeadRow({ lead, onCategorize, isNew = false }) {
  const [expanded, setExpanded] = useState(false);
  const highlightClass = isNew ? 'animate-fade-out' : '';

  return (
    <>
      <tr
        className={`transition-colors ${highlightClass}`}
        style={{ borderBottom: '1px solid var(--border)' }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ''; }}
      >
        <td className="px-4 py-3 min-w-[180px]">
          <div className="font-medium text-gray-900 truncate max-w-[200px]">
            {lead.full_name || '—'}
          </div>
          <div className="text-xs text-gray-500 truncate max-w-[200px]">
            {lead.job_title || '—'}
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-gray-700 max-w-[160px]">
          <div className="truncate">{lead.company_name || '—'}</div>
          {lead.company_domain && (
            <div className="text-xs text-gray-400 truncate">{lead.company_domain}</div>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-gray-700 max-w-[200px]">
          <a
            href={`mailto:${lead.email}`}
            className="hover:underline truncate block"
            style={{ color: 'var(--text-1)' }}
          >
            {lead.email}
          </a>
        </td>
        <td className="px-4 py-3">
          <CategoryBadge value={lead.lead_quality} type="quality" />
        </td>
        <td className="px-4 py-3">
          <CategoryBadge value={lead.manual_category} type="category" />
        </td>
        <td className="px-4 py-3 text-sm text-gray-500">
          {lead.confidence_score != null ? `${lead.confidence_score}%` : '—'}
        </td>
        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
          {lead.created_at
            ? format(new Date(lead.created_at), 'MMM dd, yy')
            : '—'}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onCategorize(lead)}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-2)' }}
              title="Categorize"
            >
              <Tag className="w-4 h-4" />
            </button>
            <Link
              to={`/leads/${lead.id}`}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-3)' }}
              title="View details"
            >
              <ExternalLink className="w-4 h-4" />
            </Link>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-3)' }}
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-gray-50 border-b border-gray-100">
          <td colSpan={8} className="px-6 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {lead.pain_points && (
                <div>
                  <span className="font-medium text-gray-600">Pain points: </span>
                  <span className="text-gray-700">{lead.pain_points}</span>
                </div>
              )}
              {lead.reason_for_outreach && (
                <div>
                  <span className="font-medium text-gray-600">Outreach angle: </span>
                  <span className="text-gray-700">{lead.reason_for_outreach}</span>
                </div>
              )}
              {lead.manual_notes && (
                <div>
                  <span className="font-medium text-gray-600">Notes: </span>
                  <span className="text-gray-700">{lead.manual_notes}</span>
                </div>
              )}
              {lead.location && (
                <div>
                  <span className="font-medium text-gray-600">Location: </span>
                  <span className="text-gray-700">{lead.location}</span>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
