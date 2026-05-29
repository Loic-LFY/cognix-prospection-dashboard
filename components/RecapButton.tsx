'use client';

import { useState } from 'react';

export default function RecapButton({ leadId }: { leadId: string }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/recap`, { method: 'POST' });
      if (res.ok) {
        const { recap } = await res.json();
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(`<pre style="font-family:monospace;padding:20px;white-space:pre-wrap">${recap}</pre>`);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
    >
      {loading ? '⏳ Génération...' : '📄 Générer récap'}
    </button>
  );
}
