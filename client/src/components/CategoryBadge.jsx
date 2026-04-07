const QUALITY_CONFIG = {
  hot:  { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300', dot: 'bg-green-500' },
  warm: { bg: 'bg-amber-100',  text: 'text-amber-800',  border: 'border-amber-300',  dot: 'bg-amber-500' },
  cold: { bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-300',  dot: 'bg-slate-400' },
};

const CATEGORY_CONFIG = {
  hot:          { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
  warm:         { bg: 'bg-orange-100',  text: 'text-orange-800',  border: 'border-orange-300' },
  cold:         { bg: 'bg-blue-100',    text: 'text-blue-800',    border: 'border-blue-300' },
  disqualified: { bg: 'bg-red-100',     text: 'text-red-800',     border: 'border-red-300' },
  pending:      { bg: 'bg-purple-100',  text: 'text-purple-700',  border: 'border-purple-300' },
};

/**
 * CategoryBadge — renders a colored pill for lead_quality or manual_category.
 * type: 'quality' | 'category'
 */
export default function CategoryBadge({ value, type = 'quality', size = 'sm' }) {
  if (!value) return <span className="text-gray-400 text-xs">—</span>;

  const config =
    type === 'quality' ? QUALITY_CONFIG[value] : CATEGORY_CONFIG[value];

  if (!config) return <span className="text-gray-400 text-xs">{value}</span>;

  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium capitalize
        ${config.bg} ${config.text} ${config.border} ${sizeClass}`}
    >
      {type === 'quality' && config.dot && (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dot}`} />
      )}
      {value}
    </span>
  );
}
