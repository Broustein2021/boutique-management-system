import { redirect } from 'next/navigation'

import { auth } from '@/lib/auth'
import { getDashboardData } from '@/lib/data'
import { AtelierApp } from './atelier-app'
import { DbUnreachable } from '@/components/db-unreachable'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const initial = await getDashboardData(session.user.role).catch(() => null)
  if (!initial) return <DbUnreachable />
  return (
    <AtelierApp
      initial={initial}
      user={{
        name: session.user.name ?? 'Utilisateur',
        email: session.user.email ?? '',
        role: session.user.role,
        initials: session.user.initials ?? 'MA',
      }}
    />
  )
}