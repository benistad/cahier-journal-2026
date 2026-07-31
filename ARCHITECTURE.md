# Architecture — Cahier Journal 2026

Document d'analyse (aucune modification de comportement). Sert de base aux prochaines étapes : sync distante, recherche Google Drive, assistant OpenRouter.

---

## 1. Architecture actuelle

Application **statique monofichier** : tout (HTML, CSS, JS) est dans [index.html](index.html), sans build, sans framework, sans dépendance npm.

```
Navigateur ──fetch──> GitHub Pages (statique)
   │                     ├── index.html   (app complète)
   │                     ├── data.json    (données "officielles")
   │                     └── docs/        (fichiers joints : pdf, docx, pptx)
   │
   └── localStorage (clé "cj_data")  ← copie de travail locale
```

- **Aucun backend.** GitHub Pages sert des fichiers statiques ; il n'y a pas de serveur applicatif, pas d'API, pas de base de données.
- **Aucune authentification.** Le "mode édition" (bouton ✏️ Éditer) est un simple état d'UI (`edit-mode` sur `<body>`), pas une protection d'accès : n'importe quel visiteur du site public peut l'activer et éditer localement.
- **Écriture réelle du contenu publié** : ne passe pas par l'UI du site. C'est un flux hors-application :
  1. L'enseignant dicte le contenu à Claude Code (ce terminal).
  2. Claude modifie directement [data.json](data.json) et copie les fichiers dans [docs/](docs/).
  3. `bash publish.sh` fait `git add / commit / push` ([publish.sh](publish.sh)).
  4. GitHub Pages republie en ~1 min.
- **L'UI d'édition du navigateur** (panneau ✏️, formulaires, drag & drop, upload) est fonctionnelle mais **écrit uniquement dans `localStorage`**, jamais dans `data.json`. C'est un mode d'édition "brouillon local / démo", déconnecté du pipeline de publication réel.

---

## 2. Endroits où les données sont chargées, fusionnées, sauvegardées, importées, exportées

