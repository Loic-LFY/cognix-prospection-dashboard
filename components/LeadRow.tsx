'use client';

import Link from 'next/link';
import type { Lead, LeadStatus, LinkedInStatus } from '@/types/lead';
import TemperatureBadge from './TemperatureBadge';

interface Props {
  lead: Lead;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  new: { label: 'Nouveau', className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  linkedin_pending: { label: 'LinkedIn ⏳', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  connection_sent: { label: 'Connexion 📤', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' },
  connected: { label: 'Connecté 🤝', className: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300' },
  message_sent: { label: 'Message 💬', className: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300' },
  chaud: { label: '🔥 Chaud', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' },
  rdv_planifie: { label: '📅 RDV', className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  converti: { label: '✅ Converti', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' },
  perdu: { label: '❌ Perdu', className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  ban: { label: '🚫 Ban', className: 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 line-through' },
};

const linkedinConfig: Record<string, { label: string; className: string }> = {
  pending: { label: 'En attente', className: 'text-gray-400' },
  not_found: { label: 'Non trouvé', className: 'text-red-500' },
  found: { label: 'Trouvé ✓', className: 'text-blue-500' },
  connection_sent: { label: 'Connexion envoyée', className: 'text-indigo-500' },
  connected: { label: 'Connecté', className: 'text-teal-500 font-medium' },
  message_sent: { label: 'Message envoyé', className: 'text-violet-500' },
  replied: { label: 'Répondu 🎉', className: 'text-green-600 font-bold' },
};

function ScoreDots({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 10 }).map((_, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full ${
            i < score
              ? score >= 8
                ? 'bg-green-500'
                : score >= 5
                ? 'bg-yellow-400'
                : 'bg-red-400'
              : 'bg-gray-200 dark:bg-gray-600'
          }`}
        />
      ))}
      <span className="ml-1 text-xs font-semibold text-gray-600 dark:text-gray-400">{score}/10</span>
    </div>
  );
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export default function LeadRow({ lead }: Props) {
  const status = statusConfig[lead.status] ?? statusConfig.new;
  const liStatus = linkedinConfig[lead.linkedin_status] ?? linkedinConfig.pending;

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors group">
      <td className="px-4 py-3">
        <Link
          href={`/leads/${lead.id}`}
          className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition"
        >
          {lead.company}
        </Link>
        {lead.sector && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{lead.sector}</div>
        )}
      </td>
      <td className="px-4 py-3">
        <ScoreDots score={lead.score} />
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
        {lead.location ?? '—'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
        <div>{lead.contact_name ?? '—'}</div>
        {lead.contact_title && (
          <div className="text-xs text-gray-400 dark:text-gray-500">{lead.contact_title}</div>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
        {lead.current_host ?? '—'}
      </td>
      <td className="px-4 py-3">
        <TemperatureBadge temperature={lead.temperature} />
      </td>
      <td className="px-4 py-3">
        {lead.linkedin_url ? (
          <a
            href={lead.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-xs ${liStatus.className} hover:underline`}
          >
            {liStatus.label}
          </a>
        ) : (
          <span className={`text-xs ${liStatus.className}`}>{liStatus.label}</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
        {formatDate(lead.last_action_date)}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${status.className}`}
        >
          {status.label}
        </span>
      </td>
    </tr>
  );
}
