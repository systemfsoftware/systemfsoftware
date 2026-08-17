/**
 * The neo4j preset — upstream `src/modules/neo4j.ts` (`Neo4jContainer`):
 * HTTP Cypher transactions on 7474 plus the bolt port 7687. Defaults to
 * neo4j/rightsize-test (the image refuses passwords under 8 characters).
 * Readiness is the exact `Started.` log line — printed only after both
 * connectors listen; memory floor 1024 makes Neo4j's memory calculator
 * (page cache + heap sized off visible RAM) accept the guest.
 */
import type { ModulePreset } from '../preset.js'

export const Neo4jPreset: ModulePreset = {
  id: 'neo4j',
  description: 'A single-node Neo4j Community (HTTP Cypher on 7474, bolt on 7687); neo4j/rightsize-test by default.',
  image: 'neo4j:latest',
  expectedRepository: 'neo4j',
  env: [['NEO4J_AUTH', 'neo4j/rightsize-test']],
  ports: [7474, 7687],
  aliases: [],
  waitStrategy: { _tag: 'ForLogMessage', pattern: '.*Started\\..*', count: 1 },
  readinessSteps: [],
  backendRestrictions: [],
  specTransforms: [],
  startupTimeoutMs: 120_000,
  memoryLimitMb: 1024,
  helpers: {
    httpUrl: { _tag: 'Url', scheme: 'http', guestPort: 7474 },
    boltUrl: { _tag: 'Url', scheme: 'bolt', guestPort: 7687 },
  },
}
