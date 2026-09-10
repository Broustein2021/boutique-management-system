import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { eq } from 'drizzle-orm'

import { db } from './db'
import { users } from '../db/schema'
import { verifyPassword } from './password'

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? '').trim().toLowerCase()
        const password = String(credentials?.password ?? '')
        if (!email || !password) return null

        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
        if (!user || !user.passwordHash || user.status !== 'Actif') return null

        const valid = await verifyPassword(password, user.passwordHash)
        if (!valid) return null

        return {
          id: String(user.id),
          name: user.name,
          email: user.email,
          role: user.role,
          initials: user.initials,
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.initials = user.initials
        token.name = user.name
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.sub as string) ?? session.user.id
        session.user.role = token.role as string | undefined
        session.user.initials = token.initials as string | undefined
        session.user.name = (token.name as string) ?? session.user.name
      }
      return session
    },
  },
})