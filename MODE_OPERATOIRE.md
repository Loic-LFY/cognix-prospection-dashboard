# Mode opératoire — Cognix Prospection Dashboard

> Hermes / OpenClaw — Version 1.0 — Mai 2026
> Périmètre : Cognix Systems — Prospection Hosting / Infogérance Cloud

---

## 1. Vue d'ensemble

L'application automatise la prospection B2B de Cognix Systems de bout en bout :

```
Email entrant (AI_Cognix)
       ↓
  Parse 7 fiches
       ↓
 Qualification automatique (score → température)
       ↓
  Sauvegarde SQLite → Dashboard
       ↓
  Séquence email (J0 / J+3 / J+7)
       ↓
  Suivi réponses → escalade ou ban
       ↓
  Récap WhatsApp quotidien à 18h
```

Tout est tracé. Rien n'est envoyé sans être d'abord sauvegardé en base.

---

## 2. Sources d'entrée

- **Boîte email** : `contact@7solutionsweb.com`, dossier IMAP `AI_Cognix`
- **Expéditeur des leads** : `agent01@cognix-systems.com`
- **Sujet type** : `Prospection hosting — 7 fiches qualifiées — JJ mois AAAA`
- **Fréquence** : 1 email par run, 7 fiches par email

Chaque fiche contient : nom société, SIRET, score /10, localisation, secteur, effectif, dirigeant (nom + titre), téléphone, email, hébergeur actuel, angle d'attaque recommandé.

---

## 3. Qualification automatique — Températures

La température est assignée dès l'ingestion, basée sur le **score /10** de la fiche :

| Score | Température | Comportement |
|-------|-------------|--------------|
| 8-10  | 🔥 `chaud`  | Séquence prioritaire, alerte immédiate WhatsApp |
| 6-7   | 🌡 `tiede`  | Séquence standard, suivi automatique |
| 5     | ❄️ `froid`  | Mise en attente, pas d'envoi automatique |
| < 5   | Rejeté      | Non chargé en base |

La température **évolue** ensuite en fonction des réponses reçues (voir section 6).

