const QUALITY_CONFIG = {
  hot:  {
    classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    dot: 'bg-emerald-400',
    dotGlow: '0 0 5px rgba(52,211,153,0.9)',
  },
  warm: {
    classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    dot: 'bg-amber-400',
    dotGlow: '0 0 5px rgba(251,191,36,0.9)',
  },
  cold: {
    classes: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    dot: 'bg-sky-400',
    dotGlow: '0 0 5px rgba(56,189,248,0.9)',
  },
};

const CATEGORY_CONFIG = {
  hot:          { classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  warm:         { classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  cold:         { classes: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  disqualified: { classes: 'bg-red-500/15 text-red-400 border-red-500/30' },
  pending:      { classes: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
};

/**
 * CategoryBadge — neon glow pill for lead_quality or manual_category.
 * type: 'quality' | 'category'
 */
export default function CategoryBadge({ value, type = 'quality', size = 'sm' }) {
  if (!value) return <span className="text-slate-600 text-xs">—</span>;

  const config = type === 'quality' ? QUALITY_CONFIG[value] : CATEGORY_CONFIG[value];
  if (!config) return <span className="text-slate-600 text-xs">{value}</span>;

  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold capitalize
        shadow-sm transition-all duration-200
        ${config.classes} ${sizeClass}`}
    >
      {type === 'quality' && config.dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dot}`}
          style={{ boxShadow: config.dotGlow }}
        />
      )}
      {value}
    </span>
  );
}
