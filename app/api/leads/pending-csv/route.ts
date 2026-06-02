import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/leads/pending-csv?token=***
 * Retourne un CSV des leads approuvés sans URL LinkedIn ET avec un contact identifié.
 * Colonnes : firstName, lastName, companyName
 * Utilisé comme spreadsheetUrl pour le Phantom "Profile URL Finder".
 *
 * Leads sans contact_name sont exclus (pas de prénom/nom = impossible à chercher sur LinkedIn).
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
       AND contact_name IS NOT NULL
       AND contact_name != ''
     ORDER BY created_at ASC
     LIMIT 50`
  ).all() as { contact_name: string; company: string }[];

  const esc = (s: string) => '"' + s.replace(/"/g, '""') + '"';

  const rows: string[] = [];
  for (const l of leads) {
    const parts = l.contact_name.trim().split(/\s+/);
    const firstName = parts[0] ?? '';
    const lastName = parts.slice(1).join(' ');
    // Skip si pas de prénom ET pas de nom (contact_name = 1 seul mot)
    if (!firstName || !lastName) continue;
    rows.push([esc(firstName), esc(lastName), esc(l.company)].join(','));
  }

  const csv = ['firstName,lastName,companyName', ...rows].join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Cache-Control': 'no-store',
    },
  });
}
