import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient from '../api/client.js';
import CategoryBadge from './CategoryBadge.jsx';

const CATEGORIES = [
  { value: 'hot', label: '🔥 Hot', desc: 'Strong ICP fit, ready to contact' },
  { value: 'warm', label: '🌡 Warm', desc: 'Partial fit, worth nurturing' },
  { value: 'cold', label: '❄️ Cold', desc: 'Weak fit, low priority' },
  { value: 'disqualified', label: '🚫 Disqualified', desc: 'Not a match' },
  { value: 'pending', label: '⏳ Pending', desc: 'Needs more review' },
];

const KEY_MAP = { H: 'hot', W: 'warm', C: 'cold', D: 'disqualified', P: 'pending' };

export default function ManualCategoryModal({ lead, isOpen, onClose }) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen && lead) {
      setCategory(lead.manual_category || 'pending');
      setNotes(lead.manual_notes || '');
    }
  }, [isOpen, lead]);

  const mutation = useMutation({
    mutationFn: async ({ category, notes }) => {
      const res = await apiClient.put(`/leads/${lead.id}/categorize`, {
        manual_category: category,
        manual_notes: notes,
      });
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['leads'], (old) => {
        if (!old) return old;
        return {
          ...old,
          leads: old.leads?.map((l) => (l.id === updated.id ? updated : l)),
        };
      });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      toast.success(`Lead categorized as "${category}"`);
      onClose();
    },
    onError: () => toast.error('Failed to save — try again'),
  });

  const handleSave = useCallback(() => {
    if (!category) return;
    mutation.mutate({ category, notes });
  }, [category, notes, mutation]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e) {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      const mapped = KEY_MAP[e.key.toUpperCase()];
      if (mapped) { setCategory(mapped); return; }
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Enter') { handleSave(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, handleSave]);

  if (!isOpen || !lead) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{lead.full_name}</h2>
            <p className="text-sm text-gray-500">{lead.company_name} · {lead.email}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* AI Assessment */}
          <div className="flex items-center gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">AI Quality</p>
              <CategoryBadge value={lead.lead_quality} type="quality" />
            </div>
            {lead.confidence_score != null && (
              <div>
                <p className="text-xs text-gray-500 mb-1">AI Score</p>
                <span className="text-sm font-semibold text-gray-900">{lead.confidence_score}%</span>
              </div>
            )}
          </div>

          {lead.pain_points && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Pain Points</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{lead.pain_points}</p>
            </div>
          )}

          {/* Category selector */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Manual Category <span className="normal-case font-normal">(H/W/C/D/P)</span>
            </p>
            <div className="grid grid-cols-1 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                    category === cat.value
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-base">{cat.label.split(' ')[0]}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{cat.label.split(' ').slice(1).join(' ')}</p>
                    <p className="text-xs text-gray-500">{cat.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="label">Notes (optional)</label>
            <textarea
              className="input min-h-[80px] resize-none"
              placeholder="Add context or next steps…"
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <p className="text-xs text-gray-400 text-right mt-1">{notes.length}/1000</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <p className="text-xs text-gray-400">Press Enter to save · Esc to close</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button
              onClick={handleSave}
              disabled={mutation.isPending || !category}
              className="btn-primary gap-2"
            >
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
