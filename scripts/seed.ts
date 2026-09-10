import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw = readFileSync(join(root, '.env.local'), 'utf8')
const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith('DATABASE_URL='))
if (!line) throw new Error('DATABASE_URL introuvable dans .env.local')
process.env.DATABASE_URL = line.slice(line.indexOf('=') + 1).trim()

const { neon } = await import('@neondatabase/serverless')
const { drizzle } = await import('drizzle-orm/neon-http')
const {
  activityLog,
  customers,
  products,
  refunds,
  sales,
  stockMovements,
  expenses,
  users,
} = await import('../db/schema.ts')
const { hashPassword } = await import('../lib/password.ts')

const db = drizzle(neon(process.env.DATABASE_URL))

const demo = process.argv.includes('--demo')
const empty = process.argv.includes('--empty')
const force = process.argv.includes('--yes')

const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? null
if (!DEFAULT_PASSWORD) {
  console.error('✗ SEED_DEFAULT_PASSWORD manquant. Exemple : SEED_DEFAULT_PASSWORD=MonMotDePasse12! npm run db:seed -- --yes')
  process.exit(1)
}
if (!force) {
  console.error('✗ Action bloquée par sécurité : le seed SUPPRIME toutes les données existantes (ventes, clientes, dépenses, produits, comptes) avant de réinsérer l’inventaire.')
  console.error('  Si vous assumez cette réinitialisation, relancez avec le drapeau --yes.')
  console.error('    SEED_DEFAULT_PASSWORD=MonMotDePasse12! npm run db:seed -- --yes')
  process.exit(1)
}

const CATEGORY_CODE: Record<string, string> = {
  Ensemble: 'ENS',
  Robe: 'ROB',
  Bijou: 'BIJ',
  Lingerie: 'LIN',
  'Sous-vêtement': 'SOV',
  Haut: 'HAU',
  Accessoire: 'ACC',
  'Par-dessus': 'PAR',
  Body: 'BOD',
  Corset: 'COR',
  Pyjama: 'PYJ',
}

const COLORS = ['rose', 'plum', 'gold', 'mauve', 'peach']
const MIN_STOCK_PORTION = 0.2

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('') || 'MA'

