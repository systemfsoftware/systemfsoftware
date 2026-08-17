/**
 * The flink preset — upstream `src/modules/flink.ts` (`FlinkContainer`): a
 * JobManager (REST 8081, RPC 6123). The declared backend restriction
 * captures upstream's known, adjudicated msb limitation: the docker-only
 * `withTaskManager()` companion needs a persistent bidirectional Pekko RPC
 * the msb exec-tunnel cannot carry (and the image ships no `nc`/`busybox`),
 * so the launch workflow's capability check rejects that combination
 * pre-I/O — the declared row below covers the JobManager alone, which runs
 * on both backends.
 */
import type { ModulePreset } from '../preset.js'

export const FlinkPreset: ModulePreset = {
  id: 'flink',
  description: 'A Flink JobManager (REST 8081, RPC 6123); TaskManager companion is docker-only, declared.',
  image: 'flink:latest',
  expectedRepository: 'flink',
  env: [['FLINK_PROPERTIES', 'jobmanager.rpc.address: flink-jobmanager']],
  command: ['jobmanager'],
  ports: [6123, 8081],
  aliases: ['flink-jobmanager'],
  waitStrategy: { _tag: 'ForHttp', path: '/overview', port: 8081 },
  readinessSteps: [],
  backendRestrictions: [
    { feature: 'withTaskManager() companion', backends: ['docker'] },
  ],
  specTransforms: [],
  startupTimeoutMs: 120_000,
  memoryLimitMb: 1024,
  helpers: {
    restUrl: { _tag: 'Url', scheme: 'http', guestPort: 8081 },
  },
}