| Fonction | Ligne | Rôle |
|---|---|---|
| `load()` | [index.html:482](index.html#L482) | Lit `localStorage.getItem('cj_data')`, parse le JSON. Retourne `{}` si absent/invalide. |
| `save()` | [index.html:483](index.html#L483) | Écrit `data` (l'objet JS en mémoire) dans `localStorage['cj_data']`. Appelée après **chaque** mutation UI (ajout/édition/suppression de bloc, upload, pause, drag & drop, clear day, copy previous week). |
| `loadRemote()` | [index.html:485-496](index.html#L485) | `fetch('data.json?t=' + Date.now())` puis **`Object.assign(data, remote)`** : les clés de `remote` (les semaines) **écrasent** les clés locales existantes, clé par clé (au niveau "semaine", pas de fusion profonde jour par jour). Résultat immédiatement réécrit dans `localStorage`. Erreurs silencieusement ignorées (offline). |
| `exportJSON()` | [index.html:915-923](index.html#L915) | Télécharge `data` (état courant en mémoire, donc localStorage + remote fusionné) en fichier `.json`. Export manuel, déclenché par le bouton 💾. |
| `importJSON(file)` | [index.html:925-936](index.html#L925) | Lit un fichier `.json` choisi par l'utilisateur, **remplace entièrement** `data` après confirmation (`confirm()`), sauvegarde et re-render. Remplacement total, pas de fusion. |
| `copyPrevWeek()` | [index.html:941-956](index.html#L941) | Copie profonde (`JSON.parse(JSON.stringify(...))`) des `blocks` de la semaine précédente vers la semaine courante, en mémoire puis `save()`. |
| Upload pièce jointe | [index.html:1001-1013](index.html#L1001) | `FileReader.readAsDataURL(file)` → stocke le fichier **encodé en base64** directement dans l'objet `attachments` en mémoire, puis `save()` → donc **en localStorage**, sous forme de très longue chaîne de caractères. Limite : 10 Mo côté client (`file.size > 10*1024*1024`), pas de limite serveur puisqu'il n'y a pas de serveur. |
| Initialisation | [index.html:1042-1045](index.html#L1042) | Séquence au chargement : `data = load()` (localStorage, **synchrone**) → `update()` (render immédiat avec les données locales) → `loadRemote()` (fetch **asynchrone**, écrase ensuite ce qui vient d'être affiché). |

### Séquence de chargement précise
1. `load()` : localStorage → `data` (peut être vide ou obsolète).
2. `update()` : rendu immédiat avec ces données locales (potentiellement obsolètes).
3. `loadRemote()` (async, en parallèle) : dès que `data.json` répond, ses clés de semaine **écrasent** celles déjà en mémoire/localStorage, puis re-render.

**Priorité actuelle** : les données distantes (`data.json`) gagnent toujours sur les données locales **pour les semaines qu'elles contiennent**, et ce écrasement se produit après coup (l'utilisateur voit d'abord l'ancien état local, puis un re-render avec l'état distant). Les semaines présentes uniquement en local (jamais publiées) sont conservées, car `Object.assign` ne touche pas les clés absentes de `remote`.

---

## 3. Rôle précis de `data.json` et de `localStorage`

- **`data.json`** = source de vérité *publiée*. C'est un fichier statique versionné dans git, la seule donnée que tous les visiteurs du site voient en commun. Il n'est modifié que hors-navigateur (par Claude Code sur la machine de l'enseignant), jamais par le site lui-même.
- **`localStorage['cj_data']`** = cache/brouillon *local au navigateur*, propre à chaque appareil/navigateur. Il sert de :
  - copie de travail pour le mode édition du site (qui ne persiste que là),
  - cache offline (si `fetch('data.json')` échoue, l'app garde ce qui était en localStorage),
  - fusionné/écrasé à chaque chargement de page par le contenu de `data.json`.

Il n'y a **aucun lien retour** de `localStorage` vers `data.json` : ce que l'enseignant modifie en direct sur le site (mode édition navigateur) reste piégé dans ce navigateur/appareil précis, et sera de toute façon écrasé à la prochaine publication via Claude Code puisque le `data.json` republié ré-écrase la semaine correspondante en localStorage.

---

## 4. Risques de perte ou d'écrasement des données

1. **Écrasement silencieux des éditions faites dans le navigateur.** Si l'enseignant (ou un élève, faute d'authentification) édite une semaine via le panneau ✏️ sur le site, ces changements ne vivent que dans `localStorage`. Au prochain chargement de page où `data.json` contient déjà cette semaine, `loadRemote()` (ligne 491) écrase ces modifications sans avertissement ni fusion.
2. **Pas de fusion fine.** `Object.assign(data, remote)` fusionne au niveau "semaine" entière, pas jour par jour ni bloc par bloc. Si `data.json` et le localStorage divergent sur des jours différents de la même semaine, un seul des deux survit entièrement pour cette semaine.
3. **`localStorage` par appareil.** Deux appareils différents (ordinateur de classe, tablette, téléphone) ont chacun leur propre `localStorage` : pas de synchronisation entre eux tant que `data.json` n'a pas été republié.
4. **Import JSON destructif.** `importJSON()` (ligne 925) remplace `data` en entier (après confirmation), donc perte de toute donnée non présente dans le fichier importé si l'utilisateur importe un export ancien ou partiel.
5. **`localStorage` non durable.** Effaçable par l'utilisateur (nettoyage navigateur), par le mode navigation privée, ou par une limite de quota (rare vu la taille, mais les pièces jointes en base64 rapprochent de la limite ~5-10 Mo de `localStorage`).
6. **Pièces jointes en base64 dans le JSON.** Chaque fichier joint gonfle `data.json`/`localStorage` d'environ +33% de sa taille en base64. Un PDF de quelques Mo peut à lui seul saturer le quota `localStorage`, et alourdit chaque `git commit`/`push` et chaque chargement de `data.json` (tout le JSON est retéléchargé à chaque visite, y compris les fichiers déjà vus).
7. **Absence de contrôle de concurrence.** Rien n'empêche deux écritures concurrentes de `data.json` (ex. deux sessions Claude Code sur deux machines) de s'écraser mutuellement lors du `git push` — actuellement mitigé uniquement par le fait qu'une seule personne (l'enseignant, via Claude Code) écrit dans ce fichier.
8. **Pas de sauvegarde/versionning autre que git.** Le seul filet de sécurité actuel est l'historique git de `data.json` (donc récupérable), mais aucune protection n'existe côté `localStorage` (pas d'historique, écrasement = perte définitive locale).

---

## 5. Séparation minimale interface / gestion des données / stockage

L'application actuelle mélange les trois couches dans un seul fichier (fonctions DOM et fonctions données entremêlées, ex. `submitActivity()` ligne 842 fait à la fois logique métier et `save(); renderJournal(); renderBlocks();`). Une séparation minimale, sans réécrire l'appli :

```
┌─────────────────────────────┐
│  UI (rendu + événements)     │  renderJournal(), renderBlocks(), panneaux, formulaires
├─────────────────────────────┤
│  Data layer (logique pure)   │  ensureWeek(), getDayData(), submitActivity() sans effets
│                              │  de bord DOM, merge(local, remote), validation de schéma
├─────────────────────────────┤
│  Storage adapters             │  - localAdapter (localStorage, tel quel aujourd'hui)
│                              │  - remoteAdapter (aujourd'hui: fetch data.json en lecture
│                              │    seule ; demain : lecture + écriture vers un backend)
└─────────────────────────────┘
```

Points clés pour préparer la suite sans casser l'existant :
- Isoler un module « **data layer** » avec une fonction unique `mergeWeeks(local, remote)` qui explicite la règle de priorité (aujourd'hui : remote écrase local par semaine) — remplaçable plus tard par une fusion par horodatage (`updatedAt`) sans toucher à l'UI.
- Isoler un module « **storage adapter** » avec une interface `{ load(), save(data), loadRemote() }` — permet de brancher un futur backend (Étape suivante) derrière la même interface que `localStorage` actuel, sans réécrire les fonctions de rendu.
- Garder les pièces jointes en dehors du flux JSON principal dès que possible (cf. §8) pour que la couche "storage" du texte (rapide, petit) et celle des fichiers (volumineuse) évoluent indépendamment.

---

## 6. Comparatif rapide des solutions de backend pour une appli statique

| Solution | Écriture depuis le navigateur | Auth simple | Fichiers binaires | Secrets protégés | Coût | Complexité ajoutée |
|---|---|---|---|---|---|---|
| **Rester en manuel** (Claude Code + git push, statu quo) | Non (hors-app) | N/A | git (lourd à terme) | ✅ (aucun secret exposé) | Gratuit | Nulle |
| **GitHub API en direct depuis le navigateur** (commit via REST API) | Oui | Difficile (token GitHub exposé côté client = risque) | via git | ❌ (token doit être caché) | Gratuit | Faible mais peu sûr sans proxy |
| **Firebase (Firestore + Storage + Auth)** | Oui | ✅ intégré | ✅ Storage dédié | ✅ (règles serveur) | Gratuit à petite échelle | Moyenne (SDK, règles de sécurité) |
| **Supabase (Postgres + Storage + Auth)** | Oui | ✅ intégré | ✅ Storage dédié | ✅ (RLS + clés serveur) | Gratuit à petite échelle | Moyenne, mais SQL classique |
| **Petit backend perso (Node/Express ou équivalent) + hébergement (Render/Fly/VPS)** | Oui | À coder soi-même | Oui (à gérer) | ✅ (serveur classique) | Gratuit/faible | Élevée (maintenance serveur) |
| **Fonctions serverless (Cloudflare Workers/Vercel) + KV/D1/Postgres** | Oui | À coder ou via provider | Oui (R2/S3) | ✅ (env vars serveur) | Gratuit à petite échelle | Moyenne |

Le point commun indispensable pour les étapes futures (sync distante réelle depuis l'UI, recherche Google Drive, assistant OpenRouter) : **toutes ces intégrations nécessitent des secrets** (clé API Google, clé API OpenRouter) qui ne doivent jamais être exposés dans du JS servi statiquement — donc un site 100% statique (comme aujourd'hui) ne peut plus suffire dès qu'on veut appeler ces APIs directement depuis le navigateur.

---

## 7. Recommandation

**Supabase** (Postgres + Storage + Auth + fonctions Edge), avec justification :

- **Un seul enseignant, faible volume** : le plan gratuit suffit largement (base de données, stockage fichiers, fonctions serveur).
- **Auth intégrée simple** : permet de vraiment protéger l'édition (contrairement au `edit-mode` actuel, purement cosmétique), avec un compte unique pour l'enseignant.
- **Stockage de fichiers dédié (Supabase Storage)** : résout directement le problème des pièces jointes en base64 dans le JSON (§4.6) — les fichiers sortent du flux de données et sont servis par URL, comme `docs/` aujourd'hui mais sans limite de taille de `localStorage`/JSON.
- **Fonctions Edge (Deno) faciles à écrire** : c'est l'endroit naturel pour héberger, plus tard, les appels à l'API OpenRouter et à l'API Google Drive — les secrets restent côté serveur Supabase, jamais exposés au navigateur.
- **Migration progressive possible** : `data.json` peut continuer d'exister comme export/snapshot de secours pendant la transition, le temps de migrer confortablement sans tout casser d'un coup.
- Alternative écartée : Firebase est équivalent en capacités mais moins naturel en SQL (préférence pour la structure relationnelle claire du schéma en §8) ; un backend maison ajoute de la maintenance serveur sans bénéfice pour un projet à un seul utilisateur.

---

## 8. Futur schéma général des données et points de migration

Schéma cible (indicatif, à affiner à l'étape "sync distante") :

```
weeks
  id (pk), monday_date (unique), updated_at

days
  id (pk), week_id (fk), day_name (Lundi..Vendredi), position

blocks
  id (pk), day_id (fk), position, type (subject|break)
  tag, content, time            -- si type = subject
  label                         -- si type = break

attachments
  id (pk)
  block_id (fk, nullable)       -- pièce jointe liée à un bloc précis (usage actuel dominant)
  day_id (fk, nullable)         -- pièce jointe générale du jour (cf. attachments actuels du jour)
  storage_path (Supabase Storage), original_name, size, mime_type
```

Points de migration identifiés :
1. **`data.json` → tables `weeks/days/blocks`** : script one-shot qui parcourt les semaines existantes et insère les lignes correspondantes, en conservant l'ordre des blocs (`position`).
2. **Pièces jointes base64 → Supabase Storage** : décoder chaque `attachments[].url` (data URI actuel) et re-uploader en fichier binaire, remplacer par un `storage_path` + URL publique/signée.
3. **`docs/` (fichiers actuels versionnés en git)** : à migrer aussi vers Storage pour unifier tous les fichiers au même endroit (actuellement scindés entre `docs/` en git et les futures pièces jointes en base64).
4. **Couche storage adapter (§5)** : remplacer l'implémentation `localAdapter`/`remoteAdapter` par des appels au client Supabase, sans changer la couche UI si l'interface `{load, save, loadRemote}` a été respectée.
5. **`data.json` conservé en lecture seule** temporairement comme filet de secours / export de secours, généré depuis la base au moment de `publish.sh`, le temps de valider la fiabilité du nouveau backend.

---

## 9. Secrets à garder côté serveur

À ne **jamais** exposer dans `index.html` ni dans aucun fichier statique servi au navigateur :

- **Clé API OpenRouter** (assistant IA) — appel à faire depuis une fonction serveur (Edge Function Supabase), jamais depuis le JS client.
- **Identifiants OAuth Google Drive** (client secret) et **tokens d'accès/rafraîchissement** de l'enseignant — le flux OAuth doit passer par un serveur ; seul un token de session applicatif (pas le token Google brut) peut éventuellement transiter côté client, et encore, avec prudence.
- **Clé de service Supabase** (`service_role key`) si utilisée pour des opérations privilégiées — uniquement dans les fonctions Edge, jamais dans le bundle client (seule la clé publique `anon key`, prévue pour être publique et encadrée par des règles de sécurité (RLS), peut rester côté navigateur).
- **Tout token GitHub** si l'on garde un mécanisme de publication automatique vers `data.json`/git en parallèle — à conserver côté serveur/CI, jamais dans le navigateur.

---

## Hors périmètre de cette étape

Conformément à la demande, ce document ne développe pas encore : l'assistant IA (OpenRouter), la recherche de documents Google Drive, ni l'enregistrement vocal. Aucun comportement de l'application n'a été modifié — seule cette analyse a été produite.
