import type { Metadata } from 'next'
import { connection } from 'next/server'

import { AppLogo } from '@/components/AppLogo'
import { getStoreLogo } from '@/lib/data'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Connexion — Atelier de la Séduction',
  description: 'Connectez-vous à votre espace de gestion boutique.',
}

export default async function LoginPage() {
  // Le logo est lu en base : exclure cette page du prérendu (API recommandée dans Next 16).
  await connection()
  const storeLogo = await getStoreLogo()
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-brand"><div className="brand-mark"><AppLogo size={42} src={storeLogo} /></div><div><strong>Atelier de la Séduction</strong><span>Espace de gestion</span></div></div>
        <h1>Connexion</h1>
        <p className="login-sub">Accédez à votre tableau de bord boutique.</p>
        <LoginForm />
      </div>
      <p className="login-foot">Gestion boutique Atelier de la Séduction — accès réservé à l’équipe.</p>
    </main>
  )
}