# Cognix Prospection Dashboard

Dashboard Next.js 14 de suivi des leads et de la prospection LinkedIn/Email pour **Cognix Systems**.

## Fonctionnalités

- **Header dynamique** : badge mode (🧪 SIMULATION / 🌍 RÉEL), statut (ACTIF / EN PAUSE), boutons STOP/RESUME
- **6 KPIs** : Total leads, LinkedIn trouvés, Actions du jour, Connexions acceptées, Leads chauds, Ban list
- **Quota PhantomBuster** : barre de progression heures/20h mensuel, alerte à 80%
- **Entonnoir de conversion** : new → connection_sent → connected → message_sent → chaud
- **Graphique 7 jours** : leads par jour (recharts)
- **Table filtrée** : température, statut, LinkedIn status, recherche texte, tri score/date
- **Fiche détail lead** :
  - Validation manuelle (✅ Valider / 🗑️ Supprimer)
  - Prise de contact (toggle canal LinkedIn / Email, mise en file d'attente)
  - Indicateur ouverture email (webhook Resend)
  - Historique des séquences
- **API REST** : CRUD leads avec déduplication, validation, outreach, stats, contrôle

## Stack

- Next.js 14 App Router + TypeScript
- Tailwind CSS (dark mode)
- SQLite via `better-sqlite3`
- Recharts pour les graphiques

## Installation

```bash
npm install
cp .env.example .env.local
# Éditer .env.local
npm run dev
```

## Variables d'environnement

| Variable | Obligatoire | Description |
|---|---|---|
| `DATABASE_URL` | Non | Chemin SQLite (défaut : `/home/node/.openclaw/workspace/state/cognix/leads.db`) |
| `API_KEY` | Non | Clé header `x-api-key` (désactivé si vide) |
| `PHANTOMBUSTER_API_KEY` | Non | Clé PhantomBuster (sans elle : mode simulation) |
| `PHANTOMBUSTER_AGENT_ID_CONNECTION` | Non | ID phantom "LinkedIn Network Booster" |
| `PHANTOMBUSTER_AGENT_ID_MESSAGE` | Non | ID phantom "LinkedIn Message Sender" |
| `RESEND_API_KEY` | Non | Clé Resend pour le canal email (affiché si absent) |
| `RESEND_WEBHOOK_SECRET` | Non | Secret HMAC pour vérifier les webhooks Resend |
| `RESEND_TRACKING_ENABLED` | Non | `true` pour activer le pixel de tracking (DNS requis) |

## API Routes

### Leads
| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/api/leads` | Oui | Liste paginée avec filtres |
| POST | `/api/leads` | Oui | Créer un lead (skip silencieux si email en double) |
| GET | `/api/leads/:id` | Oui | Détail d'un lead |
| PATCH | `/api/leads/:id` | Oui | Mettre à jour un lead |
| DELETE | `/api/leads/:id` | Oui | Supprimer un lead |
| POST | `/api/leads/:id/qualify` | Oui | Valider / rejeter / supprimer (`action: approve\|reject\|delete`) |
| POST | `/api/leads/:id/recap` | Oui | Générer une fiche récap |

### Outreach
| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| POST | `/api/outreach` | Oui | Mettre un lead approuvé en file d'attente (`leadId`, `channel: linkedin\|email`) |
| POST | `/api/outreach/process` | Oui | Traiter la file (1 LinkedIn, max 3 emails). Respecte la plage 09h-20h Paris pour LinkedIn |

### Stats & Contrôle
| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/api/stats` | Oui | Métriques globales + entonnoir + 7j |
| GET | `/api/control/status` | Non | Statut moteur |
| POST | `/api/control/stop` | Oui | Mettre en pause |
| POST | `/api/control/resume` | Oui | Reprendre |

### PhantomBuster
| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/api/phantombuster/usage` | Non | Conso mensuelle (heures exec / quota plan) |

### Webhooks
| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| POST | `/api/webhooks/resend` | HMAC | Événements Resend (email.opened) — actif après config DNS |

## Workflow de prospection

```
Import email → Déduplication → Validation manuelle → File d'attente → Envoi (LinkedIn ou Email)
                (par email)    (✅ Valider requis)    (outreach_queued)   (09h-20h Paris / Resend)
```

**Règle fondamentale :** aucune prise de contact ne se déclenche sans `qualification_status = approved`.

## Docker

```bash
# Build et démarrage
docker-compose up -d

# Avec un chemin DB custom
DB_HOST_PATH=/path/to/your/db docker-compose up -d
```

## Schéma SQLite — colonnes principales `leads`

| Colonne | Type | Description |
|---------|------|-------------|
| `qualification_status` | TEXT | `pending_review` / `approved` / `rejected` |
| `outreach_channel` | TEXT | `linkedin` / `email` |
| `outreach_queued_at` | TEXT | Date mise en file d'attente |
| `outreach_sent_at` | TEXT | Date d'envoi effectif |
| `email_outreach_status` | TEXT | `pending` / `sent` / `opened` / `not_sent` |
| `email_opened` | INTEGER | 0/1 (via webhook Resend) |
| `email_opened_at` | TEXT | Date ouverture email |
| `linkedin_conv_step` | INTEGER | Étape conversation (0-4) |
| `linkedin_engagement` | TEXT | `none` / `connected` / `replied` / `warm` / `rdv_proposed` |

---

*Repo : [Loic-LFY/cognix-prospection-dashboard](https://github.com/Loic-LFY/cognix-prospection-dashboard)*
*Dashboard : https://cognix.7solutionsweb.com*
