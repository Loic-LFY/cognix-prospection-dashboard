import type { Lead } from '@/types/lead';

interface Props {
  lead: Lead;
}

export default function EmailStatus({ lead }: Props) {
  const { email_outreach_status, email_opened, email_opened_at, outreach_sent_at, outreach_channel } = lead;

  if (outreach_channel !== 'email') return null;
  if (outreach_channel === 'email' && !outreach_sent_at) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
        Email non encore envoyé
      </div>
    );
  }

  if (email_opened) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span>
          Email ouvert ✅
          {email_opened_at && (
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
              le {new Date(email_opened_at).toLocaleString('fr-FR')}
            </span>
          )}
        </span>
      </div>
    );
  }

  // Envoyé mais pas encore ouvert
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
        <span className="w-2 h-2 rounded-full bg-amber-400" />
        Email envoyé — ouverture en attente
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        ⚠️ Le tracking d'ouverture sera actif une fois l'entrée DNS cognix-systems.com configurée
        et la variable <code className="font-mono">RESEND_TRACKING_ENABLED=true</code> activée.
      </p>
    </div>
  );
}
