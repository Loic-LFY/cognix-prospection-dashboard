# Mode opératoire — Cognix Prospection Dashboard

> Hermes / OpenClaw — Version 3.0 — Mai 2026
> Périmètre : Cognix Systems — Prospection Hosting / Infogérance Cloud

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
  Score → Température
       ↓
  ┌─── VALIDATION MANUELLE ───┐
  │  ✅ Valider / 🗑️ Supprimer  │  ← aucune action sans ce passage
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
       Suivi engagement / ouverture email
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

Sur chaque fiche lead, un bloc "🛡️ Validation manuelle" propose :

| Bouton | Action | Effet |
|--------|--------|-------|
| ✅ Valider | `approve` | `qualification_status = approved` → éligible à l'outreach |
| ↩️ Annuler validation | `reject` | `qualification_status = rejected` |
| 🗑️ Supprimer | `delete` | Suppression définitive (hors cible, déjà client...) |

Route : `POST /api/leads/:id/qualify` avec `{ action: "approve" | "reject" | "delete" }`.

Tentative de mise en file d'attente sans `approved` → HTTP 403.

---

## 5. Qualification — Températures

### Température initiale (score à l'import)

| Score | Température | Comportement |
|-------|-------------|--------------|
| 8-10  | 🔥 `chaud`  | Séquence prioritaire |
| 6-7   | 🌡 `tiede`  | Séquence standard |
| 5     | ❄️ `froid`  | Attente |
| < 5   | Rejeté      | Non importé |

### Évolution selon LinkedIn

| Événement | Température | `linkedin_engagement` |
|-----------|-------------|----------------------|
| Connexion envoyée | `new` | `none` |
| Connexion acceptée | `tiede` | `connected` |
| Répond au 1er message | `tiede` | `replied` |
| 2e échange | `tiede` | `warm` |
| Calendly proposé | `tiede` | `rdv_proposed` |
| RDV confirmé | 🔥 `chaud` | `rdv_proposed` |

---

## 6. Prise de contact — Canal LinkedIn (PhantomBuster)

### Prérequis
- `qualification_status = approved`
- `PHANTOMBUSTER_API_KEY` dans `~/openclaw/.env`
- `PHANTOMBUSTER_AGENT_ID_CONNECTION` (phantom "LinkedIn Network Booster")
- `PHANTOMBUSTER_AGENT_ID_MESSAGE` (phantom "LinkedIn Message Sender")

### Contraintes horaires
- **Envois uniquement entre 09h00 et 20h00 heure de Paris**
- Hors plage → action mise en attente jusqu'au lendemain 09h00
- `/api/outreach/process` retourne `next_window` si hors plage

### Flux
1. Lead validé → bouton "🚀 Mettre en file d'attente" (canal LinkedIn sélectionné)
2. `POST /api/outreach` → `outreach_queued_at` renseigné
3. `POST /api/outreach/process` (cron ou manuel) :
   - Si `linkedin_connected = 0` → lance phantom "Network Booster" (demande de connexion)
   - Si `linkedin_connected = 1` → lance phantom "Message Sender" (message)
   - 1 action LinkedIn par appel (espacement naturel)

### Limites anti-ban
- Max 15 connexions/jour
- Max 10 messages/jour
- Espacer les appels à `/api/outreach/process` d'au moins 3 minutes

---

## 7. Prise de contact — Canal Email (Resend)

### Prérequis
- `qualification_status = approved`
- `RESEND_API_KEY` dans `~/openclaw/.env`
- Expéditeur : `loic.fretay@cognix-systems.com`

### Activation
Dans la fiche lead, toggle "📧 Email" (affiché en grisé si `RESEND_API_KEY` absente).

Un avertissement s'affiche si la clé est manquante.

### Tracking d'ouverture
**Désactivé intentionnellement** tant que l'entrée DNS entreprise n'est pas configurée.

Pour activer :
1. Créer le domaine `cognix-systems.com` dans le dashboard Resend
2. Ajouter l'entrée DNS SPF/DKIM fournie par Resend
3. Ajouter `RESEND_TRACKING_ENABLED=true` dans `~/openclaw/.env`

