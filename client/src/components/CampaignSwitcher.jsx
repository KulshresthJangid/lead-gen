import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext.jsx';

export default function CampaignSwitcher({ onNewCampaign }) {
  const { campaigns, currentCampaign, selectCampaign } = useCampaign();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!currentCampaign && campaigns.length === 0) return null;

  return (
    <div ref={ref} className="relative px-3 pb-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
        style={{ backgroundColor: 'var(--active)', color: 'var(--text-1)' }}
      >
        <span className="truncate max-w-[120px]" title={currentCampaign?.name}>
          {currentCampaign?.name || 'No campaign'}
        </span>
        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
      </button>

      {open && (
        <div
          className="absolute left-3 right-3 top-full mt-1 rounded-xl border shadow-xl z-50 py-1 overflow-hidden"
          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border-md)' }}
        >
          {campaigns.map((c) => (
            <button
              key={c.id}
              onClick={() => { selectCampaign(c); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs transition-colors hover:bg-white/5"
              style={{
                color: c.id === currentCampaign?.id ? 'var(--text-1)' : 'var(--text-2)',
                fontWeight: c.id === currentCampaign?.id ? 600 : 400,
              }}
            >
              {c.name}
            </button>
          ))}
          {onNewCampaign && (
            <>
              <div className="mx-3 my-1 border-t" style={{ borderColor: 'var(--border)' }} />
              <button
                onClick={() => { onNewCampaign(); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-white/5"
                style={{ color: 'var(--text-3)' }}
              >
                <Plus className="w-3.5 h-3.5" />
                New campaign
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
