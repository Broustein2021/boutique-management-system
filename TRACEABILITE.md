# Traçabilité des fonctionnalités et fonctionnement du logiciel

**Version** : 23/11/2026 · **Code de référence** : commit `f1abd4d` + correctif d’encodage du 23/11.  
Ce document explique *comment ça marche* et *où est implémentée chaque exigence*. Il complète `CAHIER_DE_RECETTE.md` (tests) et `MANUEL_UTILISATEUR.md` (usage).

---

## 1. Architecture générale

| Couche | Technologie | Rôle |
|---|---|---|
| Interface | Next.js 16 (App Router, Turbopack), React 19, TypeScript | `app/page.tsx` (serveur) charge les données, `app/atelier-app.tsx` (client) gère l’UI. |
| Styles | Tailwind CSS 4 + `app/globals.css` | Design boutique, responsive, modales, panier, reçu. |
| Écritures | Server Actions (`app/actions.ts`) | Toute mutation passe par une action serveur qui **revérifie session + rôle**. |
| Lecture | Drizzle ORM sur `@neondatabase/serverless` (HTTP) | `lib/data.ts` agrège les données pour le tableau de bord. |
| Authentification | Auth.js v5, JWT, mots de passe scrypt | `lib/auth.ts`, `lib/password.ts`, verrouillage 5 échecs/10 min. |
| Permissions | `lib/permissions.ts` | `can(role, capability)` : `sales`, `customers`, `catalog`, `stock`, `expenses`, `users`, `activity`. |
| PDF | `jspdf@4` + `jspdf-autotable@5` | `lib/pdf.ts` (exports) et génération du reçu dans `app/atelier-app.tsx`. |
| Stockage | PostgreSQL Neon | Données, photos produits **et logo** en `text` (data URL), compatible Vercel (pas de système de fichiers local). |

### Rôles et capacités

| Rôle | sales | customers | catalog | stock | expenses | users | activity |
|---|---|---|---|---|---|---|---|
| Administratrice | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Associée | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Caissière | ✓ | ✓ | — | — | — | — | — |

> La section « Paramètres » est plus restrictive encore : `requireAdmin()` dans `app/actions.ts` (Administratrice uniquement).

---

## 2. Modèle de données

| Table | Contenu | Notes |
|---|---|---|
| `products` | Références, prix vente/achat, stock, seuil, tailles JSON, image, archivage | SKU unique. |
| `customers` | Nom, téléphone, notes | Répertoire client. |
| `invoices` | Une facture = une vente | `customer_name`, `payment_method`, `seller_name`, `item_count`, `total`, `sold_at`. |
| `sales` | **Lignes** de facture | `invoice_id` (FK), produit, quantité, prix unitaire, taille, prix d’achat. |
| `refunds` | Remboursements par ligne | `sale_id` (FK), motif, auteur. |
| `stock_movements` | Traçabilité des stocks | Vente, remboursement, ajustement. |
| `expenses` | Dépenses | Libellé, catégorie, montant, date. |
| `activity_log` | Journal d’activité | Qui a fait quoi, quand. |
| `users` | Comptes | Rôle, statut, hash du mot de passe. |
| `store_settings` | Réglages boutique | Une ligne (`id = 1`) contenant le logo en data URL. |

**Migration `0010_invoices.sql`** : crée `invoices`, ajoute `sales.invoice_id` + index, backfill des ventes existantes (chacune devient une facture d’une ligne), crée `public.create_invoice(...)` puis supprime la colonne temporaire `legacy_sale_id`.  
**Migration `0011_store_settings.sql`** : crée `store_settings` et sa ligne par défaut.

---

## 3. Flux métier principaux

### 3.1 Vente multi-articles (Tâche 1)

1. **Client** (`app/atelier-app.tsx`) : l’utilisateur recherche un produit, l’ajoute au panier avec quantité et taille. Le prix est prérempli depuis le catalogue. Le total est calculé en direct.
2. **Action** (`registerSale`, `app/actions.ts`) :
   - `requireCapability('sales')` ; moyen de paiement dans la liste autorisée.
   - 1 à 100 lignes ; quantité 1–999 ; prix 0–1 000 000.
   - Fusion des doublons **même produit + même taille** (côté client puis côté serveur).
   - Vérification produit actif, taille valide, stock disponible.
   - Le prix n’est modifiable que si `can(role,'catalog') || can(role,'stock')` (Admin/Associée) ; sinon le prix catalogue est forcé.
   - Résolution de la cliente (nom ou id).
3. **Écriture atomique** : `db.execute(sql\`SELECT public.create_invoice(...)\`)`. La fonction PostgreSQL insère la facture, les lignes, décrémente le stock (global ou par taille), écrit les mouvements, puis renvoie `{ invoiceId, total, itemCount, lines }`.  
   > `neon-http` ne supporte pas `db.transaction()` : la transaction est donc portée par la fonction SQL, en un seul appel.
4. **Sortie** : `toReceipt()` construit un `ReceiptData` avec `lines`, `invoiceId`, `invoiceTotal` **et** les champs plats historiques (compatibilité anciens écrans). Activité journalisée, `revalidatePath('/')`.
5. **Remboursement** (`refundSale`) : agit sur **une ligne** (`saleId`), réintègre le stock (et la taille), écrit un mouvement, refuse un doublon. Le comportement historique est conservé.

### 3.2 Exports CSV / PDF (Tâche 2)

