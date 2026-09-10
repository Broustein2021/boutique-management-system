'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import { login } from './login-action'

export function LoginForm() {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<{ error?: string } | null, FormData>(
    async (_, formData) => {
      const res = await login(formData)
      if (res.ok) router.push('/')
      return { error: res.error }
    },
    null,
  )

  return (
    <form action={formAction} className="login-form">
      <label className="form-label">Adresse e-mail<input name="email" type="email" required autoComplete="email" placeholder="anna@atelierseduction.ci" /></label>
      <label className="form-label">Mot de passe<input name="password" type="password" required autoComplete="current-password" placeholder="••••••••" /></label>
      {state?.error && <p className="login-error">{state.error}</p>}
      <button className="primary-button full" type="submit" disabled={pending}><Loader2 size={17} /> {pending ? 'Connexion…' : 'Se connecter'}</button>
    </form>
  )
}