import { readFileSync } from 'node:fs'
import type { Config } from 'drizzle-kit'

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const raw = readFileSync('.env.local', 'utf8')
  const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith('DATABASE_URL='))
  if (!line) throw new Error('DATABASE_URL introuvable dans .env.local')
  return line.slice(line.indexOf('=') + 1).trim()
}

export default {
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: getDatabaseUrl() },
} satisfies Config