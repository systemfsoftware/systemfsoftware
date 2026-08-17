/**
 * The mariadb preset — upstream `src/modules/mariadb.ts`
 * (`MariaDBContainer`), mirroring the MySQL module's builder shape. The
 * readiness regex requires the `mariadb.org binary distribution` marker on
 * the same line as `port: 3306` — the temp init server prints `port: 0`
 * and can never false-match.
 */
import type { ModulePreset } from '../preset.js'

export const MariaDBPreset: ModulePreset = {
  id: 'mariadb',
  description: 'A single-node MariaDB (MySQL wire protocol), defaulting to test/test/test/test.',
  image: 'mariadb:latest',
  expectedRepository: 'mariadb',
  env: [
    ['MARIADB_USER', 'test'],
    ['MARIADB_PASSWORD', 'test'],
    ['MARIADB_DATABASE', 'test'],
    ['MARIADB_ROOT_PASSWORD', 'test'],
  ],
  ports: [3306],
  aliases: [],
  waitStrategy: {
    _tag: 'ForLogMessage',
    pattern: '.*port: 3306.*mariadb\\.org binary distribution.*',
    count: 1,
  },
  readinessSteps: [],
  backendRestrictions: [],
  specTransforms: [],
  helpers: {
    connectionString: {
      _tag: 'Url',
      scheme: 'mysql',
      guestPort: 3306,
      usernameEnv: 'MARIADB_USER',
      passwordEnv: 'MARIADB_PASSWORD',
      databaseEnv: 'MARIADB_DATABASE',
    },
  },
}
