'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, count, desc, eq, gt, sql } from 'drizzle-orm'

import { auth } from '../lib/auth'
import { db } from '../lib/db'
import { buildCSV } from '../lib/csv'
import { can, USER_ROLES } from '../lib/permissions'
import type { Capability } from '../lib/permissions'
import { hashPassword, verifyPassword } from '../lib/password'
import { passwordError } from '../lib/password-rules'
import { activityLog, customers, expenses, products, refunds, sales, stockMovements, users } from '../db/schema'
import type { ReceiptData } from '../lib/types'

const COLORS = ['rose', 'plum', 'gold', 'mauve', 'peach']
const PAYMENT_METHODS = ['Espèces', 'Carte bancaire', 'Mobile Money']
const REFUND_REASONS = ['Remboursement', 'Échange', "Erreur d'encaissement", 'Produit défectueux']

const frDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const frHour = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const frLongDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

type ActionResult = { ok: boolean; error?: string; archived?: boolean }

const cleanCategory = (category: string) => category.trim().slice(0, 80)

const imageValue = (image?: string | null): string | null => {
  if (image == null || image === '') return null
  if (image.length > 2_500_000) throw new Error('Image trop volumineuse (max ~2 Mo).')
  if (!image.startsWith('data:image/') || !image.includes(';base64,')) throw new Error('Format d’image non pris en charge.')
  return image
}

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('') || 'MA'

async function requireAuth(): Promise<ActionResult | null> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Session expirée. Reconnectez-vous.' }
  return null
}

async function requireCapability(capability: Capability): Promise<ActionResult | null> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Session expirée. Reconnectez-vous.' }
  const [record] = await db
    .select({ role: users.role, status: users.status })
    .from(users)
    .where(eq(users.id, Number(session.user.id)))
    .limit(1)
  if (!record) return { ok: false, error: 'Compte introuvable.' }
  if (record.status !== 'Actif') return { ok: false, error: 'Ce compte est suspendu. Contactez l’administratrice.' }
  if (!can(record.role, capability)) {
    return { ok: false, error: 'Accès refusé : cette action nécessite des droits plus élevés.' }
  }
  return null
}

async function logActivity(type: string, detail: string): Promise<void> {
  try {
    const session = await auth()
    await db.insert(activityLog).values({
      userName: (session?.user?.name ?? 'Utilisateur').slice(0, 160),
      type,
      detail: detail.slice(0, 400),
    })
  } catch {
    /* la journalisation ne doit jamais bloquer l’action principale */
  }
}

function toReceipt(sale: { customerName: string; quantity: number; unitPrice: number; paymentMethod: string; sellerName: string; soldAt: Date }, productName: string, productSku: string, size?: string | null): ReceiptData {
  return {
    id: 0,
    dateLabel: frLongDate.format(sale.soldAt),
    hourLabel: frHour.format(sale.soldAt),
    customer: sale.customerName,
    article: productName,
    sku: productSku,
    size: size ?? null,
    quantity: sale.quantity,
    unitPrice: sale.unitPrice,
    total: sale.unitPrice * sale.quantity,
    method: sale.paymentMethod.replace('Carte bancaire', 'Carte'),
    seller: sale.sellerName,
  }
}

export async function addCustomer(input: { name: string; phone: string }): Promise<ActionResult & { id?: number }> {
  try {
    const denied = await requireCapability('customers')
    if (denied) return denied
    const name = input.name.trim()
    if (!name) return { ok: false, error: 'Le nom de la cliente est obligatoire.' }
    const phone = input.phone.trim().slice(0, 40)
    const [created] = await db
      .insert(customers)
      .values({ name: name.slice(0, 160), phone })
      .returning({ id: customers.id })
    void logActivity('Ajout cliente', `${name}${phone ? ` · ${phone}` : ''}`)
    revalidatePath('/')
    return { ok: true, id: created.id }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur serveur.' }
  }
}

export async function anonymizeCustomer(customerId: number): Promise<ActionResult> {
  try {
    const denied = await requireCapability('customers')
    if (denied) return denied
    const [existing] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId)).limit(1)
    if (!existing) return { ok: false, error: 'Cliente introuvable.' }

    await db
      .update(customers)
      .set({ name: 'Cliente anonymisée', phone: '', notes: null })
      .where(eq(customers.id, customerId))
    await db.update(sales).set({ customerName: 'Cliente anonymisée' }).where(eq(sales.customerId, customerId))
    void logActivity('Effacement données cliente', 'Données personnelles anonymisées')
    revalidatePath('/')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur serveur.' }
  }
}

