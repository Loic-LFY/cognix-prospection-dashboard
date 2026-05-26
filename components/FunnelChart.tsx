'use client';

import type { FunnelStep } from '@/types/lead';

interface Props {
  funnel: FunnelStep[];
}

export default function FunnelChart({ funnel }: Props) {
  const max = Math.max(...funnel.map((s) => s.count), 1);

  const colors = [
    'bg-blue-500',
    'bg-indigo-500',
    'bg-violet-500',
    'bg-purple-500',
    'bg-fuchsia-500',
    'bg-orange-500',
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wide">
        🎯 Entonnoir de conversion
      </h3>
      <div className="space-y-3">
        {funnel.map((step, i) => {
          const pct = max > 0 ? (step.count / max) * 100 : 0;
          const convPct =
            i > 0 && funnel[i - 1].count > 0
              ? Math.round((step.count / funnel[i - 1].count) * 100)
              : null;

          return (
            <div key={step.status} className="flex items-center gap-3">
              <div className="w-40 text-xs text-gray-600 dark:text-gray-400 shrink-0 text-right pr-2">
                {step.name}
              </div>
              <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-6 relative overflow-hidden">
                <div
                  className={`h-6 rounded-full ${colors[i % colors.length]} transition-all duration-500 flex items-center justify-end pr-2`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                >
                  {step.count > 0 && (
                    <span className="text-white text-xs font-bold">{step.count}</span>
                  )}
                </div>
                {step.count === 0 && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">0</span>
                )}
              </div>
              {convPct !== null && (
                <div className="w-12 text-xs text-gray-500 dark:text-gray-400 shrink-0">
                  ↓{convPct}%
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
