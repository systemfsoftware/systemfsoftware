/**
 * The elasticsearch preset — upstream `src/modules/elasticsearch.ts`
 * (`ElasticsearchContainer`). Elastic publishes no floating tag
 * (`elasticsearch:latest` 404s on Docker Hub), so this row carries NO
 * default image: an explicit image is required on construction, and the
 * image-compat gate still checks its repository. Single-node config disables
 * TLS/auth; 2560 MB floor; readiness is a plain HTTP 200 on `/` — cluster
 * health stays `yellow` on one node and would hang a green-wait forever.
 */
import type { ModulePreset } from '../preset.js'

export const ElasticsearchPreset: ModulePreset = {
  id: 'elasticsearch',
  description: 'A single-node Elasticsearch (REST 9200, transport 9300); explicit image required (no floating tag).',
  expectedRepository: 'elasticsearch',
  env: [
    ['discovery.type', 'single-node'],
    ['xpack.security.enabled', 'false'],
    ['ES_JAVA_OPTS', '-Xms512m -Xmx512m'],
  ],
  ports: [9200, 9300],
  aliases: [],
  waitStrategy: { _tag: 'ForHttp', path: '/', port: 9200 },
  readinessSteps: [],
  backendRestrictions: [],
  specTransforms: [],
  startupTimeoutMs: 300_000,
  memoryLimitMb: 2560,
  helpers: {
    restUrl: { _tag: 'Url', scheme: 'http', guestPort: 9200 },
  },
}
