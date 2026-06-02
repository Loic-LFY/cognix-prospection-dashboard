import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const PB_BASE = 'https://api.phantombuster.com/api/v2';

export async function GET(req: NextRequest) {
  const authError = await checkApiKey(req);
  if (authError) return authError;

  const apiKey = process.env.PHANTOMBUSTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'PHANTOMBUSTER_API_KEY absente' }, { status: 500 });

  const ids = {
    search: process.env.PHANTOMBUSTER_AGENT_ID_SEARCH,
    connection: process.env.PHANTOMBUSTER_AGENT_ID_CONNECTION,
    message: process.env.PHANTOMBUSTER_AGENT_ID_MESSAGE,
  };

  const results: Record<string, unknown> = {};

  for (const [name, id] of Object.entries(ids)) {
    if (!id) { results[name] = { error: 'ID non configuré' }; continue; }
    const res = await fetch(`${PB_BASE}/agents/fetch?id=${id}`, {
      headers: { 'X-Phantombuster-Key': apiKey },
    });
    const data = await res.json();
    results[name] = { id, status: res.status, name: data.name, scriptId: data.scriptId, argument: data.argument };
  }

  return NextResponse.json(results);
}
