import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { getLeads, createLead, getLeadByEmail } from '@/lib/db';
import type { LeadFilters, Temperature, LeadStatus, LinkedInStatus } from '@/types/lead';

export async function GET(req: NextRequest) {
  const authError = checkApiKey(req);
  if (authError) return authError;

  const { searchParams } = req.nextUrl;

  const filters: LeadFilters = {
    temperature: (searchParams.get('temperature') as Temperature) || undefined,
    status: (searchParams.get('status') as LeadStatus) || undefined,
    linkedin_status: (searchParams.get('linkedin_status') as LinkedInStatus) || undefined,
    search: searchParams.get('search') || undefined,
    sortBy: (searchParams.get('sortBy') as LeadFilters['sortBy']) || 'created_at',
    sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
    page: parseInt(searchParams.get('page') || '1', 10),
    pageSize: parseInt(searchParams.get('pageSize') || '20', 10),
  };

  const { data, total } = getLeads(filters);
  const page = filters.page!;
  const pageSize = filters.pageSize!;

  return NextResponse.json({
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}

export async function POST(req: NextRequest) {
  const authError = checkApiKey(req);
  if (authError) return authError;

  try {
    const body = await req.json();

    // Déduplication : skip silencieux si l'email existe déjà en base
    if (body.email) {
      const existing = getLeadByEmail(body.email);
      if (existing) {
        return NextResponse.json(
          { skipped: true, reason: 'duplicate_email', existing_id: existing.id },
          { status: 200 }
        );
      }
    }

    const lead = createLead(body);
    return NextResponse.json(lead, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
