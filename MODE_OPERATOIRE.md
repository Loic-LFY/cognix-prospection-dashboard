# Mode opératoire — Cognix Prospection Dashboard

> Hermes / OpenClaw — Version 5.0 — Juin 2026
> Périmètre : Cognix Systems — Prospection Hosting / Infogérance Cloud
> **Source de vérité : le code. Ce fichier est synchronisé avec le code source.**

---

## 1. Vue d'ensemble

L'application automatise la prospection B2B de Cognix Systems via deux canaux : **LinkedIn** (PhantomBuster) et **Email** (Resend). Toute prise de contact nécessite une **validation manuelle préalable**.

```
Email entrant (AI_Cognix)
       ↓
  Parse 7 fiches
       ↓
 Déduplication par email   ← skip silencieux si déjà en base
       ↓
  Température : toujours 'new' à la création
       ↓
  ┌─── VALIDATION MANUELLE ───┐
  │  Valider / Supprimer      │  ← aucune action sans ce passage
  └───────────┬───────────────┘
              ↓
       File d'attente (outreach_queued)
              ↓
  ┌────────────────────────────────┐
  │  Canal LINKEDIN   Canal EMAIL  │
  │  (PhantomBuster)  (Resend)     │
  │  09h-20h Paris    pas d'heure  │
  └────────────────────────────────┘
              ↓
       Classification manuelle (chaud/froid/rdv)
              ↓
         Lead chaud → Fiche récap
```

---

## 2. Sources d'entrée

- **Boîte email** : `contact@7solutionsweb.com`, dossier IMAP `AI_Cognix`
- **Expéditeur attendu** : `agent01@cognix-systems.com`
- **Sujet type** : `Prospection hosting — 7 fiches qualifiées — JJ mois AAAA`
- **Fréquence** : 1 email par run, 7 fiches par email

Chaque fiche contient : nom société, SIRET, score /10, localisation, secteur, effectif, dirigeant (nom + titre), téléphone, email, hébergeur actuel, angle d'attaque.

---

## 3. Déduplication des leads

Avant tout INSERT, le dashboard vérifie si un lead avec le même email existe déjà en base SQLite.

- **Lead existant** → réponse `{ skipped: true, reason: "duplicate_email" }` — pas d'écrasement
- **Nouveau lead** → insertion normale avec `qualification_status = pending_review`

La déduplication s'appuie sur la base SQLite, **pas** sur la boîte email (qui peut être purgée).

---

## 4. Validation manuelle — Règle fondamentale

**Aucune prise de contact ne se déclenche automatiquement sans validation manuelle.**

Sur chaque fiche lead, un bloc "Validation manuelle" propose :

| Bouton | Action | Effet |
|--------|--------|-------|
| Valider | `approve` | `qualification_status = approved` → éligible à l'outreach |
| Annuler validation | `reject` | `qualification_status = rejected` |
| Supprimer | `delete` | Suppression définitive (hors cible, déjà client...) |

Route : `POST /api/leads/:id/qualify` avec `{ action: "approve" | "reject" | "delete" }`.

Tentative de mise en file d'attente sans `approved` → HTTP 403.

---

## 5. Températures et classification

### À la création
**La température est toujours `new` à la création**, quel que soit le score.

### Évolution automatique via le pipeline

| Événement | Statut | Température | Auto ? |
|-----------|--------|-------------|--------|
| Lead créé | `new` | `new` | Auto |
| Connexion envoyée | `connection_sent` | `new` | Auto |
| Connexion acceptée (bouton dashboard) | `connected` | `new` | Manuel |
| Message post-connexion envoyé | `message_sent` | `tiede` | **Auto** |
| Connexion non acceptée après 7j | `ban` | `froid` | **Auto** |

### Classification manuelle (boutons dashboard)

Visibles sur les leads avec `temperature = tiede` ou `status = message_sent` :

| Bouton | Température | Statut |
|--------|-------------|--------|
| Chaud | `chaud` | `chaud` |
| Froid | `froid` | inchangé |
| RDV proposé | `chaud` | `rdv_planifie` |

> Les réponses LinkedIn ne sont pas lues automatiquement (limitation PB/LinkedIn).
> Workflow : Loïc transmet la réponse du prospect à Hermes → Hermes génère la suite → Loïc valide et envoie.

---

## 6. Prise de contact — Canal LinkedIn (PhantomBuster)

