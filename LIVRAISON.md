# Livraison — Maison Allure (boutique-management-system)

## État de l'application
- **App** : vente « Maison Allure » — tableau de bord, ventes & caisse, catalogue, stock, clientes & répertoire, dépenses, activités, gestion des comptes.
- **Rôles** : Administratrice / Associée / Caissière (permissions par rôle, comptes suspendus bloqués).
- **Sécurité** : connexion par e-mail + mot de passe (scrypt), verrouillage après 5 échecs / 10 min, session JWT.
- **Tailles** : gestion S/M/L/XL sur les produits de lingerie (édition produit, ajustement par taille, vente avec taille, reçus, remboursement).
- **Base** : PostgreSQL (Neon), migrations Drizzle (10 migrations, journal cohérent).
- **Branches** : le service dev tourne via `npm run dev` sur le port 3000.

## Données en base (état au moment de la remise)
| Chose | Quantité | Commentaire |
|---|---|---|
| Produits (inventaire 02/09) | 62 | issu de `inventaire_AS.pdf`, IDs 383→444 |
| Produits avec tailles | 8 | lingerie/sous-vêtement/body/corset/pyjama |
| Clientes au répertoire | 0 | à repartir de zéro |
| Historique de ventes | 0 | (hors 2 ventes de test, remboursées) |
| Dépenses | 0 | à saisir |

⚠️ **Les tables transactionnelles (clientes, ventes, dépenses) sont vides.** Une seule ressource : l'inventaire des 62 produits du 02/09.

## À faire / à valider AVANT la remise
- [ ] **Purge des ventes de test** (#628/#629 « Caleçons (lot C) » + remboursements) si l'on veut une base de production propre.
- [ ] **Fixer le prix** du produit « Robe + par-dessus en dos » (actuellement 0 FCFA).
- [ ] **Valider les tailles lingerie** : la répartition S/M/L/XL sur les 8 références a été estimée en base — à confirmer (ou saisir) par la boutique.
- [ ] **Photographie du stock** : l'inventaire date du 02/09. Recommandé : saisir un ajustement de stock à la date de la remise (ou l'accepter tel quel).
- [ ] **Saisir l'historique** (clientes, dépenses) si la boutique souhaite repartir d'un état réel.
- [ ] Tests de recette (cf. ci-dessous).

## Comptes et mots de passe
- [ ] Anna Martin — **Administratrice**
- [ ] Khadija Mensah — **Associée**
- [ ] Yasmine Soumah — **Caissière**

> ⚠️ **Jamais de mot de passe dans ce dépôt.** Les mots de passe initiaux sont transmis **en main propre / hors-ligne** ; prévoir leur **changement à la première connexion** (menu Comptes → Changer mon mot de passe).
> Le seed inventaire utilise `SEED_DEFAULT_PASSWORD` (variable d'environnement) — il ne contient aucun mot de passe en dur.

## Scénarios de recette (à rejouer ensemble)
- [ ] Connexion des 3 comptes ; comptes Suspendus => refusés ; 5 échecs => verrouillage 15 min.
- [ ] Vente avec taille : sélection M, panier, encaissement, reçu **écran** + **PDF** (+ impayé WhatsApp).
- [ ] Vente sans connexion d'un produit non taillé ; paiement Carte bancaire / Mobile Money / Espèces.
- [ ] Remboursement → stock réintégré (y compris par taille), activité journalisée.
- [ ] Ajustement de stock par taille ; ajout / modification de produit avec tailles ; seuil « Stock à surveiller ».
- [ ] Export CSV (ventes/produits/dépenses/clientes) avec filtres ; dépenses ; gestion des comptes.
- [ ] Vérification mobile (390×844) : aucune coupure, modales défilables.

## Règles d'exploitation
- [ ] **Ne jamais relancer `npm run db:seed` sans sauvegarde et sans `--yes`** — le seed efface produits, ventes, clientes, dépenses et comptes.
- [ ] `.env.local` (contient `DATABASE_URL`, `AUTH_SECRET`) reste **hors du dépôt git** ; à sauvegarder hors-ligne.
- [ ] `npm run db:migrate` est sûr : no-op sur une base à jour, applique tout sur une base neuve.
- [ ] Chaque ouverture de session d'édition : `npm install` (une seule fois), `npm run dev` → `http://localhost:3000`.

## Démarrage local
```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # build de production
npm run db:generate   # nouvelle migration (après modification de db/schema.ts)
npm run db:migrate    # applique les migrations
npm run db:seed -- --yes  # (DESTRUCTIF) SEED_DEFAULT_PASSWORD=... requis
```

## Déploiement (optionnel)
L'app n'est pas hébergée : elle tourne en local. Pour une mise en ligne (Vercel/Neon), les secrets doivent être fournis via les variables d'environnement de la plateforme — **jamais** dans le code ni dans un `.env` committé.