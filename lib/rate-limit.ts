const MAX_ATTEMPTS = 5
const WINDOW_MS = 10 * 60 * 1000
const LOCK_MS = 15 * 60 * 1000

type Entry = { attempts: number; windowStart: number; lockedUntil: number }

const store = new Map<string, Entry>()

function prune() {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (entry.lockedUntil < now && now - entry.windowStart > WINDOW_MS) store.delete(key)
  }
  if (store.size > 2000) {
    const oldest = [...store.entries()].sort((a, b) => a[1].windowStart - b[1].windowStart)[0]
    if (oldest) store.delete(oldest[0])
  }
}

function keyOf(email: string, ip: string) {
  return `${email.toLowerCase()}|${ip}`
}

export function checkLoginAttempts(email: string, ip: string): { allowed: boolean; retryAfterMin: number } {
  prune()
  const key = keyOf(email, ip)
  const now = Date.now()
  const entry = store.get(key)
  if (entry && entry.lockedUntil > now) {
    return { allowed: false, retryAfterMin: Math.max(1, Math.ceil((entry.lockedUntil - now) / 60000)) }
  }
  return { allowed: true, retryAfterMin: 0 }
}

export function registerLoginAttempt(email: string, ip: string) {
  prune()
  const key = keyOf(email, ip)
  const now = Date.now()
  const entry = store.get(key)
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    store.set(key, { attempts: 1, windowStart: now, lockedUntil: 0 })
    return
  }
  entry.attempts += 1
  if (entry.attempts >= MAX_ATTEMPTS) entry.lockedUntil = now + LOCK_MS
}

export function registerLoginSuccess(email: string, ip: string) {
  store.delete(keyOf(email, ip))
}