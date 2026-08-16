/**
 * The cassandra preset — upstream `src/modules/cassandra.ts`
 * (`CassandraContainer`): the `GPG_KEYS` override is REQUIRED — the image's
 * baked build arg contains a literal tab that panics msb's VMM builder
 * before the guest boots; overriding it to an empty string is a no-op for
 * docker builds and safety for msb. Heap sized down, 2560 MB floor.
 */
import type { ModulePreset } from '../preset.schema.js'

export const CassandraPreset: ModulePreset = {
  id: 'cassandra',
  description: 'A single-node Cassandra (CQL 9042); GPG_KEYS tab-workaround declared; 2560 MB floor.',
  image: 'cassandra:latest',
  expectedRepository: 'cassandra',
  env: [
    ['GPG_KEYS', ''],
    ['MAX_HEAP_SIZE', '512M'],
    ['HEAP_NEWSIZE', '128M'],
  ],
  ports: [9042],
  aliases: [],
  waitStrategy: { _tag: 'ForLogMessage', pattern: '.*Starting listening for CQL clients.*', count: 1 },
  readinessSteps: [],
  backendRestrictions: [],
  specTransforms: [],
  startupTimeoutMs: 300_000,
  memoryLimitMb: 2560,
  helpers: {
    contactPoint: { _tag: 'Address', guestPort: 9042 },
    cqlPort: { _tag: 'PortValue', guestPort: 9042 },
    localDatacenter: { _tag: 'Constant', value: 'datacenter1' },
  },
}
