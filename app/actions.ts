'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, count, desc, eq, gt, inArray, sql } from 'drizzle-orm'

import { auth } from '../lib/auth'
import { db } from '../lib/db'
import { buildCSV } from '../lib/csv'
import { can, USER_ROLES } from '../lib/permissions'
import type { Capability } from '../lib/permissions'
import { hashPassword, verifyPassword } from '../lib/password'
import { passwordError } from '../lib/password-rules'
import { activityLog, customers, expenses, products, refunds, sales, stockMovements, storeSettings, users } from '../db/schema'
import type { ReceiptData, ReceiptLine } from '../lib/types'
import type { ExportTable } from '../lib/pdf'

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

type InvoiceRpcLine = {
  id: number
  productId: number
  article: string
  sku: string
  size: string | null
  quantity: number
  unitPrice: number
  subtotal: number
}

type InvoiceRpcResult = {
  invoiceId: number
  total: number
  itemCount: number
  lines: InvoiceRpcLine[]
}

async function currentSeller(): Promise<{ sellerName: string; role?: string }> {
  const session = await auth()
  const [record] = session?.user
    ? await db.select({ name: users.name, role: users.role }).from(users).where(eq(users.id, Number(session.user.id))).limit(1)
    : []
  return {
    sellerName: (record?.name ?? session?.user?.name ?? 'Caisse').slice(0, 160),
    role: record?.role ?? session?.user?.role,
  }
}

function toReceipt(result: InvoiceRpcResult, paymentMethod: string, soldAt: Date): ReceiptData {
  const lines: ReceiptLine[] = (result.lines ?? []).map((line) => ({
    id: Number(line.id),
    productId: Number(line.productId),
    article: String(line.article),
    sku: String(line.sku),
    size: line.size == null ? null : String(line.size),
    quantity: Number(line.quantity),
    unitPrice: Number(line.unitPrice),
    subtotal: Number(line.subtotal),
  }))
  const first = lines[0]
  return {
    id: result.invoiceId,
    invoiceId: result.invoiceId,
    dateLabel: frLongDate.format(soldAt),
    hourLabel: frHour.format(soldAt),
    customer: '',
    lines,
    article: first?.article ?? '',
    sku: first?.sku ?? '',
    size: first?.size ?? null,
    quantity: first?.quantity ?? 0,
    unitPrice: first?.unitPrice ?? 0,
    total: result.total,
    invoiceTotal: result.total,
    method: paymentMethod.replace('Carte bancaire', 'Carte'),
    seller: '',
  }
}

async function requireAdmin(): Promise<ActionResult | null> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Session expirée. Reconnectez-vous.' }
  const [record] = await db
    .select({ role: users.role, status: users.status })
    .from(users)
    .where(eq(users.id, Number(session.user.id)))
    .limit(1)
  if (!record) return { ok: false, error: 'Compte introuvable.' }
  if (record.status !== 'Actif') return { ok: false, error: 'Ce compte est suspendu.' }
  if (record.role !== 'Administratrice') return { ok: false, error: 'Réservé à l’Administratrice.' }
  return null
}

/** Logo PNG/JPG redimensionné côté client, stocké en data URL (compatible Vercel, comme les photos produits). */
export async function uploadStoreLogo(dataUrl: string): Promise<ActionResult & { logo?: string }> {
  try {
    const denied = await requireAdmin()
    if (denied) return denied
    const logo = imageValue(dataUrl)
    if (!logo) return { ok: false, error: 'Logo invalide.' }
    await db
      .insert(storeSettings)
      .values({ id: 1, logo, updatedAt: new Date() })
      .onConflictDoUpdate({ target: storeSettings.id, set: { logo, updatedAt: new Date() } })
    void logActivity('Logo boutique', 'Logo personnalisé mis à jour')
    revalidatePath('/')
    revalidatePath('/login')
    return { ok: true, logo }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur serveur.' }
  }
}

