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

// ─── Parsing CSV résultat PB ──────────────────────────────────────────────────

/**
 * Parse une ligne CSV en tenant compte des guillemets.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Récupère le fichier CSV résultat d'un agent PB et cherche l'URL LinkedIn
 * correspondant à la société/contact traité.
 *
 * Le CSV résultat contient : firstName, lastName, companyName, email, location,
 * query, url, title, description, score, timestamp, error
 *
 * On utilise /agents/fetch-output?id={agentId} pour obtenir le dernier CSV.
 */
async function extractUrlFromAgentCSV(
  agentId: string,
  apiKey: string,
  company: string,
  fullName: string
): Promise<string | null> {
  try {
    // /agents/fetch-output retourne le dernier fichier de résultats de l'agent
    const res = await fetch(`${PHANTOMBUSTER_BASE}/agents/fetch-output?id=${agentId}`, {
      headers: { 'X-Phantombuster-Key': apiKey },
    });
    if (!res.ok) return null;

    const data = await res.json();

    // Selon la version PB, le CSV peut être dans différents champs
    let csvText: string | null = null;

    // Cas 1 : outputFileUrl (URL vers fichier CSV externe)
    const csvUrl: string | null =
      (data as Record<string, string>).csvUrl ??
      (data as Record<string, string>).outputFileUrl ??
      null;

    if (csvUrl) {
      const csvRes = await fetch(csvUrl).catch(() => null);
      if (csvRes?.ok) csvText = await csvRes.text();
    }

    // Cas 2 : output direct (string CSV ou JSON)
    if (!csvText) {
      const rawOutput = (data as Record<string, string>).output ?? '';
      if (typeof rawOutput === 'string' && rawOutput.includes('firstName')) {
        csvText = rawOutput;
      }
    }

    if (!csvText) return null;

    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return null;

    const headers = parseCSVLine(lines[0]);
    const urlIdx = headers.findIndex((h) => h.toLowerCase() === 'url');
    const companyIdx = headers.findIndex((h) => h.toLowerCase() === 'companyname');
    const firstNameIdx = headers.findIndex((h) => h.toLowerCase() === 'firstname');
    const errorIdx = headers.findIndex((h) => h.toLowerCase() === 'error');

    if (urlIdx === -1) return null;

    const companyLower = company.toLowerCase();
    const nameParts = fullName.toLowerCase().split(/\s+/);

    // Chercher la ligne correspondant à notre lead (la plus récente en premier)
    for (let i = lines.length - 1; i >= 1; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = parseCSVLine(line);

      const rowCompany = (cols[companyIdx] ?? '').toLowerCase();
      const rowFirstName = (cols[firstNameIdx] ?? '').toLowerCase();

      const matchesCompany =
        rowCompany.includes(companyLower.substring(0, 8)) ||
        companyLower.includes(rowCompany.substring(0, 8));
      const matchesName =
        nameParts.length > 0 && rowFirstName.includes(nameParts[0]);

      if (matchesCompany || matchesName) {
        const url = cols[urlIdx]?.trim();
        const error = cols[errorIdx]?.trim();
        if (url && url.includes('linkedin.com/in/')) {
          return url;
        }
        if (error) return null; // "No result found" explicite
      }
    }
    return null;
  } catch {
    return null;
  }
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
 * Stratégie d'extraction du résultat (par ordre) :
 *  1. Logs console du container → regex sur URL linkedin.com/in/
 *  2. Fichier CSV résultat de l'agent → parser CSV + match company/firstName
 */
export async function findLinkedInProfileUrl(
  fullName: string,
  company: string,
  leadId?: string
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

    // URL CSV publique — PhantomBuster accède depuis ses serveurs, donc il faut l'URL publique.
    // Requiert APP_URL=https://cognix.7solutionsweb.com dans le docker-compose.
    const csvToken = process.env.CSV_EXPORT_TOKEN ?? process.env.API_KEY ?? '';
    const appUrl = process.env.APP_URL ?? '';
    // CSV ciblé sur ce lead uniquement (évite les mélanges entre leads)
    const csvUrl = leadId
      ? `${appUrl}/api/leads/${leadId}/search-csv?token=${csvToken}`
      : `${appUrl}/api/leads/pending-csv?token=${csvToken}`;

    const newArg = {
      ...currentArg,
      spreadsheetUrl: csvUrl,
      numberOfLinesPerLaunch: 1,
      // Noms des colonnes dans le CSV (requis par le Phantom)
      firstNameColumnName: 'firstName',
      lastNameColumnName: 'lastName',
      companyNameColumnName: 'companyName',
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

    // ── Méthode 1 : Logs console du container ─────────────────────────────
    const outputRes = await fetch(
      `${PHANTOMBUSTER_BASE}/containers/fetch-output?id=${containerId}`,
      { headers: { 'X-Phantombuster-Key': apiKey } }
    );

    if (outputRes.ok) {
      const outputData = await outputRes.json();
      const logs: string = typeof outputData === 'string'
        ? outputData
        : (outputData.output ?? outputData.text ?? JSON.stringify(outputData));

      // Regex étendue — capture plusieurs patterns possibles dans les logs PB
      const urlMatch = logs.match(
        /(?:Got|Found|profileUrl|linkedin\.com\/in\/)[^\s]*?(https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s"'\n,]+)|"(https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s"'\n,]+)"/
      );
      const directMatch = logs.match(/(https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s"'\n,]+)/);
      const foundUrl = urlMatch?.[1] ?? urlMatch?.[2] ?? directMatch?.[1];

      if (foundUrl) {
        return { profileUrl: foundUrl.trim(), status: 'found' };
      }
    }

    // ── Méthode 2 : CSV résultat de l'agent (fichier de sortie PB) ────────
    const csvUrl2 = await extractUrlFromAgentCSV(agentId, apiKey, company, fullName);
    if (csvUrl2) {
      return { profileUrl: csvUrl2, status: 'found' };
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
      inputType: 'profileUrl',           // URL directe, pas CSV
      profileUrl: linkedinUrl,           // URL du profil LinkedIn cible
      numberOfAddsPerLaunch: 1,
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
      inputType: 'profileUrl',       // URL directe, pas CSV
      profileUrl: linkedinUrl,       // URL du profil LinkedIn cible
      profilesPerLaunch: 1,
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
    // L'API PB v2 retourne les temps en millisecondes — convertir en secondes
    const usedMs: number = (data as Record<string, number>).monthlyExecutionTime ?? 0;
    const used: number = Math.round(usedMs / 1000);
    const limitMs: number =
      (data as Record<string, Record<string, number>>).plan?.maxMonthlyExecutionTime ??
      (data as Record<string, Record<string, number>>).plan?.monthlyExecutionTime ??
      (START_PLAN_LIMIT_SECONDS * 1000);
    const planLimit: number = Math.round(limitMs / 1000);
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