// Inventaire du 02/09 — extrait d'inventaire_AS.pdf
// Format : [catégorie, produit, quantité, prix unitaire FCFA]
const inventory: [string, string, number, number][] = [
  ['Ensemble', 'Ensemble Pyjamas rouge', 2, 40000],
  ['Ensemble', 'Ensemble Pantalon Chemise dentelle dans le dos', 5, 40000],
  ['Ensemble', 'Ensemble 3 pièces rouge sang', 1, 40000],
  ['Ensemble', 'Ensemble style chinois 2 pièces (1 rose, 1 beige)', 2, 40000],
  ['Ensemble', 'Ensemble (générique, non nommé)', 4, 40000],
  ['Ensemble', 'Ensemble 3 pièces culotte', 1, 30000],
  ['Ensemble', 'Ensemble culotte rose', 1, 20000],
  ['Ensemble', 'Ensemble mixte 2 pièces', 2, 50000],
  ['Ensemble', 'Ensemble marron', 1, 40000],
  ['Ensemble', 'Ensemble noir', 1, 40000],
  ['Ensemble', 'Ensemble rouge pantalon 2 pièces', 1, 35000],
  ['Ensemble', 'Ensemble rouge pantalon 3 pièces', 1, 40000],
  ['Ensemble', 'Ensemble culotte blanche', 4, 40000],
  ['Ensemble', 'Ensemble culotte léopard', 4, 40000],
  ['Ensemble', 'Ensemble simple culotte bleu/noir/kaki', 17, 20000],
  ['Ensemble', 'Ensemble manche longue blanc', 2, 45000],
  ['Ensemble', 'Ensemble manche longue noir', 3, 45000],
  ['Robe', 'Petite robe rouge et noir', 5, 20000],
  ['Ensemble', 'Ensemble rouge bordeaux par-dessus et robe', 1, 45000],
  ['Ensemble', 'Ensemble léopard robe et par-dessus', 2, 45000],
  ['Ensemble', 'Ensemble 3 pièces (2 roses, 1 beige)', 3, 50000],
  ['Ensemble', 'Ensemble par-dessus et robes (2 roses, 2 noires)', 4, 45000],
  ['Ensemble', 'Ensemble bader (2 noirs, 2 beige, 3 rouges)', 7, 30000],
  ['Bijou', 'Boucles d’oreilles', 177, 5000],
  ['Bijou', 'Bagues', 202, 5000],
  ['Bijou', 'Bracelets (lot 1)', 83, 10000],
  ['Bijou', 'Bracelets (lot 2)', 15, 5000],
  ['Bijou', 'Bayas', 159, 5000],
  ['Lingerie', 'Lingeries (en cartons)', 37, 10000],
  ['Sous-vêtement', 'Caleçons (lot A)', 241, 5000],
  ['Sous-vêtement', 'Caleçons (lot B)', 184, 4000],
  ['Sous-vêtement', 'Caleçons (lot C)', 494, 2500],
  ['Ensemble', 'Ensemble à bretelle rouge', 6, 20000],
  ['Ensemble', 'Ensemble à bretelle marron', 5, 20000],
  ['Ensemble', 'Ensemble en corset noir', 1, 20000],
  ['Ensemble', 'Ensemble soutien-caleçon', 2, 15000],
  ['Ensemble', 'Ensemble strié 2 pièces', 2, 15000],
  ['Haut', 'Long tee-shirt', 7, 10000],
  ['Accessoire', 'Long paréo', 14, 60000],
  ['Ensemble', 'Ensemble rose/noir paréo + robe noire', 2, 60000],
  ['Par-dessus', 'Par-dessus court blanc et noir', 4, 25000],
  ['Par-dessus', 'Par-dessus simple terracotta', 1, 25000],
  ['Ensemble', 'Ensemble culotte verte', 5, 40000],
  ['Ensemble', 'Ensemble culotte léopard (2e lot)', 4, 45000],
  ['Ensemble', 'Ensemble culotte terracotta', 3, 40000],
  ['Ensemble', 'Ensemble culotte noire (2e lot)', 2, 40000],
  ['Robe', 'Robe + par-dessus blanc', 5, 50000],
  ['Ensemble', 'Ensemble culotte en dentelle', 3, 35000],
  ['Robe', 'Robe + par-dessus en dos', 3, 0],
  ['Ensemble', 'Ensemble soutien', 1, 20000],
  ['Body', 'Body suit', 18, 10000],
  ['Ensemble', 'Ensembles soutiens & caleçons rembourrés', 116, 10000],
  ['Corset', 'Corsets', 12, 20000],
  ['Ensemble', 'Ensembles soutiens', 54, 15000],
  ['Robe', 'Longue robe blanche', 1, 30000],
  ['Robe', 'Longue robe noire', 4, 25000],
  ['Pyjama', 'Pyjama bleu', 1, 35000],
  ['Robe', 'Robe noire', 1, 15000],
  ['Ensemble', 'Ensemble papillons', 2, 40000],
  ['Robe', 'Petite robe avec string', 11, 20000],
  ['Robe', 'Petites robes à 15.000 (lot)', 35, 15000],
  ['Sous-vêtement', 'Culotte simple', 21, 5000],
]

const now = new Date()
const dayAt = (daysAgo: number, hour: number, minute = 0) => {
  const d = new Date(now)
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, minute, 0, 0)
  return d
}

const cleanName = (category: string, product: string) => {
  const tokens = product.trim().split(/\s+/)
  const remaining = tokens.slice(1)
  const first = remaining[0] ?? ''
  const isCleanable =
    tokens[0].toLowerCase() === category.toLowerCase() &&
    remaining.length >= 2 &&
    /^[a-zA-ZÀ-ÿ0-9]/.test(first)
  return isCleanable ? remaining.join(' ') : product.trim()
}

console.log('→ Vidage des tables…')
await db.delete(activityLog)
await db.delete(refunds)
await db.delete(sales)
await db.delete(customers)
await db.delete(stockMovements)
await db.delete(expenses)
await db.delete(products)
await db.delete(users)

