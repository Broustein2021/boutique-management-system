'use server'

import { headers } from 'next/headers'
import { AuthError } from 'next-auth'

import { signIn } from '@/lib/auth'
import { checkLoginAttempts, registerLoginAttempt, registerLoginSuccess } from '@/lib/rate-limit'

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()

  const h = await headers()
  const forwarded = h.get('x-forwarded-for') ?? ''
  const ip = forwarded.split(',')[0].trim() || h.get('x-real-ip') || 'unknown'

  const { allowed, retryAfterMin } = checkLoginAttempts(email, ip)
  if (!allowed) {
    return { ok: false, error: `Trop de tentatives. Réessayez dans ${retryAfterMin} min.` }
  }

  try {
    await signIn('credentials', {
      email,
      password: String(formData.get('password') ?? ''),
      redirectTo: '/',
    })
    registerLoginSuccess(email, ip)
    return { ok: true, error: undefined }
  } catch (error) {
    if (error instanceof AuthError) {
      registerLoginAttempt(email, ip)
      return { ok: false, error: 'E-mail ou mot de passe incorrect.' }
    }
    throw error
  }
}