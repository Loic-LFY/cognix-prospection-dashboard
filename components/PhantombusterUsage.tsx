'use client';

import { useEffect, useState } from 'react';
import type { PhantombusterUsage } from '@/lib/phantombuster';

/** Quota forfait Start : 20h = 72 000 s. Utilisé comme fallback d'affichage. */
const START_PLAN_HOURS = 20;

function secondsToHours(s: number): number {
  return Math.round((s / 3600) * 10) / 10; // 1 décimale
}

function ProgressBar({ percent, warning }: { percent: number; warning: boolean }) {
  const clamped = Math.min(percent, 100);

  const barColor = warning
    ? 'bg-orange-500'
    : percent >= 60
    ? 'bg-yellow-400'
    : 'bg-blue-500';

  return (
    <div className="relative w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
        style={{ width: `${clamped}%` }}
      />
      {/* Marqueur 80% */}
      <div
        className="absolute top-0 bottom-0 w-px bg-orange-400 dark:bg-orange-500 opacity-70"
        style={{ left: '80%' }}
        title="Seuil d'alerte 80%"
      />
    </div>
  );
}

export default function PhantombusterUsageWidget() {
  const [data, setData] = useState<PhantombusterUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetch('/api/phantombuster/usage')
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    const d = await fetch('/api/phantombuster/usage').then((r) => r.json()).catch(() => null);
    if (d) setData(d);
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm animate-pulse">
        <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
        <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    );
  }

  if (!data) return null;

  const limitHours =
    data.planMonthlyLimit > 0
      ? Math.round((data.planMonthlyLimit / 3600) * 10) / 10
      : START_PLAN_HOURS;

  const usedHours = secondsToHours(data.monthlyExecutionTime);
  const remaining = Math.max(0, limitHours - usedHours);
  const percent = data.percentUsed;
  const isWarning = percent >= 80;
  const isCritical = percent >= 100;

  return (
    <div
      className={`rounded-xl border p-4 shadow-sm ${
        isCritical
          ? 'bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-700'
          : isWarning
          ? 'bg-orange-50 dark:bg-orange-950 border-orange-300 dark:border-orange-700'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            👻 PhantomBuster
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-mono">
            {data.planName}
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={`ml-1 text-gray-400 hover:text-gray-600 text-xs transition ${refreshing ? 'animate-spin' : ''}`}
            title="Actualiser"
          >
            🔄
          </button>
        </div>

        {/* Alerte 80% */}
        {isWarning && !isCritical && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 animate-pulse">
            ⚠️ {percent}% consommé
          </span>
        )}
        {isCritical && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
            🚫 Quota dépassé
          </span>
        )}
      </div>

      {/* Barre de progression */}
      <ProgressBar percent={percent} warning={isWarning} />

      {/* Chiffres */}
      <div className="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
        <span>
          <strong className={`text-sm ${isWarning ? 'text-orange-600 dark:text-orange-400' : 'text-gray-900 dark:text-white'}`}>
            {usedHours}h
          </strong>
          {' '}/ {limitHours}h utilisées ce mois
        </span>
        <span className={remaining <= 2 && isWarning ? 'text-orange-500 dark:text-orange-400 font-medium' : ''}>
          {remaining}h restantes
        </span>
      </div>

      {/* Clé absente */}
      {data.notConfigured && (
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 italic">
          Ajoutez <code className="font-mono">PHANTOMBUSTER_API_KEY</code> dans ~/openclaw/.env pour afficher la consommation réelle.
        </p>
      )}

      {/* Erreur API */}
      {data.error && !data.notConfigured && (
        <p className="mt-2 text-xs text-red-500 dark:text-red-400">
          Erreur API : {data.error}
        </p>
      )}
    </div>
  );
}
