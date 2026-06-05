'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Lead, Temperature, LeadStatus } from '@/types/lead';
import TemperatureBadge from './TemperatureBadge';

interface Props {
  lead: Lead;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  new: { label: 'Nouveau', className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  linkedin_pending: { label: 'LinkedIn ⏳', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  connection_sent: { label: 'Connexion envoyée', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' },
  connected: { label: 'Connecté', className: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300' },
  message_sent: { label: 'En conversation 💬', className: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300' },
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

// Boutons de classification manuelle (visibles pour les leads en conversation ou tiède)
const TEMP_ACTIONS: { label: string; temperature: Temperature; status?: LeadStatus; className: string }[] = [
  { label: '🔥 Chaud', temperature: 'chaud', status: 'chaud', className: 'bg-orange-100 hover:bg-orange-200 text-orange-700 dark:bg-orange-900 dark:hover:bg-orange-800 dark:text-orange-300' },
  { label: '❄️ Froid', temperature: 'froid', className: 'bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900 dark:hover:bg-blue-800 dark:text-blue-300' },
  { label: '📅 RDV proposé', temperature: 'chaud', status: 'rdv_planifie', className: 'bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-900 dark:hover:bg-green-800 dark:text-green-300' },
];

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
  const [currentLiStatus, setCurrentLiStatus] = useState(lead.linkedin_status);
  const [currentStatus, setCurrentStatus] = useState(lead.status);
  const [currentTemp, setCurrentTemp] = useState<Temperature>(lead.temperature as Temperature);
  const status = statusConfig[currentStatus] ?? statusConfig.new;
  const liStatus = linkedinConfig[currentLiStatus] ?? linkedinConfig.pending;

  const [qualStatus, setQualStatus] = useState(lead.qualification_status ?? 'pending_review');
  const [channel, setChannel] = useState<'linkedin' | 'email'>(
    (lead.outreach_channel as 'linkedin' | 'email') ?? 'linkedin'
  );
  const [busy, setBusy] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);
  const [tempBusy, setTempBusy] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);

  async function qualify(action: 'approve' | 'delete') {
    setBusy(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/qualify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        if (action === 'delete') {
          window.dispatchEvent(new CustomEvent('leadDeleted', { detail: lead.id }));
          return;
        }
        const updated = await res.json();
        setQualStatus(updated.qualification_status);
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleChannel() {
    const next: 'linkedin' | 'email' = channel === 'linkedin' ? 'email' : 'linkedin';
    setChannel(next);
    await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outreach_channel: next }),
    });
  }

  async function handleSaveLinkedInUrl() {
    const url = manualUrl.trim();
    if (!url.startsWith('https://www.linkedin.com/') && !url.startsWith('https://linkedin.com/')) {
      alert('URL LinkedIn invalide (doit commencer par https://www.linkedin.com/ ou https://linkedin.com/)');
      return;
    }
    setUrlBusy(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkedin_url: url,
          linkedin_found: 1,
          linkedin_status: 'found',
          outreach_sent_at: null,
        }),
      });
      if (res.ok) {
        setCurrentLiStatus('found');
        setShowUrlInput(false);
        setManualUrl('');
        window.location.reload();
      }
    } finally {
      setUrlBusy(false);
    }
  }

  async function handleMarkConnected() {
    setConnectBusy(true);
    try {
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

      if (!patchRes.ok) return;

      // Re-queue automatique pour le message
      await fetch('/api/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, channel: 'linkedin' }),
      });

      setCurrentLiStatus('connected');
      setCurrentStatus('connected');
    } finally {
      setConnectBusy(false);
    }
  }

  async function handleSetTemperature(temperature: Temperature, status?: LeadStatus) {
    setTempBusy(true);
    try {
      const body: Record<string, string> = { temperature };
      if (status) body.status = status;
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setCurrentTemp(temperature);
        if (status) setCurrentStatus(status);
      }
    } finally {
      setTempBusy(false);
    }
  }

  // Afficher les boutons de classification manuelle si le lead est en conversation (tiède) ou message_sent
  const showTempActions = currentTemp === 'tiede' || currentStatus === 'message_sent';

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors group">
      {/* Société */}
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

      {/* Score */}
      <td className="px-4 py-3">
        <ScoreDots score={lead.score} />
      </td>

      {/* Localisation */}
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
        {lead.location ?? '—'}
      </td>

      {/* Contact */}
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
        <div>{lead.contact_name ?? '—'}</div>
        {lead.contact_title && (
          <div className="text-xs text-gray-400 dark:text-gray-500">{lead.contact_title}</div>
        )}
      </td>

      {/* Hébergeur */}
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
        {lead.current_host ?? '—'}
      </td>

      {/* Température + boutons de classification manuelle */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <TemperatureBadge temperature={currentTemp} />
          {showTempActions && (
            <div className="flex flex-wrap gap-1 mt-1">
              {TEMP_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleSetTemperature(action.temperature, action.status)}
                  disabled={tempBusy}
                  title={`Classer comme : ${action.label}`}
                  className={`px-2 py-0.5 text-xs rounded-lg font-medium transition disabled:opacity-40 ${action.className}`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </td>

      {/* LinkedIn — avec bouton 🤝 si connexion en attente d'acceptation */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
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

          {/* Saisie manuelle URL — visible si not_found */}
          {currentLiStatus === 'not_found' && (
            <>
              {showUrlInput ? (
                <div className="flex items-center gap-1 mt-1">
                  <input
                    type="url"
                    value={manualUrl}
                    onChange={(e) => setManualUrl(e.target.value)}
                    placeholder="https://linkedin.com/in/..."
                    className="text-xs px-2 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white w-40"
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveLinkedInUrl()}
                    autoFocus
                  />
                  <button
                    onClick={handleSaveLinkedInUrl}
                    disabled={urlBusy || !manualUrl.trim()}
                    title="Enregistrer et mettre en file"
                    className="px-1.5 py-0.5 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 text-xs rounded transition disabled:opacity-40"
                  >
                    {urlBusy ? '⏳' : '✓'}
                  </button>
                  <button
                    onClick={() => { setShowUrlInput(false); setManualUrl(''); }}
                    className="px-1.5 py-0.5 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowUrlInput(true)}
                  title="Saisir l'URL LinkedIn manuellement"
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs rounded-lg transition w-fit"
                >
                  🔗 URL manuelle
                </button>
              )}
            </>
          )}

          {/* Bouton "Connexion acceptée" — visible uniquement en connection_sent */}
          {currentLiStatus === 'connection_sent' && (
            <button
              onClick={handleMarkConnected}
              disabled={connectBusy}
              title="Connexion acceptée sur LinkedIn ? Cliquer pour envoyer le message"
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-100 hover:bg-teal-200 dark:bg-teal-900 dark:hover:bg-teal-800 text-teal-700 dark:text-teal-300 text-xs font-medium rounded-lg transition disabled:opacity-40 w-fit"
            >
              {connectBusy ? '⏳' : '🤝'} Connexion acceptée
            </button>
          )}
        </div>
      </td>

      {/* Dernière action */}
      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
        {formatDate(lead.last_action_date)}
      </td>

      {/* Validation manuelle */}
      <td className="px-3 py-3">
        {qualStatus === 'approved' ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Validé
          </span>
        ) : qualStatus === 'rejected' ? (
          <span className="text-xs text-red-400 line-through">Rejeté</span>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={() => qualify('approve')}
              disabled={busy}
              title="Valider ce lead"
              className="px-2 py-1 bg-green-100 hover:bg-green-200 dark:bg-green-900 dark:hover:bg-green-800 text-green-700 dark:text-green-300 text-xs rounded-lg transition disabled:opacity-40"
            >
              ✅
            </button>
            <button
              onClick={() => { if (confirm('Supprimer ce lead ?')) qualify('delete'); }}
              disabled={busy}
              title="Supprimer"
              className="px-2 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800 text-red-700 dark:text-red-300 text-xs rounded-lg transition disabled:opacity-40"
            >
              🗑️
            </button>
          </div>
        )}
      </td>

      {/* Toggle canal */}
      <td className="px-3 py-3">
        <button
          onClick={toggleChannel}
          title={`Canal : ${channel} — cliquer pour changer`}
          className={`px-2 py-1 rounded-lg text-xs font-medium transition ${
            channel === 'linkedin'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
              : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
          }`}
        >
          {channel === 'linkedin' ? '💼 LK' : '📧 Mail'}
        </button>
      </td>

      {/* Statut */}
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

