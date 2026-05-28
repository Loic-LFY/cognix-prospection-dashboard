export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { getStats } from '@/lib/db';

export async function GET(req: NextRequest) {
  const authError = checkApiKey(req);
  if (authError) return authError;

  const stats = getStats();
  return NextResponse.json(stats);
}
