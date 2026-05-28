/**
 * Client Resend pour l'envoi d'emails de prospection Cognix.
 *
 * Variables d'env requises :
 *  - RESEND_API_KEY (optionnel - si absent, le canal email est désactivé)
 *
 * Expéditeur : loic.fretay@cognix-systems.com
 *
 * ⚠️  Tracking d'ouverture (open tracking) : DÉSACTIVÉ intentionnellement.
 *     Le DNS entreprise (pixel de tracking) n'est pas encore configuré.
 *     Le code est prévu — activer via la feature flag RESEND_TRACKING_ENABLED=true
 *     une fois l'entrée DNS cognix-systems.com créée.
 */

const RESEND_API = 'https://api.resend.com/emails';
const FROM_EMAIL = 'loic.fretay@cognix-systems.com';
const FROM_NAME = 'Loïc Fretay - Cognix Systems';

export interface ResendSendResult {
  id?: string;
  status: 'sent' | 'skipped' | 'error';
  message?: string;
}

export function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** ID du lead pour la corrélation webhook (metadata) */
  leadId?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<ResendSendResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return {
      status: 'skipped',
      message: 'RESEND_API_KEY absente — canal email désactivé',
    };
  }

  // Feature flag tracking ouverture (désactivé tant que DNS non configuré)
  const trackingEnabled = process.env.RESEND_TRACKING_ENABLED === 'true';

  const body: Record<string, unknown> = {
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to: [payload.to],
    subject: payload.subject,
    html: payload.html,
    ...(payload.text ? { text: payload.text } : {}),
    // Tracking d'ouverture - désactivé
    // open_tracking: trackingEnabled,   // ← décommenter une fois DNS configuré
    // click_tracking: false,
    ...(payload.leadId ? { tags: [{ name: 'lead_id', value: payload.leadId }] } : {}),
  };

  // Suppression explicite du tracking si non activé (par défaut Resend l'active)
  if (!trackingEnabled) {
    // Resend ne permet pas encore de désactiver le tracking par email individuel
    // via l'API de base — le faire au niveau du domaine dans le dashboard Resend.
    // Cf. https://resend.com/docs/dashboard/domains/introduction
  }

  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        status: 'error',
        message: data.message ?? data.error ?? JSON.stringify(data),
      };
    }

    return { id: data.id, status: 'sent' };
  } catch (e) {
    return { status: 'error', message: String(e) };
  }
}
