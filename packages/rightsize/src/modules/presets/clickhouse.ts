/**
 * The clickhouse preset — upstream `src/modules/clickhouse.ts`
 * (`ClickHouseContainer`): HTTP 8123 (what the module's helpers use) plus
 * the native protocol port 9000. `/ping` returns `Ok.` on 200; the
 * entrypoint's user/database provisioning runs a second server pass, hence
 * the 180s startup timeout.
 */
import type { ModulePreset } from '../preset.schema.js'

export const ClickHousePreset: ModulePreset = {
  id: 'clickhouse',
  description: 'A single-node ClickHouse, HTTP (8123) + native (9000), defaulted to test/test/test.',
  image: 'clickhouse/clickhouse-server:latest',
  expectedRepository: 'clickhouse/clickhouse-server',
  env: [
    ['CLICKHOUSE_USER', 'test'],
    ['CLICKHOUSE_PASSWORD', 'test'],
    ['CLICKHOUSE_DB', 'test'],
  ],
  ports: [8123, 9000],
  aliases: [],
  waitStrategy: { _tag: 'ForHttp', path: '/ping', port: 8123 },
  readinessSteps: [],
  backendRestrictions: [],
  specTransforms: [],
  startupTimeoutMs: 180_000,
  helpers: {
    httpUrl: { _tag: 'Url', scheme: 'http', guestPort: 8123 },
  },
}
