export const dynamic = 'force-dynamic';
/**
 * POST /api/leads/[id]/recap
 * Génère et enregistre le récapitulatif d'un lead chaud.
 *
 * Marque recap_generated = 1 et retourne les données du lead
 * pour affichage dans le dashboard (Hermes génère le texte côté OpenClaw).
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { getLeadById, updateLead } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await checkApiKey(req);
  if (authError) return authError;

  const { id } = await params;

  const lead = getLeadById(id);
  if (!lead) return NextResponse.json({ error: 'Lead non trouvé' }, { status: 404 });

  // Marquer le récap comme généré
  const updated = updateLead(id, { recap_generated: 1 });

  return NextResponse.json({
    recap_generated: true,
    lead: updated,
  });
}