export async function removeStoreLogo(): Promise<ActionResult> {
  try {
    const denied = await requireAdmin()
    if (denied) return denied
    await db.update(storeSettings).set({ logo: null, updatedAt: new Date() }).where(eq(storeSettings.id, 1))
    void logActivity('Logo boutique', 'Logo personnalisé supprimé — retour au logo par défaut')
    revalidatePath('/')
    revalidatePath('/login')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur serveur.' }
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

export type SaleItemInput = {
  productId: number
  quantity: number
  unitPrice?: number
  size?: string | null
}

type RegisterSaleInput = {
  items?: SaleItemInput[]
  /** Ancienne signature mono-article, conservée pour ne casser aucun appel existant. */
  productId?: number
  quantity?: number
  unitPrice?: number
  size?: string | null
  paymentMethod: string
  customerName?: string
  customerId?: number | null
}

export async function registerSale(input: RegisterSaleInput): Promise<ActionResult & { receipt?: ReceiptData }> {
  try {
    const denied = await requireCapability('sales')
    if (denied) return denied
    if (!PAYMENT_METHODS.includes(input.paymentMethod)) return { ok: false, error: 'Moyen de paiement invalide.' }

    const rawItems: SaleItemInput[] = Array.isArray(input.items)
      ? input.items
      : input.productId != null
        ? [{ productId: input.productId, quantity: input.quantity ?? 1, unitPrice: input.unitPrice, size: input.size ?? null }]
        : []
    if (rawItems.length === 0) return { ok: false, error: 'La facture est vide : ajoutez au moins un article.' }
    if (rawItems.length > 100) return { ok: false, error: 'Trop de lignes sur cette facture (100 maximum).' }

    // Un doublon (même article + même taille) est cumulé côté serveur également.
    const merged = new Map<string, SaleItemInput>()
    for (const item of rawItems) {
      const productId = Math.trunc(Number(item.productId))
      const quantity = Math.trunc(Number(item.quantity))
      if (!Number.isInteger(productId) || productId <= 0) return { ok: false, error: 'Article invalide.' }
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 999) return { ok: false, error: 'Quantité invalide (1 à 999).' }
      if (item.unitPrice != null && (!Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0)) {
        return { ok: false, error: 'Prix unitaire invalide.' }
      }
      const size = item.size ? String(item.size).trim().slice(0, 40) : null
      const key = `${productId}|${size ?? ''}`
      const existing = merged.get(key)
      merged.set(key, existing ? { ...existing, quantity: existing.quantity + quantity } : { productId, quantity, unitPrice: item.unitPrice, size })
    }
    const items = [...merged.values()]
    if (items.some((item) => item.quantity > 999)) return { ok: false, error: 'Quantité totale trop élevée pour une ligne.' }

    const ids = [...new Set(items.map((item) => item.productId))]
    const productRows = await db.select().from(products).where(inArray(products.id, ids))
    const productById = new Map(productRows.map((product) => [product.id, product]))
    if (productRows.length !== ids.length) return { ok: false, error: 'Un article de la facture est introuvable.' }

    const seller = await currentSeller()
    const canChangePrice = can(seller.role, 'catalog') || can(seller.role, 'stock')
    const now = new Date()

    for (const item of items) {
      const product = productById.get(item.productId)!
      if (!product.isActive) return { ok: false, error: `« ${product.name} » est archivé et ne peut plus être vendu.` }
      const hasSizes = !!product.sizes && Object.keys(product.sizes).length > 0
      if (hasSizes) {
        if (!item.size) return { ok: false, error: `« ${product.name} » se décline en tailles — choisissez une taille.` }
        if (!(item.size in product.sizes!)) return { ok: false, error: `Taille ${item.size} inconnue pour « ${product.name} ».` }
      }
      const available = hasSizes && item.size ? (product.sizes?.[item.size] ?? 0) : product.stock
      if (available <= 0) return { ok: false, error: `« ${product.name} »${item.size ? ` — Taille ${item.size}` : ''} est en rupture de stock.` }
      if (available < item.quantity) {
        return { ok: false, error: `Stock insuffisant pour « ${product.name} »${item.size ? ` — Taille ${item.size}` : ''} : ${available} disponible(s), ${item.quantity} demandé(s).` }
      }
      item.size = hasSizes ? item.size : null
      const requestedPrice = item.unitPrice == null ? null : Math.round(Number(item.unitPrice))
      item.unitPrice = canChangePrice && requestedPrice != null ? requestedPrice : product.price
      if (!Number.isInteger(item.unitPrice) || (item.unitPrice as number) < 0 || (item.unitPrice as number) > 1_000_000) {
        return { ok: false, error: 'Prix unitaire invalide.' }
      }
    }

    let customerName = input.customerName?.trim() || 'Cliente'
    let customerId = input.customerId ?? null
    if (customerId != null && Number.isInteger(Number(customerId))) {
      const [client] = await db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.id, Number(customerId))).limit(1)
      if (!client) return { ok: false, error: 'Cliente introuvable.' }
      customerName = client.name
      customerId = client.id
    } else {
      customerId = null
    }

    // create_invoice() exécute toute l'écriture (facture + lignes + stock + mouvements)
    // dans une seule transaction PostgreSQL — indispensable avec le driver neon-http,
    // qui ne prend pas en charge db.transaction().
    const response = await db.execute(sql`SELECT public.create_invoice(
      ${customerId}::integer,
      ${customerName.slice(0, 160)}::varchar,
      ${input.paymentMethod}::varchar,
      ${seller.sellerName}::varchar,
      ${JSON.stringify(items)}::jsonb
    ) AS result`)
    const rows = (response as unknown as { rows?: Array<{ result: InvoiceRpcResult }> }).rows ?? []
    const result = rows[0]?.result
    if (!result?.invoiceId) throw new Error('La facture n’a pas pu être créée.')

    const receipt = toReceipt(result, input.paymentMethod, now)
    receipt.customer = customerName
    receipt.seller = seller.sellerName

    void logActivity('Vente', `Facture N°${String(result.invoiceId).padStart(4, '0')} · ${result.itemCount} ligne(s) · ${result.total} FCFA — ${customerName} (${input.paymentMethod})`)
    revalidatePath('/')
    return { ok: true, receipt }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur.'
    return { ok: false, error: message.replace(/^error:\s*/i, '').slice(0, 300) }
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

export async function exportCSV(kind: 'sales' | 'products' | 'expenses' | 'customers', filters?: { period?: 'today' | 'week' | 'month' | 'all'; type?: 'sales' | 'refunds' | 'all'; seller?: string }): Promise<ActionResult & { csv?: string; pdf?: ExportTable; filename?: string }> {
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
      const paid = visible.filter((sale) => !refundedIds.has(sale.id)).reduce((sum, sale) => sum + sale.unitPrice * sale.quantity, 0)
      const refunded = visible.filter((sale) => refundedIds.has(sale.id)).reduce((sum, sale) => sum + sale.unitPrice * sale.quantity, 0)
      const periodLabel = period === 'today' ? "aujourd'hui" : period === 'week' ? '7 derniers jours' : period === 'month' ? 'ce mois-ci' : 'toutes périodes'
      const pdf: ExportTable = {
        title: 'Export des ventes',
        subtitle: `Période : ${periodLabel} · ${type === 'all' ? 'toutes opérations' : type === 'refunds' ? 'remboursements' : 'ventes'} · ${visible.length} ligne(s)`,
        blocks: [{
          columns: rows[0].map(String),
          rows: rows.slice(1),
          totals: [{ label: 'Total payé', value: `${paid} FCFA` }, { label: 'Total remboursé', value: `${refunded} FCFA` }],
        }],
      }
      void logActivity('Export ventes', `${visible.length} ventes`)
      return { ok: true, csv: buildCSV(rows), pdf, filename: `ventes-${frDate.format(new Date()).replaceAll('/', '-')}.csv` }
    }

    if (kind === 'products') {
      const rows = await db.select().from(products).orderBy(products.id)
      const out: Array<Array<string | number>> = [
        ['Référence', 'Nom', 'Catégorie', 'Prix', "Coût d'achat", 'Stock', 'Tailles', 'Seuil min.', 'Statut'],
        ...rows.map((p) => [p.sku, p.name, p.category, p.price, p.purchasePrice, p.stock, p.sizes ? Object.entries(p.sizes).map(([s, q]) => `${s}:${q}`).join(', ') : '', p.minStock, p.isActive ? 'Actif' : 'Archivé']),
      ]
      const stockTotal = rows.reduce((sum, product) => sum + product.stock, 0)
      const pdf: ExportTable = {
        title: 'Export du catalogue',
        subtitle: `${rows.length} référence(s)`,
        blocks: [{
          columns: out[0].map(String),
          rows: out.slice(1),
          totals: [{ label: 'Stock total', value: `${stockTotal} pièce(s)` }],
        }],
      }
      void logActivity('Export catalogue', `${rows.length} produits`)
      return { ok: true, csv: buildCSV(out), pdf, filename: `produits-${frDate.format(new Date()).replaceAll('/', '-')}.csv` }
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
      const spentTotal = [...totals.values()].reduce((sum, entry) => sum + entry.total, 0)
      const pdf: ExportTable = {
        title: 'Export du répertoire clientes',
        subtitle: `${clientRows.length} cliente(s)`,
        blocks: [{
          columns: out[0].map(String),
          rows: out.slice(1),
          totals: [{ label: 'Total dépensé', value: `${spentTotal} FCFA` }],
        }],
      }
      void logActivity('Export clientes', `${clientRows.length} clientes`)
      return { ok: true, csv: buildCSV(out), pdf, filename: `clientes-${frDate.format(new Date()).replaceAll('/', '-')}.csv` }
    }

    const rows = await db.select().from(expenses).orderBy(desc(expenses.date))
    const out: Array<Array<string | number>> = [
      ['Date', 'Libellé', 'Catégorie', 'Montant'],
      ...rows.map((e) => [frDate.format(new Date(e.date)), e.label, e.category, e.amount]),
    ]
    const spent = rows.reduce((sum, expense) => sum + expense.amount, 0)
    const pdf: ExportTable = {
      title: 'Export des dépenses',
      subtitle: `${rows.length} dépense(s)`,
      blocks: [{
        columns: out[0].map(String),
        rows: out.slice(1),
        totals: [{ label: 'Total des dépenses', value: `${spent} FCFA` }],
      }],
    }
    void logActivity('Export dépenses', `${rows.length} dépenses`)
    return { ok: true, csv: buildCSV(out), pdf, filename: `depenses-${frDate.format(new Date()).replaceAll('/', '-')}.csv` }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erreur serveur.' }
  }
}

