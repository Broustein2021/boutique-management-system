# Livraison — Atelier de la Séduction (boutique-management-system)

## État de l'application
- **App** : vente « Atelier de la Séduction » — tableau de bord, ventes & caisse, catalogue, stock, clientes & répertoire, dépenses, activités, gestion des comptes.
- **Rôles** : Administratrice / Associée / Caissière (permissions par rôle, comptes suspendus bloqués).
- **Sécurité** : connexion par e-mail + mot de passe (scrypt), verrouillage après 5 échecs / 10 min, session JWT.
- **Tailles** : gestion S/M/L/XL sur les produits à tailles (édition produit avec photo, ajustement par taille, vente avec taille, reçus, remboursement).
- **Base** : PostgreSQL (Neon), migrations Drizzle (**12 migrations**, journal cohérent, vérifié le 23/11/2026).
- **Branches** : le service dev tourne via `pnpm dev` sur le port 3000.

## Nouveautés livrées le 23/11/2026 (Tâches 1 → 2 → 3)
1. **Facture multi-articles** : une facture regroupe plusieurs lignes de vente ; panier caisse avec recherche/liste produit, quantité, prix unitaire prérempli (modifiable seulement par Admin/Associée), sous-totaux et total en direct, ajout/suppression de ligne, contrôle stock/taille/prix côté serveur, enregistrement atomique via `public.create_invoice()` (fonction PostgreSQL obligatoire avec `neon-http`, qui ne supporte pas `db.transaction()`). Les anciennes ventes mono-article sont reconstituées en factures d’une ligne par la migration `0010` (aucune perte). Le remboursement reste **par ligne** (comportement historique conservé).
2. **Exports PDF** : `jspdf` + `jspdf-autotable` ; boutons **CSV | PDF** sur ventes, produits/stock, dépenses, clientes et rapport. Chaque PDF contient en-tête boutique + logo, titre, date, tableau paginé et totaux. Le CSV reste disponible tel quel.
3. **Logo configurable** : réglages réservés à l’Administratrice, upload PNG/JPG ≤ 2 Mo redimensionné côté client (256 px, JPEG, sans déformation), stocké en base (`store_settings`, comme les photos produits — compatible Vercel), suppression possible, repli sur `/logo.jpg` si absent. Le logo apparaît sur le reçu écran/PDF/impression, les exports PDF et la page de connexion.
- **Dépendances ajoutées** : `jspdf@^4.2.1`, `jspdf-autotable@^5.0.9` (lockfile pnpm mis à jour).
- **Next.js 16** : la page `/login` lit le logo en base ; elle est exclue du prérendu avec `await connection()` de `next/server` (API recommandée, `export const dynamic = 'force-dynamic'` étant déprécié).
- **Vérifications techniques** : `pnpm exec tsc --noEmit` ✓, `pnpm build` ✓ (routes `/` et `/login` dynamiques), `pnpm db:migrate` ✓, test `doc.lastAutoTable.finalY` sous autotable v5 ✓.

