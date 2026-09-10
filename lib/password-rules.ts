export const MIN_PASSWORD_LENGTH = 8

export function passwordStrength(pw: string): number {
  let score = 0
  if (pw.length >= MIN_PASSWORD_LENGTH) score++
  if (/[a-zA-Z]/.test(pw) && /\d/.test(pw)) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw)) score++
  if (pw.length >= 12) score++
  return Math.max(0, Math.min(3, score))
}

export function passwordError(pw: string): string | null {
  if (pw.length === 0) return null
  if (pw.length < MIN_PASSWORD_LENGTH) return `Au moins ${MIN_PASSWORD_LENGTH} caractères.`
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return 'Mélangez lettres et chiffres.'
  return null
}