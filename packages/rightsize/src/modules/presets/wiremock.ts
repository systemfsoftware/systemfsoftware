/**
 * The wiremock preset — upstream `src/modules/wiremock.ts`
 * (`WireMockContainer`): a real WireMock server for the TypeScript
 * ecosystem, readiness on the dependency-free `/__admin/health` endpoint.
 */
import type { ModulePreset } from '../preset.schema.js'

export const WireMockPreset: ModulePreset = {
  id: 'wiremock',
  description: 'A single-node WireMock server (stubs served over HTTP), readiness on /__admin/health.',
  image: 'wiremock/wiremock:latest',
  expectedRepository: 'wiremock/wiremock',
  env: [],
  ports: [8080],
  aliases: [],
  waitStrategy: { _tag: 'ForHttp', path: '/__admin/health', port: 8080 },
  readinessSteps: [],
  backendRestrictions: [],
  specTransforms: [],
  helpers: {
    baseUrl: { _tag: 'Url', scheme: 'http', guestPort: 8080 },
    adminUrl: { _tag: 'Url', scheme: 'http', guestPort: 8080, path: '/__admin' },
  },
}