## Données en base — état historique (remise du 10/09/2026)
| Chose | Quantité | Commentaire |
|---|---|---|
| Produits | 0 | **base rendue vierge le 10/09** (décision : repartir de l'inventaire réel, avec photos, valeurs et références) |
| Clientes au répertoire | 0 | à constituer |
| Historique de ventes | 0 | à partir de la reprise d'activité |
| Dépenses | 0 | à saisir |
| Comptes utilisateurs | 3 | Anna (Admin) · Khadija (Associée) · Yasmine (Caissière) |

> **Principe** : l'inventaire du 02/09 (62 références, y compris les 8 lingerie à tailles estimées et le produit « Robe + par-dessus en dos » à prix 0) a été **entièrement supprimé** car ce sont des données de démonstration. La boutique saisit désormais son vrai stock directement dans l'application.

## État réel avant remise à zéro (23/11/2026, après migrations)
| Chose | Quantité | Commentaire |
|---|---|---|
| Produits | 36 | Stock réel saisi par la boutique (plus aucune donnée de démo) |
| Clientes au répertoire | 1 | |
| Historique de ventes | 11 | Dont les lignes créées lors des tests du 23/11 |
| **Factures** | **8** | Backfill `0010` (7) + 1 facture de test multi-articles |
| Remboursements | 2 | Dont ceux créés lors des tests |
| Dépenses | 0 | |
| Comptes utilisateurs | 6 | 3 comptes initiaux + comptes créés depuis la reprise |
| Réglages boutique | 1 | Ligne `store_settings` créée par `0011` |
| Migrations appliquées | 12 | `0000` … `0011`, dont `create_invoice()` présent |
| Période d'activité | 27/10 → 23/11/2026 | Date de la première à la dernière opération relevée |

> Ce tableau est **historique** : il décrit l’état sauvegardé juste avant la remise à zéro du 23/11/2026.

## État actuel — base vidée pour la formation du 24/11/2026
Remise à zéro exécutée le **23/11/2026 à 14:16 UTC** via `pnpm db:reset-data -- --yes`.

| Chose | Quantité | Commentaire |
|---|---|---|
| Produits / ventes / factures | 0 | Séquences remises à 1 |
| Remboursements / clientes / dépenses | 0 | |
| Mouvements de stock / journal d’activité | 0 | |
| Comptes utilisateurs | 6 | **Conservés**, mots de passe inchangés |
| Logo boutique | Conservé | Réglage `store_settings` non supprimé |
| Migrations appliquées | 12 | Inchangées |

> Sauvegarde complète (CSV de 10 tables + journal Drizzle) dans `_archive\boutique-management-system\neon-20261123-141552-avant-formation\`.

## Avant de remettre à la boutique
- [ ] **Transmettre les mots de passe initiaux en main propre** (jamais par ce dépôt).
- [ ] **Photographier et saisir le stock réel** : Catalogue → Ajouter un produit (photo, prix, coût d'achat, stock, seuil min., tailles si lingerie).
- [x] **Hébergement retenu** : mise en ligne sur Vercel (projet `gestionas`), déploiement final effectué le **23/11/2026** (voir « Production — lien client »).
- [ ] Tests de recette (cf. ci-dessous).

## Comptes et mots de passe
- [ ] Anna Martin — **Administratrice**
- [ ] Khadija Mensah — **Associée**
- [ ] Yasmine Soumah — **Caissière**

> ⚠️ **Jamais de mot de passe dans ce dépôt.** Les mots de passe initiaux sont transmis **en main propre / hors-ligne** ; prévoir leur **changement à la première connexion** (menu Comptes → Changer mon mot de passe).
> Le seed administrateur utilise `SEED_DEFAULT_PASSWORD` (variable d'environnement) — aucun mot de passe en dur dans le code.

## Scénarios de recette (à rejouer ensemble)
### Socle (existant, à ne pas casser)
- [ ] Connexion des 3 comptes ; comptes Suspendus => refusés ; 5 échecs => verrouillage 10 min.
- [ ] Ajout d'un produit **avec photo et tailles** (S/M/L/XL) → visible au catalogue, colonne « TAILLES » au stock.
- [ ] Vente avec taille : sélection M, panier, encaissement, reçu **écran** + **PDF** (+ impayé WhatsApp).
- [ ] Vente d'un produit non taillé ; paiement Carte bancaire / Mobile Money / Espèces.
- [ ] Remboursement → stock réintégré (y compris par taille), activité journalisée.
- [ ] Ajustement de stock par taille ; seuil « Stock à surveiller » ; archivage d'un article.
- [ ] Import / Export CSV (ventes/produits/dépenses/clientes) avec filtres ; dépenses ; gestion des comptes.
- [ ] Vérification mobile (390×844) : aucune coupure, modales défilables.

### Tâche 1 — Facture multi-articles
- [ ] Caisse : ajouter 3 articles **dont deux fois le même** → le doublon est **fusionné** (quantité cumulée), total temps réel correct.
- [ ] Modifier une quantité (1 → 3), supprimer une ligne, vérifier la mise à jour immédiate du sous-total et du total.
- [ ] Prix prérempli depuis le catalogue ; tentative de modification en tant que **Caissière** → refus ; OK en Admin/Associée.
- [ ] Quantité > stock → refus clair ; produit archivé → refus ; taille manquante sur un produit taillé → refus.
- [ ] Facture vide → bouton « Encaisser » désactivé / erreur serveur si contourné.
- [ ] Deux caisses en simultané sur le dernier article → une seule vente acceptée, l’autre en rupture (atomicité).
- [ ] Reçu après vente : **toutes les lignes** apparaissent à l’écran, dans le PDF et dans l’impression ; total = somme des lignes.
- [ ] Rembourser **une ligne seulement** d’une facture multi-lignes → stock réintégré pour cette ligne, le reste intact.
- [ ] Historique : l’ancienne vente du 20/11 apparaît toujours (facture mono-ligne reconstituée).

### Tâche 2 — Exports PDF
- [ ] Sur **Ventes, Produits/Stock, Dépenses, Clientes, Rapport** : cliquer **PDF** → fichier téléchargé, en-tête avec logo, titre, date, tableau lisible.
- [ ] Forcer un grand nombre de lignes (ou filtre large) → pagination correcte, totaux en pied, pas de chevauchement.
- [ ] Cliquer **CSV** → export identique à l’ancien comportement.
- [ ] PDF avec logo absent → en-tête propre (nom de la boutique seulement), pas d’image cassée.

### Tâche 3 — Logo
- [ ] Admin uniquement : Paramètres → uploader un **PNG** puis un **JPG** → aperçu carré, **aucune déformation**.
- [ ] Fichier > 2 Mo ou mauvais type → refus avec message clair ; fichier valide → logo visible sur connexion, reçu, PDF.
- [ ] Supprimer le logo → repli sur `/logo.jpg` partout ; recharger la page de connexion (doit refléter le changement).
- [ ] Se connecter en Caissière/Associée → section Paramètres absente et action serveur refusée si appelée directement.

## Règles d'exploitation
- [ ] **Ne jamais relancer `pnpm db:seed` sans sauvegarde** — le seed standard efface TOUT (produits, ventes, clientes, dépenses et comptes) puis réimporte l'inventaire de démo.
- [ ] **`pnpm db:seed -- --empty --yes`** : remet proprement la base **vierge** (0 produit, 0 vente, 0 dépense) tout en **conservant les 3 comptes** — à utiliser pour repartir d'un état neuf.
- [ ] `.env.local` (contient `DATABASE_URL`, `AUTH_SECRET`) reste **hors du dépôt git** ; à sauvegarder hors-ligne.
- [ ] `pnpm db:migrate` est sûr : no-op sur une base à jour, applique tout sur une base neuve.
- [ ] Chaque ouverture de session d'édition : `pnpm install` (une seule fois), `pnpm dev` → `http://localhost:3000`.
- [ ] Après une migration, refaire un export logique Neon dans `_archive\boutique-management-system\` (l’export du 23/11 11:54 est **antérieur** aux migrations `0010`/`0011`).

## Production — lien client
- **URL officielle : https://gestionas.vercel.app** — ✅ **nouvelle version en ligne le 23/11/2026** (déploiement `dpl_GbvfuciE8kFabG1m75KPacv161dx`, état `READY`). Contrôle effectué : `/` → 307 vers `/login`, `/login` → 200, `/logo.jpg` → 200.
- Variables d'environnement définies sur Vercel (Production/Preview/Development) : uniquement `DATABASE_URL` (hôte **`ep-wild-sky-ayeobzgc-pooler.c-5.us-east-2.aws.neon.tech`**, base `neondb`) et `AUTH_SECRET` — **jamais** committées. Vérifié le 23/11/2026 après déconnexion de Supabase.
- La « Deployment Protection » (authentification Vercel) reste **désactivée** : les clientes accèdent sans compte Vercel.
- ✅ Le domaine officiel `gestionas.vercel.app` a été **réassigné** au nouveau déploiement (il pointait encore sur l’ancien `dpl_A3b1GCAmUspCEL12qmncDNah6bw6`, servi en cache). Il sert désormais exactement les mêmes fichiers que `gestionas-sdtmici-services.vercel.app` (contrôle octet par octet du HTML et des 9 chunks JS).
- ⚠️ `boutique-management-system.vercel.app` n'est **pas** notre app (nom global déjà pris par un autre projet) — ne jamais donner ce lien. Alias valides : `gestionas.vercel.app`, `gestionas-sdtmici-services.vercel.app`, `boutique-management-system-ashen.vercel.app`.
- Les données restent hébergées par Neon (base partagée local ↔ production) ; photos produits **et logo** stockés en base.
- ✅ **Lien Vercel ↔ GitHub finalisé** : dépôt `Broustein2021/boutique-management-system`, branche `main`. Un `git push` déclenche un déploiement. Redéploiement manuel possible avec `vercel deploy --prod --yes` dans ce dossier (build distant). La méthode `--prebuilt` est à éviter avec Next.js 16 (erreur sur un fichier de l’output précompilé).

### Incident de déploiement du 23/11/2026 — cause et résolution
- **Symptôme** : tous les déploiements échouaient avant le build avec `BUILD_ERROR: Resource provisioning failed` (CLI, Git, preview, et même redéploiement d’une ancienne version READY).
- **Cause** : le projet Vercel avait un store **Supabase** (`supabase-cerulean-castle`, projet `sdvyaitemyqaajirghps`) lié en `preview + production`, déclaré `deployments.required: true` et **suspendu** (plan gratuit inactif). Vercel tentait de le provisionner à chaque déploiement, indépendamment de `DATABASE_URL` qui pointe sur Neon.
- **Résolution (action humaine obligatoire)** : déconnexion du store via `vercel storage disconnect supabase-cerulean-castle --project gestionas` (confirmation interactive). Seules les 16 variables `POSTGRES_*`, `SUPABASE_*`, `NEXT_PUBLIC_SUPABASE_*` (inutilisées) ont été retirées ; `DATABASE_URL` et `AUTH_SECRET` conservées.
- **Vérification** : `vercel storage status --project gestionas` → « No storage resources are connected ». Déploiement suivant → `READY`.
- **À surveiller** : si un nouveau store Supabase est lié au projet et suspendu, le problème reviendra. Garder le projet sans intégration Supabase (l’appli n’en a pas besoin).

### Vérification du 23/11/2026 (API Vercel, lecture seule)
- Projet Vercel `gestionas` (Next.js) : **3 déploiements `READY`** en production, tous sur le commit `b3a4c68d42c2004cc43e188d5e6817598cc094e2`, identique au `HEAD` local au moment de la vérification. Le plus récent date du **27/10/2026 09:51 UTC**.
- Alias relevés : `gestionas-sdtmici-services.vercel.app` et `boutique-management-system-ashen.vercel.app`.
- `DATABASE_URL` et `AUTH_SECRET` présents sur Vercel : après déchiffrement via l'API, **identiques** à ceux de `.env.local` (même endpoint Neon `ep-wild-sky-ayeobzgc-pooler...`, même base `neondb`, même utilisateur, même mot de passe).
- `DATABASE_URL` modifiée sur Vercel le **27/10/2026 09:49 UTC**, juste avant le redéploiement (09:51) et la reprise des données dans Neon (09:55) : chronologie cohérente.
- Le projet Vercel est désormais **lié à GitHub** (`Broustein2021/boutique-management-system`, branche `main`) ; la liaison, tentative infructueuse plus tôt dans la journée, a été finalisée par le propriétaire le 23/11/2026 (voir « Suivi des mises à jour »).
- ⚠️ Le token Vercel utilisé pour ces vérifications doit être **révoqué** après usage (il permet de lire les secrets en clair).

## Suivi des mises à jour (23/11/2026)
- **GitHub** : premier push effectué le 23/11/2026 (commit `e3f67a0819fc08188f5948e78224c1321fb1a6f6`), suivi des commits de suivi du statut. Le dépôt `Broustein2021/boutique-management-system` n'est plus vide : il contient l'intégralité de l'historique local (les 4 commits d'origine + les commits de mise à jour du 23/11/2026).
- **Lien Vercel ↔ GitHub** : ✅ **finalisé** par le propriétaire le 23/11/2026 — `link.type = github`, repo `Broustein2021/boutique-management-system`, `productionBranch = main`. Un commit vide (`d06e905`) poussé sur `main` a bien déclenché un déploiement Vercel (source `git`), confirmant le fonctionnement du lien.
- **Sauvegarde Neon** : export logique complet (CSV de toutes les tables + 10 migrations + journal) dans `_archive\boutique-management-system\neon-20261123-115435-logique\`. Le `pg_dump` local (v17) ne peut pas dumper un serveur v18, d'où le format CSV.
- **Journal Drizzle** : la migration `0008_add_customers` était absente des 9 entrées de `drizzle.__drizzle_migrations` alors que la table `customers` et `sales.customer_id` existaient déjà. Elle a été **réconciliée** le 23/11/2026 par ajout de son empreinte SHA256 (`cfbaeb84e86069dac8bf635205feb6e3e8ebd35d75dcd907ca6a1604a8b03c0b`) avec l'horodatage du journal local — **sans réexécuter son SQL**. Le journal contient désormais **12 entrées** / **12 snapshots**, séquence `0..11` validée.
- **Migrations `0010_invoices` et `0011_store_settings`** : appliquées le 23/11/2026 via `pnpm db:migrate`. Vérification en base : `invoices = 7` (total 238 000), `sales liées = 7/7`, `store_settings = 1`, `pg_proc.create_invoice = 1`, `drizzle.__drizzle_migrations = 12`.
- **Conséquence** : `pnpm db:migrate` est de nouveau sûr (no-op) sur cette base. `pnpm db:seed` reste **destructif** et interdit en production.

### Détail des migrations ajoutées
- `drizzle/0010_invoices.sql` (snapshot `0010`) : `invoices`, `sales.invoice_id` + FK + index, colonne temporaire `legacy_sale_id`, backfill des ventes existantes, fonction `public.create_invoice(p_customer_id, p_customer_name, p_payment_method, p_seller_name, p_items jsonb)` — valide quantité (1–999), prix (0–1 000 000), stock, taille, article archivé ; écrit facture + lignes + mouvements de stock en **un seul appel SQL** ; supprime la colonne temporaire.
- `drizzle/0011_store_settings.sql` (snapshot `0011`) : `store_settings` (logo data URL, une seule ligne) + ligne par défaut.

## Documentation livrée
- **`CAHIER_DE_RECETTE.md`** : 32 scénarios numérotés (REC-01 → REC-32), procédures, résultats attendus, statuts et suivi des anomalies.
- **`TRACEABILITE.md`** : architecture, modèle de données, flux métier (vente, export, logo, sécurité), matrice exigence → code → recette, commandes et limites.
- **`MANUEL_UTILISATEUR.md`** : guide pratique par rôle (connexion, caisse multi-articles, remboursement, catalogue, stock, exports, paramètres, compte, dépannage), avec l’état des données après vidage.
- **`CODE_COMPLET.md`** (hors dépôt, dans `_archive\boutique-management-system\livraison-20261123\`) : code intégral des fichiers modifiés/créés de la livraison initiale.

## Démarrage local
```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm build    # build de production (tsc inclus)
pnpm exec tsc --noEmit
pnpm db:generate   # nouvelle migration (après modification de db/schema.ts)
pnpm db:migrate    # applique les migrations (no-op si à jour)
pnpm db:backup                    # sauvegarde CSV datée (UTILE avant toute manipulation)
pnpm db:reset-data -- --yes       # vide les données métier, garde les 6 comptes + le logo
pnpm db:seed -- --empty --yes     # (DESTRUCTIF) supprime AUSSI les comptes et recrée les 3 comptes initiaux :
                                  # SEED_DEFAULT_PASSWORD=... requis
```
> `npm` fonctionne aussi ; le dépôt utilise **pnpm** et son `pnpm-lock.yaml` (ne pas mélanger les deux gestionnaires).

## Sécurité en production
- `pnpm db:seed` ne doit **jamais** tourner sur Vercel (destructif) — uniquement en local.
- Tokens Vercel : créer au besoin, **révoquer immédiatement après usage** (Settings → Tokens). Le token de lecture utilisé le 23/11 doit être révoqué.
- Mots de passe commerciaux : rotation à la première connexion par la boutique, transmission hors-ligne.
- Les actions serveur sensibles (upload/suppression du logo, modification de prix, ventes) **revérifient le rôle et la session côté serveur** ; ne jamais se fier à l’interface.
