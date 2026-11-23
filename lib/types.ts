export type Section =
  | 'dashboard'
  | 'ventes'
  | 'produits'
  | 'stock'
  | 'depenses'
  | 'rapports'
  | 'clientes'
  | 'utilisateurs'
  | 'journal'
  | 'parametres'

export type ProductDTO = {
  id: number
  name: string
  sku: string
  category: string
  price: number
  purchasePrice: number
  stock: number
  min: number
  color: string
  initials: string
  image: string | null
  active: boolean
  sizes: Record<string, number> | null
}

export type ReceiptLine = {
  id: number
  productId: number
  article: string
  sku: string
  size: string | null
  quantity: number
  unitPrice: number
  subtotal: number
}

export type ReceiptData = {
  id: number
  invoiceId: number
  dateLabel: string
  hourLabel: string
  customer: string
  lines: ReceiptLine[]
  // Champs de la première ligne, conservés pour les écrans/exports historiques.
  article: string
  sku: string
  quantity: number
  unitPrice: number
  total: number
  /** Total de la facture entière (utile pour un reçu ouvert depuis une ligne de l'historique). */
  invoiceTotal?: number
  method: string
  seller: string
  size?: string | null
}

export type CartLine = {
  key: string
  productId: number
  article: string
  sku: string
  color: string
  initials: string
  size: string | null
  quantity: number
  unitPrice: number
  available: number
}

export type SaleDTO = ReceiptData & { time: string; soldAt: string; refunded: boolean; customerId: number | null }

export type ExpenseDTO = {
  id: number
  label: string
  category: string
  amount: number
  dateLabel: string
}

export type UserDTO = {
  id: number
  name: string
  email: string
  role: string
  status: string
  initials: string
}

export type ChartPoint = { day: string; total: number }

export type CategoryShare = { name: string; total: number; pct: number }

export type TopProduct = { name: string; count: number }

export type CustomerDTO = {
  id: number
  name: string
  phone: string
  initials: string
  totalSpent: number
  visits: number
  lastVisitLabel: string
  createdLabel: string
}

export type ActivityDTO = {
  id: number
  userName: string
  type: string
  detail: string
  timeLabel: string
}

export type StatsDTO = {
  revenueMonth: number
  revenueDelta: number
  salesToday: number
  salesTodayDelta: number
  avgBasket: number
  avgBasketDelta: number
  totalStock: number
  lowStockCount: number
  costOfGoodsMonth: number
  marginMonth: number
  stockValueCost: number
  stockValueRetail: number
}

export type InitialData = {
  products: ProductDTO[]
  allCategories: string[]
  stats: StatsDTO
  chart: ChartPoint[]
  weekRevenue: number
  salesThisMonth: number
  returnsCount: number
  recentSales: SaleDTO[]
  sales: SaleDTO[]
  expenses: ExpenseDTO[]
  expensesMonth: number
  users: UserDTO[]
  categories: CategoryShare[]
  topProducts: TopProduct[]
  activity: ActivityDTO[]
  customers: CustomerDTO[]
  storeLogo: string | null
  todayLabel: string
  historyLabel: string
}