let productRows: (typeof products.$inferSelect)[] = []
if (!empty) {
  console.log(`→ Import de l’inventaire (${inventory.length} références)…`)
  const seq = new Map<string, number>()
  const productValues = inventory.map(([category, product, quantity, price], index) => {
    const code = CATEGORY_CODE[category] ?? 'ART'
    const next = (seq.get(code) ?? 0) + 1
    seq.set(code, next)
    const name = cleanName(category, product)
    return {
      name,
      sku: `${code}-${String(next).padStart(3, '0')}`,
      category,
      price,
      purchasePrice: price > 0 ? Math.round(price * 0.5) : 0,
      stock: quantity,
      minStock: Math.max(3, Math.ceil(quantity * MIN_STOCK_PORTION)),
      color: COLORS[index % COLORS.length],
      initials: initialsOf(name),
    }
  })

  productRows = await db.insert(products).values(productValues).returning()
  const totalStockValue = productRows.reduce((sum, p) => sum + p.price * p.stock, 0)
  console.log(`→ ${productRows.length} produits insérés, valeur de stock ${totalStockValue.toLocaleString('fr-FR')} FCFA`)

  console.log('→ Mouvements de stock initiaux…')
  await db.insert(stockMovements).values(
    productRows.map((p) => ({
      productId: p.id,
      change: p.stock,
      reason: 'Stock initial (inventaire du 02/09)',
      createdAt: dayAt(7, 9),
    })),
  )
} else {
  console.log('→ Mode --empty : catalogue vierge, aucun produit inséré.')
}

if (demo && !empty) {
  const customers = [
    'Camille Dupont', 'Nina Kouassi', 'Sarah Martin', 'Aïcha Diallo', 'Fatou Ndiaye',
    'Grace Okonjo', 'Léa Moreau', 'Mariam Koné', 'Clara Dubois', 'Inès Traoré',
  ]
  const methods = ['Espèces', 'Carte bancaire', 'Mobile Money']

  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]

  console.log('→ Ventes démo des 30 derniers jours…')
  const saleValues: (typeof sales.$inferInsert)[] = []
  for (let daysAgo = 0; daysAgo < 30; daysAgo++) {
    const count = 1 + Math.floor(Math.random() * 6)
    for (let i = 0; i < count; i++) {
      const product = pick(productRows.filter((p) => p.stock > 0))
      saleValues.push({
        productId: product.id,
        customerName: pick(customers),
        quantity: 1,
        unitPrice: product.price,
        purchasePrice: product.purchasePrice,
        paymentMethod: pick(methods),
        soldAt: dayAt(daysAgo, 9 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 60)),
      })
    }
  }
  await db.insert(sales).values(saleValues)
  console.log(`→ ${saleValues.length} ventes démo insérées`)

  console.log('→ Dépenses démo…')
  await db.insert(expenses).values([
    { label: 'Loyer boutique', category: 'Immobilier', amount: 250000, date: dayAt(8, 8) },
    { label: 'Réassort fournisseur', category: 'Achats', amount: 180000, date: dayAt(6, 10) },
    { label: 'Sac et emballages', category: 'Fournitures', amount: 35000, date: dayAt(3, 11) },
    { label: 'Publicité Instagram', category: 'Marketing', amount: 20000, date: dayAt(1, 15) },
    { label: 'Électricité & eau', category: 'Charges', amount: 42500, date: dayAt(34, 9) },
    { label: 'Réassort fournisseur', category: 'Achats', amount: 212000, date: dayAt(27, 10) },
  ])
}

console.log('→ Équipe…')
const team = [
  { name: 'Anna Martin', email: 'anna@atelierseduction.ci', role: 'Administratrice', initials: 'AM' },
  { name: 'Khadija Mensah', email: 'khadija@atelierseduction.ci', role: 'Associée', initials: 'KM' },
  { name: 'Yasmine Soumah', email: 'yasmine@atelierseduction.ci', role: 'Caissière', initials: 'YS' },
]
await db.insert(users).values(
  await Promise.all(
    team.map(async (member) => ({
      ...member,
      status: 'Actif',
      passwordHash: await hashPassword(DEFAULT_PASSWORD),
    })),
  ),
)
console.log(`✓ ${team.length} comptes créés (mot de passe fourni via SEED_DEFAULT_PASSWORD)`)

const finalProducts = await db.select().from(products)
const totalStock = finalProducts.reduce((s, p) => s + p.stock, 0)
const lowStock = finalProducts.filter((p) => p.stock <= p.minStock).length
const value = finalProducts.reduce((s, p) => s + p.price * p.stock, 0)
const costValue = finalProducts.reduce((s, p) => s + p.purchasePrice * p.stock, 0)
console.log(`✓ Seed terminé — ${finalProducts.length} références, ${totalStock} unités, ${lowStock} sous le seuil, valeur (vente) ${value.toLocaleString('fr-FR')} / (coût) ${costValue.toLocaleString('fr-FR')} FCFA`)
console.log('ℹ Les produits de lingerie sont créés SANS tailles (S/M/L/XL) — à renseigner ensuite depuis l’application (modal produit).')
process.exit(0)