export async function registerSale(input: {
  productId: number
  paymentMethod: string
  customerName?: string
  customerId?: number | null
  size?: string | null
}): Promise<ActionResult & { receipt?: ReceiptData }> {
  try {
    const denied = await requireCapability('sales')
    if (denied) return denied
    if (!PAYMENT_METHODS.includes(input.paymentMethod)) return { ok: false, error: 'Moyen de paiement invalide.' }
    const [product] = await db.select().from(products).where(eq(products.id, input.productId))
    if (!product) return { ok: false, error: 'Produit introuvable.' }
    let size: string | null = null
    if (product.sizes && Object.keys(product.sizes).length > 0) {
      size = String(input.size ?? '').trim()
      if (!size) return { ok: false, error: `« ${product.name} » se décline en tailles — choisissez une taille.` }
      const available = product.sizes[size]
      if (!available || available <= 0) return { ok: false, error: `Taille ${size} en rupture pour « ${product.name} ».` }
    }
    if (product.stock <= 0) return { ok: false, error: `« ${product.name} » est en rupture de stock.` }

    let customerName = input.customerName?.trim() || 'Cliente'
    let customerId = input.customerId ?? null
    if (customerId != null && typeof customerId === 'number') {
      const [client] = await db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.id, customerId)).limit(1)
      if (!client) return { ok: false, error: 'Cliente introuvable.' }
      customerName = client.name
    } else {
      customerId = null
    }
    const session = await auth()
    const sellerName = (session?.user?.name ?? 'Caisse').slice(0, 160)
    const now = new Date()

    const [reserved] = await db
      .update(products)
      .set({ stock: sql`${products.stock} - 1` })
      .where(and(eq(products.id, product.id), gt(products.stock, 0)))
      .returning({ id: products.id })
    if (!reserved) return { ok: false, error: `« ${product.name} » est en rupture de stock.` }

    if (size) {
      const sizes = { ...product.sizes }
      const remaining = (sizes[size] ?? 0) - 1
      if (remaining < 0) return { ok: false, error: `Taille ${size} en rupture pour « ${product.name} ».` }
      sizes[size] = remaining
      await db.update(products).set({ sizes }).where(eq(products.id, product.id))
    }

    const [created] = await db
      .insert(sales)
      .values({
        productId: product.id,
        customerId,
        customerName,
        quantity: 1,
        unitPrice: product.price,
        purchasePrice: product.purchasePrice,
        paymentMethod: input.paymentMethod,
        sellerName,
        size,
        soldAt: now,
      })
      .returning({ id: sales.id })
    await db.insert(stockMovements).values({ productId: product.id, change: -1, reason: 'Vente' })
    void logActivity('Vente', `${product.name}${size ? ` — Taille ${size}` : ''} · ${product.price} FCFA — ${customerName} (${input.paymentMethod})`)

    revalidatePath('/')
    const receipt = toReceipt(
      { customerName, quantity: 1, unitPrice: product.price, paymentMethod: input.paymentMethod, sellerName, soldAt: now },
      product.name,
      product.sku,
      size,
    )
    return { ok: true, receipt: { ...receipt, id: created.id } }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur serveur.' }
  }
}

