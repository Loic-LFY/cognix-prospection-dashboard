/**
 * PhantomBuster client pour LinkedIn outreach automatisé.
 *
 * Phantoms configurés côté PB :
 *  - "Cognix - Profile URL Finder"  (SEARCH)     → scriptId 4015
 *  - "Cognix - Auto Connect"        (CONNECTION)  → scriptId 2818
 *  - "Cognix - Message Sender"      (MESSAGE)     → scriptId 9227
 *
 * Variables d'env requises :
 *  - PHANTOMBUSTER_API_KEY
 *  - PHANTOMBUSTER_AGENT_ID_SEARCH
 *  - PHANTOMBUSTER_AGENT_ID_CONNECTION
 *  - PHANTOMBUSTER_AGENT_ID_MESSAGE
 *
 * IMPORTANT : Les Phantoms CONNECTION et MESSAGE utilisent sessionCookie + userAgent
 * stockés dans leur configuration PB. On récupère toujours la config actuelle avant
 * de lancer pour ne jamais écraser ces champs sensibles.
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
 * Récupère l'argument JSON actuel d'un agent PB.
 * Permet de merger les champs sensibles (sessionCookie, userAgent) sans les écraser.
 */
async function fetchAgentArgument(agentId: string, apiKey: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`${PHANTOMBUSTER_BASE}/agents/fetch?id=${agentId}`, {
      headers: { 'X-Phantombuster-Key': apiKey },
    });
    if (!res.ok) return {};
    const data = await res.json();
    return JSON.parse(data.argument || '{}');
  } catch {
    return {};
  }
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

// ─── Helpers polling ─────────────────────────────────────────────────────────

/**
 * Attend la fin d'un container PB via /containers/fetch (polling statut).
 */
async function waitForContainer(
  containerId: string,
  apiKey: string,
  maxAttempts = 12,
  intervalMs = 5000
): Promise<'finished' | 'error' | 'timeout'> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    const res = await fetch(
      `${PHANTOMBUSTER_BASE}/containers/fetch?id=${containerId}`,
      { headers: { 'X-Phantombuster-Key': apiKey } }
    ).catch(() => null);

    if (!res || !res.ok) continue;

    const data = await res.json().catch(() => null);
    if (!data) continue;

    const status: string = data.status ?? '';
    if (status === 'finished') return 'finished';
    if (status === 'error' || status === 'crashed') return 'error';
  }
  return 'timeout';
}

// ─── Recherche de profil ──────────────────────────────────────────────────────

export interface ProfileSearchResult {
  profileUrl: string | null;
  status: 'found' | 'not_found' | 'skipped' | 'error' | 'timeout';
  message?: string;
}

