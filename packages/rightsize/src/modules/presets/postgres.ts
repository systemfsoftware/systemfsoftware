/**
 * The postgres preset — upstream `src/modules/postgres.ts`
 * (`PostgresContainer`): `test`/`test`/`test` user/password/database by
 * default, usable with zero configuration. The wait counts TWO
 * "ready to accept connections" lines — the entrypoint boots once to run
 * initdb, then again for real; the second listen is the durable one.
 */
import type { ModulePreset } from '../preset.schema.js'

export const PostgresPreset: ModulePreset = {
  id: 'postgres',
  description: 'A single-node PostgreSQL, defaulted to test/test/test so connectionString works unconfigured.',
  image: 'postgres:latest',
  expectedRepository: 'postgres',
  env: [
    ['POSTGRES_USER', 'test'],
    ['POSTGRES_PASSWORD', 'test'],
    ['POSTGRES_DB', 'test'],
    ['DOCKER_PG_LLVM_DEPS', ''],
  ],
  ports: [5432],
  aliases: [],
  waitStrategy: {
    _tag: 'ForLogMessage',
    pattern: '.*database system is ready to accept connections.*',
    count: 2,
  },
  readinessSteps: [],
  backendRestrictions: [],
  specTransforms: [],
  helpers: {
    connectionString: {
      _tag: 'Url',
      scheme: 'postgres',
      guestPort: 5432,
      usernameEnv: 'POSTGRES_USER',
      passwordEnv: 'POSTGRES_PASSWORD',
      databaseEnv: 'POSTGRES_DB',
    },
  },
}
