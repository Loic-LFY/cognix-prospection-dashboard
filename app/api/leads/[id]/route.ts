export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { getLeadById, updateLead, deleteLead } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkApiKey(req);
  if (authError) return authError;

  const { id } = await params;
  const lead = getLeadById(id);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(lead);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkApiKey(req);
  if (authError) return authError;

  const { id } = await params;
  const lead = getLeadById(id);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  deleteLead(id);
  return NextResponse.json({ deleted: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = checkApiKey(req);
  if (authError) return authError;

  const { id } = await params;
  try {
    const body = await req.json();
    const lead = updateLead(id, body);
    if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(lead);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
