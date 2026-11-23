// Sauvegarde logique (CSV) de toutes les tables applicatives — compatible Neon HTTP.
// Usage : node scripts/backup-data.mjs [dossier de sortie]
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = readFileSync(join(root, '.env.local'), 'utf8')
const line = env.split(/\r?\n/).find((l) => l.trim().startsWith('DATABASE_URL='))
if (!line) throw new Error('DATABASE_URL introuvable dans .env.local')
const url = line.slice(line.indexOf('=') + 1).trim()
const { neon } = await import('@neondatabase/serverless')
const sql = neon(url)

const out = resolve(process.argv[2] ?? join(root, 'tmp-backup'))
mkdirSync(out, { recursive: true })

const tables = [
  'products',
  'customers',
  'invoices',
  'sales',
  'refunds',
  'stock_movements',
  'expenses',
  'activity_log',
  'users',
  'store_settings',
]

const csvCell = (value) => {
  if (value === null || value === undefined) return ''
  let text
  if (value instanceof Date) text = value.toISOString()
  else if (typeof value === 'object') text = JSON.stringify(value)
  else text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const counts = {}
for (const table of tables) {
  const rows = await sql.query(`select * from "public"."${table}" order by id`)
  counts[table] = rows.length
  if (rows.length === 0) {
    writeFileSync(join(out, `${table}.csv`), '', 'utf8')
    continue
  }
  const headers = Object.keys(rows[0])
  const body = rows.map((row) => headers.map((h) => csvCell(row[h])).join(',')).join('\r\n')
  writeFileSync(join(out, `${table}.csv`), `${headers.join(',')}\r\n${body}\r\n`, 'utf8')
}

const migrations = await sql.query('select id, created_at, hash from drizzle.__drizzle_migrations order by id')
writeFileSync(
  join(out, 'drizzle_migrations.csv'),
  `id,created_at,hash\r\n${migrations.map((m) => `${m.id},${m.created_at},${m.hash}`).join('\r\n')}\r\n`,
  'utf8',
)

const readme = [
  'Sauvegarde logique Neon — Atelier de la Séduction',
  `Générée le : ${new Date().toISOString()}`,
  `Base : ${url.replace(/:[^:@]+@/, ':***@')}`,
  '',
  'Lignes exportées :',
  ...Object.entries(counts).map(([table, n]) => `- ${table}: ${n}`),
  `- drizzle_migrations: ${migrations.length}`,
  '',
  'Les fichiers CSV sont encodés en UTF-8 (séparateur virgule, guillemets doublés).',
  'Pour restaurer : utiliser un outil PostgreSQL (psql \\copy ou import Drizzle) — ne pas réimporter tel quel sans contrôle des clés étrangères.',
  '',
].join('\n')
writeFileSync(join(out, 'README.txt'), readme, 'utf8')
console.log(`✓ Sauvegarde terminée dans ${out}`)
console.log(Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' | '))
