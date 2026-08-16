/**
 * The rabbitmq preset — upstream `src/modules/rabbitmq.ts`
 * (`RabbitMQContainer`): `rabbitmq:management` (the management plugin image
 * the readiness log line comes from), guest/guest credentials by default.
 */
import type { ModulePreset } from '../preset.js'

export const RabbitMQPreset: ModulePreset = {
  id: 'rabbitmq',
  description: 'A single-node RabbitMQ with the management plugin; guest/guest credentials by default.',
  image: 'rabbitmq:management',
  expectedRepository: 'rabbitmq',
  env: [],
  ports: [5672, 15672],
  aliases: [],
  waitStrategy: { _tag: 'ForLogMessage', pattern: '.*Server startup complete.*', count: 1 },
  readinessSteps: [],
  backendRestrictions: [],
  specTransforms: [],
  helpers: {
    amqpUrl: {
      _tag: 'Url',
      scheme: 'amqp',
      guestPort: 5672,
      usernameEnv: 'RABBITMQ_DEFAULT_USER',
      passwordEnv: 'RABBITMQ_DEFAULT_PASS',
    },
    managementUrl: { _tag: 'Url', scheme: 'http', guestPort: 15672 },
  },
}
