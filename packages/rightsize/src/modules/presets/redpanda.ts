/**
 * The redpanda preset — upstream `src/modules/redpanda.ts`
 * (`RedpandaContainer`): a single-node broker with its schema registry, both
 * advertised listeners post-allocated via the declared `TemplateCommand`
 * transform (EXTERNAL carries the mapped host port; INTERNAL stays on the
 * alias:port siblings resolve on a library network).
 */
import type { ModulePreset } from '../preset.js'

export const RedpandaPreset: ModulePreset = {
  id: 'redpanda',
  description: 'A single-node Redpanda broker (Kafka API-compatible) with its schema registry enabled.',
  image: 'redpandadata/redpanda:latest',
  expectedRepository: 'redpandadata/redpanda',
  env: [],
  ports: [9092, 9093, 8081],
  aliases: [],
  waitStrategy: { _tag: 'ForLogMessage', pattern: '.*Successfully started Redpanda.*', count: 1 },
  readinessSteps: [],
  backendRestrictions: [],
  specTransforms: [
    {
      _tag: 'TemplateCommand',
      command: [
        'redpanda',
        'start',
        '--mode',
        'dev-container',
        '--smp',
        '1',
        '--kafka-addr',
        'EXTERNAL://0.0.0.0:9092,INTERNAL://0.0.0.0:9093',
        '--advertise-kafka-addr',
        'EXTERNAL://127.0.0.1:${port:9092},INTERNAL://redpanda:9093',
        '--schema-registry-addr',
        '0.0.0.0:8081',
      ],
    },
  ],
  helpers: {
    bootstrapServers: { _tag: 'Url', scheme: 'PLAINTEXT', guestPort: 9092 },
    schemaRegistryUrl: { _tag: 'Url', scheme: 'http', guestPort: 8081 },
  },
}
