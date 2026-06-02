import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/leads/pending-csv?token={CSV_EXPORT_TOKEN}
 *
 * Retourne un CSV public des leads approuvés sans URL LinkedIn.
 * Colonnes : firstName, lastName, companyName
 * Utilisé comme spreadsheetUrl pour le Phantom "Profile URL Finder".
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const expected = process.env.CSV_EXPORT_TOKEN ?? process.env.API_KEY;
  if (!token || token !== expected) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const db = getDb();
  const leads = db.prepare(
    `SELECT contact_name, company
     FROM leads
     WHERE qualification_status = 'approved'
       AND (linkedin_url IS NULL OR linkedin_url = '')
       AND outreach_sent_at IS NULL
     ORDER BY created_at ASC
     LIMIT 50`
  ).all() as { contact_name: string | null; company: string }[];

  const rows = leads.map((l) => {
    const parts = (l.contact_name ?? l.company).trim().split(' ');
    const firstName = parts[0] ?? '';
    const lastName = parts.slice(1).join(' ') || l.company;
    const companyName = l.company;
    // Echapper les virgules et guillemets CSV
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    return `${esc(firstName)},${esc(lastName)},${esc(companyName)}`;
  });

  const csv = ['firstName,lastName,companyName', ...rows].join('
');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Cache-Control': 'no-store',
    },
  });
}
