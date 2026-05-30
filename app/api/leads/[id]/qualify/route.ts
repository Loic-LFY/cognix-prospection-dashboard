export const dynamic = 'force-dynamic';
/**
 * POST /api/leads/[id]/qualify
 * Qualification manuelle d'un lead.
 *
 * Body: { action: 'approve' | 'reject' | 'delete' }
 *
 * - approve → qualification_status = 'approved'
 * - reject  → qualification_status = 'rejected'
 * - delete  → suppression définitive du lead
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { getLeadById, setQualificationStatus, deleteLead } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await checkApiKey(req);
  if (authError) return authError;

  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const { action } = body as { action?: string };

  if (!action || !['approve', 'reject', 'delete'].includes(action)) {
    return NextResponse.json(
      { error: 'action requis : approve | reject | delete' },
      { status: 400 }
    );
  }

  const lead = getLeadById(id);
  if (!lead) return NextResponse.json({ error: 'Lead non trouvé' }, { status: 404 });

  if (action === 'delete') {
    deleteLead(id);
    return NextResponse.json({ deleted: true, id });
  }

  const status = action === 'approve' ? 'approved' : 'rejected';
  const updated = setQualificationStatus(id, status);
  return NextResponse.json(updated);
}
