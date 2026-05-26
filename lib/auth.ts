import { NextRequest, NextResponse } from 'next/server';

export function checkApiKey(req: NextRequest): NextResponse | null {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    // If API_KEY not set, allow all (dev mode)
    return null;
  }
  const provided = req.headers.get('x-api-key');
  if (!provided || provided !== apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