Le code est en place (feature flag), aucun changement de code nécessaire.

### Webhook ouverture
`POST /api/webhooks/resend` reçoit les événements `email.opened` de Resend.

Configuration Resend (une fois DNS prêt) :
1. Resend Dashboard → Webhooks → Add endpoint
2. URL : `https://cognix.7solutionsweb.com/api/webhooks/resend`
3. Événements : `email.opened`
4. Copier le secret dans `RESEND_WEBHOOK_SECRET`

Le champ `email_opened` (0/1) et `email_opened_at` sont mis à jour automatiquement.

---

## 8. Indicateur quota PhantomBuster

Le dashboard affiche en haut de page une barre de progression de la consommation mensuelle.

| Seuil | Affichage |
|-------|-----------|
| 0-59% | Barre bleue |
| 60-79% | Barre jaune |
| ≥ 80% | Barre orange + badge pulsant "⚠️ X% consommé" |
| ≥ 100% | Fond rouge + badge "🚫 Quota dépassé" |

**Forfait Start : 20h/mois** (72 000 s). Fallback si l'API ne retourne pas la limite du plan.

Source : `GET /api/v2/orgs/fetch-resources` — champ `monthlyExecutionTime`.
Route interne : `GET /api/phantombuster/usage`.

---

## 9. Séquence LinkedIn complète

### LK-0 - Recherche profil
Via SearXNG. Si trouvé : `linkedin_found = 1`, `linkedin_url` renseigné.

### LK-1 - Demande de connexion (PhantomBuster)
Déclenchée après validation + mise en file d'attente (canal LinkedIn).

*Profil digital/web/marketing :*
> Bonjour [Prénom], je développe un réseau d'experts du digital et recherche des partenaires en développement web afin de créer des synergies d'affaires. Seriez-vous ouvert à une mise en relation ?

*Profil non-digital :*
> Bonjour [Prénom], je travaille avec des dirigeants sur des projets d'infrastructure numérique et de performance web. Je serais ravi d'élargir mon réseau dans votre secteur.

### LK-2 - Connexion acceptée → 1er message
Déclenché dans les 30 min-2h. Température → `tiede`.

### LK-3/4 - Conversation (2-3 échanges)
- Réponse positive : `linkedin_engagement = replied` puis `warm`
- Réponse négative : `froid` + ban list

### LK-5 - Proposition Calendly
> Parfait ! Je vous envoie mon lien : https://calendly.com/loic-fretay-cognix-systems/45min — 45 min, sans engagement.

### LK-6 - RDV confirmé → Lead chaud
- `temperature = chaud`
- Fiche récap générée (`POST /api/leads/:id/recap`)
- Alerte WhatsApp Loïc

---

## 10. Séquence email à froid (canal Email / Resend)

Expéditeur : `loic.fretay@cognix-systems.com`

### J0 - Premier contact
- Objet : `Hébergement & infogérance pour [NOM_SOCIÉTÉ]`
- Personnalisé avec l'angle et l'hébergeur actuel détectés
- Aucun lien de tracking tant que DNS non configuré

### J+3 - Relance (si pas de réponse)
### J+7 - Dernière tentative
Sans réponse : `email_outreach_status = not_sent` + ban list 90 jours

---

## 11. Ban list et file d'attente

- **Ban list** : `rejected` ou non-réponse → 90 jours, puis proposition de relance à Loïc
- **File d'attente** : `outreach_queued_at` renseigné, `outreach_sent_at` null → en attente de traitement

---

## 12. Architecture technique

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
| POST | `/api/outreach/process` | Oui | Traitement file (LinkedIn + Email) |
| POST | `/api/webhooks/resend` | HMAC | Événements ouverture email |

### Schéma SQLite — table `leads` (colonnes clés)

