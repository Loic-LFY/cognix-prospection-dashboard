export const dynamic = 'force-dynamic';
/**
 * POST /api/outreach/process
 * Traite la file d'attente de prise de contact.
 *
 * Séquence LinkedIn complète :
 *   1. Vérifie que le moteur est ACTIF (pas en pause)
 *   2. Vérifie la plage horaire 09h-20h Paris
 *   3. Si linkedin_url absent → Profile URL Finder (Phantom search, polling 60s)
 *   4. Si URL trouvée et non connecté → Auto Connect avec note
 *   5. Si URL trouvée et connecté → Message Sender
 *
 * - Traite 1 lead LinkedIn par appel (espacer les appels de quelques minutes)
 * - Met à jour le statut + compteur daily_actions après chaque action
 *
 * À appeler via un cron Hermes ou manuellement depuis le dashboard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import {
  getQueuedLeads,
  markOutreachSent,
  updateLead,
  getControl,
  incrementDailyActions,
} from '@/lib/db';
import {
  findLinkedInProfileUrl,
  sendLinkedInConnection,
  sendLinkedInMessage,
  isWithinOutreachWindow,
  nextOutreachWindow,
} from '@/lib/phantombuster';
import { sendEmail, isResendConfigured } from '@/lib/resend';

export async function POST(req: NextRequest) {
  const authError = await checkApiKey(req);
  if (authError) return authError;

  const results: Array<{ leadId: string; company: string; channel: string; result: string }> = [];

  // ─── Vérification statut moteur ───────────────────────────────────────────
  const control = getControl();
  if (control.status === 'paused') {
    return NextResponse.json({
      processed: 0,
      skipped_reason: `Moteur en pause — ${control.pause_reason ?? 'arrêt manuel'}`,
      paused_at: control.paused_at,
    });
  }

  // ─── LinkedIn ─────────────────────────────────────────────────────────────
  if (!isWithinOutreachWindow()) {
    const nextWindow = nextOutreachWindow();
    return NextResponse.json({
      processed: 0,
      skipped_reason: `Hors plage horaire LinkedIn (09h-20h Paris)`,
      next_window: nextWindow.toISOString(),
    });
  }

  const linkedinLeads = getQueuedLeads('linkedin');
  for (const lead of linkedinLeads.slice(0, 1)) {
    // ── Étape 1 : Recherche de l'URL LinkedIn si absente ──────────────────
    if (!lead.linkedin_url) {
      const searchRes = await findLinkedInProfileUrl(
        lead.contact_name ?? lead.company,
        lead.company
      );

      if (searchRes.status === 'found' && searchRes.profileUrl) {
        updateLead(lead.id, {
          linkedin_url: searchRes.profileUrl,
          linkedin_found: 1,
          linkedin_status: 'found',
        });
        lead.linkedin_url = searchRes.profileUrl;
      } else if (searchRes.status === 'skipped') {
        results.push({
          leadId: lead.id,
          company: lead.company,
          channel: 'linkedin',
          result: `search_skipped: ${searchRes.message}`,
        });
        continue;
      } else {
        updateLead(lead.id, {
          linkedin_found: 0,
          linkedin_status: 'not_found',
        });
        results.push({
          leadId: lead.id,
          company: lead.company,
          channel: 'linkedin',
          result: `search_${searchRes.status}: ${searchRes.message}`,
        });
        continue;
      }
    }

    // ── Étape 2 : Connexion ou message selon l'état du lead ───────────────
    const isConnected = lead.linkedin_connected === 1;

    const res = isConnected
      ? await sendLinkedInMessage(
          lead.linkedin_url,
          `Bonjour ${lead.contact_name ?? ''},\n\nNous accompagnons des entreprises comme ${lead.company} dans leur hébergement et infogérance. Seriez-vous disponible pour un échange rapide ?\n\nCordialement,\nLoïc Fretay - Cognix Systems`
        )
      : await sendLinkedInConnection(
          lead.linkedin_url,
          `Bonjour ${lead.contact_name ?? ''}, je souhaite rejoindre votre réseau dans le cadre de nos services d'hébergement et infogérance. Loïc Fretay - Cognix Systems`
        );

    if (res.status === 'launched') {
      markOutreachSent(lead.id);
      incrementDailyActions(1);
      updateLead(lead.id, {
        status: isConnected ? 'message_sent' : 'connection_sent',
        linkedin_status: isConnected ? 'message_sent' : 'connection_sent',
        ...(isConnected
          ? { linkedin_message_sent: 1, linkedin_message_sent_at: new Date().toISOString() }
          : { connection_sent_at: new Date().toISOString() }),
        last_action_date: new Date().toISOString(),
      });
      results.push({
        leadId: lead.id,
        company: lead.company,
        channel: 'linkedin',
        result: `launched: ${res.containerId}`,
      });
    } else {
      results.push({
        leadId: lead.id,
        company: lead.company,
        channel: 'linkedin',
        result: `${res.status}: ${res.message}`,
      });
    }
  }

  // ─── Email ────────────────────────────────────────────────────────────────
  const emailLeads = getQueuedLeads('email');
  if (!isResendConfigured()) {
    if (emailLeads.length > 0) {
      results.push({
        leadId: 'N/A',
        company: 'N/A',
        channel: 'email',
        result: `skip: RESEND_API_KEY absente (${emailLeads.length} leads en attente)`,
      });
    }
  } else {
    for (const lead of emailLeads.slice(0, 3)) {
      if (!lead.email) {
        results.push({
          leadId: lead.id,
          company: lead.company,
          channel: 'email',
          result: 'skip: pas d\'email renseigné',
        });
        continue;
      }

      const res = await sendEmail({
        to: lead.email,
        subject: `Hébergement & infogérance pour ${lead.company}`,
        html: `<p>Bonjour ${lead.contact_name ?? ''},</p>
<p>Nous accompagnons des entreprises dans votre secteur (${lead.sector ?? 'votre secteur'}) dans leur hébergement web et infogérance.</p>
<p>Votre hébergeur actuel est <strong>${lead.current_host ?? 'non identifié'}</strong> — nous serions ravis de vous présenter notre offre.</p>
<p>Seriez-vous disponible pour un échange de 15 minutes ?</p>
<p>Cordialement,<br/>Loïc Fretay<br/>Cognix Systems</p>`,
        text: `Bonjour ${lead.contact_name ?? ''},\n\nNous accompagnons des entreprises dans votre secteur dans leur hébergement web et infogérance.\n\nSeriez-vous disponible pour un échange de 15 minutes ?\n\nCordialement,\nLoïc Fretay - Cognix Systems`,
        leadId: lead.id,
      });

      if (res.status === 'sent') {
        markOutreachSent(lead.id);
        updateLead(lead.id, {
          email_outreach_status: 'sent',
          outreach_sent_at: new Date().toISOString(),
          last_action_date: new Date().toISOString(),
        });
        results.push({
          leadId: lead.id,
          company: lead.company,
          channel: 'email',
          result: `sent: ${res.id}`,
        });
      } else {
        results.push({
          leadId: lead.id,
          company: lead.company,
          channel: 'email',
          result: `${res.status}: ${res.message}`,
        });
      }
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
