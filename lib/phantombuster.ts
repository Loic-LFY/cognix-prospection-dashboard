/**
 * PhantomBuster client pour LinkedIn outreach automatisé.
 *
 * Phantoms à configurer côté PhantomBuster :
 *  - "LinkedIn Profile URL Finder"  → trouver l'URL LinkedIn depuis nom + société
 *  - "LinkedIn Auto Connect"        → demandes de mise en relation avec note
 *  - "LinkedIn Message Sender"      → messages aux connexions existantes
 *
 * Variables d'env requises :
 *  - PHANTOMBUSTER_API_KEY
 *  - PHANTOMBUSTER_AGENT_ID_SEARCH     (LinkedIn Profile URL Finder)
 *  - PHANTOMBUSTER_AGENT_ID_CONNECTION (LinkedIn Auto Connect)
 *  - PHANTOMBUSTER_AGENT_ID_MESSAGE    (LinkedIn Message Sender)
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

  const day = get('day');
  const month = get('month');
  const year = get('year');

  if (!isWithinOutreachWindow()) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowParts = parisFormatter.formatToParts(tomorrow);
    const tDay = tomorrowParts.find((p) => p.type === 'day')?.value ?? day;
    const tMonth = tomorrowParts.find((p) => p.type === 'month')?.value ?? month;
    const tYear = tomorrowParts.find((p) => p.type === 'year')?.value ?? year;
    return new Date(`${tYear}-${tMonth}-${tDay}T09:00:00+02:00`);
  }
  return now;
}

// ─── Recherche de profil ──────────────────────────────────────────────────────

export interface ProfileSearchResult {
  profileUrl: string | null;
  status: 'found' | 'not_found' | 'skipped' | 'error' | 'timeout';
  message?: string;
}

/**
 * Lance LinkedIn Profile URL Finder pour trouver l'URL d'un profil LinkedIn
 * depuis un nom complet + société (Sales Navigator Core compatible).
 *
 * Polling max 60s (12 × 5s). Retourne l'URL ou null si non trouvé.
 */
export async function findLinkedInProfileUrl(
  fullName: string,
  company: string
): Promise<ProfileSearchResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { profileUrl: null, status: 'skipped', message: 'PHANTOMBUSTER_API_KEY manquante' };
  }

  const agentId = process.env.PHANTOMBUSTER_AGENT_ID_SEARCH;
  if (!agentId) {
    return { profileUrl: null, status: 'skipped', message: 'PHANTOMBUSTER_AGENT_ID_SEARCH non configuré' };
  }

  try {
    // Lancer le Phantom avec la query "Prénom NOM Société"
    const launchRes = await fetch(`${PHANTOMBUSTER_BASE}/agent/${agentId}/launch`, {
      method: 'POST',
      headers: {
        'X-Phantombuster-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        argument: JSON.stringify({
          queries: [`${fullName} ${company}`],
          numberOfResultsPerSearch: 1,
        }),
      }),
    });

    if (!launchRes.ok) {
      const err = await launchRes.json().catch(() => ({}));
      return {
        profileUrl: null,
        status: 'error',
        message: err.error ?? `HTTP ${launchRes.status}`,
      };
    }

    const launchData = await launchRes.json();
    const containerId: string = launchData.containerId ?? '';
    if (!containerId) {
      return { profileUrl: null, status: 'error', message: 'containerId absent de la réponse PhantomBuster' };
    }

    // Polling du résultat — max 12 tentatives × 5s = 60s
    for (let i = 0; i < 12; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const resultRes = await fetch(
        `${PHANTOMBUSTER_BASE}/containers/fetch-result-object?id=${containerId}`,
        { headers: { 'X-Phantombuster-Key': apiKey } }
      );

      if (!resultRes.ok) continue;

      const data = await resultRes.json();
      const done =
        data.status === 'finished' ||
        data.exitCode !== undefined ||
        data.status === 'error';

      if (!done) continue;

      // Parser le résultat — Profile URL Finder retourne un tableau
      const output = data.resultObject;
      if (Array.isArray(output) && output.length > 0) {
        const profileUrl: string | undefined =
          output[0].profileUrl ?? output[0].linkedinUrl ?? output[0].url;
        if (profileUrl) {
          return { profileUrl, status: 'found' };
        }
      }

      return {
        profileUrl: null,
        status: 'not_found',
        message: 'Profil introuvable — ajout manuel requis',
      };
    }

    return {
      profileUrl: null,
      status: 'timeout',
      message: 'Timeout 60s — PhantomBuster trop lent, réessayer plus tard',
    };
  } catch (e) {
    return { profileUrl: null, status: 'error', message: String(e) };
  }
}

// ─── Connexion LinkedIn ───────────────────────────────────────────────────────

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

// ─── Message LinkedIn ─────────────────────────────────────────────────────────

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

// ─── Usage / quota ────────────────────────────────────────────────────────────

export interface PhantombusterUsage {
  /** Temps d'exécution mensuel consommé, en secondes */
  monthlyExecutionTime: number;
  /** Quota mensuel du plan, en secondes (-1 = non renseigné) */
  planMonthlyLimit: number;
  /** Nom du forfait (ex: "Start", "Growth") */
  planName: string;
  /** Pourcentage consommé (0-100+) */
  percentUsed: number;
  /** true si API key absente */
  notConfigured?: boolean;
  /** Message d'erreur éventuel */
  error?: string;
}

/**
 * Forfait Start PhantomBuster : 20h/mois = 72 000 secondes.
 * Fallback si l'API ne retourne pas la limite.
 */
const START_PLAN_LIMIT_SECONDS = 20 * 3600; // 72 000

export async function fetchPhantombusterUsage(): Promise<PhantombusterUsage> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      monthlyExecutionTime: 0,
      planMonthlyLimit: START_PLAN_LIMIT_SECONDS,
      planName: 'Start',
      percentUsed: 0,
      notConfigured: true,
    };
  }

  try {
    const res = await fetch(`${PHANTOMBUSTER_BASE}/orgs/fetch-resources`, {
      headers: { 'X-Phantombuster-Key': apiKey },
      cache: 'no-store',
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        monthlyExecutionTime: 0,
        planMonthlyLimit: START_PLAN_LIMIT_SECONDS,
        planName: 'Start',
        percentUsed: 0,
        error: data.error ?? `HTTP ${res.status}`,
      };
    }

    const data = await res.json();

    const used: number = data.monthlyExecutionTime ?? 0;
    const planLimit: number =
      data.plan?.maxMonthlyExecutionTime ??
      data.plan?.monthlyExecutionTime ??
      START_PLAN_LIMIT_SECONDS;
    const planName: string = data.planName ?? data.plan?.name ?? 'Start';
    const percentUsed = planLimit > 0 ? Math.round((used / planLimit) * 100) : 0;

    return { monthlyExecutionTime: used, planMonthlyLimit: planLimit, planName, percentUsed };
  } catch (e) {
    return {
      monthlyExecutionTime: 0,
      planMonthlyLimit: START_PLAN_LIMIT_SECONDS,
      planName: 'Start',
      percentUsed: 0,
      error: String(e),
    };
  }
}
