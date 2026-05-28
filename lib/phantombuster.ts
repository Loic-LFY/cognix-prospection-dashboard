/**
 * PhantomBuster client pour LinkedIn outreach automatisé.
 *
 * Phantom à configurer côté PhantomBuster :
 *  - "LinkedIn Message Sender" pour envoyer des messages aux connexions
 *  - "LinkedIn Network Booster" pour les demandes de mise en relation
 *
 * Variables d'env requises :
 *  - PHANTOMBUSTER_API_KEY
 *  - PHANTOMBUSTER_AGENT_ID_CONNECTION (demandes de mise en relation)
 *  - PHANTOMBUSTER_AGENT_ID_MESSAGE    (messages aux connexions)
 */

const PHANTOMBUSTER_BASE = 'https://api.phantombuster.com/api/v2';

export interface PhantomLaunchResult {
  containerId: string;
  status: 'launched' | 'skipped' | 'error';
  message?: string;
}

function getApiKey(): string | null {
  return process.env.PHANTOMBUSTER_API_KEY ?? null;
}

/**
 * Vérifie si le créneau horaire est dans la plage autorisée (09h-20h Paris).
 */
export function isWithinOutreachWindow(): boolean {
  const now = new Date();
  const paris = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: 'numeric',
    hour12: false,
  }).format(now);
  const hour = parseInt(paris, 10);
  return hour >= 9 && hour < 20;
}

/**
 * Retourne l'heure (ISO) du prochain créneau autorisé (09h00 Paris lendemain si dépassé).
 */
export function nextOutreachWindow(): Date {
  const now = new Date();
  // Construire 09:00 heure Paris aujourd'hui
  const parisFormatter = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = parisFormatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';

  // Date locale Paris
  const day = get('day');
  const month = get('month');
  const year = get('year');

  // On construit "YYYY-MM-DD 09:00:00" en heure Paris puis on le convertit en UTC
  const candidate = new Date(`${year}-${month}-${day}T09:00:00`);
  // Ajuster pour le TZ offset Paris (approx, on fait mieux via luxon si dispo)
  // Méthode simple : si now >= 20h Paris → demain 09h Paris
  if (!isWithinOutreachWindow()) {
    const parisFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Paris',
      hour: 'numeric',
      hour12: false,
    });
    const currentHour = parseInt(parisFmt.format(now), 10);
    // Si on est après 20h, on vise demain à 9h
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowParts = parisFormatter.formatToParts(tomorrow);
    const tDay = tomorrowParts.find((p) => p.type === 'day')?.value ?? day;
    const tMonth = tomorrowParts.find((p) => p.type === 'month')?.value ?? month;
    const tYear = tomorrowParts.find((p) => p.type === 'year')?.value ?? year;
    return new Date(`${tYear}-${tMonth}-${tDay}T09:00:00+02:00`);
  }
  return now; // déjà dans la fenêtre
}

/**
 * Lance un agent PhantomBuster pour envoyer une demande de connexion LinkedIn.
 */
export async function sendLinkedInConnection(
  linkedinUrl: string,
  message?: string
): Promise<PhantomLaunchResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { containerId: '', status: 'skipped', message: 'PHANTOMBUSTER_API_KEY manquante' };
  }

  if (!isWithinOutreachWindow()) {
    return {
      containerId: '',
      status: 'skipped',
      message: `Hors plage horaire (09h-20h Paris). Prochain créneau : ${nextOutreachWindow().toISOString()}`,
    };
  }

  const agentId = process.env.PHANTOMBUSTER_AGENT_ID_CONNECTION;
  if (!agentId) {
    return { containerId: '', status: 'skipped', message: 'PHANTOMBUSTER_AGENT_ID_CONNECTION non configuré' };
  }

  try {
    const res = await fetch(`${PHANTOMBUSTER_BASE}/agent/${agentId}/launch`, {
      method: 'POST',
      headers: {
        'X-Phantombuster-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        argument: JSON.stringify({
          profileUrl: linkedinUrl,
          message: message ?? '',
        }),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { containerId: '', status: 'error', message: data.error ?? JSON.stringify(data) };
    }
    return { containerId: data.containerId ?? '', status: 'launched' };
  } catch (e) {
    return { containerId: '', status: 'error', message: String(e) };
  }
}

/**
 * Lance un agent PhantomBuster pour envoyer un message LinkedIn (connexion existante).
 */
export async function sendLinkedInMessage(
  linkedinUrl: string,
  message: string
): Promise<PhantomLaunchResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { containerId: '', status: 'skipped', message: 'PHANTOMBUSTER_API_KEY manquante' };
  }

  if (!isWithinOutreachWindow()) {
    return {
      containerId: '',
      status: 'skipped',
      message: `Hors plage horaire (09h-20h Paris). Prochain créneau : ${nextOutreachWindow().toISOString()}`,
    };
  }

  const agentId = process.env.PHANTOMBUSTER_AGENT_ID_MESSAGE;
  if (!agentId) {
    return { containerId: '', status: 'skipped', message: 'PHANTOMBUSTER_AGENT_ID_MESSAGE non configuré' };
  }

  try {
    const res = await fetch(`${PHANTOMBUSTER_BASE}/agent/${agentId}/launch`, {
      method: 'POST',
      headers: {
        'X-Phantombuster-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        argument: JSON.stringify({
          profileUrl: linkedinUrl,
          message,
        }),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { containerId: '', status: 'error', message: data.error ?? JSON.stringify(data) };
    }
    return { containerId: data.containerId ?? '', status: 'launched' };
  } catch (e) {
    return { containerId: '', status: 'error', message: String(e) };
  }
}