export async function refundSale(input: { saleId: number; reason: string }): Promise<ActionResult> {
  try {
    const denied = await requireCapability('sales')
    if (denied) return denied
    const reason = String(input.reason ?? '').trim()
    if (!REFUND_REASONS.includes(reason)) return { ok: false, error: 'Motif de remboursement invalide.' }

    const [sale] = await db.select().from(sales).where(eq(sales.id, input.saleId))
    if (!sale) return { ok: false, error: 'Vente introuvable.' }
    const [existingRefund] = await db.select({ id: refunds.id }).from(refunds).where(eq(refunds.saleId, sale.id)).limit(1)
    if (existingRefund) return { ok: false, error: 'Cette vente a déjà été remboursée.' }

    const [product] = await db.select().from(products).where(eq(products.id, sale.productId))
    if (!product) return { ok: false, error: 'Produit lié introuvable.' }

    await db
      .update(products)
      .set({ stock: sql`${products.stock} + 1` })
      .where(eq(products.id, product.id))
    if (sale.size && product.sizes) {
      const sizes = { ...product.sizes }
      sizes[sale.size] = (sizes[sale.size] ?? 0) + 1
      await db.update(products).set({ sizes }).where(eq(products.id, product.id))
    }
    const session = await auth()
    await db.insert(refunds).values({
      saleId: sale.id,
      reason,
      refundedBy: (session?.user?.name ?? 'Caisse').slice(0, 160),
    })
    await db.insert(stockMovements).values({ productId: product.id, change: 1, reason: `Remboursement · ${reason}` })
    void logActivity('Remboursement', `Vente N°${String(sale.id).padStart(4, '0')} · ${product.name} · motif : ${reason}`)

    revalidatePath('/')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur serveur.' }
  }
}

export async function addProduct(input: {
  name: string
  sku: string
  category: string
  price: number
  purchasePrice: number
  stock: number
  min: number
  image?: string | null
  sizes?: Record<string, number> | null
}): Promise<ActionResult> {
  try {
    const denied = await requireCapability('catalog')
    if (denied) return denied
    const name = input.name.trim()
    if (!name || !input.sku.trim()) return { ok: false, error: 'Nom et référence sont obligatoires.' }
    const category = cleanCategory(input.category)
    if (!category) return { ok: false, error: 'Choisissez ou saisissez une catégorie.' }
    if (Number.isNaN(input.price) || input.price < 0) return { ok: false, error: 'Prix invalide.' }
    if (Number.isNaN(input.purchasePrice) || input.purchasePrice < 0) return { ok: false, error: "Coût d'achat invalide." }
    const image = imageValue(input.image)

    const sizes = input.sizes !== undefined && input.sizes !== null && Object.keys(input.sizes).length > 0 ? input.sizes : null
    const sku = input.sku.trim().toUpperCase()
    const [existing] = await db.select().from(products).where(eq(products.sku, sku)).limit(1)
    if (existing) return { ok: false, error: `La référence « ${sku} » existe déjà (${existing.name}).` }

    await db.insert(products).values({
      name,
      sku,
      category,
      price: Math.round(input.price),
      purchasePrice: Math.round(input.purchasePrice),
      stock: sizes ? Object.values(sizes).reduce((a, b) => a + b, 0) : Math.max(0, Math.round(input.stock)),
      minStock: Math.max(0, Math.round(input.min)),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      initials: initialsOf(name),
      image,
      sizes,
    })
    void logActivity('Ajout produit', `${name} (${sku}) · ${category} · ${Math.round(input.price)} FCFA` + (sizes ? ` · ${Object.keys(sizes).length} tailles` : ''))

    revalidatePath('/')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur serveur.' }
  }
}

export async function updateProduct(input: {
  id: number
  name: string
  category: string
  price: number
  purchasePrice: number
  min: number
  image?: string | null
  sizes?: Record<string, number> | null
}): Promise<ActionResult> {
  try {
    const denied = await requireCapability('catalog')
    if (denied) return denied
    const name = input.name.trim()
    if (!name) return { ok: false, error: 'Le nom du modèle est obligatoire.' }
    const category = cleanCategory(input.category)
    if (!category) return { ok: false, error: 'Choisissez ou saisissez une catégorie.' }
    if (Number.isNaN(input.price) || input.price < 0) return { ok: false, error: 'Prix invalide.' }
    if (Number.isNaN(input.purchasePrice) || input.purchasePrice < 0) return { ok: false, error: "Coût d'achat invalide." }

    const sizes = input.sizes !== undefined && input.sizes !== null && Object.keys(input.sizes).length > 0 ? input.sizes : null
    const [current] = await db.select().from(products).where(eq(products.id, input.id))
    if (!current) return { ok: false, error: 'Produit introuvable.' }

    await db
      .update(products)
      .set({
        name,
        category,
        price: Math.round(input.price),
        purchasePrice: Math.round(input.purchasePrice),
        minStock: Math.max(0, Math.round(input.min)),
        ...(sizes ? { sizes, stock: Object.values(sizes).reduce((a, b) => a + b, 0) } : { sizes: null }),
        ...(input.image === undefined ? {} : { image: imageValue(input.image) }),
      })
      .where(eq(products.id, input.id))
    void logActivity('Modification produit', `${name} · ${Math.round(input.price)} FCFA` + (sizes ? ` · ${Object.keys(sizes).length} tailles` : ''))

    revalidatePath('/')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur serveur.' }
  }
}

