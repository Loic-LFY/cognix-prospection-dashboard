'use client';

import type { Stats } from '@/types/lead';

interface Props {
  stats: Stats;
}

interface KPI {
  label: string;
  value: number | string;
  icon: string;
  color: string;
  description?: string;
}

export default function KPIGrid({ stats }: Props) {
  const kpis: KPI[] = [
    {
      label: 'Total leads',
      value: stats.total,
      icon: '🏢',
      color: 'border-l-blue-500',
      description: 'Toutes entreprises',
    },
    {
      label: 'LinkedIn trouvés',
      value: stats.linkedin_found,
      icon: '💼',
      color: 'border-l-indigo-500',
      description: `${stats.total > 0 ? Math.round((stats.linkedin_found / stats.total) * 100) : 0}% du total`,
    },
    {
      label: 'Actions LinkedIn/10',
      value: `${stats.linkedin_actions_today}/10`,
      icon: '📤',
      color:
        stats.linkedin_actions_today >= 10
          ? 'border-l-red-500'
          : stats.linkedin_actions_today >= 7
          ? 'border-l-yellow-500'
          : 'border-l-green-500',
      description: "Aujourd'hui",
    },
    {
      label: 'Connexions acceptées',
      value: stats.connections_accepted,
      icon: '🤝',
      color: 'border-l-teal-500',
      description: 'Réseau constitué',
    },
    {
      label: 'Leads chauds 🔥',
      value: stats.leads_chauds,
      icon: '🔥',
      color: 'border-l-orange-500',
      description: 'À relancer en priorité',
    },
    {
      label: 'Ban list',
      value: stats.ban_count,
      icon: '🚫',
      color: 'border-l-red-400',
      description: 'Ne pas contacter',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 ${kpi.color} p-4 flex flex-col gap-1 shadow-sm hover:shadow-md transition`}
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl">{kpi.icon}</span>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {kpi.value}
          </div>
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{kpi.label}</div>
          {kpi.description && (
            <div className="text-xs text-gray-500 dark:text-gray-400">{kpi.description}</div>
          )}
        </div>
      ))}
    </div>
  );
}
