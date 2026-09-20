import type { EffectPgDatabase } from 'drizzle-orm/effect-pglite'
import { Context } from 'effect'

export type DrizzleDatabase = EffectPgDatabase

export class DrizzleSession extends Context.Service<DrizzleSession, DrizzleDatabase>()(
  '@systemfsoftware/example-inventory-fulfillment/store/DrizzleSession',
) {}