export async function exportReport(): Promise<ActionResult & { csv?: string; pdf?: ExportTable; filename?: string }> {
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
    const pdf: ExportTable = {
      title: 'Rapport mensuel',
      subtitle: monthLabel,
      blocks: [
        {
          title: 'Synthèse',
          columns: ['Indicateur', 'Valeur'],
          rows: [
            ['CA du mois', revenue],
            ['Nombre de ventes', monthSales.length],
            ["Coût des ventes du mois", costOfGoods],
            ['Marge brute du mois (coût)', margin],
            ['Panier moyen', monthSales.length === 0 ? 0 : Math.round(revenue / monthSales.length)],
            ['Dépenses du mois', expensesMonth],
            ['Résultat net du mois (marge − dépenses)', margin - expensesMonth],
          ],
        },
        {
          title: 'Ventes par catégorie',
          columns: ['Catégorie', 'Montant', 'Part', 'Ventes'],
          rows: [...categoryTotals.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name, total]) => [name, total, categoryTotal === 0 ? 0 : `${Math.round((total / categoryTotal) * 100)}%`, categoryCount.get(name) ?? 0]),
        },
        {
          title: 'Top produits vendus',
          columns: ['Produit', 'Nb ventes'],
          rows: [...productCount.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([productId, count]) => [productById.get(productId)?.name ?? 'Produit', count]),
        },
        {
          title: 'Par moyen de paiement',
          columns: ['Moyen', 'Montant', 'Ventes'],
          rows: [...methodTotals.entries()].map(([method, stats]) => [method, stats.amount, stats.count]),
          totals: [{ label: 'CA du mois', value: `${revenue} FCFA` }],
        },
      ],
    }
    void logActivity('Export rapport', `${monthLabel} · CA ${revenue} FCFA`)

    return { ok: true, csv: buildCSV(rows), pdf, filename: `rapport-mensuel-${frDate.format(now).replaceAll('/', '-')}.csv` }
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