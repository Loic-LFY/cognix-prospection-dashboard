# Mode opératoire — Cognix Prospection Dashboard

> Hermes / OpenClaw — Version 2.0 — Mai 2026
> Périmètre : Cognix Systems — Prospection Hosting / Infogérance Cloud

---

## 1. Vue d'ensemble

L'application automatise la prospection B2B de Cognix Systems de bout en bout via deux canaux parallèles : **email à froid** et **LinkedIn**.

```
Email entrant (AI_Cognix)
       ↓
  Parse 7 fiches
       ↓
 Score → Température initiale
       ↓
  ┌─────────────────┬─────────────────┐
  │   Canal EMAIL   │  Canal LINKEDIN │
  │  (score >= 6)   │  (profil trouvé)│
  └────────┬────────┴────────┬────────┘
           │                 │
    Séquence J0/J+3/J+7   LK-0 → LK-6
           │                 │
      Réponse ?         Connexion acceptée
           │                 ↓ tiède
           ↓          Conversation 2-3 échanges
     Escalade ou ban         ↓ warm
                       Calendly proposé
                             ↓ chaud
                        Fiche récap email
```

Tout est tracé. Rien n'est envoyé sans être sauvegardé en base au préalable.

---

## 2. Sources d'entrée

- **Boîte email** : `contact@7solutionsweb.com`, dossier IMAP `AI_Cognix`
- **Expéditeur** : `agent01@cognix-systems.com`
- **Sujet type** : `Prospection hosting — 7 fiches qualifiées — JJ mois AAAA`
- **Fréquence** : 1 email par run, 7 fiches par email

Chaque fiche contient : nom société, SIRET, score /10, localisation, secteur, effectif, dirigeant (nom + titre), téléphone, email, hébergeur actuel, angle d'attaque.

---

## 3. Qualification automatique — Températures

### Température initiale (basée sur le score)

| Score | Température | Comportement |
|-------|-------------|--------------|
| 8-10  | 🔥 `chaud`  | Séquence prioritaire, alerte immédiate |
| 6-7   | 🌡 `tiede`  | Séquence standard |
| 5     | ❄️ `froid`  | Attente, pas d'envoi automatique |
| < 5   | Rejeté      | Non chargé |

### Évolution de la température selon les actions LinkedIn

| Événement | Température | Sous-état (`linkedin_engagement`) |
|-----------|-------------|-----------------------------------|
| Aucune action | `new` | `none` |
| Connexion envoyée | `new` | `none` |
| Connexion acceptée | `tiede` | `connected` |
| Répond au premier message | `tiede` | `replied` |
| Engage la conversation (2e échange) | `tiede` | `warm` |
| RDV Calendly proposé | `tiede` | `rdv_proposed` |
| RDV confirmé | 🔥 `chaud` | `rdv_proposed` |

**État actuel de la base (27/05/2026) :** 14 leads, mode SIMULATION, aucune séquence démarrée.

---

## 4. Pipeline de traitement (run quotidien 12h00 Paris)

### Étape 1 - Lecture email
Hermes lit le dossier `AI_Cognix` et détecte les emails non marqués `processed`.

### Étape 2 - Parse et extraction
7 fiches extraites par email, converties en JSON, insérées en base SQLite.

### Étape 3 - Vérification CRM
Recherche par nom de société et SIRET dans le CRM Cognix (`CRM_URL` dans `~/openclaw/.env`).

### Étape 4 - Enrichissement signal web (score >= 6)
Visite du site prospect + recherche profil LinkedIn dirigeant via SearXNG (lecture seule).

### Étape 5 - Sauvegarde dashboard
`POST /api/leads` sur `https://cognix.7solutionsweb.com`. Auth : `x-api-key`.

### Étape 6 - Lancement séquences
Email à froid ET LinkedIn en parallèle selon disponibilité.

---

## 5. Séquence email à froid

**Expéditeur** : `contact@7solutionsweb.com`
**Signature** : Loïc FRETAY - Chargé d'affaires Cloud, Cognix Systems

### J0 - Premier contact (score >= 6)
- Objet : `[NOM_SOCIÉTÉ] — Infrastructure cloud souveraine`
- 7-10 lignes, personnalisé avec l'angle détecté
- Accroche sur le signal hébergeur, proposition de valeur, CTA discret
- Aucun lien, aucune pièce jointe

### J+3 - Relance (si pas de réponse)
- 3-4 lignes, angle reformulé, élément de preuve

### J+7 - Dernière tentative (scores 7-8)
- 2-3 lignes, question ouverte, ton détendu
- Sans réponse : `froid` + ban list 90 jours

---

## 6. Séquence LinkedIn (canal prioritaire)

### LK-0 - Recherche profil
Recherche via SearXNG. Si trouvé : `linkedin_found = 1`.

### LK-1 - Demande de connexion
Message adapté au profil (digital vs non-digital).

Exemples :

*Profil digital/web/marketing :*
> Bonjour [Prénom], je développe un réseau d'experts du digital et recherche des partenaires en développement web afin de créer des synergies d'affaires. Seriez-vous ouvert à une mise en relation ?

*Profil non-digital (industrie, commerce, santé...) :*
> Bonjour [Prénom], je travaille avec des dirigeants bretons sur des projets d'infrastructure numérique et de performance web. Je serais ravi d'élargir mon réseau dans votre secteur. N'hésitez pas à me rejoindre !

Limites : **15 connexions/jour max**, espacées aléatoirement 2-8 min.

### LK-2 - Connexion acceptée → 1er message
**Déclenché dans les 30 min-2h.** Température passe à `tiede`.

