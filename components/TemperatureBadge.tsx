'use client';

import type { Temperature } from '@/types/lead';

interface Props {
  temperature: Temperature;
}

const config: Record<Temperature, { label: string; className: string }> = {
  new: { label: 'Nouveau', className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  froid: { label: '❄️ Froid', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  tiede: { label: '🌤 Tiède', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  chaud: { label: '🔥 Chaud', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
};

export default function TemperatureBadge({ temperature }: Props) {
  const { label, className } = config[temperature] ?? config.new;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