export async function toggleProductActive(id: number): Promise<ActionResult> {
  try {
    const denied = await requireCapability('catalog')
    if (denied) return denied
    const [product] = await db.select().from(products).where(eq(products.id, id))
    if (!product) return { ok: false, error: 'Produit introuvable.' }

    await db
      .update(products)
      .set({ isActive: !product.isActive })
      .where(eq(products.id, id))
    void logActivity(product.isActive ? 'Archivage produit' : 'Réactivation produit', `${product.name} (${product.sku})`)

    revalidatePath('/')
    return { ok: true, archived: product.isActive }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur serveur.' }
  }
}

export async function adjustStock(input: {
  productId: number
  newStock: number
  reason?: string
  sizes?: Record<string, number> | null
}): Promise<ActionResult> {
  try {
    const denied = await requireCapability('stock')
    if (denied) return denied
    const [product] = await db.select().from(products).where(eq(products.id, input.productId))
    if (!product) return { ok: false, error: 'Produit introuvable.' }

    const patch: Record<string, unknown> = {}
    const reason = input.reason?.trim() || 'Ajustement'
    let logDetail = `${product.name} : ${product.stock}`

    if (product.sizes && input.sizes) {
      const cleaned: Record<string, number> = {}
      for (const [size, qty] of Object.entries(input.sizes)) {
        if (qty > 0) cleaned[size] = Math.max(0, Math.round(qty))
      }
      const nextTotal = Object.values(cleaned).reduce((a, b) => a + b, 0)
      patch.sizes = Object.keys(cleaned).length > 0 ? cleaned : null
      patch.stock = nextTotal
      logDetail = `${product.name} : ${product.stock} → ${nextTotal} (${Object.keys(cleaned).sort().join(', ') || 'sans tailles'})`
      if (nextTotal === product.stock) {
        await db.update(products).set(patch).where(eq(products.id, product.id))
        return { ok: true }
      }
      const delta = nextTotal - product.stock
      await db.update(products).set(patch).where(eq(products.id, product.id))
      await db.insert(stockMovements).values({ productId: product.id, change: delta, reason })
      void logActivity('Ajustement stock', `${logDetail} (${reason})`)
      revalidatePath('/')
      return { ok: true }
    }

    const next = Math.max(0, Math.round(input.newStock))
    const delta = next - product.stock
    if (delta === 0) return { ok: true }

    await db
      .update(products)
      .set({ stock: next })
      .where(eq(products.id, product.id))
    await db.insert(stockMovements).values({ productId: product.id, change: delta, reason })
    void logActivity('Ajustement stock', `${product.name} : ${product.stock} → ${next} (${reason})`)

    revalidatePath('/')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur serveur.' }
  }
}

export async function deleteProduct(id: number): Promise<ActionResult> {
  try {
    const denied = await requireCapability('catalog')
    if (denied) return denied
    const [product] = await db.select().from(products).where(eq(products.id, id))
    if (!product) return { ok: false, error: 'Produit introuvable.' }

    const [{ count: salesCount }] = await db.select({ count: count() }).from(sales).where(eq(sales.productId, id))
    const [{ count: movementCount }] = await db.select({ count: count() }).from(stockMovements).where(eq(stockMovements.productId, id))
    if (salesCount > 0 || movementCount > 0) {
      return { ok: false, error: 'Impossible de supprimer : des ventes ou mouvements de stock existent. Archivez l’article à la place.' }
    }

    await db.delete(products).where(eq(products.id, id))
    void logActivity('Suppression produit', `${product.name} (${product.sku})`)

    revalidatePath('/')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur serveur.' }
  }
}

