'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Lead, OutreachChannel } from '@/types/lead';

interface Props {
  lead: Lead;
  resendConfigured: boolean;
}

export default function OutreachPanel({ lead, resendConfigured }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [channel, setChannel] = useState<OutreachChannel>(
    (lead.outreach_channel as OutreachChannel) ?? 'linkedin'
  );
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_DASHBOARD_API_KEY || '';

  const isQueued = !!lead.outreach_queued_at && !lead.outreach_sent_at;
  const isSent = !!lead.outreach_sent_at;

  async function handleQueue() {
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ leadId: lead.id, channel }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Erreur inconnue');
        return;
      }

      setResult(data.message ?? 'Mis en file d\'attente');
      startTransition(() => router.refresh());
    } catch (e) {
      setError(String(e));
    }
  }

  if (lead.qualification_status !== 'approved') {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 italic">
        Validez le lead manuellement avant de lancer une prise de contact.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toggle canal */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Canal :</span>

        {/* LinkedIn */}
        <button
          onClick={() => setChannel('linkedin')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
            channel === 'linkedin'
              ? 'bg-blue-700 text-white'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          💼 LinkedIn
        </button>

        {/* Email toggle */}
        <button
          onClick={() => setChannel('email')}
          disabled={!resendConfigured}
          title={!resendConfigured ? 'RESEND_API_KEY absente — canal email indisponible' : ''}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${
            channel === 'email'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          📧 Email
          {!resendConfigured && (
            <span className="text-xs bg-red-200 text-red-700 px-1 rounded">clé manquante</span>
          )}
        </button>
      </div>

      {/* Avertissement Resend */}
      {channel === 'email' && !resendConfigured && (
        <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
          ⚠️ <strong>RESEND_API_KEY</strong> absente de l'environnement.
          Ajoutez-la dans <code className="font-mono text-xs">~/openclaw/.env</code> pour activer le canal email.
        </div>
      )}

      {/* Statut actuel */}
      {isSent && (
        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
          ✅ Prise de contact envoyée le{' '}
          {new Date(lead.outreach_sent_at!).toLocaleString('fr-FR')}
        </div>
      )}
      {isQueued && !isSent && (
        <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
          ⏳ En file d'attente depuis{' '}
          {new Date(lead.outreach_queued_at!).toLocaleString('fr-FR')}
          {' '}— prochain traitement lors du cron de prospection
        </div>
      )}

      {/* Bouton */}
      {!isQueued && !isSent && (
        <button
          onClick={handleQueue}
          disabled={isPending || (channel === 'email' && !resendConfigured)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition"
        >
          {isPending ? '⏳ En cours...' : '🚀 Mettre en file d\'attente'}
        </button>
      )}

      {result && <p className="text-sm text-green-600 dark:text-green-400">{result}</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
