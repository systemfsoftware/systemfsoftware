/**
 * The qdrant preset — upstream `src/modules/qdrant.ts` (`QdrantContainer`):
 * a vector search engine. REST 6333 (what the helper wraps) and gRPC 6334.
 * Readiness is a plain HTTP 200 on `/readyz` — answered on the very first
 * poll in the verified boot; no floor or timeout override warranted.
 */
import type { ModulePreset } from '../preset.schema.js'

export const QdrantPreset: ModulePreset = {
  id: 'qdrant',
  description: 'A single-node Qdrant vector search engine (REST 6333, gRPC 6334).',
  image: 'qdrant/qdrant:latest',
  expectedRepository: 'qdrant/qdrant',
  env: [],
  ports: [6333, 6334],
  aliases: [],
  waitStrategy: { _tag: 'ForHttp', path: '/readyz', port: 6333 },
  readinessSteps: [],
  backendRestrictions: [],
  specTransforms: [],
  helpers: {
    restUrl: { _tag: 'Url', scheme: 'http', guestPort: 6333 },
  },
}
