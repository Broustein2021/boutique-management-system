# Cahier de recette — Atelier de la Séduction

**Version** : 23/11/2026 · **Périmètre** : facturation multi-articles, exports PDF, logo configurable, remise à zéro des données.  
**Environnement de recette** : `pnpm dev` sur `http://localhost:3000`, base Neon partagée avec la production (attention : toute saisie est réelle).  
**Référence** : commit `f1abd4d` + correctifs d’encodage du 23/11/2026.

## Légende des statuts

| Statut | Signification |
|---|---|
| ✅ **OK** | Vérifié (techniquement et/ou par la boutique le 23/11/2026). |
| 🔁 **À rejouer** | Scénario à refaire pendant la formation du 24/11 avec les nouvelles données. |
| ⚠️ **Action requise** | Point non bloquant pour l’application mais à traiter côté infrastructure. |

## Synthèse

- Contrôle utilisateur global du 23/11/2026 : **« tout est bon »** (parcours caisse, reçus, exports, logo).
- Contrôles techniques : `tsc` ✓, `build` ✓, `db:migrate` ✓ (12 migrations), `autotable.finalY` ✓.
- Anomalie trouvée puis corrigée : textes de la section **Paramètres** encodés en mojibake (`ApparaÃ®t`, `reÃ§u`…) → remplacés par UTF-8 correct.
- Remise à zéro exécutée le **23/11/2026 à 14:16 UTC** : toutes les tables métier à 0, séquences remises à 1, 6 comptes et logo conservés. Sauvegarde avant écrasement : `_archive\boutique-management-system\neon-20261123-141552-avant-formation\`.

---

## A. Socle — à ne jamais casser

| ID | Scénario | Procédure | Résultat attendu | Statut |
|---|---|---|---|---|
| REC-01 | Connexion & rôles | Se connecter avec Anna (Admin), Khadija (Associée), Yasmine (Caissière). Puis 5 mots de passe erronés. | Accès selon le rôle ; verrouillage 10 min après 5 échecs ; compte suspendu refusé. | ✅ OK |
| REC-02 | Navigation par rôle | Ouvrir la barre latérale avec chaque profil. | Caissière voit Caisse + Clientes seulement ; Associée voit en plus Catalogue, Stock, Dépenses, Activités ; Admin voit tout, y compris Paramètres et Comptes. | ✅ OK |
| REC-03 | Produit taillé | Créer un produit avec tailles S/M/L/XL et stock par taille. | Tailles visibles au catalogue et au stock ; vente impossible sans taille. | ✅ OK |
| REC-04 | Ajustement de stock | Ajuster le stock d’un produit (et d’une taille). | Stock mis à jour, mouvement journalisé, seuil « à surveiller » calculé. | ✅ OK |
| REC-05 | Remboursement classique | Rembourser une vente. | Stock réintégré (y compris par taille), ligne `refunds`, activité journalisée, doublon refusé. | ✅ OK |

## B. Tâche 1 — Facture multi-articles

| ID | Scénario | Procédure | Résultat attendu | Statut |
|---|---|---|---|---|
| REC-06 | Panier multi-lignes | Caisse → ajouter 3 articles différents. | 3 lignes, sous-totaux et total mis à jour en direct. | ✅ OK |
| REC-07 | Doublon cumulé | Ajouter deux fois le même article + même taille. | Une seule ligne dont la quantité est cumulée (fusion client **et** serveur). | ✅ OK |
| REC-08 | Modifier / supprimer | Changer une quantité de 1 à 3, puis supprimer une ligne. | Total recalculé immédiatement ; bouton « Encaisser » désactivé si plus aucune ligne. | ✅ OK |
| REC-09 | Prix prérempli | Ajouter un article : le prix vient du catalogue. Modifier le prix en Caissière, puis en Admin/Associée. | Caissière : prix forcé au catalogue. Admin/Associée : prix modifiable (0 à 1 000 000). | ✅ OK |
| REC-10 | Contrôles de vente | Tenter quantité 0, quantité > stock, produit archivé, taille oubliée, taille inconnue. | Refus avec message explicite, aucune écriture en base. | ✅ OK |
| REC-11 | Facture vide | Appeler l’encaissement sans ligne (ou contourner l’UI). | Erreur serveur « La facture est vide… ». | ✅ OK |
| REC-12 | Atomicité / concurrence | Deux postes vendent en même temps le dernier article disponible. | Une seule facture créée ; l’autre reçoit « rupture de stock ». | ✅ OK (transaction SQL `create_invoice`) · 🔁 à rejouer |
| REC-13 | Reçu complet | Encaisser une facture à 3 lignes ; ouvrir reçu écran, PDF et impression. | Les 3 lignes et le total apparaissent dans les trois supports. | ✅ OK |
| REC-14 | Remboursement par ligne | Sur une facture à 3 lignes, rembourser une seule ligne. | Stock réintégré pour cette ligne uniquement ; les autres lignes et le total de la facture restent inchangés. | ✅ OK |
| REC-15 | Historique & migration | Consulter les ventes ante-migration. | Anciennes ventes toujours présentes, regroupées en factures mono-ligne (backfill `0010`). | ✅ OK |
| REC-16 | Limite de lignes | Préparer > 100 lignes. | Refus « Trop de lignes sur cette facture (100 maximum) ». | 🔁 À rejouer |

## C. Tâche 2 — Exports CSV / PDF

| ID | Scénario | Procédure | Résultat attendu | Statut |
|---|---|---|---|---|
| REC-17 | Boutons d’export | Sur Ventes, Produits/Stock, Dépenses, Clientes, Rapport : cliquer **CSV** puis **PDF**. | 10 fichiers téléchargés ; CSV identique à l’ancien comportement (BOM UTF-8), PDF lisible. | ✅ OK |
| REC-18 | Contenu PDF | Ouvrir un PDF. | En-tête « ATELIER DE LA SÉDUCTION », boutique · Abidjan, titre, date de génération, tableau, totaux, numéros de page. | ✅ OK |
| REC-19 | Pagination | Générer un PDF avec beaucoup de lignes. | Tableaux paginés, en-tête répété, aucun chevauchement (test `doc.lastAutoTable.finalY` validé sous autotable v5). | ✅ OK (technique) · 🔁 à rejouer |
| REC-20 | PDF sans logo | Supprimer le logo puis générer un PDF. | En-tête texte seul, propre, sans image cassée. | ✅ OK |
| REC-21 | Orientation | Exporter un tableau à plus de 7 colonnes. | PDF automatiquement en paysage. | 🔁 À rejouer |

## D. Tâche 3 — Logo & Paramètres

| ID | Scénario | Procédure | Résultat attendu | Statut |
|---|---|---|---|---|
| REC-22 | Accès Paramètres | Ouvrir la section avec chaque rôle. | Visible uniquement pour l’Administratrice ; appel direct de l’action refusé pour les autres. | ✅ OK |
| REC-23 | Upload PNG / JPG | Importer un PNG puis un JPG. | Aperçu carré, proportions conservées (256 px, JPEG q0,82), logo visible sur connexion, reçu et PDF. | ✅ OK |
| REC-24 | Refus de fichier | Importer un PDF, un GIF ou un fichier > 2 Mo. | Message clair, aucun stockage. | ✅ OK |
| REC-25 | Suppression / repli | Cliquer « Revenir au logo par défaut », recharger la page. | Repli sur `/logo.jpg` partout. | ✅ OK |
| REC-26 | Encodage du texte | Ouvrir Paramètres et lire tous les libellés. | `Paramètres`, `Apparaît`, `reçu`, `écran`, `Traitement…`, `·`, aucun `Ã` ni `â€`. | ✅ OK (corrigé le 23/11) |
| REC-27 | Persistance Vercel | Redéployer puis vérifier le logo. | Logo stocké en base : il survit au redéploiement. | 🔁 À rejouer après mise en production |

## E. Exploitation & données

| ID | Scénario | Procédure | Résultat attendu | Statut |
|---|---|---|---|---|
| REC-28 | Migrations | `pnpm db:migrate` sur base à jour. | No-op ; 12 migrations, `create_invoice()` présente. | ✅ OK |
| REC-29 | Compilation | `pnpm exec tsc --noEmit` puis `pnpm build`. | Aucune erreur ; `/` et `/login` dynamiques. | ✅ OK |
| REC-30 | Sauvegarde | `pnpm db:backup` avant toute manipulation destructive. | Dossier daté avec 10 CSV + journal Drizzle + README. | ✅ OK |
| REC-31 | Remise à zéro | `pnpm db:reset-data -- --yes`. | 0 produit, vente, facture, remboursement, cliente, dépense, mouvement, activité ; séquences à 1 ; 6 comptes et logo conservés. | ✅ OK (exécuté le 23/11 14:16) |
| REC-32 | Reprise après vidage | Se connecter après la remise à zéro, puis créer une vente test. | Connexion OK, caisse OK, premier numéro de facture = 1, dashboard à zéro. | 🔁 À rejouer le 24/11 |

---

## Anomalies et actions

| Date | Anomalie | Traitement | Statut |
|---|---|---|---|
| 23/11 | Textes Paramètres en mojibake (`ApparaÃ®t`, `lâ€™Ã©cran`…). | Remplacement par des chaînes UTF-8 correctes dans `app/atelier-app.tsx` (lignes 1361–1372). | ✅ Corrigé |
| 23/11 | `dynamic = 'force-dynamic'` déprécié dans Next 16. | Remplacé par `await connection()` dans `app/login/page.tsx`. | ✅ Corrigé |
| 23/11 | Lien Vercel ↔ GitHub non finalisé (token lecture seule, 403). | À faire depuis le dashboard Vercel avec un token en écriture. | ⚠️ Action requise |
| 23/11 | Token Vercel exposé (lecture des secrets en clair). | Révoquer immédiatement. | ⚠️ Action requise |
| 23/11 | Nouveau code non déployé en production. | Redéployer (`vercel --prod` ou lien Git). | ⚠️ Action requise |

## Validation

| Rôle | Nom | Date | Signature |
|---|---|---|---|
| Administratrice | Anna Martin | 23/11/2026 | « tout est bon » (contrôle utilisateur global) |
| Recette technique | Assistant | 23/11/2026 | tsc/build/migrations/backup/reset OK |
| Formation | À compléter le 24/11 | | |
