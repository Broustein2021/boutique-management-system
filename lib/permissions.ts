export type UserRole = 'Administratrice' | 'Associée' | 'Caissière'

export const USER_ROLES: UserRole[] = ['Administratrice', 'Associée', 'Caissière']

export type Capability = 'sales' | 'customers' | 'catalog' | 'stock' | 'expenses' | 'users' | 'activity'

const ROLE_CAPABILITIES: Record<UserRole, Capability[]> = {
  Administratrice: ['sales', 'customers', 'catalog', 'stock', 'expenses', 'users', 'activity'],
  Associée: ['sales', 'customers', 'catalog', 'stock', 'expenses', 'activity'],
  Caissière: ['sales', 'customers'],
}

export function can(role: string | undefined | null, capability: Capability): boolean {
  if (!role) return false
  return (ROLE_CAPABILITIES[role as UserRole] ?? []).includes(capability)
}