'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { QualificationStatus } from '@/types/lead';

interface Props {
  leadId: string;
  currentStatus: QualificationStatus;
  apiKey?: string;
}

const statusLabels: Record<QualificationStatus, { label: string; className: string }> = {
  pending_review: {
    label: '⏳ En attente de validation',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  },
  approved: {
    label: '✅ Validé - en file d\'attente',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  rejected: {
    label: '🗑️ Supprimé / Hors cible',
    className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  },
};

export default function QualificationButtons({ leadId, currentStatus }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<QualificationStatus>(currentStatus);
  const [error, setError] = useState<string | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_DASHBOARD_API_KEY || '';

  async function handleAction(action: 'approve' | 'reject' | 'delete') {
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/qualify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Erreur inconnue');
        return;
      }

      if (action === 'delete') {
        startTransition(() => router.push('/'));
        return;
      }

      const updated = await res.json();
      setStatus(updated.qualification_status as QualificationStatus);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(String(e));
    }
  }

  const badge = statusLabels[status];

  return (
    <div className="flex flex-col gap-3">
      {/* Badge de statut actuel */}
      <div className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium w-fit ${badge.className}`}>
        {badge.label}
      </div>

      {/* Boutons d'action */}
      <div className="flex gap-2 flex-wrap">
        {status !== 'approved' && (
          <button
            onClick={() => handleAction('approve')}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
          >
            ✅ Valider
          </button>
        )}
        {status === 'approved' && (
          <button
            onClick={() => handleAction('reject')}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
          >
            ↩️ Annuler validation
          </button>
        )}
        <button
          onClick={() => {
            if (confirm('Supprimer ce lead définitivement ?')) handleAction('delete');
          }}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
        >
          🗑️ Supprimer
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
