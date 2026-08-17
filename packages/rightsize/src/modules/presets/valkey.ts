/**
 * The valkey preset — upstream `src/modules/valkey.ts` (`ValkeyContainer`,
 * next to `RedisContainer`). `uri` deliberately uses `redis://`: every
 * mainstream client parses `redis://` and Valkey speaks the same wire
 * protocol.
 */
import type { ModulePreset } from '../preset.js'

export const ValkeyPreset: ModulePreset = {
  id: 'valkey',
  description: 'A single-node Valkey container (Redis-protocol-compatible fork of the Redis preset).',
  image: 'valkey/valkey:latest',
  expectedRepository: 'valkey/valkey',
  env: [],
  ports: [6379],
  aliases: [],
  waitStrategy: { _tag: 'ForLogMessage', pattern: '.*Ready to accept connections.*', count: 1 },
  readinessSteps: [],
  backendRestrictions: [],
  specTransforms: [],
  helpers: {
    uri: { _tag: 'Url', scheme: 'redis', guestPort: 6379 },
  },
}
