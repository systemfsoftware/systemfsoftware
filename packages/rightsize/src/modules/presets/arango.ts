/**
 * The arango preset — upstream `src/modules/arango.ts` (`ArangoContainer`).
 * Auth is disabled by default (`ARANGO_NO_AUTH=1`); once a caller sets
 * `ARANGO_ROOT_PASSWORD`, the declared `DropEnvWhenKey` transform removes
 * the no-auth default — the two env vars are mutually exclusive on the
 * image (upstream's `customizeSpec` hook as data).
 */
import type { ModulePreset } from '../preset.js'

export const ArangoPreset: ModulePreset = {
  id: 'arango',
  description: 'A single-node ArangoDB container; auth off by default, enables via ARANGO_ROOT_PASSWORD.',
  image: 'arangodb:latest',
  expectedRepository: 'arangodb',
  env: [['ARANGO_NO_AUTH', '1']],
  ports: [8529],
  aliases: [],
  waitStrategy: { _tag: 'ForHttp', path: '/_api/version', port: 8529 },
  readinessSteps: [],
  backendRestrictions: [],
  specTransforms: [
    { _tag: 'DropEnvWhenKey', dropKey: 'ARANGO_NO_AUTH', whenKey: 'ARANGO_ROOT_PASSWORD' },
  ],
  helpers: {
    endpoint: { _tag: 'Url', scheme: 'http', guestPort: 8529 },
  },
}
