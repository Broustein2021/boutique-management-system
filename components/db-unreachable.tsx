'use client'

import { ServerCrash } from 'lucide-react'

export function DbUnreachable() {
  return (
    <div className="app-shell" style={{ minHeight: '100vh' }}>
      <div className="page-container" style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 430 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 58, height: 58, borderRadius: '50%', background: '#f8f4f3', color: '#bf6670', marginBottom: 22 }}>
            <ServerCrash size={27} />
          </div>
          <p className="eyebrow" style={{ margin: 0 }}>CONNEXION PERDUE</p>
          <h1 style={{ fontSize: 26, letterSpacing: '-.03em', margin: '9px 0 8px' }}>La base de données est injoignable</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: 13, lineHeight: 1.65, margin: '0 auto 26px' }}>
            Votre connexion Internet a sans doute coupé un court instant. Aucune donnée n’est perdue : patientez quelques
            secondes puis réessayez.
          </p>
          <button className="primary-button" onClick={() => window.location.reload()}>
            Réessayer
          </button>
        </div>
      </div>
    </div>
  )
}