**État actuel de la base (27/05/2026) :**
- 14 leads chargés, tous à l'étape 0 (aucune séquence démarrée)
- 1 chaud / 9 tièdes / 4 froids
- Mode : SIMULATION (pas d'envoi réel tant que PHANTOMBUSTER_API_KEY absent)

---

## 4. Pipeline de traitement (run quotidien 12h00 Paris)

### Étape 1 - Lecture email
Hermes lit le dossier `AI_Cognix` et détecte les emails non marqués `processed`.

### Étape 2 - Parse et extraction
7 fiches extraites par email, converties en enregistrements JSON et insérés en base SQLite.

### Étape 3 - Vérification CRM
Pour chaque lead : recherche par nom de société et SIRET dans le CRM Cognix (`CRM_URL` dans `~/openclaw/.env`).
- Trouvé → `crm_exists: true`, statut existant noté dans `notes`
- Non trouvé → `crm_exists: false`
- CRM inaccessible → erreur loggée, traitement continue

### Étape 4 - Enrichissement signal web (score >= 6)
- Visite du site prospect pour confirmer l'hébergeur détecté
- Vérification profil LinkedIn du dirigeant via SearXNG (lecture seule, aucun login)
- Résultats consignés dans `notes`

### Étape 5 - Sauvegarde dashboard
Chaque lead poussé via `POST /api/leads` sur `https://cognix.7solutionsweb.com`.
Auth : header `x-api-key` avec `DASHBOARD_API_KEY`.

### Étape 6 - Lancement séquences
Voir section 5.

---

## 5. Séquences email

**Expéditeur** : `contact@7solutionsweb.com`
**Signature** : Loïc FRETAY - Chargé d'affaires Cloud, Cognix Systems

### J0 - Premier contact (score >= 6, automatique)

- Objet : `[NOM_SOCIÉTÉ] — Infrastructure cloud souveraine`
- 7-10 lignes max, personnalisé avec l'angle détecté
- Accroche sur le signal hébergeur (ex: "Votre site est actuellement sur OVH mutualisé...")
- Proposition de valeur Cognix : souveraineté, infogérance, performance
- CTA : "Seriez-vous disponible 20 minutes cette semaine ?"
- Aucun lien, aucune pièce jointe (délivrabilité)

Après envoi : `sequence_step = 1`, `status = "contacted"`

### J+3 - Relance (si pas de réponse)

- Objet : `Re: [NOM_SOCIÉTÉ] — Infrastructure cloud souveraine`
- 3-4 lignes, angle reformulé différemment, élément de preuve (cas client similaire)
- Même CTA

Après envoi : `sequence_step = 2`

### J+7 - Dernière tentative (scores 7-8 uniquement)

- Objet : `Dernière question — [NOM_SOCIÉTÉ]`
- 2-3 lignes, question ouverte, ton détendu
- "Est-ce que le sujet de l'hébergement n'est tout simplement pas une priorité en ce moment ?"
- Si pas de réponse → `temperature = "froid"`, `status = "no_response"`, ban list

Après envoi : `sequence_step = 3`

---

## 6. Gestion des réponses entrantes

Hermes surveille `contact@7solutionsweb.com` en continu pour matcher les réponses aux séquences actives.

### Réponse négative

Exemples : "Non merci", "Pas intéressé", "Nous avons déjà un prestataire"

- `temperature = "froid"`, `status = "rejected"`
- Réponse automatique polie : "Merci pour votre retour. Je ne vous recontacte pas. Bonne continuation."
- Enregistrement en ban list (délai 90 jours)

### Réponse neutre / mitigée

Exemples : "Envoyez plus d'infos", "Pas le bon moment", "On verra dans quelques mois"

- `temperature = "tiede"`, `status = "warm_pending"`
- Analyse du frein principal (timing, budget, prestataire actuel, décisionnaire)
- Email de suivi argumenté avec 2-3 questions ouvertes
- Replanification J+14

### Réponse positive

Exemples : "Oui, intéressé", "On peut en parler", "Qu'est-ce que vous proposez ?"

- `temperature = "chaud"`, `status = "hot"`
- Envoi immédiat du lien Calendly de Loïc (`CALENDLY_URL` dans `~/openclaw/.env`)
- Génération d'une fiche récap (voir section 7)
- Alerte WhatsApp immédiate à Loïc

---

## 7. Fiche récap lead chaud

Générée automatiquement quand `temperature` passe à `"chaud"`. Format Markdown :

```
# Fiche récap — [NOM_SOCIÉTÉ]

Date de qualification : JJ/MM/AAAA
Score initial : X/10

Contact : Prénom NOM (Titre) — Tel — Email — LinkedIn
Société : Secteur — Localisation — Effectif — Hébergeur actuel

Signal détecté : [Angle d'attaque original]

Historique :
- JJ/MM : Email J0 envoyé
- JJ/MM : Réponse reçue — [Résumé]

Prochaine étape :
[ ] RDV Calendly proposé
[ ] RDV confirmé : DATE HEURE
[ ] Offre à préparer

Notes : ...
```

Sauvegardée via `POST /api/leads/{id}/recap` et envoyée à `loic.fretay@cognix-systems.com`.

---

## 8. Ban list et file d'attente

### Ban list (cold)

- Leads avec `temperature = "froid"` ET `status` dans `["rejected", "no_response"]`
- Délai minimum : **90 jours sans contact**
- À J+90 : Hermes propose via WhatsApp "Ce lead est sorti de la ban list depuis 90 jours. On retente ?"

### File d'attente (warm pending)

- Leads avec `temperature = "tiede"`, `status = "warm_pending"`
- Recontactés à la date planifiée
- Argumentaire ajusté à chaque reprise selon les frictions identifiées

---

## 9. Architecture technique

### Stack

- **Frontend / API** : Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Base de données** : SQLite via `better-sqlite3`
- **Auth API** : token statique, header `x-api-key`
- **Déploiement** : Docker Compose sur VPS

### Routes API disponibles

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/leads` | Liste tous les leads (filtres : temperature, status) |
| POST | `/api/leads` | Créer un lead |
| GET | `/api/leads/:id` | Détail d'un lead |
| PATCH | `/api/leads/:id` | Mettre à jour un lead |
| POST | `/api/leads/:id/recap` | Sauvegarder une fiche récap |
| GET | `/api/stats` | Métriques globales |
| GET | `/api/control/status` | Statut du moteur (actif/pause/simulation) |

### Variables d'environnement (`.env.local` sur le VPS)

```
DATABASE_URL=/data/leads.db
API_KEY=<token_secret>
NEXT_PUBLIC_DASHBOARD_TITLE=Cognix Prospection
```

### Variables dans `~/openclaw/.env` (côté Hermes)

```
DASHBOARD_API_URL=https://cognix.7solutionsweb.com
DASHBOARD_API_KEY=<même_token>
PHANTOMBUSTER_API_KEY=<à_renseigner>
CRM_URL=<url_crm_cognix>
CRM_USER=<user>
CRM_PASS=<pass>
CALENDLY_URL=<lien_loic>
```

---

## 10. Schéma base de données

### Table `leads`
Champs principaux :

| Champ | Type | Description |
|-------|------|-------------|
| `id` | TEXT PK | UUID auto |
| `score` | INTEGER | Score /10 de la fiche |
| `temperature` | TEXT | `new` / `chaud` / `tiede` / `froid` |
| `status` | TEXT | `new` / `contacted` / `warm_pending` / `hot` / `rejected` / `no_response` |
| `sequence_step` | INTEGER | 0=pas commencé, 1=J0, 2=J+3, 3=J+7 |
| `linkedin_status` | TEXT | `pending` / `found` / `not_found` |
| `calendly_sent` | INTEGER | 0/1 |
| `recap_generated` | INTEGER | 0/1 |
| `crm_exists` | INTEGER | null / 0 / 1 |

### Table `sequences`
Historique de chaque email envoyé ou reçu dans une séquence.
Champ `mode` : `simulation` (log sans envoi) ou `live` (envoi réel).

### Table `ban_list`
Leads exclus temporairement. `unban_at` = date de réintégration possible.

### Table `control`
1 seule ligne. Permet à Loïc de passer le moteur en pause ou de basculer en mode simulation/live.

---

## 11. Commandes disponibles via WhatsApp

| Commande | Action |
|----------|--------|
| `hermes cognix run` | Déclenche immédiatement un cycle complet de traitement |
| `hermes cognix init` | Initialise le module (première fois) |
| `hermes cognix stop` | Met le moteur en pause |
| `hermes cognix resume` | Reprend après une pause |
| `hermes cognix build dashboard` | Génère/pousse le repo GitHub du dashboard |

---

## 12. Notifications automatiques

### Récap quotidien (18h00 Paris)

```
Cognix Prospection — Bilan du JJ/MM

Nouveaux leads reçus : X
Emails J0 envoyés : X
Relances envoyées : X
Réponses reçues : X
Leads chauds : X
Leads froids/ban : X
RDV Calendly proposés : X
```

### Alertes immédiates

- Lead chaud détecté (réponse positive)
- Erreur critique (bounces multiples, CRM inaccessible, base inaccessible)

---

## 13. Sécurités et limites

- Maximum **7 emails J0** par jour (1 run = 7 leads)
- Maximum **20 relances/jour** toutes séquences confondues
- **3 bounces en 24h** → arrêt immédiat + alerte WhatsApp Loïc
- Jamais plus d'**1 email par jour** par prospect
- Un lead en ban list ne peut **jamais** être recontacté automatiquement (validation Loïc requise)
- Mode SIMULATION actif par défaut tant que `PHANTOMBUSTER_API_KEY` est absent

---

*Repo GitHub : [Loic-LFY/cognix-prospection-dashboard](https://github.com/Loic-LFY/cognix-prospection-dashboard)*
*Dashboard : https://cognix.7solutionsweb.com*
