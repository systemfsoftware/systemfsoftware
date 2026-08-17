/**
 * The memcached preset — upstream `src/modules/memcached.ts`
 * (`MemcachedContainer`). Readiness is the declared protocol-level version
 * probe (memcached never logs on startup and the port forwarder accepts
 * before the guest listens), carried as a `ProtocolReply` readiness step.
 */
import type { ModulePreset } from '../preset.js'
import { memcachedVersionProbeStep } from '../readiness.js'

export const MemcachedPreset: ModulePreset = {
  id: 'memcached',
  description: 'A single-node Memcached container, ready-checked with a protocol-level `version` probe.',
  image: 'memcached:latest',
  expectedRepository: 'memcached',
  env: [],
  ports: [11211],
  aliases: [],
  waitStrategy: { _tag: 'ForPort' },
  readinessSteps: [memcachedVersionProbeStep()],
  backendRestrictions: [],
  specTransforms: [],
  helpers: {
    address: { _tag: 'Address', guestPort: 11211 },
  },
}
