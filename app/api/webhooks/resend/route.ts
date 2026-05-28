export const dynamic = 'force-dynamic';
/**
 * POST /api/webhooks/resend
 * Endpoint webhook pour recevoir les événements Resend (ouverture email, clics...).
 *
 * ⚠️  Cette fonctionnalité est PRÉPARÉE mais inactive.
 *     Elle sera activée une fois l'entrée DNS entreprise configurée
 *     côté cognix-systems.com (pixel de tracking Resend).
 *
 * Configuration Resend :
 *  1. Aller dans Resend Dashboard → Webhooks → Add endpoint
 *  2. URL : https://cognix.7solutionsweb.com/api/webhooks/resend
 *  3. Événements à sélectionner : email.opened, email.clicked
 *  4. Copier le webhook secret dans RESEND_WEBHOOK_SECRET
 *
 * Sécurité : vérification de signature HMAC-SHA256 (désactivée si secret absent).
 */

import { NextRequest, NextResponse } from 'next/server';
import { markEmailOpened } from '@/lib/db';
import { createHmac } from 'crypto';

interface ResendWebhookEvent {
  type: string;
  created_at: string;
  data: {
    email_id?: string;
    to?: string[];
    tags?: Array<{ name: string; value: string }>;
    [key: string]: unknown;
  };
}

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Secret non configuré → on accepte sans vérification (dev/préprod uniquement)
    console.warn('[resend-webhook] RESEND_WEBHOOK_SECRET absent — signature non vérifiée');
    return true;
  }
  if (!signatureHeader) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return signatureHeader === expected;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('svix-signature') ?? req.headers.get('x-resend-signature');

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Signature invalide' }, { status: 401 });
  }

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  console.log('[resend-webhook] Event reçu:', event.type, event.created_at);

  // Traitement de l'événement d'ouverture
  if (event.type === 'email.opened') {
    // Récupérer le lead_id depuis les tags Resend
    const leadTag = event.data?.tags?.find((t) => t.name === 'lead_id');
    if (leadTag?.value) {
      const lead = markEmailOpened(leadTag.value);
      if (lead) {
        console.log(`[resend-webhook] Email ouvert pour lead ${leadTag.value} (${lead.company})`);
      } else {
        console.warn(`[resend-webhook] Lead ${leadTag.value} non trouvé en base`);
      }
    } else {
      // Fallback : essayer de retrouver par email
      const to = event.data?.to?.[0];
      console.warn(`[resend-webhook] email.opened sans lead_id tag (to: ${to})`);
    }
  }

  return NextResponse.json({ received: true, type: event.type });
}
