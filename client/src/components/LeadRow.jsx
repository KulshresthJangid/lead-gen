import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Tag, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import CategoryBadge from './CategoryBadge.jsx';
import { format } from 'date-fns';

export default function LeadRow({ lead, onCategorize, isNew = false }) {
  const hasEnrichment = !!(lead.pain_points || lead.reason_for_outreach);
  const [expanded, setExpanded] = useState(hasEnrichment);
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
          <div className="font-medium truncate max-w-[200px]" style={{ color: 'var(--text-1)' }}>
            {lead.full_name || '—'}
          </div>
          <div className="text-xs truncate max-w-[200px]" style={{ color: 'var(--text-3)' }}>
            {lead.job_title || '—'}
          </div>
        </td>
        <td className="px-4 py-3 text-sm max-w-[160px]" style={{ color: 'var(--text-2)' }}>
          <div className="truncate">{lead.company_name || '—'}</div>
          {lead.company_domain && (
            <div className="text-xs truncate" style={{ color: 'var(--text-3)' }}>{lead.company_domain}</div>
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
        <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-3)' }}>
          {lead.confidence_score != null ? `${lead.confidence_score}%` : '—'}
        </td>
        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-3)' }}>
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
              className="p-1.5 rounded-lg transition-colors relative"
              style={{ color: hasEnrichment ? 'var(--text-1)' : 'var(--text-3)' }}
              title={hasEnrichment ? 'Show AI enrichment' : 'No enrichment yet'}
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              {hasEnrichment && !expanded && (
                <span
                  className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--text-1)' }}
                />
              )}
            </button>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--hover)' }}>
          <td colSpan={8} className="px-6 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {lead.pain_points && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-3)' }}>Pain points</p>
                  <p style={{ color: 'var(--text-1)' }}>{lead.pain_points}</p>
                </div>
              )}
              {lead.reason_for_outreach && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-3)' }}>Outreach angle</p>
                  <p style={{ color: 'var(--text-1)' }}>{lead.reason_for_outreach}</p>
                </div>
              )}
              {lead.manual_notes && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-3)' }}>Notes</p>
                  <p style={{ color: 'var(--text-2)' }}>{lead.manual_notes}</p>
                </div>
              )}
              {lead.location && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-3)' }}>Location</p>
                  <p style={{ color: 'var(--text-2)' }}>{lead.location}</p>
                </div>
              )}
              {!lead.pain_points && !lead.reason_for_outreach && (
                <p className="text-xs italic col-span-2" style={{ color: 'var(--text-3)' }}>Not yet enriched by AI</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