export async function addExpense(input: {
  label: string
  category: string
  amount: number
}): Promise<ActionResult> {
  try {
    const denied = await requireCapability('expenses')
    if (denied) return denied
    const label = input.label.trim()
    if (!label) return { ok: false, error: 'Le libellé est obligatoire.' }
    if (Number.isNaN(input.amount) || input.amount <= 0) return { ok: false, error: 'Montant invalide.' }

    await db.insert(expenses).values({
      label,
      category: input.category.trim() || 'Autres',
      amount: Math.round(input.amount),
    })
    void logActivity('Dépense', `${label} · ${Math.round(input.amount)} FCFA (${input.category.trim() || 'Autres'})`)

    revalidatePath('/')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur serveur.' }
  }
}

export async function exportCSV(kind: 'sales' | 'products' | 'expenses' | 'customers', filters?: { period?: 'today' | 'week' | 'month' | 'all'; type?: 'sales' | 'refunds' | 'all'; seller?: string }): Promise<ActionResult & { csv?: string; filename?: string }> {
  try {
    const capability: Capability = kind === 'sales' ? 'sales' : kind === 'products' ? 'catalog' : kind === 'customers' ? 'customers' : 'expenses'
    const denied = await requireCapability(capability)
    if (denied) return denied

    if (kind === 'sales') {
      const [saleRows, productRows, refundRows] = await Promise.all([
        db.select().from(sales).orderBy(desc(sales.soldAt)),
        db.select({ id: products.id, name: products.name, sku: products.sku }).from(products),
        db.select({ saleId: refunds.saleId }).from(refunds),
      ])
      const productById = new Map(productRows.map((p) => [p.id, p]))
      const refundedIds = new Set(refundRows.map((r) => r.saleId))
      const period = filters?.period ?? 'all'
      const type = filters?.type ?? 'all'
      const seller = filters?.seller ?? 'all'
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const week = new Date(today)
      week.setDate(week.getDate() - 6)
      const month = new Date(now.getFullYear(), now.getMonth(), 1)
      const visible = saleRows.filter((sale) => {
        const d = new Date(sale.soldAt)
        if (period === 'today' && d < today) return false
        if (period === 'week' && d < week) return false
        if (period === 'month' && d < month) return false
        if (type === 'sales' && refundedIds.has(sale.id)) return false
        if (type === 'refunds' && !refundedIds.has(sale.id)) return false
        if (seller !== 'all' && sale.sellerName !== seller) return false
        return true
      })
      const rows: Array<Array<string | number>> = [
        ['Date', 'Heure', 'Produit', 'Référence', 'Taille', 'Qté', 'Prix unitaire', 'Total', 'Client', 'Moyen de paiement', 'Vendeuse', 'Statut'],
        ...visible.map((sale) => {
          const product = productById.get(sale.productId)
          return [
            frDate.format(new Date(sale.soldAt)),
            frHour.format(new Date(sale.soldAt)),
            product?.name ?? 'Article',
            product?.sku ?? '',
            sale.size ?? '',
            sale.quantity,
            sale.unitPrice,
            sale.unitPrice * sale.quantity,
            sale.customerName,
            sale.paymentMethod,
            sale.sellerName,
            refundedIds.has(sale.id) ? 'Remboursée' : 'Payée',
          ]
        }),
      ]
      void logActivity('Export ventes', `${visible.length} ventes`)
      return { ok: true, csv: buildCSV(rows), filename: `ventes-${frDate.format(new Date()).replaceAll('/', '-')}.csv` }
    }

    if (kind === 'products') {
      const rows = await db.select().from(products).orderBy(products.id)
      const out: Array<Array<string | number>> = [
        ['Référence', 'Nom', 'Catégorie', 'Prix', "Coût d'achat", 'Stock', 'Tailles', 'Seuil min.', 'Statut'],
        ...rows.map((p) => [p.sku, p.name, p.category, p.price, p.purchasePrice, p.stock, p.sizes ? Object.entries(p.sizes).map(([s, q]) => `${s}:${q}`).join(', ') : '', p.minStock, p.isActive ? 'Actif' : 'Archivé']),
      ]
      void logActivity('Export catalogue', `${rows.length} produits`)
      return { ok: true, csv: buildCSV(out), filename: `produits-${frDate.format(new Date()).replaceAll('/', '-')}.csv` }
    }

    if (kind === 'customers') {
      const [clientRows, saleRows] = await Promise.all([
        db.select().from(customers).orderBy(customers.id),
        db.select().from(sales),
      ])
      const totals = new Map<number, { total: number; visits: number }>()
      for (const sale of saleRows) {
        if (sale.customerId == null) continue
        const entry = totals.get(sale.customerId) ?? { total: 0, visits: 0 }
        entry.total += sale.unitPrice * sale.quantity
        entry.visits += 1
        totals.set(sale.customerId, entry)
      }
      const out: Array<Array<string | number>> = [
        ['Nom', 'Téléphone', 'Passages', 'Total dépensé', 'Cliente depuis'],
        ...clientRows.map((client) => {
          const entry = totals.get(client.id) ?? { total: 0, visits: 0 }
          return [client.name, client.phone, entry.visits, entry.total, frDate.format(new Date(client.createdAt))]
        }),
      ]
      void logActivity('Export clientes', `${clientRows.length} clientes`)
      return { ok: true, csv: buildCSV(out), filename: `clientes-${frDate.format(new Date()).replaceAll('/', '-')}.csv` }
    }

    const rows = await db.select().from(expenses).orderBy(desc(expenses.date))
    const out: Array<Array<string | number>> = [
      ['Date', 'Libellé', 'Catégorie', 'Montant'],
      ...rows.map((e) => [frDate.format(new Date(e.date)), e.label, e.category, e.amount]),
    ]
    void logActivity('Export dépenses', `${rows.length} dépenses`)
    return { ok: true, csv: buildCSV(out), filename: `depenses-${frDate.format(new Date()).replaceAll('/', '-')}.csv` }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur serveur.' }
  }
}