| Colonne | Type | Défaut | Description |
|---------|------|--------|-------------|
| `qualification_status` | TEXT | `pending_review` | `pending_review` / `approved` / `rejected` |
| `outreach_channel` | TEXT | `linkedin` | `linkedin` / `email` |
| `outreach_queued_at` | TEXT | NULL | Date mise en file |
| `outreach_sent_at` | TEXT | NULL | Date envoi effectif |
| `email_outreach_status` | TEXT | `pending` | `pending` / `sent` / `opened` / `not_sent` |
| `email_opened` | INTEGER | 0 | 1 si email ouvert (webhook Resend) |
| `email_opened_at` | TEXT | NULL | Date ouverture |
| `linkedin_conv_step` | INTEGER | 0 | Étape conversation LinkedIn (0-4) |
| `linkedin_engagement` | TEXT | `none` | `none` / `connected` / `replied` / `warm` / `rdv_proposed` |
| `linkedin_last_reply_at` | TEXT | NULL | Dernière réponse LinkedIn |
| `linkedin_rdv_proposed` | INTEGER | 0 | 0/1 |

---

## 13. Variables d'environnement

### Sur le VPS (`docker-compose.yml` → `.env.local`)
```
DATABASE_URL=/data/leads.db
API_KEY=***
```

### Côté Hermes (`~/openclaw/.env`)
```
# Dashboard
DASHBOARD_API_URL=https://cognix.7solutionsweb.com
DASHBOARD_API_KEY=***

# LinkedIn outreach (PhantomBuster)
PHANTOMBUSTER_API_KEY=***
PHANTOMBUSTER_AGENT_ID_CONNECTION=***   # phantom "LinkedIn Network Booster"
PHANTOMBUSTER_AGENT_ID_MESSAGE=***      # phantom "LinkedIn Message Sender"

# Canal email (Resend) — optionnel
RESEND_API_KEY=                         # laisser vide pour désactiver
RESEND_WEBHOOK_SECRET=                  # secret HMAC webhook
RESEND_TRACKING_ENABLED=false           # true seulement après config DNS

# Divers
CRM_URL=
CALENDLY_URL=https://calendly.com/loic-fretay-cognix-systems/45min
```

> Mode SIMULATION actif tant que `PHANTOMBUSTER_API_KEY` est absent. Aucun envoi LinkedIn réel.

---

## 14. Limites de sécurité prospection

- Max **15 connexions LinkedIn/jour**
- Max **10 messages LinkedIn/jour**
- Envois LinkedIn **uniquement 09h-20h Paris**
- Espacement minimum **3 min** entre deux appels `/api/outreach/process`
- **1 seul contact/jour** par prospect (tout canal confondu)
- **3 bounces email en 24h** → arrêt + alerte
- Restriction LinkedIn détectée → arrêt immédiat + alerte Loïc
- Lead ban list → aucun contact automatique sans re-validation manuelle

---

## 15. Commandes WhatsApp Hermes

| Commande | Action |
|----------|--------|
| `hermes cognix run` | Cycle complet immédiat |
| `hermes cognix stop` | Pause moteur |
| `hermes cognix resume` | Reprise |
| `hermes cognix build dashboard` | Génère/pousse le repo GitHub |

---

## 16. Notifications automatiques

### Récap quotidien (18h00 Paris)
```
Cognix Prospection — Bilan du JJ/MM

Nouveaux leads : X
Validés manuellement : X
Connexions LinkedIn envoyées : X
Connexions acceptées : X
Messages envoyés : X
Emails envoyés : X / ouverts : X
En conversation : X
Leads chauds : X / Ban list : X
Quota PhantomBuster : Xh / 20h (X%)
```

### Alertes immédiates
- Connexion LinkedIn acceptée (lead score >= 8)
- Lead passé en chaud (RDV confirmé)
- Quota PhantomBuster >= 80%
- Erreur critique (bounces, restriction LinkedIn, base inaccessible)
- RESEND_API_KEY absente si canal email sélectionné

---

*Repo GitHub : [Loic-LFY/cognix-prospection-dashboard](https://github.com/Loic-LFY/cognix-prospection-dashboard)*
*Dashboard : https://cognix.7solutionsweb.com*
*Version : 3.0 — Mai 2026*