### Prérequis
- `qualification_status = approved`
- `PHANTOMBUSTER_API_KEY` (si absent → mode SIMULATION, aucun envoi réel)
- `PHANTOMBUSTER_AGENT_ID_SEARCH` (phantom "Cognix - Profile URL Finder", scriptId 4015)
- `PHANTOMBUSTER_AGENT_ID_CONNECTION` (phantom "Cognix - Auto Connect", scriptId 2818)
- `PHANTOMBUSTER_AGENT_ID_MESSAGE` (phantom "Cognix - Message Sender", scriptId 9227)

### Contraintes horaires
- **Envois uniquement entre 09h00 et 20h00 heure de Paris**
- Hors plage → `/api/outreach/process` retourne `next_window` (lendemain 09h00)

### Flux complet (implémenté dans `app/api/outreach/process/route.ts`)

**Tour A — Recherche URL LinkedIn**
- Lance phantom SEARCH avec `nom + société + lead_id` (CSV ciblé par lead, `csvName` unique obligatoire)
- URL trouvée → `linkedin_url`, `linkedin_found = 1`, `linkedin_status = found`
- Non trouvée → `linkedin_status = not_found`, sort de la file

**Tour B — Demande de connexion**
- Condition : `linkedin_url` présente + `linkedin_connected = 0`
- Lance phantom CONNECTION
- Résultat : `status = connection_sent`, `connection_sent_at = now`

**Tour C — Message post-connexion**
- Déclencheur : bouton "Connexion acceptée" dans le dashboard (manuel)
  → `linkedin_connected = 1`, `status = connected`, re-queue automatique
- Condition envoi : `linkedin_connected = 1` ET `temperature = 'new'`
- Lance phantom MESSAGE avec le template ci-dessous
- Résultat : `status = message_sent`, `temperature = tiede`

**Ban automatique**
- À chaque appel `/api/outreach/process` : les leads avec `connection_sent_at > 7 jours` et `linkedin_connected = 0` passent automatiquement en `status = ban` + `temperature = froid`

### Template message post-connexion

```
Bonjour #firstName#,

Merci pour la demande de connexion.

L'idée est de créer des partenariats entre professionnels du digital afin de pouvoir se recommander mutuellement selon les besoins clients.

De notre côté, chez Cognix Systems, nous accompagnons principalement les entreprises sur :

- l'hébergement web et cloud,
- l'infogérance serveurs,
- la sécurisation et la supervision d'infrastructures,
- ainsi que le support technique avancé.

L'objectif n'est pas de concurrencer les agences ou développeurs web, mais au contraire de leur apporter un partenaire technique fiable lorsqu'un client a des besoins d'hébergement, de performance, de migration ou de maintenance.

Et inversement, nous pouvons également orienter certains besoins en développement vers des partenaires de confiance.

Je pense qu'un échange rapide pourrait être intéressant pour voir s'il existe des synergies possibles entre nos activités.

Belle journée à vous également,
```

> `#firstName#` est remplacé automatiquement par PhantomBuster avec le prénom du profil LinkedIn ciblé.

### Note de demande de connexion (personnalisée par secteur)

```
Bonjour #firstName#, Je développe un réseau d'experts du digital et recherche des partenaires
en [secteur] afin de créer des synergies d'affaires. Seriez-vous ouvert à une mise en relation ?
```

### Limites anti-ban
- Max 15 connexions/jour
- Max 10 messages/jour
- Espacer les appels à `/api/outreach/process` d'au moins 3 minutes (cron 45 min)

---

## 7. Prise de contact — Canal Email (Resend)

### Prérequis
- `qualification_status = approved`
- `RESEND_API_KEY` (si absent → canal email désactivé silencieusement)
- Expéditeur : `loic.fretay@cognix-systems.com`

### Flux
- `POST /api/outreach/process` traite jusqu'à **3 leads email par appel**
- Skip silencieux si `RESEND_API_KEY` absente

### Tracking d'ouverture
Désactivé tant que DNS `cognix-systems.com` non configuré dans Resend.

---

## 8. Indicateur quota PhantomBuster

Barre de progression en haut du dashboard. Forfait Start : 20h/mois (72 000 s).

| Seuil | Affichage |
|-------|-----------|
| 0-59% | Barre bleue |
| 60-79% | Barre jaune |
| >= 80% | Barre orange + badge pulsant |
| >= 100% | Fond rouge + badge bloquant |

---

## 9. Architecture technique

### Stack
- **Frontend / API** : Next.js 14 App Router, TypeScript, Tailwind CSS
- **Base de données** : SQLite via `better-sqlite3`
- **Outreach LinkedIn** : PhantomBuster API v2
- **Outreach Email** : Resend API
- **Auth API** : header `x-api-key` (token statique)
- **Déploiement** : Docker Compose sur VPS

