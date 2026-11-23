import { desc, eq } from 'drizzle-orm'

import { db } from './db'
import { can } from './permissions'
import { activityLog, customers, expenses, products, refunds, sales, storeSettings, users } from '../db/schema'
import type {
  InitialData,
} from './types'

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

const frDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const frHistory = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const frHour = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const frShortDay = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' })
const frWeekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' })

const inRange = (d: Date, a: Date, b: Date) => d >= a && d < b

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** i))
    }
  }
  throw lastError
}

/** Logo configuré dans les réglages. Repli silencieux si la table n'existe pas encore. */
export async function getStoreLogo(): Promise<string | null> {
  try {
    const [row] = await db
      .select({ logo: storeSettings.logo })
      .from(storeSettings)
      .where(eq(storeSettings.id, 1))
      .limit(1)
    return row?.logo ?? null
  } catch {
    return null
  }
}

export async function getDashboardData(role?: string | null): Promise<InitialData> {
  const now = new Date()
  const [productRows, saleRows, expenseRows, userRows, refundRows, logRows, customerRows, logoRows] = await withRetry(() =>
    Promise.all([
      db.select().from(products).orderBy(products.id),
      db.select().from(sales).orderBy(desc(sales.soldAt)),
      db.select().from(expenses).orderBy(desc(expenses.date)),
      db.select().from(users).orderBy(users.id),
      db.select().from(refunds),
      db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(60),
      db.select().from(customers).orderBy(customers.id),
      getStoreLogo().then((logo) => (logo ? [{ logo }] : [])),
    ]),
  )
  const refundedIds = new Set(refundRows.map((r) => r.saleId))

  const productById = new Map(productRows.map((p) => [p.id, p]))
  const activeRows = productRows.filter((p) => p.isActive)

  // Une facture = plusieurs lignes `sales`. On regroupe ces lignes pour que le reçu
  // ouvert depuis l'historique affiche l'ensemble de l'achat, y compris les anciennes
  // ventes mono-article (sans invoice_id, reconstituées à la migration 0010).
  type ReceiptLineDTO = InitialData['sales'][number]['lines'][number]
  const invoiceKeyOf = (sale: (typeof saleRows)[number]) => sale.invoiceId ?? sale.id
  const linesByInvoice = new Map<number, ReceiptLineDTO[]>()
  const invoiceTotals = new Map<number, number>()
  for (const sale of saleRows) {
    const key = invoiceKeyOf(sale)
    const product = productById.get(sale.productId)
    const list = linesByInvoice.get(key) ?? []
    list.push({
      id: sale.id,
      productId: sale.productId,
      article: product?.name ?? 'Article',
      sku: product?.sku ?? '',
      size: sale.size ?? null,
      quantity: sale.quantity,
      unitPrice: sale.unitPrice,
      subtotal: sale.unitPrice * sale.quantity,
    })
    linesByInvoice.set(key, list)
    invoiceTotals.set(key, (invoiceTotals.get(key) ?? 0) + sale.unitPrice * sale.quantity)
  }

  const canSeeCosts = can(role, 'catalog') || can(role, 'stock')
  const canSeeUsers = can(role, 'users')
  const canSeeExpenses = can(role, 'expenses')
  const canSeeActivity = can(role, 'activity')

  const today = startOfDay(now)
  const tomorrow = addDays(today, 1)
  const yesterdayStart = addDays(today, -1)
  const weekStart = addDays(today, -6)
  const thisMonthStart = startOfMonth(now)
  const prevMonthStart = new Date(thisMonthStart.getFullYear(), thisMonthStart.getMonth() - 1, 1)

  let revenueMonth = 0
  let revenuePrevMonth = 0
  let salesThisMonth = 0
  let salesPrevMonth = 0
  let salesToday = 0
  let salesYesterday = 0
  let weekRevenue = 0
  let costOfGoodsMonth = 0
  const chartTotals = new Map<string, number>()
  const categoryTotals = new Map<string, number>()
  const productCount = new Map<number, number>()

  for (const sale of saleRows) {
    if (refundedIds.has(sale.id)) continue
    const occurred = new Date(sale.soldAt)
    const amount = sale.unitPrice * sale.quantity
    const dayKey = occurred.toDateString()

    if (inRange(occurred, thisMonthStart, now)) {
      revenueMonth += amount
      salesThisMonth += 1
      costOfGoodsMonth += sale.purchasePrice * sale.quantity
    }
    if (inRange(occurred, prevMonthStart, thisMonthStart)) {
      revenuePrevMonth += amount
      salesPrevMonth += 1
    }
    if (inRange(occurred, today, tomorrow)) salesToday += 1
    if (inRange(occurred, yesterdayStart, today)) salesYesterday += 1
    if (inRange(occurred, weekStart, tomorrow)) {
      weekRevenue += amount
      chartTotals.set(dayKey, (chartTotals.get(dayKey) ?? 0) + amount)
    }
    const product = productById.get(sale.productId)
    if (product) {
      categoryTotals.set(product.category, (categoryTotals.get(product.category) ?? 0) + amount)
      productCount.set(sale.productId, (productCount.get(sale.productId) ?? 0) + 1)
    }
  }

  const customerTotals = new Map<number, { total: number; visits: number; last: number }>()
  for (const sale of saleRows) {
    if (refundedIds.has(sale.id)) continue
    if (sale.customerId == null) continue
    const entry = customerTotals.get(sale.customerId) ?? { total: 0, visits: 0, last: 0 }
    entry.total += sale.unitPrice * sale.quantity
    entry.visits += 1
    entry.last = Math.max(entry.last, new Date(sale.soldAt).getTime())
    customerTotals.set(sale.customerId, entry)
  }
  const customersDTO = customerRows.map((client) => {
    const entry = customerTotals.get(client.id) ?? { total: 0, visits: 0, last: 0 }
    return {
      id: client.id,
      name: client.name,
      phone: client.phone,
      initials: client.name.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 2),
      totalSpent: entry.total,
      visits: entry.visits,
      lastVisitLabel: entry.last > 0 ? frHistory.format(new Date(entry.last)) : '—',
      createdLabel: frShortDay.format(new Date(client.createdAt)),
    }
  })

  const productsDTO = productRows.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    category: p.category,
    price: p.price,
    purchasePrice: canSeeCosts ? p.purchasePrice : 0,
    stock: p.stock,
    min: p.minStock,
    color: p.color,
    initials: p.initials,
    image: p.image ?? null,
    active: p.isActive,
    sizes: p.sizes ?? null,
  }))

  const allCategories = [...new Set(activeRows.map((p) => p.category))].sort()

  const revenueDelta = revenuePrevMonth === 0 ? 100 : Math.round(((revenueMonth - revenuePrevMonth) / revenuePrevMonth) * 100)
  const avgBasket = salesThisMonth === 0 ? 0 : Math.round(revenueMonth / salesThisMonth)
  const avgBasketPrev = salesPrevMonth === 0 ? 0 : Math.round(revenuePrevMonth / salesPrevMonth)
  const avgBasketDelta = avgBasketPrev === 0 ? 100 : Math.round(((avgBasket - avgBasketPrev) / avgBasketPrev) * 100)

  const chart: InitialData['chart'] = []
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today, -i)
    const label = frWeekday.format(day)
    chart.push({ day: label.charAt(0).toUpperCase() + label.slice(1, 4), total: chartTotals.get(day.toDateString()) ?? 0 })
  }

  const saleDTO = (sale: (typeof saleRows)[number]): InitialData['sales'][number] => {
    const product = productById.get(sale.productId)
    const invoiceKey = invoiceKeyOf(sale)
    const productName = product?.name ?? 'Article'
    const productSku = product?.sku ?? ''
    const lineTotal = sale.unitPrice * sale.quantity
    return {
      id: sale.id,
      invoiceId: invoiceKey,
      customerId: sale.customerId ?? null,
      customer: sale.customerName,
      article: productName,
      sku: productSku,
      quantity: sale.quantity,
      unitPrice: sale.unitPrice,
      total: lineTotal,
      invoiceTotal: invoiceTotals.get(invoiceKey) ?? lineTotal,
      lines: linesByInvoice.get(invoiceKey) ?? [{
        id: sale.id,
        productId: sale.productId,
        article: productName,
        sku: productSku,
        size: sale.size ?? null,
        quantity: sale.quantity,
        unitPrice: sale.unitPrice,
        subtotal: lineTotal,
      }],
      method: sale.paymentMethod.replace('Carte bancaire', 'Carte'),
      size: sale.size ?? null,
      time: frHour.format(new Date(sale.soldAt)),
      soldAt: sale.soldAt.toISOString(),
      dateLabel: frHistory.format(new Date(sale.soldAt)),
      hourLabel: frHour.format(new Date(sale.soldAt)),
      seller: sale.sellerName,
      refunded: refundedIds.has(sale.id),
    }
  }

  const allSalesDTO = saleRows.map(saleDTO)
  const recentSales = allSalesDTO.slice(0, 8)

  const expensesMonth = expenseRows
    .filter((e) => inRange(e.date, thisMonthStart, now))
    .reduce((sum, e) => sum + e.amount, 0)

  const expensesDTO = expenseRows.map((e) => ({
    id: e.id,
    label: e.label,
    category: e.category,
    amount: e.amount,
    dateLabel: frShortDay.format(new Date(e.date)),
  }))

  const usersDTO = userRows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    initials: u.initials,
  }))

  const activityDTO = logRows.map((entry) => ({
    id: entry.id,
    userName: entry.userName,
    type: entry.type,
    detail: entry.detail,
    timeLabel: `${frShortDay.format(new Date(entry.createdAt))} · ${frHour.format(new Date(entry.createdAt))}`,
  }))

  const sortedCategories = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1])
  const categoryTotal = sortedCategories.reduce((sum, [, total]) => sum + total, 0)
  const categories = sortedCategories.slice(0, 3).map(([name, total]) => ({
    name,
    total,
    pct: categoryTotal === 0 ? 0 : Math.round((total / categoryTotal) * 100),
  }))

  const topProducts = [...productCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([productId, count]) => ({ name: productById.get(productId)?.name ?? 'Produit', count }))

  const lowStockCount = activeRows.filter((p) => p.stock <= p.minStock).length
  const totalStock = activeRows.reduce((sum, p) => sum + p.stock, 0)
  const stockValueCost = activeRows.reduce((sum, p) => sum + p.stock * p.purchasePrice, 0)
  const stockValueRetail = activeRows.reduce((sum, p) => sum + p.stock * p.price, 0)

  const todayLabel = frDay.format(now).toUpperCase()
  const historyLabel = `${frHistory.format(now)} · ${salesThisMonth} transactions`

  return {
    products: productsDTO,
    allCategories,
    stats: {
      revenueMonth,
      revenueDelta,
      salesToday,
      salesTodayDelta: salesToday - salesYesterday,
      avgBasket,
      avgBasketDelta,
      totalStock,
      lowStockCount,
      costOfGoodsMonth: canSeeCosts ? costOfGoodsMonth : 0,
      marginMonth: canSeeCosts ? revenueMonth - costOfGoodsMonth : 0,
      stockValueCost: canSeeCosts ? stockValueCost : 0,
      stockValueRetail,
    },
    chart,
    weekRevenue,
    salesThisMonth,
    returnsCount: refundRows.filter((r) => inRange(r.refundedAt, thisMonthStart, now)).length,
    recentSales,
    sales: allSalesDTO,
    expenses: canSeeExpenses ? expensesDTO : [],
    expensesMonth: canSeeExpenses ? expensesMonth : 0,
    users: canSeeUsers ? usersDTO : [],
    categories,
    topProducts,
    activity: canSeeActivity ? activityDTO : [],
    customers: customersDTO,
    storeLogo: logoRows[0]?.logo ?? null,
    todayLabel,
    historyLabel,
  }
}
