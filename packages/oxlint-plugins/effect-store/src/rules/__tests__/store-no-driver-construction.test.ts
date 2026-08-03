import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { storeNoDriverConstruction } from '../store-no-driver-construction.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

const driverImportError = (name: string) => ({
  messageId: 'driverImport',
  data: {
    name,
    expected: 'no driver constructor or connection-config import — the store is technology-blind',
    actual: 'an import of a driver package',
    fix:
      'delete the import and take the driver via the injected DB Context.Tag (yield* DB) — the adapter owns the driver',
  },
})

const driverConstructionError = (name: string) => ({
  messageId: 'driverConstruction',
  data: {
    name,
    expected: 'the driver constructed only inside the adapter',
    actual: 'a driver client constructed here',
    fix: 'yield* the injected DB tag instead — the adapter owns the driver lifecycle',
  },
})

const connectionConfigError = (name: string) => ({
  messageId: 'connectionConfig',
  data: {
    name,
    expected: 'no connection config read in the store — configuration arrives via the port',
    actual: 'a process.env read',
    fix: 'receive configuration through the injected port — the store never reads connection config',
  },
})

ruleTester.run('store-no-driver-construction', storeNoDriverConstruction, {
  valid: [
    {
      name: 'Should_Pass_When_Driver_Comes_From_Port',
      code: `import * as Effect from 'effect/Effect'
import { DB } from './db.port.js'
export const save = Effect.fn(function* (decision: OrderDecision) {
  const db = yield* DB
  return yield* Effect.tryPromise(() => db.insert(decision))
})\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Effect_And_Domain_Imports_Only',
      code: `import { Schema as S } from 'effect/Schema'
import { decodeOrder } from './order.acl.js'
import { orders } from './order.shape.js'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_New_Is_A_Domain_Constructor',
      code: `export const missing = () => new OrderStoreError({ reason: 'missing' })\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Driver_Like_Relative_Module_Is_Imported',
      code: `import { pg } from './pg.js'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Driver_Like_Named_Module_Is_Imported',
      code: `import { pool } from './db-pool.js'\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Process_Object_Is_Read_Without_Env',
      code: `const pid = process.pid\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Env_Object_Is_Read_Without_Property',
      code: `const env = process.env\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Env_Property_Is_Computed_NonLiteral',
      code: `const url = process.env[key]\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_Driver_Constructor_Is_A_Member',
      code: `const pool = new db.Pool()\n`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Ignore_Driver_Imports_When_File_Is_Not_A_Store',
      code: `import { drizzle } from 'drizzle-orm/node-postgres'\nconst db = drizzle(process.env.DATABASE_URL!)\n`,
      filename: 'drizzle.adapter.ts',
    },
    {
      name: 'Should_Ignore_Driver_Construction_When_File_Is_An_Executor',
      code: `const pool = new Pool()\n`,
      filename: 'confirm-order.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_DriverImport_When_Store_Imports_Drizzle',
      code: `import { drizzle } from 'drizzle-orm/node-postgres'\n`,
      filename: 'order.store.ts',
      errors: [driverImportError('drizzle-orm/node-postgres')],
    },
    {
      name: 'Should_Report_DriverImport_When_Store_Imports_Pg',
      code: `import { Pool } from 'pg'\n`,
      filename: 'order.store.ts',
      errors: [driverImportError('pg')],
    },
    {
      name: 'Should_Report_DriverImport_When_Store_Imports_BetterSqlite3',
      code: `import Database from 'better-sqlite3'\n`,
      filename: 'order.store.ts',
      errors: [driverImportError('better-sqlite3')],
    },
    {
      name: 'Should_Report_DriverImport_When_Store_Imports_Scoped_Libsql',
      code: `import { createClient } from '@libsql/client'\n`,
      filename: 'order.store.ts',
      errors: [driverImportError('@libsql/client')],
    },
    {
      name: 'Should_Report_DriverImport_When_Store_Imports_Drizzle_Core',
      code: `import { pgTable } from 'drizzle-orm/pg-core'\n`,
      filename: 'order.store.ts',
      errors: [driverImportError('drizzle-orm/pg-core')],
    },
    {
      name: 'Should_Report_DriverImport_When_Type_Import_From_Driver',
      code: `import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'\n`,
      filename: 'order.store.ts',
      errors: [driverImportError('drizzle-orm/postgres-js')],
    },
    {
      name: 'Should_Report_DriverImport_When_Dynamic_Import_Of_Driver',
      code: `const m = yield* Effect.promise(() => import('pg'))\n`,
      filename: 'order.store.ts',
      errors: [driverImportError('pg')],
    },
    {
      name: 'Should_Report_DriverConstruction_When_New_Pool',
      code: `const pool = new Pool({ connectionString: 'x' })\n`,
      filename: 'order.store.ts',
      errors: [driverConstructionError('Pool')],
    },
    {
      name: 'Should_Report_DriverConstruction_When_New_Client',
      code: `const client = new Client()\n`,
      filename: 'order.store.ts',
      errors: [driverConstructionError('Client')],
    },
    {
      name: 'Should_Report_DriverConstruction_When_New_Database',
      code: `const database = new Database('orders.db')\n`,
      filename: 'order.store.ts',
      errors: [driverConstructionError('Database')],
    },
    {
      name: 'Should_Report_ConnectionConfig_When_ProcessEnv_Read',
      code: `const url = process.env.DATABASE_URL\n`,
      filename: 'order.store.ts',
      errors: [connectionConfigError('DATABASE_URL')],
    },
    {
      name: 'Should_Report_ConnectionConfig_When_Computed_Env_Read',
      code: `const url = process.env['DB_URL']\n`,
      filename: 'order.store.ts',
      errors: [connectionConfigError('DB_URL')],
    },
    {
      name: 'Should_Report_ConnectionConfig_When_NonConnection_Env_Read',
      code: `const mode = process.env.NODE_ENV\n`,
      filename: 'order.store.ts',
      errors: [connectionConfigError('NODE_ENV')],
    },
  ],
})
