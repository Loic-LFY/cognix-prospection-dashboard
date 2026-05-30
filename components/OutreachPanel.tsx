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
  const [connectPending, setConnectPending] = useState(false);
  const [connectResult, setConnectResult] = useState<string | null>(null);

  const isQueued = !!lead.outreach_queued_at && !lead.outreach_sent_at;
  const isSent = !!lead.outreach_sent_at;
  const isConnectionSent =
    lead.linkedin_status === 'connection_sent' && !lead.linkedin_connected;

  async function handleQueue() {
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  async function handleMarkConnected() {
    setConnectPending(true);
    setConnectResult(null);
    setError(null);

    try {
      // 1. Mettre à jour le statut de connexion
      const patchRes = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkedin_connected: 1,
          linkedin_status: 'connected',
          status: 'connected',
          connection_accepted_at: new Date().toISOString(),
        }),
      });

      if (!patchRes.ok) {
        const d = await patchRes.json();
        setError(d.error ?? 'Erreur lors de la mise à jour');
        return;
      }

      // 2. Re-queue automatique pour le message de prospection
      const queueRes = await fetch('/api/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, channel: 'linkedin' }),
      });

      if (queueRes.ok) {
        setConnectResult('✅ Connexion enregistrée — le message de prospection partira au prochain cycle (09h-20h Paris).');
      } else {
        setConnectResult('✅ Connexion enregistrée — remettez le lead en file d\'attente manuellement.');
      }

      startTransition(() => router.refresh());
    } catch (e) {
      setError(String(e));
    } finally {
      setConnectPending(false);
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

      {/* ── Bloc connexion acceptée ─────────────────────────────────────────── */}
      {isConnectionSent && (
        <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⏳</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-1">
                Demande de connexion envoyée
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">
                Dès que {lead.contact_name ?? 'le contact'} accepte sur LinkedIn,
                marquez la connexion ici pour déclencher l'envoi du message de prospection.
              </p>
              <button
                onClick={handleMarkConnected}
                disabled={connectPending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition"
              >
                {connectPending ? '⏳ En cours...' : '🤝 Marquer comme connecté'}
              </button>
              {connectResult && (
                <p className="mt-2 text-sm text-green-700 dark:text-green-400">{connectResult}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Toggle canal ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Canal :</span>

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

      {/* Statut file d'attente */}
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

      {/* Bouton mise en file */}
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
