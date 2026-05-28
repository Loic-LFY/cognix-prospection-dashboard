export const dynamic = 'force-dynamic';
/**
 * POST /api/outreach
 * Met un lead approuvé en file d'attente de prise de contact.
 *
 * Body: { leadId: string, channel: 'linkedin' | 'email' }
 *
 * La prise de contact réelle est déclenchée via POST /api/outreach/process
 * (appelé manuellement ou par un cron).
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { getLeadById, queueLeadForOutreach } from '@/lib/db';
import type { OutreachChannel } from '@/types/lead';

export async function POST(req: NextRequest) {
  const authError = checkApiKey(req);
  if (authError) return authError;

  const body = await req.json();
  const { leadId, channel } = body as { leadId?: string; channel?: OutreachChannel };

  if (!leadId) {
    return NextResponse.json({ error: 'leadId requis' }, { status: 400 });
  }

  const validChannels: OutreachChannel[] = ['linkedin', 'email'];
  const outreachChannel: OutreachChannel = validChannels.includes(channel as OutreachChannel)
    ? (channel as OutreachChannel)
    : 'linkedin';

  const lead = getLeadById(leadId);
  if (!lead) {
    return NextResponse.json({ error: 'Lead non trouvé' }, { status: 404 });
  }

  if (lead.qualification_status !== 'approved') {
    return NextResponse.json(
      {
        error: 'Lead non validé manuellement. Validez le lead avant de déclencher une prise de contact.',
        qualification_status: lead.qualification_status,
      },
      { status: 403 }
    );
  }

  const updated = queueLeadForOutreach(leadId, outreachChannel);
  return NextResponse.json({
    queued: true,
    lead: updated,
    message: `Lead mis en file d'attente (canal: ${outreachChannel})`,
  });
}
