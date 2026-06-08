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
 *   5. Si URL trouvée, connecté ET température = new → Message Sender (post-connexion)
 *
 * - Traite 1 lead LinkedIn par appel (espacer les appels de quelques minutes)
 * - Met à jour le statut + compteur daily_actions après chaque action
 * - Classe en ban + froid les leads avec connexion_sent il y a >7j sans acceptation
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
  getDb,
} from '@/lib/db';
import {
  findLinkedInProfileUrl,
  sendLinkedInConnection,
  sendLinkedInMessage,
  isWithinOutreachWindow,
  nextOutreachWindow,
} from '@/lib/phantombuster';
import { sendEmail, isResendConfigured } from '@/lib/resend';

// Message post-connexion (envoyé uniquement si status=connected + temperature=new)
const LINKEDIN_POST_CONNECTION_MESSAGE = `Bonjour #firstName#,

Merci pour la demande de connexion.

L'idée est de créer des partenariats entre professionnels du digital afin de pouvoir se recommander mutuellement selon les besoins clients.

De notre côté, chez Cognix Systems, nous accompagnons principalement les entreprises sur :

- l'hébergement web et cloud,
- l'infogérance serveurs,
- la sécurisation et la supervision d'infrastructures,
- ainsi que le support technique avancé.

L'objectif n'est pas de concurrencer les agences ou développeurs web, mais au contraire de leur apporter un partenaire technique fiable lorsqu'un client a des besoins d'hébergement, de performance, de migration ou de maintenance.

Et inversement, nous pouvons également orienter certains besoins en développement vers des partenaires de confiance.

Je pense qu'un échange rapide pourrait être intéressant pour voir s'il existe des synergies possibles entre nos activités.

Belle journée à vous également,`;

/**
 * Classe en ban + froid les leads avec connexion envoyée il y a >7 jours sans acceptation.
 */
function processBanStaleConnections(): number {
  const db = getDb();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const stale = db
    .prepare(
      `SELECT id FROM leads
       WHERE linkedin_status = 'connection_sent'
         AND linkedin_connected = 0
         AND connection_sent_at IS NOT NULL
         AND connection_sent_at < :cutoff`
    )
    .all({ cutoff: sevenDaysAgo }) as { id: string }[];

  for (const { id } of stale) {
    db.prepare(
      `UPDATE leads SET
         status = 'ban',
         temperature = 'froid',
         linkedin_status = 'not_found',
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(id);
  }
  return stale.length;
}

export async function POST(req: NextRequest) {
  const authError = await checkApiKey(req);
  if (authError) return authError;

  const results: Array<{ leadId: string; company: string; channel: string; result: string }> = [];

  // ─── Bannissement automatique des connexions expirées (>7j) ──────────────
  const bannedCount = processBanStaleConnections();
  if (bannedCount > 0) {
    results.push({
      leadId: 'system',
      company: 'system',
      channel: 'system',
      result: `auto_ban: ${bannedCount} lead(s) sans acceptation après 7j`,
    });
  }

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
      const nameParts = (lead.contact_name ?? '').trim().split(/\s+/);
      if (!lead.contact_name || nameParts.length < 2) {
        updateLead(lead.id, { linkedin_status: 'not_found', outreach_sent_at: new Date().toISOString() });
        results.push({ leadId: lead.id, company: lead.company, channel: 'linkedin',
          result: 'skip: contact_name invalide (prénom+nom requis)' });
        continue;
      }

      const searchRes = await findLinkedInProfileUrl(
        lead.contact_name ?? lead.company,
        lead.company,
        lead.id
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
          outreach_sent_at: new Date().toISOString(),
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

    if (isConnected) {
      // N'envoyer le message que si température = new (pas encore contacté post-connexion)
      if (lead.temperature !== 'new') {
        results.push({
          leadId: lead.id,
          company: lead.company,
          channel: 'linkedin',
          result: `skip_message: déjà en température ${lead.temperature}`,
        });
        // Sortir de la file pour ne pas reboucler
        markOutreachSent(lead.id);
        continue;
      }

      const res = await sendLinkedInMessage(lead.linkedin_url, LINKEDIN_POST_CONNECTION_MESSAGE);

      if (res.status === 'launched') {
        markOutreachSent(lead.id);
        incrementDailyActions(1);
        updateLead(lead.id, {
          status: 'message_sent',
          linkedin_status: 'message_sent',
          temperature: 'tiede',
          linkedin_message_sent: 1,
          linkedin_message_sent_at: new Date().toISOString(),
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
    } else {
      // Envoi demande de connexion
      const keyword = getSectorKeyword(lead.sector);
      const connectionNote = `Bonjour #firstName#, Je développe un réseau d'experts du digital et recherche des partenaires en ${keyword} afin de créer des synergies d'affaires.\nSeriez-vous ouvert à une mise en relation ?`;

      const res = await sendLinkedInConnection(lead.linkedin_url, connectionNote);

      if (res.status === 'launched') {
        markOutreachSent(lead.id);
        incrementDailyActions(1);
        updateLead(lead.id, {
          status: 'connection_sent',
          linkedin_status: 'connection_sent',
          connection_sent_at: new Date().toISOString(),
          last_action_date: new Date().toISOString(),
        });
        results.push({
          leadId: lead.id,
          company: lead.company,
          channel: 'linkedin',
          result: `connection_launched_unverified: ${res.containerId}`,
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

/**
 * Dérive un mot-clé sectoriel depuis le secteur du lead pour personnaliser la note de connexion.
 */
function getSectorKeyword(sector: string | null | undefined): string {
  const s = (sector ?? '').toLowerCase();
  if (s.includes('e-commerce') || s.includes('ecommerce') || s.includes('commerce')) return 'e-commerce';
  if (s.includes('web') || s.includes('agence') || s.includes('digital') || s.includes('numérique')) return 'développement web';
  if (s.includes('hébergement') || s.includes('cloud') || s.includes('infogérance') || s.includes('hosting')) return 'hébergement et infogérance';
  if (s.includes('logiciel') || s.includes('software') || s.includes('saas') || s.includes('erp')) return 'solutions logicielles';
  if (s.includes('sécurité') || s.includes('cybersécurité')) return 'cybersécurité';
  if (s.includes('iot') || s.includes('industrie')) return 'transformation numérique';
  if (s.includes('conseil') || s.includes('consulting')) return 'conseil digital';
  return 'digital et technologie';
}
