import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const DRIVER_PACKAGES = [
  'drizzle-orm',
  'pg',
  'postgres',
  'mysql2',
  'better-sqlite3',
  'sqlite3',
  '@libsql/client',
  '@neondatabase/serverless',
  '@planetscale/database',
  'kysely',
  'typeorm',
  'prisma',
  '@prisma/client',
  'mongodb',
  'redis',
  'ioredis',
] as const

export const DRIVER_CONSTRUCTORS = ['Pool', 'Client', 'Database'] as const

export const CONFIG_ENV_OBJECT = 'process' as const
export const CONFIG_ENV_PROPERTY = 'env' as const

export const DRIVER_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const DRIVER_CONSTRUCTION_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const CONNECTION_CONFIG_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const DRIVER_IMPORT_EXPECTED =
  'no driver constructor or connection-config import — the store is technology-blind' as const

export const DRIVER_IMPORT_ACTUAL = 'an import of a driver package' as const

export const DRIVER_IMPORT_FIX =
  'delete the import and take the driver via the injected DB Context.Tag (yield* DB) — the adapter owns the driver' as const

export const DRIVER_CONSTRUCTION_EXPECTED = 'the driver constructed only inside the adapter' as const

export const DRIVER_CONSTRUCTION_ACTUAL = 'a driver client constructed here' as const

export const DRIVER_CONSTRUCTION_FIX =
  'yield* the injected DB tag instead — the adapter owns the driver lifecycle' as const

export const CONNECTION_CONFIG_EXPECTED =
  'no connection config read in the store — configuration arrives via the port' as const

export const CONNECTION_CONFIG_ACTUAL = 'a process.env read' as const

export const CONNECTION_CONFIG_FIX =
  'receive configuration through the injected port — the store never reads connection config' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban driver construction in *.store.ts: no driver package import (static or dynamic), no new Pool/Client/Database, and no process.env connection-config read. The store takes its driver from an injected Context.Tag.',
  },
  schema: [Options],
  messages: {
    driverImport: DRIVER_IMPORT_MESSAGE,
    driverConstruction: DRIVER_CONSTRUCTION_MESSAGE,
    connectionConfig: CONNECTION_CONFIG_MESSAGE,
  },
} as const
