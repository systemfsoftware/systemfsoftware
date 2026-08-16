/**
 * The spring-cloud-config preset — upstream `src/modules/spring-cloud-config.ts`
 * (`SpringCloudConfigContainer`). Paketo's memory calculator sizes this JVM
 * image above msb's default microVM RAM, so the 1024 MB floor is declared.
 */
import type { ModulePreset } from '../preset.schema.js'

export const SpringCloudConfigPreset: ModulePreset = {
  id: 'spring-cloud-config',
  description: 'A Spring Cloud Config Server, ready-checked via its actuator health endpoint.',
  image: 'hyness/spring-cloud-config-server:latest',
  expectedRepository: 'hyness/spring-cloud-config-server',
  env: [],
  ports: [8888],
  aliases: [],
  waitStrategy: { _tag: 'ForHttp', path: '/actuator/health', port: 8888 },
  readinessSteps: [],
  backendRestrictions: [],
  specTransforms: [],
  memoryLimitMb: 1024,
  helpers: {
    uri: { _tag: 'Url', scheme: 'http', guestPort: 8888 },
  },
}
