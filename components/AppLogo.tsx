/** Logo de la boutique. `src` vient des réglages ; le logo livré sert de repli. */
export function AppLogo({ size = 31, src }: { size?: number; src?: string | null }) {
  return (
    <img
      src={src || '/logo.jpg'}
      alt="Logo Atelier de la Séduction"
      width={size}
      height={size}
      className="app-logo"
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  )
}

export function ReceiptMark({ size = 15, src }: { size?: number; src?: string | null }) {
  return (
    <img
      src={src || '/logo.jpg'}
      alt="Atelier de la Séduction"
      width={size}
      height={size}
      className="app-logo"
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  )
}