Le premier message qualifie sans pitcher. Fin : une question ouverte sur leur setup actuel ou leurs frustrations.

### LK-3/4 - Conversation (2-3 échanges)
Objectif : comprendre le besoin, apporter de la valeur, créer le lien.
- Réponse positive : `linkedin_engagement = replied` puis `warm`
- Réponse négative : `froid` + ban list
- Timing : jamais instantané, toujours 30 min à 4h selon le contexte
- **10 messages/jour max** toutes conversations confondues

### LK-5 - Proposition Calendly
Dès que le prospect montre un signal de disponibilité :
> Parfait ! Je vous envoie mon lien : https://calendly.com/loic-fretay-cognix-systems/45min
> 45 min, sans engagement.

### LK-6 - RDV confirmé → Lead chaud
- `temperature = chaud`
- Fiche récap générée et envoyée à `loic.fretay@cognix-systems.com`
- Alerte WhatsApp immédiate à Loïc

---

## 7. Fiche récap lead chaud

Format Markdown, envoyée par email dès que `temperature` passe à `chaud` (via email ou LinkedIn).

Contient : contact complet, profil société, signal détecté, historique des échanges, prochaine étape, notes.

Sauvegardée via `POST /api/leads/{id}/recap`.

---

## 8. Ban list et file d'attente

- **Ban list** : `froid` + `rejected/no_response` → 90 jours sans contact, puis proposition de relance à Loïc
- **File d'attente** : `tiede` + `warm_pending` → recontact à la date planifiée avec argumentaire adapté

---

## 9. Architecture technique

### Stack
- **Frontend / API** : Next.js 14, TypeScript, Tailwind CSS
- **Base de données** : SQLite via `better-sqlite3`
- **Auth API** : token statique `x-api-key`
- **Déploiement** : Docker Compose sur VPS

### Routes API

| Méthode | Route | Auth requise | Description |
|---------|-------|-------------|-------------|
| GET | `/api/control/status` | Non | Statut moteur (utilisé par le header) |
| POST | `/api/control/stop` | Oui | Mettre en pause |
| POST | `/api/control/resume` | Oui | Reprendre |
| GET | `/api/leads` | Oui | Liste leads |
| POST | `/api/leads` | Oui | Créer lead |
| GET/PATCH | `/api/leads/:id` | Oui | Détail/mise à jour |
| POST | `/api/leads/:id/recap` | Oui | Fiche récap |
| GET | `/api/stats` | Oui | Métriques |

### Champs LinkedIn dans la table `leads`

| Champ | Type | Description |
|-------|------|-------------|
| `linkedin_url` | TEXT | URL du profil |
| `linkedin_found` | INTEGER | 0/1 |
| `linkedin_status` | TEXT | pending/found/not_found |
| `linkedin_connected` | INTEGER | 0/1 |
| `connection_sent_at` | TEXT | Date envoi connexion |
| `connection_accepted_at` | TEXT | Date acceptation |
| `linkedin_message_sent_at` | TEXT | Date 1er message |
| `linkedin_conv_step` | INTEGER | Étape conversation (0-4) |
| `linkedin_engagement` | TEXT | none/connected/replied/warm/rdv_proposed |
| `linkedin_last_reply_at` | TEXT | Dernière réponse |
| `linkedin_rdv_proposed` | INTEGER | 0/1 |

---

## 10. Variables d'environnement

### Sur le VPS (`.env.local`)
```
DATABASE_URL=/data/leads.db
API_KEY=***
```

### Côté Hermes (`~/openclaw/.env`)
```
DASHBOARD_API_URL=https://cognix.7solutionsweb.com
DASHBOARD_API_KEY=***
PHANTOMBUSTER_API_KEY=***        # requis pour passer en mode LIVE LinkedIn
CRM_URL=<url_crm>
CALENDLY_URL=https://calendly.com/loic-fretay-cognix-systems/45min
```

> Mode SIMULATION actif tant que `PHANTOMBUSTER_API_KEY` est absent. Aucun envoi réel en simulation.

---

## 11. Commandes WhatsApp

| Commande | Action |
|----------|--------|
| `hermes cognix run` | Cycle complet immédiat |
| `hermes cognix init` | Initialisation (première fois) |
| `hermes cognix stop` | Pause moteur |
| `hermes cognix resume` | Reprise |
| `hermes cognix build dashboard` | Génère/pousse le repo GitHub |

---

## 12. Notifications automatiques

### Récap quotidien (18h00 Paris)
```
Cognix Prospection — Bilan du JJ/MM

Nouveaux leads : X
Connexions LinkedIn envoyées : X
Connexions acceptées : X
Messages envoyés : X
En conversation : X
Leads chauds : X / Ban list : X
RDV proposés : X
```

### Alertes immédiates
- Connexion LinkedIn acceptée (si lead score >= 8)
- Lead passé en chaud (RDV confirmé)
- Erreur critique (bounces, restriction LinkedIn, base inaccessible)

---

## 13. Sécurités et limites

- Max **15 connexions LinkedIn/jour**
- Max **10 messages LinkedIn/jour**
- Max **7 emails J0/jour**
- Max **20 relances email/jour**
- **1 seul contact/jour** par prospect, tout canal confondu
- **3 bounces email en 24h** → arrêt + alerte
- Restriction LinkedIn détectée → arrêt immédiat + alerte
- Lead ban list → aucun contact automatique possible (validation Loïc requise)

---

*Repo GitHub : [Loic-LFY/cognix-prospection-dashboard](https://github.com/Loic-LFY/cognix-prospection-dashboard)*
*Dashboard : https://cognix.7solutionsweb.com*
*Version : 2.0 — Mai 2026*
