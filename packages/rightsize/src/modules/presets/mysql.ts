/**
 * The mysql preset — upstream `src/modules/mysql.ts` (`MySQLContainer`):
 * `test`/`test`/`test` trio plus `MYSQL_ROOT_PASSWORD=test`. The readiness
 * regex is anchored on the real server's `port: 3306` with a
 * non-digit-or-end boundary: the temp init server prints `port: 0` and the
 * X Plugin prints `33060`, both of which would false-match an unanchored
 * pattern or a naive occurrence count.
 */
import type { ModulePreset } from '../preset.schema.js'

export const MySQLPreset: ModulePreset = {
  id: 'mysql',
  description: 'A single-node MySQL, defaulting to test/test/test/test; readiness anchored on the real 3306 server.',
  image: 'mysql:latest',
  expectedRepository: 'mysql',
  env: [
    ['MYSQL_USER', 'test'],
    ['MYSQL_PASSWORD', 'test'],
    ['MYSQL_DATABASE', 'test'],
    ['MYSQL_ROOT_PASSWORD', 'test'],
  ],
  ports: [3306],
  aliases: [],
  waitStrategy: {
    _tag: 'ForLogMessage',
    pattern: '.*mysqld: ready for connections.*port: 3306($|[^0-9]).*',
    count: 1,
  },
  readinessSteps: [],
  backendRestrictions: [],
  specTransforms: [],
  startupTimeoutMs: 180_000,
  helpers: {
    connectionString: {
      _tag: 'Url',
      scheme: 'mysql',
      guestPort: 3306,
      usernameEnv: 'MYSQL_USER',
      passwordEnv: 'MYSQL_PASSWORD',
      databaseEnv: 'MYSQL_DATABASE',
    },
  },
}