- `exportCSV(kind, filters)` et `exportReport()` (`app/actions.ts`) retournent `{ ok, csv, pdf, filename }`.
- Le **CSV** reste construit par `buildCSV()` (BOM UTF-8 `\uFEFF` ajouté côté client).
- Le **PDF** est une structure `ExportTable` (titre, sous-titre, blocs avec colonnes/lignes/totaux) transmise à `buildExportPdf()` (`lib/pdf.ts`).
- `buildExportPdf()` : charge jsPDF/autotable en dynamique, A4 portrait (paysage si > 7 colonnes), en-tête boutique + logo (redimensionné proportionnellement dans 22×16 mm, repli silencieux si corrompu), date `fr-FR`, tableau `grid`, en-tête répété à chaque page, pied « Généré le … · Page x/{total} », totaux en fin de bloc.
- `saveBlob()` (`lib/pdf.ts`) déclenche le téléchargement côté navigateur.

### 3.3 Logo configurable (Tâche 3)

1. **Client** : `resizeLogo()` (`app/atelier-app.tsx`) lit le fichier, refuse > 2 Mo et tout type hors PNG/JPG, dessine sur un canvas 256×256 avec `object-fit: contain` (aucune déformation), exporte en JPEG q0,82 → data URL.
2. **Action `uploadStoreLogo(dataUrl)`** : `requireAdmin()`, validation `imageValue()`, `insert(...).onConflictDoUpdate()` sur `store_settings.id = 1`, activité, `revalidatePath('/')` et `revalidatePath('/login')`.
3. **Action `removeStoreLogo()`** : remet `logo = null` ; l’interface affiche alors le logo livré `/logo.jpg`.
4. **Affichage** : `AppLogo` / `ReceiptMark` (`components/AppLogo.tsx`) reçoivent `src` optionnel ; `getStoreLogo()` (`lib/data.ts`) alimente la page de connexion (via `await connection()` pour exclure le prérendu) et le tableau de bord.
5. Le logo est aussi injecté dans les PDF d’export et le reçu PDF.

### 3.4 Authentification & sécurité

- Session JWT Auth.js ; mot de passe haché avec scrypt ; verrouillage après 5 échecs / 10 minutes.
- Chaque action sensible appelle `auth()` puis interroge la table `users` pour vérifier **rôle ET statut** (un compte suspendu est refusé même avec un JWT valide).
- Les entrées sont validées côté serveur (quantités, prix, types MIME, tailles de fichier, motifs de remboursement).
- `.env.local` (DATABASE_URL, AUTH_SECRET) reste hors git.

---

## 4. Matrice exigence → code → recette

| Exigence | Fichiers | Recette |
|---|---|---|
| Facture multi-articles | `db/schema.ts`, `drizzle/0010_invoices.sql`, `app/actions.ts` (`registerSale`, `toReceipt`), `app/atelier-app.tsx` (panier, reçu), `lib/types.ts` | REC-06 → REC-16 |
| Récupération anciennes ventes | `drizzle/0010_invoices.sql` (backfill), `lib/data.ts` (regroupement par `invoiceId ?? sale.id`) | REC-15 |
| Prix modifiable par rôle | `app/actions.ts` (`can(seller.role,'catalog') || can(...,'stock')`) | REC-09 |
| Export CSV conservé | `app/actions.ts` (`buildCSV`, `exportCSV`, `exportReport`) | REC-17 |
| Export PDF | `lib/pdf.ts`, `app/actions.ts` (`pdf:`), `app/atelier-app.tsx` (`buildExportPdf`) | REC-17 → REC-21 |
| Logo configurable | `drizzle/0011_store_settings.sql`, `app/actions.ts` (`uploadStoreLogo`, `removeStoreLogo`), `lib/data.ts`, `components/AppLogo.tsx`, `app/login/page.tsx`, `app/globals.css` | REC-22 → REC-27 |
| Encodage UTF-8 correct | `app/atelier-app.tsx` (section Paramètres), `app/layout.tsx` (`lang="fr"`) | REC-26 |
| Vidage pour formation | `scripts/reset-business-data.mjs`, `scripts/backup-data.mjs`, `package.json` | REC-30 → REC-32 |
| Documentation | `LIVRAISON.md`, `CAHIER_DE_RECETTE.md`, `TRACEABILITE.md`, `MANUEL_UTILISATEUR.md` | — |

---

## 5. Commandes d’exploitation

```bash
pnpm install
pnpm dev                       # http://localhost:3000
pnpm exec tsc --noEmit
pnpm build
pnpm db:migrate                # applique les 12 migrations (no-op si à jour)
pnpm db:backup                 # sauvegarde CSV datée dans le dossier courant
pnpm db:backup <dossier>       # sauvegarde à un emplacement choisi
pnpm db:reset-data -- --yes    # vide les données métier, garde comptes + logo
pnpm db:seed -- --empty --yes  # (DESTRUCTIF) détruit AUSSI les comptes et recrée les 3 comptes initiaux
```

> ⚠️ `db:reset-data` et `db:seed` ne doivent **jamais** être lancés en production sans sauvegarde préalable. Préférer `db:reset-data` pour une formation : il conserve les comptes existants et leurs mots de passe.

---

## 6. Limites et comportements connus

- 100 lignes maximum par facture ; quantité 1–999 par ligne ; prix unitaire 0–1 000 000 FCFA.
- Un remboursement ne peut s’appliquer qu’**une fois** à une ligne.
- Le logo est limité à 2 Mo, PNG/JPG uniquement, redimensionné à 256 px.
- Les exports PDF utilisent une policeHelvetica standard : les accents français sont rendus via l’encodage Latin-1 de jsPDF (vérifié visuellement).
- Le déploiement Vercel n’est pas encore lié à GitHub ; le token de lecture utilisé pour les vérifications du 23/11 doit être révoqué.
- Local et production partagent la même base Neon : penser à sauvegarder avant toute manipulation.
