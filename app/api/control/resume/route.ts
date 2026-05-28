export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { resumeControl } from '@/lib/db';

export async function POST(req: NextRequest) {
  const authError = await checkApiKey(req);
  if (authError) return authError;

  const control = resumeControl();
  return NextResponse.json(control);
}
