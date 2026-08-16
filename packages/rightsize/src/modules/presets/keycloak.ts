/**
 * The keycloak preset — upstream `src/modules/keycloak.ts`
 * (`KeycloakContainer`): `quay.io/keycloak/keycloak:latest` with
 * `start-dev`. The expected repository is `keycloak/keycloak` — `quay.io`
 * strips as a registry host. Health lives on the management port (9000) in
 * 26.x, so readiness probes `/health/ready` there.
 */
import type { ModulePreset } from '../preset.schema.js'

export const KeycloakPreset: ModulePreset = {
  id: 'keycloak',
  description: 'A single-node Keycloak in start-dev mode; health/ready on the management interface (9000).',
  image: 'quay.io/keycloak/keycloak:latest',
  expectedRepository: 'keycloak/keycloak',
  env: [
    ['KC_BOOTSTRAP_ADMIN_USERNAME', 'admin'],
    ['KC_BOOTSTRAP_ADMIN_PASSWORD', 'admin'],
    ['KC_HEALTH_ENABLED', 'true'],
  ],
  command: ['start-dev'],
  ports: [8080, 9000],
  aliases: [],
  waitStrategy: { _tag: 'ForHttp', path: '/health/ready', port: 9000 },
  readinessSteps: [],
  backendRestrictions: [],
  specTransforms: [],
  startupTimeoutMs: 180_000,
  memoryLimitMb: 1024,
  helpers: {
    authServerUrl: { _tag: 'Url', scheme: 'http', guestPort: 8080 },
  },
}
