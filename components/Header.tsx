'use client';

import { useEffect, useState } from 'react';
import type { Control } from '@/types/lead';

interface ControlWithDuration extends Control {
  pauseDuration?: string | null;
}

export default function Header() {
  const [control, setControl] = useState<ControlWithDuration | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/control/status');
      if (res.ok) setControl(await res.json());
    } catch {}
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleStop = async () => {
    if (!confirm('Mettre en pause le prospecting ?')) return;
    setLoading(true);
    await fetch('/api/control/stop', { method: 'POST' });
    await fetchStatus();
    setLoading(false);
  };

  const handleResume = async () => {
    setLoading(true);
    await fetch('/api/control/resume', { method: 'POST' });
    await fetchStatus();
    setLoading(false);
  };

  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        {/* Left: title */}
        <div className="flex items-center gap-3">
          <span className="text-2xl">📡</span>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
              Cognix Prospection
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Dashboard de suivi</p>
          </div>
        </div>

        {/* Right: badges + controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Mode badge */}
          {control && (
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                control.mode === 'reel'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
              }`}
            >
              {control.mode === 'reel' ? '🌍 RÉEL' : '🧪 SIMULATION'}
            </span>
          )}

          {/* Status badge */}
          {control && (
            <span
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                control.status === 'active'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  control.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                }`}
              />
              {control.status === 'active'
                ? 'ACTIF'
                : `EN PAUSE${control.pauseDuration ? ` (${control.pauseDuration})` : ''}`}
            </span>
          )}

          {/* Stop button */}
          {control?.status === 'active' && (
            <button
              onClick={handleStop}
              disabled={loading}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
            >
              ⏹ STOP
            </button>
          )}

          {/* Resume button */}
          {control?.status === 'paused' && (
            <button
              onClick={handleResume}
              disabled={loading}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
            >
              ▶ RESUME
            </button>
          )}

          {/* Refresh */}
          <button
            onClick={fetchStatus}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
            title="Actualiser"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Pause reason bar */}
      {control?.status === 'paused' && control.pause_reason && (
        <div className="bg-red-50 dark:bg-red-950 border-t border-red-200 dark:border-red-800 px-4 py-1.5 text-xs text-red-700 dark:text-red-300">
          ⚠️ Raison de la pause : {control.pause_reason}
        </div>
      )}
    </header>
  );
}