export async function exportReport(): Promise<ActionResult & { csv?: string; filename?: string }> {
  try {
    const denied = await requireCapability('sales')
    if (denied) return denied

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const withinMonth = (d: Date) => d >= monthStart && d < now

    const [saleRows, productRows, expenseRows, refundRows] = await Promise.all([
      db.select().from(sales).orderBy(desc(sales.soldAt)),
      db.select().from(products),
      db.select().from(expenses).orderBy(desc(expenses.date)),
      db.select({ saleId: refunds.saleId }).from(refunds),
    ])
    const productById = new Map(productRows.map((p) => [p.id, p]))
    const refundedIds = new Set(refundRows.map((r) => r.saleId))

    const monthSales = saleRows.filter((s) => withinMonth(new Date(s.soldAt)) && !refundedIds.has(s.id))
    const revenue = monthSales.reduce((sum, s) => sum + s.unitPrice * s.quantity, 0)
    const costOfGoods = monthSales.reduce((sum, s) => sum + s.purchasePrice * s.quantity, 0)
    const margin = revenue - costOfGoods
    const expensesMonth = expenseRows.filter((e) => withinMonth(e.date)).reduce((sum, e) => sum + e.amount, 0)

    const categoryTotals = new Map<string, number>()
    const categoryCount = new Map<string, number>()
    const productCount = new Map<number, number>()
    const methodTotals = new Map<string, { amount: number; count: number }>()
    for (const sale of monthSales) {
      const product = productById.get(sale.productId)
      const amount = sale.unitPrice * sale.quantity
      if (product) {
        categoryTotals.set(product.category, (categoryTotals.get(product.category) ?? 0) + amount)
        categoryCount.set(product.category, (categoryCount.get(product.category) ?? 0) + 1)
      }
      productCount.set(sale.productId, (productCount.get(sale.productId) ?? 0) + 1)
      const method = methodTotals.get(sale.paymentMethod) ?? { amount: 0, count: 0 }
      method.amount += amount
      method.count += 1
      methodTotals.set(sale.paymentMethod, method)
    }

    const categoryTotal = [...categoryTotals.values()].reduce((a, b) => a + b, 0)
    const monthLabel = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(now)
    const rows: Array<Array<string | number>> = []
    rows.push(['Rapport mensuel — Atelier de la Séduction'])
    rows.push(['Période', monthLabel])
    rows.push([])
    rows.push(['CA du mois', revenue])
    rows.push(['Nb de ventes', monthSales.length])
    rows.push(["Coût des ventes du mois", costOfGoods])
    rows.push(['Marge brute du mois (coût)', margin])
    rows.push(['Panier moyen', monthSales.length === 0 ? 0 : Math.round(revenue / monthSales.length)])
    rows.push(['Dépenses du mois', expensesMonth])
    rows.push(['Résultat net du mois (marge − dépenses)', margin - expensesMonth])
    rows.push([])
    rows.push(['VENTES PAR CATÉGORIE', 'Montant', 'Part', 'Ventes'])
    for (const [name, total] of [...categoryTotals.entries()].sort((a, b) => b[1] - a[1])) {
      rows.push([name, total, categoryTotal === 0 ? 0 : `${Math.round((total / categoryTotal) * 100)}%`, categoryCount.get(name) ?? 0])
    }
    rows.push([])
    rows.push(['TOP PRODUITS VENDUS', 'Nb ventes'])
    for (const [productId, count] of [...productCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      rows.push([productById.get(productId)?.name ?? 'Produit', count])
    }
    rows.push([])
    rows.push(['PAR MOYEN DE PAIEMENT', 'Montant', 'Ventes'])
    for (const [method, stats] of methodTotals) {
      rows.push([method, stats.amount, stats.count])
    }
    void logActivity('Export rapport', `${monthLabel} · CA ${revenue} FCFA`)

    return { ok: true, csv: buildCSV(rows), filename: `rapport-mensuel-${frDate.format(now).replaceAll('/', '-')}.csv` }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur serveur.' }
  }
}

export type ImportProductRow = {
  name: string
  sku: string
  category: string
  price: number
  purchasePrice: number
  stock: number
  min: number
}

export async function importProducts(input: { rows: ImportProductRow[] }): Promise<ActionResult & { imported: number; skipped: number; errors: string[] }> {
  try {
    const denied = await requireCapability('catalog')
    if (denied) return { ...denied, imported: 0, skipped: 0, errors: [] }

    const existing = await db.select({ sku: products.sku }).from(products)
    const knownSkus = new Set(existing.map((p) => p.sku))
    const valid: Array<{ name: string; sku: string; category: string; price: number; purchasePrice: number; stock: number; minStock: number; color: string; initials: string }> = []
    const errors: string[] = []

    input.rows.forEach((raw, index) => {
      const line = index + 2
      const name = String(raw.name ?? '').trim()
      const sku = String(raw.sku ?? '').trim().toUpperCase()
      if (!name || !sku) return errors.push(`Ligne ${line} : nom ou référence manquant.`)
      if (knownSkus.has(sku)) return errors.push(`Ligne ${line} : la référence « ${sku} » existe déjà.`)
      const price = Number(raw.price)
      if (Number.isNaN(price) || price < 0) return errors.push(`Ligne ${line} : prix invalide (« ${raw.price} »).`)
      const purchasePrice = Math.max(0, Math.round(Number(raw.purchasePrice) || 0))
      const stock = Math.max(0, Math.round(Number(raw.stock) || 0))
      const min = Math.max(0, Math.round(Number(raw.min) || 0))
      knownSkus.add(sku)
      valid.push({
        name,
        sku,
        category: cleanCategory(String(raw.category ?? '')) || 'Accessoires',
        price: Math.round(price),
        purchasePrice,
        stock,
        minStock: min,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        initials: initialsOf(name),
      })
    })

    if (valid.length > 0) {
      await db.insert(products).values(valid)
      void logActivity('Import catalogue', `${valid.length} produits importés` + (errors.length > 0 ? `, ${errors.length} lignes ignorées` : ''))
      revalidatePath('/')
    }

    return { ok: true, imported: valid.length, skipped: input.rows.length - valid.length, errors }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur serveur.', imported: 0, skipped: 0, errors: [] }
  }
}

function newTempPassword(): string {
  return randomBytes(4).toString('hex').toUpperCase()
}

async function currentUserId(): Promise<number | null> {
  const session = await auth()
  const id = Number(session?.user?.id)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function inviteUser(input: { name: string; email: string; role: string }): Promise<ActionResult & { tempPassword?: string }> {
  try {
    const denied = await requireCapability('users')
    if (denied) return denied
    const name = input.name.trim()
    if (!name) return { ok: false, error: 'Le nom complet est obligatoire.' }
    const email = input.email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Adresse e-mail invalide.' }
    if (!USER_ROLES.includes(input.role as (typeof USER_ROLES)[number])) return { ok: false, error: 'Rôle invalide.' }

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    if (existing) return { ok: false, error: 'Un compte existe déjà avec cette adresse e-mail.' }

    const tempPassword = newTempPassword()
    await db.insert(users).values({
      name,
      email,
      role: input.role,
      status: 'Actif',
      initials: initialsOf(name),
      passwordHash: await hashPassword(tempPassword),
    })
    void logActivity('Invitation', `${name} · ${email} (${input.role})`)

    revalidatePath('/')
    return { ok: true, tempPassword }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur serveur.' }
  }
}

export async function updateUserRole(userId: number, role: string): Promise<ActionResult> {
  try {
    const denied = await requireCapability('users')
    if (denied) return denied
    if (!USER_ROLES.includes(role as (typeof USER_ROLES)[number])) return { ok: false, error: 'Rôle invalide.' }
    const self = await currentUserId()
    if (self === userId) return { ok: false, error: 'Impossible de modifier votre propre rôle.' }
    const [target] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, userId)).limit(1)
    if (!target) return { ok: false, error: 'Utilisateur introuvable.' }

    await db.update(users).set({ role }).where(eq(users.id, userId))
    void logActivity('Changement de rôle', `${target.name ?? 'Utilisateur'} → ${role}`)
    revalidatePath('/')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur serveur.' }
  }
}

