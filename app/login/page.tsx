import type { Metadata } from 'next'

import { AppLogo } from '@/components/AppLogo'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Connexion — Atelier de la Séduction',
  description: 'Connectez-vous à votre espace de gestion boutique.',
}

export default function LoginPage() {
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-brand"><div className="brand-mark"><AppLogo size={42} /></div><div><strong>Atelier de la Séduction</strong><span>Espace de gestion</span></div></div>
        <h1>Connexion</h1>
        <p className="login-sub">Accédez à votre tableau de bord boutique.</p>
        <LoginForm />
      </div>
      <p className="login-foot">Gestion boutique Atelier de la Séduction — accès réservé à l’équipe.</p>
    </main>
  )
}