/**
 * Lance "Cognix - Profile URL Finder" pour trouver l'URL LinkedIn d'un lead.
 *
 * Ce Phantom attend une Google Sheet avec colonnes firstName, lastName, companyName.
 * On passe les données du lead directement dans l'argument en overridant spreadsheetUrl
 * avec les champs firstName/lastName/companyName si le Phantom le supporte,
 * sinon on retourne skipped (URL à renseigner manuellement).
 *
 * Polling via /containers/fetch + résultat via /containers/fetch-result-object.
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
    // Récupérer la config actuelle pour merger (market, csvName, etc.)
    const currentArg = await fetchAgentArgument(agentId, apiKey);

    // URL CSV interne : le serveur s'appelle lui-même via localhost.
    // Evite toute dépendance sur DASHBOARD_API_URL (variable externe non dispo côté serveur).
    const csvToken = process.env.CSV_EXPORT_TOKEN ?? process.env.API_KEY ?? '';
    const internalPort = process.env.PORT ?? '3000';
    const csvUrl = `http://localhost:${internalPort}/api/leads/pending-csv?token=${csvToken}`;

    const newArg = {
      ...currentArg,
      spreadsheetUrl: csvUrl,
      numberOfLinesPerLaunch: 1,
    };

    const launchRes = await fetch(`${PHANTOMBUSTER_BASE}/agents/launch`, {
      method: 'POST',
      headers: {
        'X-Phantombuster-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: agentId,
        argument: JSON.stringify(newArg),
      }),
    });

    if (!launchRes.ok) {
      const err = await launchRes.json().catch(() => ({}));
      return {
        profileUrl: null,
        status: 'error',
        message: (err as Record<string, string>).error ?? `HTTP ${launchRes.status}`,
      };
    }

    const launchData = await launchRes.json();
    const containerId: string = launchData.containerId ?? '';
    if (!containerId) {
      return { profileUrl: null, status: 'error', message: 'containerId absent de la réponse PhantomBuster' };
    }

    // Attendre la fin via /containers/fetch
    const finalStatus = await waitForContainer(containerId, apiKey);

    if (finalStatus === 'timeout') {
      return { profileUrl: null, status: 'timeout', message: 'Timeout 60s — réessayer plus tard' };
    }
    if (finalStatus === 'error') {
      return { profileUrl: null, status: 'error', message: 'Le Phantom a retourné une erreur' };
    }

    // Récupérer le résultat — /fetch-result-object retourne DIRECTEMENT le JSON du résultat
    const resultRes = await fetch(
      `${PHANTOMBUSTER_BASE}/containers/fetch-result-object?id=${containerId}`,
      { headers: { 'X-Phantombuster-Key': apiKey } }
    );

    if (!resultRes.ok) {
      return { profileUrl: null, status: 'not_found', message: 'Résultat indisponible après exécution' };
    }

    const output = await resultRes.json();

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
      message: 'Profil introuvable — URL LinkedIn à renseigner manuellement',
    };
  } catch (e) {
    return { profileUrl: null, status: 'error', message: String(e) };
  }
}

// ─── Connexion LinkedIn ───────────────────────────────────────────────────────

/**
 * Lance "Cognix - Auto Connect" pour envoyer une demande de connexion LinkedIn.
 *
 * Récupère la config actuelle du Phantom (sessionCookie, userAgent, etc.)
 * et merge avec l'URL du profil cible (spreadsheetUrl = URL profil LinkedIn).
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
    // Récupérer la config actuelle pour garder sessionCookie, userAgent, etc.
    const currentArg = await fetchAgentArgument(agentId, apiKey);

    const newArg = {
      ...currentArg,
      spreadsheetUrl: linkedinUrl,      // URL du profil LinkedIn cible
      numberOfAddsPerLaunch: 1,          // 1 seul par appel
      message: message ?? (currentArg.message as string ?? ''),
    };

    const res = await fetch(`${PHANTOMBUSTER_BASE}/agents/launch`, {
      method: 'POST',
      headers: {
        'X-Phantombuster-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: agentId,
        argument: JSON.stringify(newArg),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { containerId: '', status: 'error', message: (data as Record<string, string>).error ?? JSON.stringify(data) };
    }
    return { containerId: (data as Record<string, string>).containerId ?? '', status: 'launched' };
  } catch (e) {
    return { containerId: '', status: 'error', message: String(e) };
  }
}

// ─── Message LinkedIn ─────────────────────────────────────────────────────────

/**
 * Lance "Cognix - Message Sender" pour envoyer un message LinkedIn.
 *
 * Récupère la config actuelle du Phantom (sessionCookie, userAgent, etc.)
 * et merge avec l'URL du profil cible (spreadsheetUrl = URL profil LinkedIn).
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
    // Récupérer la config actuelle pour garder sessionCookie, userAgent, etc.
    const currentArg = await fetchAgentArgument(agentId, apiKey);

    const newArg = {
      ...currentArg,
      spreadsheetUrl: linkedinUrl,   // URL du profil LinkedIn cible
      profilesPerLaunch: 1,           // 1 seul par appel
      message,
    };

    const res = await fetch(`${PHANTOMBUSTER_BASE}/agents/launch`, {
      method: 'POST',
      headers: {
        'X-Phantombuster-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: agentId,
        argument: JSON.stringify(newArg),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { containerId: '', status: 'error', message: (data as Record<string, string>).error ?? JSON.stringify(data) };
    }
    return { containerId: (data as Record<string, string>).containerId ?? '', status: 'launched' };
  } catch (e) {
    return { containerId: '', status: 'error', message: String(e) };
  }
}

// ─── Usage / quota ────────────────────────────────────────────────────────────

export interface PhantombusterUsage {
  monthlyExecutionTime: number;
  planMonthlyLimit: number;
  planName: string;
  percentUsed: number;
  notConfigured?: boolean;
  error?: string;
}

const START_PLAN_LIMIT_SECONDS = 20 * 3600;

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
        error: (data as Record<string, string>).error ?? `HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    const used: number = (data as Record<string, number>).monthlyExecutionTime ?? 0;
    const planLimit: number =
      (data as Record<string, Record<string, number>>).plan?.maxMonthlyExecutionTime ??
      (data as Record<string, Record<string, number>>).plan?.monthlyExecutionTime ??
      START_PLAN_LIMIT_SECONDS;
    const planName: string =
      (data as Record<string, string>).planName ??
      (data as Record<string, Record<string, string>>).plan?.name ??
      'Start';
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
