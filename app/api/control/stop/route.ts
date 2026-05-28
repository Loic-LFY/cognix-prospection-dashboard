export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { pauseControl } from '@/lib/db';

export async function POST(req: NextRequest) {
  const authError = await checkApiKey(req);
  if (authError) return authError;

  let reason: string | undefined;
  try {
    const body = await req.json();
    reason = body?.reason;
  } catch {
    // body is optional
  }

  const control = pauseControl(reason);
  return NextResponse.json(control);
}
