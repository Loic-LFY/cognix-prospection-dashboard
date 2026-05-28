'use client';

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { DailyCount } from '@/types/lead';

interface Props {
  daily: DailyCount[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
}

export default function DailyChart({ daily }: Props) {
  const data = daily.map((d) => ({ ...d, label: formatDate(d.date) }));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wide">
        📈 Leads / Jour (7 jours)
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip labelStyle={{ fontWeight: 600 }} />
          <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
          <Bar dataKey="new"   name="Nouveau"    stackId="temp" fill="#94a3b8" />
          <Bar dataKey="froid" name="Froid ❄️"   stackId="temp" fill="#60a5fa" />
          <Bar dataKey="tiede" name="Tiède 🌤"   stackId="temp" fill="#fb923c" />
          <Bar dataKey="chaud" name="Chaud 🔥"   stackId="temp" fill="#ef4444" radius={[4, 4, 0, 0]} />
          <Line
            type="monotone"
            dataKey="connections"
            name="Connexions LK ✅"
            stroke="#818cf8"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