export async function updateUserStatus(userId: number, status: 'Actif' | 'Suspendu'): Promise<ActionResult> {
  try {
    const denied = await requireCapability('users')
    if (denied) return denied
    const self = await currentUserId()
    if (self === userId) return { ok: false, error: 'Impossible de suspendre votre propre compte.' }
    const [target] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, userId)).limit(1)
    if (!target) return { ok: false, error: 'Utilisateur introuvable.' }

    await db.update(users).set({ status }).where(eq(users.id, userId))
    void logActivity(status === 'Suspendu' ? 'Suspension compte' : 'Réactivation compte', `${target.name ?? 'Utilisateur'}`)
    revalidatePath('/')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur serveur.' }
  }
}

export async function resetPassword(userId: number): Promise<ActionResult & { tempPassword?: string }> {
  try {
    const denied = await requireCapability('users')
    if (denied) return denied
    const self = await currentUserId()
    if (self === userId) return { ok: false, error: 'Impossible de réinitialiser votre propre mot de passe.' }
    const [target] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, userId)).limit(1)
    if (!target) return { ok: false, error: 'Utilisateur introuvable.' }

    const tempPassword = newTempPassword()
    await db.update(users).set({ passwordHash: await hashPassword(tempPassword) }).where(eq(users.id, userId))
    void logActivity('Réinitialisation mot de passe', `${target.name}`)
    revalidatePath('/')
    return { ok: true, tempPassword }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur serveur.' }
  }
}

