export function AppLogo({ size = 31 }: { size?: number }) {
  return (
    <img
      src="/logo.jpg"
      alt="Logo Atelier de la Séduction"
      width={size}
      height={size}
      className="app-logo"
      style={{ width: size, height: size }}
    />
  )
}

export function ReceiptMark({ size = 15 }: { size?: number }) {
  return (
    <img
      src="/logo.jpg"
      alt="Atelier de la Séduction"
      width={size}
      height={size}
      className="app-logo"
      style={{ width: size, height: size }}
    />
  )
}