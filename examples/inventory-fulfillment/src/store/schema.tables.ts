import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const warehouses = pgTable('warehouses', {
  id: text('id').primaryKey(),
  region: text('region').notNull(),
})

export const stockLots = pgTable('stock_lots', {
  id: text('id').primaryKey(),
  sku: text('sku').notNull(),
  warehouseId: text('warehouse_id').notNull().references(() => warehouses.id),
  quantityOnHand: integer('quantity_on_hand').notNull(),
  version: integer('version').notNull(),
  expiresAt: timestamp('expires_at'),
})

export const reservations = pgTable('reservations', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull(),
  customerId: text('customer_id').notNull(),
  sku: text('sku').notNull(),
  warehouseId: text('warehouse_id').notNull(),
  lotId: text('lot_id').notNull(),
  quantity: integer('quantity').notNull(),
  version: integer('version').notNull(),
  occurredAt: timestamp('occurred_at').notNull(),
})

export const auditEvents = pgTable('audit_events', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull(),
  actorId: text('actor_id').notNull(),
  decisionTag: text('decision_tag').notNull(),
  occurredAt: timestamp('occurred_at').notNull(),
})

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  tier: text('tier').notNull().default('Standard'),
  creditLimit: integer('credit_limit').notNull().default(0),
  outstandingBalance: integer('outstanding_balance').notNull().default(0),
  overdraftPrivilege: integer('overdraft_privilege').notNull().default(0),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull(),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
})
