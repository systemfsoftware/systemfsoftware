/**
 * The kafka preset — upstream `src/modules/kafka.ts` (`KafkaContainer`): a
 * single-node KRaft broker. The advertised listener must carry the mapped
 * host port, known only after allocation — that is upstream's
 * `customizeSpec`, declared here as the `TemplateEnv` transform. The
 * `KAFKA_HEAP_OPTS` override keeps the JVM inside msb's default RAM.
 */
import type { ModulePreset } from '../preset.schema.js'

export const KafkaPreset: ModulePreset = {
  id: 'kafka',
  description: 'A single-node Kafka broker in KRaft mode (no ZooKeeper), advertised listener post-allocated.',
  image: 'apache/kafka:latest',
  expectedRepository: 'apache/kafka',
  env: [
    ['KAFKA_NODE_ID', '1'],
    ['KAFKA_PROCESS_ROLES', 'broker,controller'],
    ['KAFKA_CONTROLLER_QUORUM_VOTERS', '1@localhost:9091'],
    ['KAFKA_LISTENERS', 'PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9091'],
    ['KAFKA_CONTROLLER_LISTENER_NAMES', 'CONTROLLER'],
    ['KAFKA_LISTENER_SECURITY_PROTOCOL_MAP', 'PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT'],
    ['KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR', '1'],
    ['KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS', '0'],
    ['KAFKA_HEAP_OPTS', '-Xmx256M -Xms256M'],
  ],
  ports: [9092],
  aliases: [],
  waitStrategy: { _tag: 'ForLogMessage', pattern: '.*Kafka Server started.*', count: 1 },
  readinessSteps: [],
  backendRestrictions: [],
  specTransforms: [
    { _tag: 'TemplateEnv', envKey: 'KAFKA_ADVERTISED_LISTENERS', template: 'PLAINTEXT://127.0.0.1:${port:9092}' },
  ],
  helpers: {
    bootstrapServers: { _tag: 'Url', scheme: 'PLAINTEXT', guestPort: 9092 },
  },
}
