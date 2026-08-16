/**
 * The pinot preset — upstream `src/modules/pinot.ts` (`PinotContainer`): a
 * single-container QuickStart cluster (controller + broker + server + ZK).
 * The image bakes `-Xmx4G` into its launch scripts, so 4096 MB is a hard
 * floor, not a tunable default — measured upstream.
 */
import type { ModulePreset } from '../preset.schema.js'

export const PinotPreset: ModulePreset = {
  id: 'pinot',
  description: 'A single-container Apache Pinot QuickStart cluster (controller + broker + server + ZooKeeper).',
  image: 'apachepinot/pinot:latest',
  expectedRepository: 'apachepinot/pinot',
  env: [],
  command: ['QuickStart', '-type', 'EMPTY'],
  ports: [9000, 8000],
  aliases: [],
  waitStrategy: { _tag: 'ForHttp', path: '/health', port: 9000 },
  readinessSteps: [],
  backendRestrictions: [],
  specTransforms: [],
  startupTimeoutMs: 180_000,
  memoryLimitMb: 4096,
  helpers: {
    controllerUrl: { _tag: 'Url', scheme: 'http', guestPort: 9000 },
    brokerUrl: { _tag: 'Url', scheme: 'http', guestPort: 8000 },
  },
}
