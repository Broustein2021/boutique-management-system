# Livraison — Atelier de la Séduction (boutique-management-system)

## État de l'application
- **App** : vente « Atelier de la Séduction » — tableau de bord, ventes & caisse, catalogue, stock, clientes & répertoire, dépenses, activités, gestion des comptes.
- **Rôles** : Administratrice / Associée / Caissière (permissions par rôle, comptes suspendus bloqués).
- **Sécurité** : connexion par e-mail + mot de passe (scrypt), verrouillage après 5 échecs / 10 min, session JWT.
- **Tailles** : gestion S/M/L/XL sur les produits à tailles (édition produit avec photo, ajustement par taille, vente avec taille, reçus, remboursement).
- **Base** : PostgreSQL (Neon), migrations Drizzle (10 migrations, journal cohérent depuis le 23/11/2026).
- **Branches** : le service dev tourne via `npm run dev` sur le port 3000.

## Données en base — état historique (remise du 10/09/2026)
| Chose | Quantité | Commentaire |
|---|---|---|
| Produits | 0 | **base rendue vierge le 10/09** (décision : repartir de l'inventaire réel, avec photos, valeurs et références) |
| Clientes au répertoire | 0 | à constituer |
| Historique de ventes | 0 | à partir de la reprise d'activité |
| Dépenses | 0 | à saisir |
| Comptes utilisateurs | 3 | Anna (Admin) · Khadija (Associée) · Yasmine (Caissière) |

> **Principe** : l'inventaire du 02/09 (62 références, y compris les 8 lingerie à tailles estimées et le produit « Robe + par-dessus en dos » à prix 0) a été **entièrement supprimé** car ce sont des données de démonstration. La boutique saisit désormais son vrai stock directement dans l'application.

## État réel de production (vérifié le 23/11/2026)
| Chose | Quantité | Commentaire |
|---|---|---|
| Produits | 36 | Stock réel saisi par la boutique (plus aucune donnée de démo) |
| Clientes au répertoire | 1 | |
| Historique de ventes | 7 | |
| Dépenses | 0 | |
| Comptes utilisateurs | 6 | 3 comptes initiaux + comptes créés depuis la reprise |
| Période d'activité | 27/10 → 20/11/2026 | Date de la première à la dernière opération relevée |

> Ce tableau remplace, pour le suivi courant, l'état « base vierge » du 10/09 ci-dessus : la boutique a repris son activité sur l'application déployée.

## Avant de remettre à la boutique
- [ ] **Transmettre les mots de passe initiaux en main propre** (jamais par ce dépôt).
- [ ] **Photographier et saisir le stock réel** : Catalogue → Ajouter un produit (photo, prix, coût d'achat, stock, seuil min., tailles si lingerie).
- [ ] Décision boutique : **hébergement** (local sur poste boutique vs mise en ligne) — voir « Déploiement ».
- [ ] Tests de recette (cf. ci-dessous).

## Comptes et mots de passe
- [ ] Anna Martin — **Administratrice**
- [ ] Khadija Mensah — **Associée**
- [ ] Yasmine Soumah — **Caissière**

> ⚠️ **Jamais de mot de passe dans ce dépôt.** Les mots de passe initiaux sont transmis **en main propre / hors-ligne** ; prévoir leur **changement à la première connexion** (menu Comptes → Changer mon mot de passe).
> Le seed administrateur utilise `SEED_DEFAULT_PASSWORD` (variable d'environnement) — aucun mot de passe en dur dans le code.

## Scénarios de recette (à rejouer ensemble)
- [ ] Connexion des 3 comptes ; comptes Suspendus => refusés ; 5 échecs => verrouillage 15 min.
- [ ] Ajout d'un produit **avec photo et tailles** (S/M/L/XL) → visible au catalogue, colonne « TAILLES » au stock.
- [ ] Vente avec taille : sélection M, panier, encaissement, reçu **écran** + **PDF** (+ impayé WhatsApp).
- [ ] Vente d'un produit non taillé ; paiement Carte bancaire / Mobile Money / Espèces.
- [ ] Remboursement → stock réintégré (y compris par taille), activité journalisée.
- [ ] Ajustement de stock par taille ; seuil « Stock à surveiller » ; archivage d'un article.
- [ ] Import / Export CSV (ventes/produits/dépenses/clientes) avec filtres ; dépenses ; gestion des comptes.
- [ ] Vérification mobile (390×844) : aucune coupure, modales défilables.

## Règles d'exploitation
- [ ] **Ne jamais relancer `npm run db:seed` sans sauvegarde** — le seed standard efface TOUT (produits, ventes, clientes, dépenses et comptes) puis réimporte l'inventaire de démo.
- [ ] **`npm run db:seed -- --empty --yes`** : remet proprement la base **vierge** (0 produit, 0 vente, 0 dépense) tout en **conservant les 3 comptes** — à utiliser pour repartir d'un état neuf.
- [ ] `.env.local` (contient `DATABASE_URL`, `AUTH_SECRET`) reste **hors du dépôt git** ; à sauvegarder hors-ligne.
- [ ] `npm run db:migrate` est sûr : no-op sur une base à jour, applique tout sur une base neuve.
- [ ] Chaque ouverture de session d'édition : `npm install` (une seule fois), `npm run dev` → `http://localhost:3000`.

## Production — lien client
- **URL officielle : https://gestionas.vercel.app** (projet Vercel « gestionas », vérifiée le 10/09/2026 puis le 23/11/2026 : connexion, tableau de bord, ventes & produits OK, aucune erreur console).
- Variables d'environnement définies sur Vercel (Production/Preview/Development), copiées depuis `.env.local` : `DATABASE_URL`, `AUTH_SECRET` — **jamais** committées.
- La « Deployment Protection » (authentification Vercel) a été **désactivée** pour que les clientes accèdent sans compte Vercel.
- ⚠️ `boutique-management-system.vercel.app` n'est **pas** notre app (nom global déjà pris par un autre projet) — ne jamais donner ce lien.
- Les données restent hébergées par Neon (base partagée local ↔ production) ; photos produits stockées en base.
- Redéploiement : dans ce dossier, `vercel --prod` (nécessite un token Vercel, révocable). Optionnel : connecter GitHub (*Settings → Git*) pour un déploiement automatique à chaque `git push`.

### Vérification du 23/11/2026 (API Vercel, lecture seule)
- Projet Vercel `gestionas` (Next.js) : **3 déploiements `READY`** en production, tous sur le commit `b3a4c68d42c2004cc43e188d5e6817598cc094e2`, identique au `HEAD` local. Le plus récent date du **27/10/2026 09:51 UTC**.
- Alias relevés : `gestionas-sdtmici-services.vercel.app` et `boutique-management-system-ashen.vercel.app`.
- `DATABASE_URL` et `AUTH_SECRET` présents sur Vercel : après déchiffrement via l'API, **identiques** à ceux de `.env.local` (même endpoint Neon `ep-wild-sky-ayeobzgc-pooler...`, même base `neondb`, même utilisateur, même mot de passe).
- `DATABASE_URL` modifiée sur Vercel le **27/10/2026 09:49 UTC**, juste avant le redéploiement (09:51) et la reprise des données dans Neon (09:55) : chronologie cohérente.
- Le projet Vercel n'était **pas lié à GitHub** (déploiements manuels via `vercel --prod`) ; la connexion au dépôt `Broustein2021/boutique-management-system` a été tentée le 23/11/2026 mais reste à finaliser avec un token en écriture (voir « Suivi des mises à jour »).
- ⚠️ Le token Vercel utilisé pour ces vérifications doit être **révoqué** après usage (il permet de lire les secrets en clair).

## Suivi des mises à jour (23/11/2026)
- **GitHub** : premier push effectué le 23/11/2026 (commit `e3f67a0819fc08188f5948e78224c1321fb1a6f6`, suivi d'un commit de statut). Le dépôt `Broustein2021/boutique-management-system` est passé de **0 à 6 commits** et n'est plus vide.
- **Lien Vercel ↔ GitHub** : **non finalisé**. Le token fourni est en lecture seule : `POST /v9/projects/{id}/link` et `PATCH /v9/projects/{id}` répondent `403 Forbidden / Not authorized`. À faire depuis le dashboard Vercel : *Settings → Git → Connect Git Repository* → `Broustein2021/boutique-management-system`, branche de production `main`, puis vérifier qu'un déploiement se déclenche sur un `git push`.
- **Sauvegarde Neon** : export logique complet (CSV de toutes les tables + 10 migrations + journal) dans `_archive\boutique-management-system\neon-20261123-115435-logique\`. Le `pg_dump` local (v17) ne peut pas dumper un serveur v18, d'où le format CSV.
- **Journal Drizzle** : la migration `0008_add_customers` était absente des 9 entrées de `drizzle.__drizzle_migrations` alors que la table `customers` et `sales.customer_id` existaient déjà. Elle a été **réconciliée** le 23/11/2026 par ajout de son empreinte SHA256 (`cfbaeb84e86069dac8bf635205feb6e3e8ebd35d75dcd907ca6a1604a8b03c0b`) avec l'horodatage du journal local — **sans réexécuter son SQL**. Le journal contient désormais **10 entrées**, dont les hashes correspondent exactement aux 10 fichiers `drizzle/*.sql` locaux.
- **Conséquence** : `npm run db:migrate` est de nouveau sûr (no-op) sur cette base. `npm run db:seed` reste **destructif** et interdit en production.

## Démarrage local
```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # build de production
npm run db:generate   # nouvelle migration (après modification de db/schema.ts)
npm run db:migrate    # applique les migrations
npm run db:seed -- --empty --yes   # (DESTRUCTIF) base vierge, garde les 3 comptes ; SEED_DEFAULT_PASSWORD=... requis
```

## Sécurité en production
- `npm run db:seed` ne doit **jamais** tourner sur Vercel (destructif) — uniquement en local.
- Tokens Vercel : créer au besoin, **révoquer immédiatement après usage** (Settings → Tokens).
- Mots de passe commerciaux : rotation à la première connexion par la boutique, transmission hors-ligne.