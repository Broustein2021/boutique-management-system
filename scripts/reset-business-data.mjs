// Remise à zéro des données métier uniquement.
// Conservés : comptes utilisateurs (mots de passe) et réglages boutique (logo).
// Supprimés : factures, ventes, remboursements, mouvements de stock, produits,
//             clientes, dépenses, journal d'activité. Les numéros sont remis à 1.
// Usage : node scripts/reset-business-data.mjs --yes
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (!process.argv.includes('--yes')) {
  console.error('✗ Action destructive : relance avec --yes pour vider les données métier.')
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = readFileSync(join(root, '.env.local'), 'utf8')
const line = env.split(/\r?\n/).find((l) => l.trim().startsWith('DATABASE_URL='))
if (!line) throw new Error('DATABASE_URL introuvable dans .env.local')
const url = line.slice(line.indexOf('=') + 1).trim()

const { neon } = await import('@neondatabase/serverless')
const sql = neon(url)

const businessTables = [
  'products',
  'customers',
  'invoices',
  'sales',
  'refunds',
  'stock_movements',
  'expenses',
  'activity_log',
]

const counts = async () => {
  const result = {}
  for (const table of businessTables) {
    const rows = await sql.query(`select count(*)::int as n from "public"."${table}"`)
    result[table] = rows[0].n
  }
  return result
}

console.log('→ État avant :', JSON.stringify(await counts()))

// Ordre imposé par les clés étrangères : refunds → sales → invoices → stock → divers → produits.
for (const table of [
  'refunds',
  'sales',
  'invoices',
  'stock_movements',
  'activity_log',
  'customers',
  'expenses',
  'products',
]) {
  await sql.query(`delete from "public"."${table}"`)
  console.log(`  vidé : ${table}`)
}

for (const table of businessTables) {
  const seqRows = await sql.query(`select pg_get_serial_sequence('public.${table}', 'id') as seq`)
  const seq = seqRows[0]?.seq
  if (seq) await sql.query(`alter sequence ${seq} restart with 1`)
}
console.log('→ Séquences remises à 1.')

console.log('→ État après :', JSON.stringify(await counts()))
const kept = {
  users: (await sql.query('select count(*)::int as n from "public"."users"'))[0].n,
  store_settings: (await sql.query('select count(*)::int as n from "public"."store_settings"'))[0].n,
}
console.log('→ Conservés :', JSON.stringify(kept))