### Routes API complètes

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/api/control/status` | Non | Statut moteur |
| POST | `/api/control/stop` | Oui | Mettre en pause |
| POST | `/api/control/resume` | Oui | Reprendre |
| GET | `/api/leads` | Oui | Liste paginée avec filtres |
| POST | `/api/leads` | Oui | Créer lead (déduplication email) |
| GET | `/api/leads/:id` | Oui | Détail lead |
| PATCH | `/api/leads/:id` | Oui | Mise à jour partielle |
| DELETE | `/api/leads/:id` | Oui | Suppression |
| POST | `/api/leads/:id/qualify` | Oui | Validation manuelle |
| POST | `/api/leads/:id/recap` | Oui | Fiche récap |
| GET | `/api/stats` | Oui | Métriques globales |
| GET | `/api/phantombuster/usage` | Non | Quota PhantomBuster |
| POST | `/api/outreach` | Oui | Mise en file d'attente |
| POST | `/api/outreach/process` | Oui | Traitement file (LinkedIn + Email + ban auto) |
| POST | `/api/webhooks/resend` | HMAC | Événements ouverture email |

### Schéma SQLite — Statuts possibles

**`status`** : `new` / `connection_sent` / `connected` / `message_sent` / `chaud` / `rdv_planifie` / `converti` / `perdu` / `ban`

**`temperature`** : `new` / `froid` / `tiede` / `chaud`

**`linkedin_status`** : `pending` / `not_found` / `found` / `connection_sent` / `connected` / `message_sent` / `replied`

---

## 10. Variables d'environnement

Toutes les variables (sauf `DATABASE_URL`) sont injectées via `docker-compose.yml` côté VPS.

```
DATABASE_URL=/data/leads.db           # dans .env.local uniquement
DASHBOARD_PASSWORD=***
API_KEY=***                           # = COGNIX_API_KEY côté Hermes
PHANTOMBUSTER_API_KEY=
PHANTOMBUSTER_AGENT_ID_SEARCH=        # scriptId 4015
PHANTOMBUSTER_AGENT_ID_CONNECTION=    # scriptId 2818
PHANTOMBUSTER_AGENT_ID_MESSAGE=       # scriptId 9227
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
RESEND_TRACKING_ENABLED=false
CALENDLY_URL=https://calendly.com/loic-fretay-cognix-systems/45min
APP_URL=https://cognix.7solutionsweb.com   # obligatoire pour URLs CSV PhantomBuster
```

> Mode SIMULATION actif tant que `PHANTOMBUSTER_API_KEY` est absent.

---

## 11. Crons Hermes actifs

| Nom | ID | Schedule | Livraison |
|-----|----|----------|-----------|
| Import email 8h | `5da7cb0a` | 08:00 Paris quotidien | WA si nouveaux leads |
| Import email 12h | `df36c634` | 12:00 Paris quotidien | WA si nouveaux leads |
| Outreach silencieux | `9d43393e` | every 45 min | none |
| Point Cognix 13h | `650f9cce` | 13:00 Paris quotidien | WA |
| Bilan Cognix 17h30 | `5acc942a` | 17:30 Paris quotidien | WA |
| Crypto rapport midi | `b5429e8b` | 12:00 Paris quotidien | WA |
| Remise queue cooldown | `9d6ec879` | one-shot 23/06/2026 | none (deleteAfterRun) |

---

## 12. Limites de sécurité prospection

- Max **15 connexions LinkedIn/jour**
- Max **10 messages LinkedIn/jour**
- Envois LinkedIn **uniquement 09h-20h Paris**
- Espacement minimum **45 min** entre deux appels `/api/outreach/process` (cron)
- **1 seul contact/jour** par prospect (tout canal confondu)
- Connexion non acceptée après 7j → ban automatique
- **3 bounces email en 24h** → arrêt + alerte

---

## 13. Commandes WhatsApp Hermes

| Commande | Action |
|----------|--------|
| `hermes cognix run` | Cycle complet immédiat |
| `hermes cognix stop` | Pause moteur |
| `hermes cognix resume` | Reprise |
| `hermes cognix build dashboard` | Génère/pousse le repo GitHub |

---

*Repo GitHub : [Loic-LFY/cognix-prospection-dashboard](https://github.com/Loic-LFY/cognix-prospection-dashboard)*
*Dashboard : https://cognix.7solutionsweb.com*
*Version : 5.0 — Juin 2026*
