import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../api/client.js';

export default function ExportButton({ filters = {} }) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    if (loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
      });
      // Remove pagination — export all matching
      params.delete('page');
      params.delete('limit');

      const response = await apiClient.post(
        `/leads/export?${params.toString()}`,
        {},
        { responseType: 'blob' },
      );

      const url = URL.createObjectURL(
        new Blob([response.data], { type: 'text/csv' }),
      );
      const a = document.createElement('a');
      a.href = url;
      const ts = new Date().toISOString().slice(0, 10);
      a.download = `leads_export_${ts}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('CSV exported successfully!');
    } catch {
      toast.error('Export failed — try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="btn-secondary gap-2"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Download className="w-4 h-4" />
      )}
      Export CSV
    </button>
  );
}
