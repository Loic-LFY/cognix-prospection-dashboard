import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { setQualificationStatus, deleteLead, getLeadById } from '@/lib/db';
import type { QualificationStatus } from '@/types/lead';

const VALID_STATUSES: QualificationStatus[] = ['pending_review', 'approved', 'rejected'];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkApiKey(req);
  if (authError) return authError;

  const { id } = await params;

  const lead = getLeadById(id);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { action } = body as { action: 'approve' | 'reject' | 'delete' };

  if (action === 'delete') {
    deleteLead(id);
    return NextResponse.json({ deleted: true });
  }

  if (action === 'approve') {
    const updated = setQualificationStatus(id, 'approved');
    return NextResponse.json(updated);
  }

  if (action === 'reject') {
    const updated = setQualificationStatus(id, 'rejected');
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: 'Action invalide. Valeurs acceptées : approve | reject | delete' }, { status: 400 });
}
