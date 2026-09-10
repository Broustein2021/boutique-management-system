import { boolean, integer, jsonb, pgTable, serial, text, timestamp, varchar, uniqueIndex } from 'drizzle-orm/pg-core'

export const products = pgTable(
  'products',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    sku: varchar('sku', { length: 80 }).notNull(),
    category: varchar('category', { length: 80 }).notNull().default('Accessoires'),
    price: integer('price').notNull().default(0),
    purchasePrice: integer('purchase_price').notNull().default(0),
    stock: integer('stock').notNull().default(0),
    minStock: integer('min_stock').notNull().default(5),
    color: varchar('color', { length: 40 }).notNull().default('rose'),
    initials: varchar('initials', { length: 4 }).notNull().default('MA'),
    isActive: boolean('is_active').notNull().default(true),
    image: text('image'),
    sizes: jsonb('sizes').$type<Record<string, number>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('products_sku_unique').on(table.sku)],
)

export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 160 }).notNull(),
  phone: varchar('phone', { length: 40 }).notNull().default(''),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sales = pgTable('sales', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id),
  customerId: integer('customer_id').references(() => customers.id),
  customerName: varchar('customer_name', { length: 160 }).notNull().default('Cliente'),
  quantity: integer('quantity').notNull().default(1),
  unitPrice: integer('unit_price').notNull(),
  purchasePrice: integer('purchase_price').notNull().default(0),
  paymentMethod: varchar('payment_method', { length: 40 }).notNull().default('Espèces'),
  sellerName: varchar('seller_name', { length: 160 }).notNull().default('Caisse'),
  size: varchar('size', { length: 40 }),
  soldAt: timestamp('sold_at', { withTimezone: true }).notNull().defaultNow(),
})

export const activityLog = pgTable('activity_log', {
  id: serial('id').primaryKey(),
  userName: varchar('user_name', { length: 160 }).notNull().default('Utilisateur'),
  type: varchar('type', { length: 80 }).notNull().default('Action'),
  detail: varchar('detail', { length: 400 }).notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const refunds = pgTable('refunds', {
  id: serial('id').primaryKey(),
  saleId: integer('sale_id')
    .notNull()
    .references(() => sales.id),
  reason: varchar('reason', { length: 160 }).notNull().default('Remboursement'),
  refundedBy: varchar('refunded_by', { length: 160 }).notNull().default('Caisse'),
  refundedAt: timestamp('refunded_at', { withTimezone: true }).notNull().defaultNow(),
})

export const stockMovements = pgTable('stock_movements', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id),
  change: integer('change').notNull(),
  reason: varchar('reason', { length: 160 }).notNull().default('Ajustement'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const expenses = pgTable('expenses', {
  id: serial('id').primaryKey(),
  label: varchar('label', { length: 200 }).notNull(),
  category: varchar('category', { length: 80 }).notNull().default('Autres'),
  amount: integer('amount').notNull(),
  date: timestamp('date', { withTimezone: true }).notNull().defaultNow(),
})

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 160 }).notNull(),
  email: varchar('email', { length: 200 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull().default(''),
  role: varchar('role', { length: 80 }).notNull().default('Caissière'),
  status: varchar('status', { length: 40 }).notNull().default('Actif'),
  initials: varchar('initials', { length: 4 }).notNull().default('AM'),
})

export type Product = typeof products.$inferSelect
export type Customer = typeof customers.$inferSelect
export type Sale = typeof sales.$inferSelect
export type StockMovement = typeof stockMovements.$inferSelect
export type Expense = typeof expenses.$inferSelect
export type User = typeof users.$inferSelect
export type Refund = typeof refunds.$inferSelect
export type ActivityEntry = typeof activityLog.$inferSelect