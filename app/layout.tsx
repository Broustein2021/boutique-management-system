import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Atelier de la Séduction — Gestion boutique',
  description: 'Tableau de bord de gestion pour la boutique de lingerie Atelier de la Séduction.',
  generator: 'v0.app',
  icons: { icon: '/logo.jpg', apple: '/logo.jpg' },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f8f6f4',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className="bg-background">
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
