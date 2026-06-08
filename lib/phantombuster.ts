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
 * Design :
 *  - On utilise bonusArgument (single-use, mergé sur la config PB) pour tous les lancements.
 *    La config sauvegardée de l'agent (sessionCookie, userAgent, etc.) n'est JAMAIS modifiée.
 *  - SEARCH  : launch-sync + includeLogs=true → stream NDJSON, regex sur les logs
 *  - CONNECTION/MESSAGE : launch simple (pas besoin d'attendre la fin)
 *  - 1 profil par run dans tous les cas (numberOfAddsPerLaunch/profilesPerLaunch = 1)
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
    // Calculer le prochain 09h00 Paris sans offset hardcodé
    // On avance heure par heure jusqu'à être dans la fenêtre
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + 1);
    // Construire la date Paris 09:00 via UTC : trouver l'offset réel
    const tomorrowParts = parisFormatter.formatToParts(candidate);
    const tDay = tomorrowParts.find((p) => p.type === 'day')?.value ?? day;
    const tMonth = tomorrowParts.find((p) => p.type === 'month')?.value ?? month;
    const tYear = tomorrowParts.find((p) => p.type === 'year')?.value ?? year;
    // Trouver l'offset Paris réel pour ce jour (gère heure d'été/hiver)
    const probe = new Date(`${tYear}-${tMonth}-${tDay}T09:00:00`);
    const parisHour = parseInt(
      new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false }).format(probe),
      10
    );
    // Ajuster si l'offset local ne correspond pas à Paris
    probe.setHours(probe.getHours() + (9 - parisHour));
    return probe;
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
 * Lance "Cognix - Profile URL Finder" via launch-sync + includeLogs.
 *
 * On utilise bonusArgument (single-use) pour passer le CSV URL sans toucher
 * à la config sauvegardée de l'agent.
 *
 * Le stream NDJSON contient les messages :
 *   { type: "start", containerId, agentId }
 *   { type: "logs", body: { output: "...", outputPos: N } }
 *   { type: "summary", exitCode?, executionTime, containerId }
 *   { type: "error", message }
 *
 * On collecte tous les logs et on cherche toute URL linkedin.com/in/.
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
    const csvToken = process.env.CSV_EXPORT_TOKEN ?? process.env.API_KEY ?? '';
    const appUrl = process.env.APP_URL ?? '';
    const csvUrl = leadId
      ? `${appUrl}/api/leads/${leadId}/search-csv?token=${csvToken}`
      : `${appUrl}/api/leads/pending-csv?token=${csvToken}`

    const res = await fetch(`${PHANTOMBUSTER_BASE}/agents/launch-sync`, {
      method: 'POST',
      headers: {
        'X-Phantombuster-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: agentId,
        bonusArgument: {
          spreadsheetUrl: csvUrl,
          csvName: leadId ? `lead-${leadId.substring(0, 8)}` : 'result',
          numberOfLinesPerLaunch: 1,
          firstNameColumnName: 'firstName',
          lastNameColumnName: 'lastName',
          companyNameColumnName: 'companyName',
        },
        includeLogs: true,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        profileUrl: null,
        status: 'error',
        message: (err as Record<string, string>).error ?? `HTTP ${res.status}`,
      };
    }

    // Parser le stream NDJSON
    const reader = res.body?.getReader();
    if (!reader) {
      return { profileUrl: null, status: 'error', message: 'Stream indisponible' };
    }

    const decoder = new TextDecoder();
    let allLogs = '';
    let foundUrl: string | null = null;
    let buffer = '';
    let timedOut = false;

    // Timeout global 75s (le Phantom SEARCH peut prendre ~30-45s)
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 75_000));

    const readStream = async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const msg = JSON.parse(trimmed) as Record<string, unknown>;
              // Logs PB : { type: "logs", data: ["line1", "line2", ...] }
              if (msg.type === 'logs') {
                const data = msg.data as string[] | undefined;
                if (Array.isArray(data)) allLogs += data.join('\n') + '\n';
              }
              // Summary PB : { type: "summary", data: { resultObject: [...], output: "..." } }
              if (msg.type === 'summary') {
                const summaryData = msg.data as Record<string, unknown> | undefined;
                // Priorité 1 : resultObject[0].profileUrl (disponible avec csvName unique)
                const ro = summaryData?.resultObject as Array<Record<string, string>> | null | undefined;
                if (Array.isArray(ro) && ro.length > 0 && ro[0].profileUrl) {
                  foundUrl = ro[0].profileUrl.trim().replace(/\/$/, '');
                }
                // Priorité 2 : output complet pour le regex
                if (!foundUrl && typeof summaryData?.output === 'string') {
                  allLogs += summaryData.output;
                }
                return;
              }
              if (msg.type === 'error') {
                return;
              }
            } catch {
              // ligne non-JSON, ignorer
            }
          }
        }
      } catch {
        // déconnexion stream
      }
    };

    await Promise.race([
      readStream(),
      timeout.then(() => { timedOut = true; reader.cancel().catch(() => {}); }),
    ]);

    if (timedOut && !allLogs && !foundUrl) {
      return { profileUrl: null, status: 'timeout', message: 'Timeout 75s sans réponse' };
    }

    // URL trouvée dans resultObject
    if (foundUrl) {
      return { profileUrl: foundUrl, status: 'found' };
    }

    // Fallback : regex dans les logs (cas où resultObject est null)
    const urlMatch = allLogs.match(/(https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s"'\n,}\]]+)/);
    if (urlMatch?.[1]) {
      return { profileUrl: urlMatch[1].trim().replace(/\/$/, ''), status: 'found' };
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
 * Lance "Cognix - Auto Connect" via bonusArgument (single-use).
 *
 * La config de l'agent (sessionCookie, userAgent) est préservée.
 * On envoie à 1 seul profil via inputType='profileUrl'.
 *
 * IMPORTANT : Ne jamais passer spreadsheetUrl ici — PB lirait un CSV
 * et pourrait confondre les prénoms entre plusieurs lignes.
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
    const res = await fetch(`${PHANTOMBUSTER_BASE}/agents/launch`, {
      method: 'POST',
      headers: {
        'X-Phantombuster-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: agentId,
        bonusArgument: {
          inputType: 'profileUrl',      // 1 profil exact, pas de CSV
          profileUrl: linkedinUrl,
          numberOfAddsPerLaunch: 1,     // sécurité : 1 seule invitation
          ...(message ? { message } : {}),
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        containerId: '',
        status: 'error',
        message: (data as Record<string, string>).error ?? JSON.stringify(data),
      };
    }
    return { containerId: (data as Record<string, string>).containerId ?? '', status: 'launched' };
  } catch (e) {
    return { containerId: '', status: 'error', message: String(e) };
  }
}

// ─── Message LinkedIn ─────────────────────────────────────────────────────────

/**
 * Lance "Cognix - Message Sender" via bonusArgument (single-use).
 *
 * La config de l'agent (sessionCookie, userAgent) est préservée.
 * On envoie à 1 seul profil via inputType='profileUrl'.
 *
 * IMPORTANT : Ne jamais passer spreadsheetUrl ici — même raison que CONNECTION.
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
    const res = await fetch(`${PHANTOMBUSTER_BASE}/agents/launch`, {
      method: 'POST',
      headers: {
        'X-Phantombuster-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: agentId,
        bonusArgument: {
          inputType: 'profileUrl',    // 1 profil exact, pas de CSV
          profileUrl: linkedinUrl,
          profilesPerLaunch: 1,       // sécurité : 1 seul message
          message,
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        containerId: '',
        status: 'error',
        message: (data as Record<string, string>).error ?? JSON.stringify(data),
      };
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
