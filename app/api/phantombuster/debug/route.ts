import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const PB_BASE = 'https://api.phantombuster.com/api/v2';

export async function GET(req: NextRequest) {
  const authError = await checkApiKey(req);
  if (authError) return authError;

  const apiKey = process.env.PHANTOMBUSTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'PHANTOMBUSTER_API_KEY absente' }, { status: 500 });

  const agentId = process.env.PHANTOMBUSTER_AGENT_ID_SEARCH;
  if (!agentId) return NextResponse.json({ error: 'PHANTOMBUSTER_AGENT_ID_SEARCH absent' }, { status: 500 });

  // Dernière sortie console du Phantom
  const outputRes = await fetch(`${PB_BASE}/agents/fetch-output?id=${agentId}`, {
    headers: { 'X-Phantombuster-Key': apiKey },
  });
  const output = await outputRes.json();

  // Config actuelle
  const agentRes = await fetch(`${PB_BASE}/agents/fetch?id=${agentId}`, {
    headers: { 'X-Phantombuster-Key': apiKey },
  });
  const agent = await agentRes.json();

  // Test accès CSV depuis le serveur lui-même
  const csvToken = process.env.CSV_EXPORT_TOKEN ?? process.env.API_KEY ?? '';
  const dashUrl = process.env.DASHBOARD_API_URL ?? '';
  const csvUrl = `${dashUrl}/api/leads/pending-csv?token=${csvToken}`;
  const csvRes = await fetch(csvUrl);
  const csvBody = await csvRes.text();

  return NextResponse.json({
    agent_name: agent.name,
    last_argument: agent.argument,
    csv_url: csvUrl.replace(csvToken, '***'),
    csv_status: csvRes.status,
    csv_preview: csvBody.slice(0, 500),
    last_output: output,
  });
}
