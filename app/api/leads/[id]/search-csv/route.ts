import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/leads/[id]/search-csv?token=***
 * Retourne un CSV avec UN SEUL lead (celui spécifié par id).
 * Utilisé comme spreadsheetUrl pour le Phantom "Profile URL Finder"
 * afin de cibler précisément le lead en cours de traitement.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.nextUrl.searchParams.get('token');
  const expected = process.env.CSV_EXPORT_TOKEN ?? process.env.API_KEY;
  if (!token || token !== expected) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  const lead = db.prepare(
    `SELECT contact_name, company FROM leads WHERE id = ?`
  ).get(id) as { contact_name: string | null; company: string } | undefined;

  if (!lead || !lead.contact_name) {
    return new NextResponse('firstName,lastName,companyName\n', {
      status: 200,
      headers: { 'Content-Type': 'text/csv', 'Cache-Control': 'no-store' },
    });
  }

  const esc = (s: string) => '"' + s.replace(/"/g, '""') + '"';
  const parts = lead.contact_name.trim().split(/\s+/);
  const firstName = parts[0] ?? '';
  const lastName = parts.slice(1).join(' ');

  if (!firstName || !lastName) {
    return new NextResponse('firstName,lastName,companyName\n', {
      status: 200,
      headers: { 'Content-Type': 'text/csv', 'Cache-Control': 'no-store' },
    });
  }

  const csv = `firstName,lastName,companyName\n${esc(firstName)},${esc(lastName)},${esc(lead.company)}`;

  return new NextResponse(csv, {
    status: 200,
    headers: { 'Content-Type': 'text/csv', 'Cache-Control': 'no-store' },
  });
}
