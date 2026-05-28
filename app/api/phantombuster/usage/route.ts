/**
 * GET /api/phantombuster/usage
 * Retourne la consommation mensuelle PhantomBuster (heures exec / quota plan).
 * Pas d'auth requise (données non sensibles, publiques dans le dashboard).
 */

import { NextResponse } from 'next/server';
import { fetchPhantombusterUsage } from '@/lib/phantombuster';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const usage = await fetchPhantombusterUsage();
  return NextResponse.json(usage);
}
