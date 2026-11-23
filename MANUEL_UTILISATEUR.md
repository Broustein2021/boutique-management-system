# Manuel d’utilisation — Atelier de la Séduction

**Version** : 23/11/2026 · Application : *Gestion boutique Atelier de la Séduction*.  
Ce guide est destiné à l’équipe de la boutique (Administratrice, Associée, Caissière).

---

## 1. Se connecter

1. Ouvrir **https://gestionas.vercel.app** (ou `http://localhost:3000` en local).
2. Saisir l’**e-mail** et le **mot de passe** transmis en main propre.
3. Cliquer sur **Se connecter**.

- Après **5 erreurs** de mot de passe, le compte est verrouillé pendant **10 minutes**.
- Un compte **suspendu** ne peut pas se connecter.
- Le logo affiché sur cette page est celui configuré dans **Paramètres** (ou le logo par défaut).

### Changer son mot de passe
Menu **Comptes** → **Changer mon mot de passe** (disponible selon votre rôle). Choisissez un mot de passe conforme aux règles affichées et ne le partagez pas.

---

## 2. Ce que vous pouvez faire selon votre rôle

| Section | Administratrice | Associée | Caissière |
|---|---|---|---|
| Tableau de bord / Caisse | ✓ | ✓ | ✓ |
| Clientes & répertoire | ✓ | ✓ | ✓ |
| Catalogue (ajouter/modifier) | ✓ | ✓ | — |
| Stock / ajustements | ✓ | ✓ | — |
| Dépenses | ✓ | ✓ | — |
| Rapports & exports | ✓ | ✓ | — |
| Journal d’activité | ✓ | ✓ | — |
| Comptes utilisateurs | ✓ | — | — |
| Paramètres (logo) | ✓ | — | — |

Si une section n’apparaît pas dans le menu latéral, c’est que votre rôle n’y a pas accès.

---

## 3. Vendre avec une facture multi-articles (caisse)

C’est le parcours principal.

1. Ouvrir **Ventes & caisse**.
2. Dans la zone de recherche, taper le nom ou la référence d’un produit, puis cliquer sur le produit voulu.
3. Pour un produit **avec tailles** (S/M/L/XL) : choisir la taille dans la liste.
4. Ajuster la **quantité**. Le prix unitaire est rempli automatiquement depuis le catalogue.
   - Si vous êtes **Administratrice ou Associée**, vous pouvez modifier ce prix (ex. prix spécial).
   - Si vous êtes **Caissière**, le prix reste celui du catalogue.
5. Cliquer sur **Ajouter au panier**. Répéter pour chaque article.
   - Si vous ajoutez deux fois le même article et la même taille, les quantités sont **fusionnées** sur une seule ligne.
6. Vérifier le **sous-total** de chaque ligne et le **total** en bas du panier.
   - Pour changer une quantité : utiliser les boutons `+ / −` ou le champ quantité.
   - Pour retirer un article : cliquer sur l’icône **corbeille**.
7. Choisir la **cliente** (facultatif : recherche dans le répertoire, ou nom libre).
8. Choisir le **moyen de paiement** : Espèces, Carte bancaire ou Mobile Money.
9. Cliquer sur **Encaisser**.

### Contrôles automatiques
La vente est refusée si : le panier est vide, la quantité est invalide, le stock est insuffisant, le produit est archivé, la taille est manquante ou inconnue, ou le prix est hors limites. Un message explique le problème : corrigez puis réessayez.

### Après l’encaissement
Le **reçu** s’affiche avec toutes les lignes :
- **PDF** : télécharge le reçu en PDF.
- **Imprimer** : ouvre l’impression du reçu.
- Le stock est décrémenté automatiquement (et par taille pour les articles taillés).

---

## 4. Rembourser un article

1. Ouvrir **Ventes & caisse** → historique des ventes.
2. Repérer la ligne à rembourser (dans une facture, chaque article est une ligne distincte).
3. Cliquer sur **Rembourser**, choisir un **motif**, confirmer.
4. Le stock de cet article est réintégré (et sa taille le cas échéant). Les autres lignes de la facture restent inchangées.

> Une ligne ne peut être remboursée qu’**une seule fois**.

---

## 5. Gérer le catalogue

 Réservé à l’**Administratrice** et à l’**Associée**.

- **Ajouter un produit** : bouton en haut de **Catalogue** → renseigner nom, référence (SKU), catégorie, prix de vente, prix d’achat, stock, seuil d’alerte, photo.
- **Tailles** : sur un produit de lingerie, activer les tailles S/M/L/XL et indiquer le stock de chaque taille.
- **Modifier / archiver** : menu `…` sur la fiche produit. Un produit archivé n’est plus vendable mais reste dans l’historique.
- **Importer** : bouton **Importer** → fichier CSV au format attendu (voir l’exemple exporté).
- **Exporter** : boutons **CSV** et **PDF**.

