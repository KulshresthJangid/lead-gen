// Tonal scale: hot=darkest, warm=medium, cold=light, pending=outlined, disqualified=muted
const QUALITY_STYLE = {
  hot:  { bg: 'var(--btn-bg)',    text: 'var(--btn-text)',  border: 'var(--btn-bg)',    dotOpacity: 1 },
  warm: { bg: 'var(--active)',    text: 'var(--text-1)',    border: 'var(--border-md)', dotOpacity: 0.7 },
  cold: { bg: 'var(--hover)',     text: 'var(--text-2)',    border: 'var(--border)',    dotOpacity: 0.4 },
};

const CATEGORY_STYLE = {
  hot:          { bg: 'var(--btn-bg)',  text: 'var(--btn-text)', border: 'var(--btn-bg)' },
  warm:         { bg: 'var(--active)',  text: 'var(--text-1)',   border: 'var(--border-md)' },
  cold:         { bg: 'var(--hover)',   text: 'var(--text-2)',   border: 'var(--border)' },
  disqualified: { bg: 'transparent',   text: 'var(--text-3)',   border: 'var(--border)' },
  pending:      { bg: 'transparent',   text: 'var(--text-2)',   border: 'var(--border-md)' },
};

export default function CategoryBadge({ value, type = 'quality', size = 'sm' }) {
  if (!value) return <span style={{ color: 'var(--text-3)', fontSize: '12px' }}>—</span>;

  const style = type === 'quality' ? QUALITY_STYLE[value] : CATEGORY_STYLE[value];
  if (!style) return <span style={{ color: 'var(--text-3)', fontSize: '12px' }}>{value}</span>;

  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold capitalize ${sizeClass}`}
      style={{ backgroundColor: style.bg, color: style.text, borderColor: style.border }}
    >
      {type === 'quality' && (
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: style.text, opacity: style.dotOpacity }}
        />
      )}
      {value}
    </span>
  );
}
