/**
 * The redis preset — upstream `src/modules/redis.ts` (`RedisContainer`).
 * Readiness is anchored on Redis's own "Ready to accept connections" log
 * line, not a TCP probe: the port forwarder can accept before the guest
 * serves, and the log line sees through that window.
 */
import type { ModulePreset } from '../preset.schema.js'

export const RedisPreset: ModulePreset = {
  id: 'redis',
  description: 'A single-node Redis container, ready-checked on the "Ready to accept connections" log line.',
  image: 'redis:latest',
  expectedRepository: 'redis',
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
