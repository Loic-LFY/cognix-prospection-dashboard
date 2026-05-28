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
    if (!confirm('Mettre en pause la prospection ?')) return;
    // Optimistic update immédiat
    setControl((prev) => prev ? { ...prev, status: 'paused', pause_reason: 'Arrêt manuel' } : prev);
    setLoading(true);
    try {
      await fetch('/api/control/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Arrêt manuel' }),
      });
    } finally {
      await fetchStatus();
      setLoading(false);
    }
  };

  const handleResume = async () => {
    setControl((prev) => prev ? { ...prev, status: 'active', pause_reason: null } : prev);
    setLoading(true);
    try {
      await fetch('/api/control/resume', { method: 'POST' });
    } finally {
      await fetchStatus();
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  // Hauteur unifiée pour tous les éléments de la barre de contrôle
  const badgeBase = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold';
  const btnBase  = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition disabled:opacity-50 cursor-pointer';

  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="max-w-screen-xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <img src="/logo-cognix.png" alt="Cognix Systems" className="h-9 w-auto object-contain" />
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium border-l border-gray-200 dark:border-gray-600 pl-3 hidden sm:block">
            Dashboard Prospection
          </span>
        </div>

        {/* Contrôles */}
        <div className="flex items-center gap-2 flex-wrap">

          {/* Badge mode RÉEL / SIMULATION */}
          {control && (
            <span className={`${badgeBase} ${
              control.mode === 'reel'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-200'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
            }`}>
              {control.mode === 'reel' ? '🌍 RÉEL' : '🧪 SIMULATION'}
            </span>
          )}

          {/* Badge statut ACTIF / EN PAUSE */}
          {control && (
            <span className={`${badgeBase} ${
              control.status === 'active'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-200'
                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/60 dark:text-yellow-200'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                control.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
              }`} />
              {control.status === 'active'
                ? 'ACTIF'
                : `EN PAUSE${control.pauseDuration ? ` · ${control.pauseDuration}` : ''}`}
            </span>
          )}

          {/* Bouton STOP */}
          {control?.status === 'active' && (
            <button
              onClick={handleStop}
              disabled={loading}
              className={`${btnBase} bg-red-600 hover:bg-red-700 text-white`}
            >
              ⏹ STOP
            </button>
          )}

          {/* Bouton REPRENDRE */}
          {control?.status === 'paused' && (
            <button
              onClick={handleResume}
              disabled={loading}
              className={`${btnBase} bg-green-600 hover:bg-green-700 text-white`}
            >
              ▶ REPRENDRE
            </button>
          )}

          {/* Séparateur */}
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />

          {/* Refresh */}
          <button
            onClick={fetchStatus}
            disabled={loading}
            title="Actualiser le statut"
            className={`h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition ${loading ? 'animate-spin' : ''}`}
          >
            🔄
          </button>

          {/* Déconnexion — toujours visible sur le dashboard (on est forcément authentifié) */}
          <button
            onClick={handleLogout}
            title="Déconnexion"
            className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition"
          >
            🔐
          </button>
        </div>
      </div>

      {/* Bandeau pause */}
      {control?.status === 'paused' && control.pause_reason && (
        <div className="bg-yellow-50 dark:bg-yellow-950 border-t border-yellow-200 dark:border-yellow-800 px-4 py-1.5 text-xs text-yellow-800 dark:text-yellow-300 flex items-center gap-2">
          <span>⏸</span>
          <span>Prospection en pause — {control.pause_reason}</span>
        </div>
      )}
    </header>
  );
}
