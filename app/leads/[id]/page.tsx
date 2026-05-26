import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getLeadById, getDb } from '@/lib/db';
import TemperatureBadge from '@/components/TemperatureBadge';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm text-gray-900 dark:text-white font-medium">
        {value ?? <span className="text-gray-400 font-normal">—</span>}
      </span>
    </div>
  );
}

const statusLabels: Record<string, string> = {
  new: 'Nouveau',
  linkedin_pending: 'LinkedIn en attente',
  connection_sent: 'Connexion envoyée',
  connected: 'Connecté',
  message_sent: 'Message envoyé',
  chaud: '🔥 Chaud',
  rdv_planifie: '📅 RDV planifié',
  converti: '✅ Converti',
  perdu: '❌ Perdu',
  ban: '🚫 Ban',
};

function formatDateTime(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleString('fr-FR');
}

export default async function LeadDetailPage({ params }: Props) {
  const { id } = await params;
  const lead = getLeadById(id);
  if (!lead) notFound();

  // Fetch sequences
  const sequences = getDb()
    .prepare('SELECT * FROM sequences WHERE lead_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(id) as {
    id: string;
    step: number;
    type: string;
    direction: string;
    subject: string | null;
    body: string | null;
    sent_at: string | null;
    mode: string;
    created_at: string;
  }[];

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Link href="/" className="hover:text-blue-600 dark:hover:text-blue-400 transition">
          Dashboard
        </Link>
        <span>›</span>
        <span className="text-gray-900 dark:text-white font-medium">{lead.company}</span>
      </div>

      {/* Title bar */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{lead.company}</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <TemperatureBadge temperature={lead.temperature} />
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              {statusLabels[lead.status] ?? lead.status}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">Score : <strong className="text-gray-900 dark:text-white">{lead.score}/10</strong></span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {lead.linkedin_url && (
            <a
              href={lead.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg transition"
            >
              💼 Voir LinkedIn
            </a>
          )}
          <RecapButton leadId={lead.id} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Identité */}
        <Section title="🏢 Entreprise">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Société" value={lead.company} />
            <Field label="SIRET" value={lead.siret} />
            <Field label="Secteur" value={lead.sector} />
            <Field label="Taille" value={lead.size} />
            <Field label="Localisation" value={lead.location} />
            <Field label="Hébergeur actuel" value={lead.current_host} />
          </div>
          {lead.angle && (
            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-sm text-blue-800 dark:text-blue-200">
              💡 {lead.angle}
            </div>
          )}
        </Section>

        {/* Contact */}
        <Section title="👤 Contact">
          <div className="grid grid-cols-1 gap-3">
            <Field label="Nom" value={lead.contact_name} />
            <Field label="Titre" value={lead.contact_title} />
            <Field label="Email" value={lead.email ? <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">{lead.email}</a> : null} />
            <Field label="Téléphone" value={lead.phone} />
            <Field label="CRM vérifié" value={lead.crm_checked ? (lead.crm_exists ? '✅ Existe' : '❌ Absent') : '⏳ Non vérifié'} />
          </div>
        </Section>

        {/* LinkedIn */}
        <Section title="💼 LinkedIn">
          <div className="grid grid-cols-1 gap-3">
            <Field
              label="Profil"
              value={
                lead.linkedin_url ? (
                  <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline text-xs break-all">
                    {lead.linkedin_url}
                  </a>
                ) : null
              }
            />
            <Field label="Trouvé" value={lead.linkedin_found ? '✅ Oui' : '❌ Non'} />
            <Field label="Statut" value={lead.linkedin_status} />
            <Field label="Connexion envoyée" value={formatDateTime(lead.connection_sent_at)} />
            <Field label="Connexion acceptée" value={formatDateTime(lead.connection_accepted_at)} />
            <Field label="Message envoyé" value={formatDateTime(lead.linkedin_message_sent_at)} />
          </div>
        </Section>
      </div>

      {/* Timeline / Séquences */}
      {sequences.length > 0 && (
        <Section title="📜 Historique des séquences">
          <div className="space-y-3">
            {sequences.map((seq) => (
              <div key={seq.id} className="flex gap-3 text-sm">
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5" />
                  <div className="w-0.5 flex-1 bg-gray-200 dark:bg-gray-700 mt-1" />
                </div>
                <div className="flex-1 pb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 dark:text-white">
                      Étape {seq.step} — {seq.type}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${seq.mode === 'simulation' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'}`}>
                      {seq.mode}
                    </span>
                    {seq.sent_at && (
                      <span className="text-xs text-gray-400">
                        {formatDateTime(seq.sent_at)}
                      </span>
                    )}
                  </div>
                  {seq.subject && (
                    <p className="text-gray-600 dark:text-gray-400 text-xs mt-1">
                      Sujet : {seq.subject}
                    </p>
                  )}
                  {seq.body && (
                    <p className="text-gray-500 dark:text-gray-500 text-xs mt-1 line-clamp-2">
                      {seq.body}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Notes */}
      {lead.notes && (
        <Section title="📝 Notes">
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{lead.notes}</p>
        </Section>
      )}

      {/* Metadata */}
      <Section title="ℹ️ Métadonnées">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="ID" value={<span className="font-mono text-xs">{lead.id}</span>} />
          <Field label="Date réception" value={formatDateTime(lead.date_received)} />
          <Field label="Créé le" value={formatDateTime(lead.created_at)} />
          <Field label="Mis à jour" value={formatDateTime(lead.updated_at)} />
          <Field label="Étape séquence" value={lead.sequence_step} />
          <Field label="Dernière action" value={formatDateTime(lead.last_action_date)} />
          <Field label="Calendly envoyé" value={lead.calendly_sent ? '✅ Oui' : 'Non'} />
          <Field label="Récap généré" value={lead.recap_generated ? '✅ Oui' : 'Non'} />
        </div>
      </Section>
    </div>
  );
}

// Client component for recap generation
function RecapButton({ leadId }: { leadId: string }) {
  return (
    <form
      action={`/api/leads/${leadId}/recap`}
      method="post"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await fetch(`/api/leads/${leadId}/recap`, { method: 'POST' });
        if (res.ok) {
          const { recap } = await res.json();
          const win = window.open('', '_blank');
          if (win) {
            win.document.write(`<pre style="font-family:monospace;padding:20px;white-space:pre-wrap">${recap}</pre>`);
          }
        }
      }}
    >
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition"
      >
        📄 Générer récap
      </button>
    </form>
  );
}