export async function changePassword(input: { currentPassword: string; newPassword: string }): Promise<ActionResult> {
  try {
    const denied = await requireAuth()
    if (denied) return denied
    const userId = await currentUserId()
    if (!userId) return { ok: false, error: 'Session invalide. Reconnectez-vous.' }
    const [account] = await db.select({ id: users.id, name: users.name, passwordHash: users.passwordHash, status: users.status }).from(users).where(eq(users.id, userId)).limit(1)
    if (!account) return { ok: false, error: 'Compte introuvable.' }
    if (account.status !== 'Actif') return { ok: false, error: 'Ce compte est suspendu. Contactez l’administratrice.' }

    const current = input.currentPassword ?? ''
    const next = input.newPassword ?? ''
    if (!current) return { ok: false, error: 'Mot de passe actuel obligatoire.' }
    if (!next) return { ok: false, error: 'Le nouveau mot de passe est obligatoire.' }
    if (!(await verifyPassword(current, account.passwordHash))) return { ok: false, error: 'Mot de passe actuel incorrect.' }
    if (next === current) return { ok: false, error: 'Le nouveau mot de passe doit être différent de l’actuel.' }
    const weakness = passwordError(next)
    if (weakness) return { ok: false, error: `Mot de passe trop faible — ${weakness}` }

    await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, userId))
    void logActivity('Changement mot de passe', `${account.name ?? 'Utilisateur'}`)
    revalidatePath('/')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur serveur.' }
  }
}