---

## 6. Gérer le stock

 Réservé à l’**Administratrice** et à l’**Associée**.

- La page **Stock** affiche le stock disponible, le seuil minimum et les alertes « Stock à surveiller ».
- **Ajuster le stock** : indiquer le nombre d’unités à ajouter ou retirer, et un motif.
- Chaque ajustement est enregistré dans le journal d’activité.

---

## 7. Clientes, dépenses, rapports

- **Clientes & répertoire** : ajouter une cliente (nom, téléphone, notes), la retrouver lors d’une vente, anonymiser ses données si besoin.
- **Dépenses** : saisir libellé, catégorie, montant et date.
- **Rapports** : consulter les indicateurs et exporter en **CSV** ou **PDF**.
- Les exports sont disponibles aussi depuis Ventes, Catalogue/Stock, Dépenses et Clientes. Chaque bouton télécharge un fichier daté.

### Le PDF contient
En-tête avec le logo de la boutique, le titre du document, la date de génération, un tableau (paginé si nécessaire) et les totaux. Le **CSV** reste disponible si vous devez retravailler les données dans un tableur (encodage UTF-8, compatible Excel).

---

## 8. Paramètres — logo de la boutique

 Réservé à l’**Administratrice**.

1. Ouvrir **Paramètres** dans le menu latéral.
2. Cliquer sur **Importer un logo** puis choisir une image **PNG ou JPG** de **2 Mo maximum**.
3. L’image est automatiquement redimensionnée à 256 px **sans déformation** ; un aperçu s’affiche.
4. Le logo apparaît ensuite sur :
   - la page de connexion,
   - le reçu (écran, PDF et impression),
   - tous les exports PDF.
5. Pour revenir au logo d’origine : **Revenir au logo par défaut**.

> Le logo est enregistré dans la base de données : il reste en place même après un redéploiement de l’application.

---

## 9. Comptes utilisateurs

 Réservé à l’**Administratrice**.

- Créer un compte : nom, e-mail, rôle, statut.
- Modifier le rôle ou suspendre/réactiver un compte.
- Réinitialiser le mot de passe d’une collègue (nouveau mot de passe à transmettre **hors ligne**).
- Le journal **Activités** permet de voir qui a fait quoi.

---

## 10. État des données au 24/11/2026 (formation)

La base a été **vidée le 23/11/2026** pour repartir de zéro :

| Élément | État |
|---|---|
| Produits | 0 |
| Factures / ventes | 0 |
| Remboursements | 0 |
| Clientes | 0 |
| Dépenses | 0 |
| Mouvements de stock | 0 |
| Journal d’activité | 0 |
| Comptes utilisateurs | 6 (conservés, mots de passe inchangés) |
| Logo boutique | Conservé (ou logo par défaut) |

Vous pouvez donc saisir librement les nouvelles données de la formation. Les numéros de factures recommencent à **1**.

> ⚠️ L’environnement local et le site en ligne utilisent **la même base** : une saisie de test apparaît immédiatement sur le site de production.

---

## 11. Dépannage rapide

| Symptôme | Cause probable | Solution |
|---|---|---|
| « Connexion refusée / compte verrouillé » | 5 échecs de mot de passe | Attendre 10 min ou demander une réinitialisation à l’Admin. |
| « Stock insuffisant » | Stock réel trop bas | Faire un ajustement de stock (Associée/Admin) puis réessayer. |
| « Taille manquante » | Produit taillé sans taille choisie | Sélectionner la taille avant d’ajouter au panier. |
| Reçu PDF illisible / vide | Logo corrompu | Le PDF reste généré sans logo ; supprimer et réimporter le logo dans Paramètres. |
| Export PDF ne se télécharge pas | Bloqueur de téléchargements | Autoriser les téléchargements pour le site puis réessayer. |
| Page blanche au chargement | Compilation en cours (local) | Attendre quelques secondes et recharger. |

---

## 12. Bonnes pratiques

- Ne jamais partager son mot de passe ; le changer à la première connexion.
- Vérifier le **total du panier** avant d’encaisser.
- Utiliser le **reçu PDF** pour l’archivage et l’impression pour la cliente.
- Faire un **export CSV** régulier des ventes pour conservation hors ligne.
- Après la formation, refaire une **sauvegarde** avant toute remise à zéro (`pnpm db:backup` côté technique).
