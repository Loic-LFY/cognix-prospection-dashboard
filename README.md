# Cognix Prospection Dashboard

Dashboard Next.js 14 de suivi des leads et de la prospection LinkedIn pour **Cognix Systems**.

## Fonctionnalités

- **Header dynamique** : badge mode (🧪 SIMULATION / 🌍 RÉEL), badge statut (ACTIF / EN PAUSE), boutons STOP/RESUME
- **6 KPIs** : Total leads, LinkedIn trouvés, Actions du jour, Connexions acceptées, Leads chauds, Ban list
- **Entonnoir de conversion** : new → linkedin_pending → connection_sent → connected → message_sent → chaud
- **Graphique 7 jours** : leads par jour (recharts)
- **Table filtrée** : température, statut, LinkedIn status, recherche texte, tri score/date
- **Fiche détail** : toutes les informations lead + historique des séquences
- **API REST** : CRUD leads, stats, contrôle pause/resume

## Stack

- Next.js 14 App Router + TypeScript
- Tailwind CSS (dark mode par défaut)
- SQLite via `better-sqlite3`
- Recharts pour les graphiques

## Installation

```bash
npm install
cp .env.local.example .env.local
# Éditer .env.local avec votre DATABASE_URL et API_KEY
npm run dev
```

## Variables d'environnement

| Variable | Description | Défaut |
|---|---|---|
| `DATABASE_URL` | Chemin vers la base SQLite | `/home/node/.openclaw/workspace/state/cognix/leads.db` |
| `API_KEY` | Clé API pour `x-api-key` header | _(vide = pas d'auth)_ |
| `PORT` | Port d'écoute | `3000` |

## API Routes

### Leads
- `GET /api/leads` — Liste paginée avec filtres (`temperature`, `status`, `linkedin_status`, `search`, `sortBy`, `sortOrder`, `page`, `pageSize`)
- `POST /api/leads` — Créer un lead
- `GET /api/leads/:id` — Détail d'un lead
- `PATCH /api/leads/:id` — Mettre à jour un lead
- `POST /api/leads/:id/recap` — Générer une fiche récapitulative

### Stats
- `GET /api/stats` — Métriques globales + entonnoir + données 7j

### Contrôle
- `GET /api/control/status` — Statut actuel (mode + pause + durée)
- `POST /api/control/stop` — Mettre en pause (`body: { reason?: string }`)
- `POST /api/control/resume` — Reprendre

## Docker

```bash
# Build et démarrage
docker-compose up -d

# Avec un chemin DB custom
DB_HOST_PATH=/path/to/your/db docker-compose up -d
```

## Auth API

Ajouter le header `x-api-key: <votre-clé>` sur toutes les requêtes API si `API_KEY` est défini.

## Schéma SQLite

Le dashboard utilise la base existante avec les tables :
- `leads` — prospects
- `sequences` — historique des actions par lead
- `ban_list` — liste noire
- `control` — état du moteur de prospection
