export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { getLeadById, updateLead, getDb } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await checkApiKey(req);
  if (authError) return authError;

  const { id } = await params;
  const lead = getLeadById(id);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Build a recap markdown
  const recap = `# Fiche Récap — ${lead.company}

**Score :** ${lead.score}/10  
**Température :** ${lead.temperature}  
**Statut :** ${lead.status}  
**Secteur :** ${lead.sector ?? 'N/A'}  
**Localisation :** ${lead.location ?? 'N/A'}  
**Taille :** ${lead.size ?? 'N/A'}  

## Contact
- **Nom :** ${lead.contact_name ?? 'N/A'}
- **Titre :** ${lead.contact_title ?? 'N/A'}
- **Email :** ${lead.email ?? 'N/A'}
- **Téléphone :** ${lead.phone ?? 'N/A'}

## Hébergement
- **Hébergeur actuel :** ${lead.current_host ?? 'N/A'}
- **Angle d'approche :** ${lead.angle ?? 'N/A'}

## LinkedIn
- **URL :** ${lead.linkedin_url ?? 'N/A'}
- **Statut :** ${lead.linkedin_status}
- **Connexion envoyée :** ${lead.connection_sent_at ?? 'Non'}
- **Connexion acceptée :** ${lead.connection_accepted_at ?? 'Non'}
- **Message envoyé :** ${lead.linkedin_message_sent_at ?? 'Non'}

## Notes
${lead.notes ?? 'Aucune note'}

---
*Généré le ${new Date().toLocaleString('fr-FR')}*
`;

  updateLead(id, { recap_generated: 1 });

  return NextResponse.json({ recap, lead });
}
