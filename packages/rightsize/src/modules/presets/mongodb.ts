/**
 * The mongodb row preset — upstream `src/modules/mongodb.ts`
 * (`MongoDBContainer`): a one-member replica set (required for transactions
 * and change streams). The `containerIsStarted` hook becomes declared
 * readiness steps: rs.initiate, then await a PRIMARY — so
 * `connectionString` is usable the moment start() returns.
 */
import type { ModulePreset } from '../preset.js'
import { mongodbReplicaSetSteps } from '../readiness.js'

const replicaSetSteps = mongodbReplicaSetSteps()

export const MongoDBPreset: ModulePreset = {
  id: 'mongodb',
  description: 'A single-node MongoDB running as a one-member replica set (transactions/change streams ready).',
  image: 'mongo:latest',
  expectedRepository: 'mongo',
  env: [],
  command: ['mongod', '--replSet', 'docker-rs', '--bind_ip_all'],
  ports: [27017],
  aliases: [],
  waitStrategy: { _tag: 'ForPort' },
  readinessSteps: replicaSetSteps,
  backendRestrictions: [],
  specTransforms: [],
  helpers: {
    connectionString: {
      _tag: 'Url',
      scheme: 'mongodb',
      guestPort: 27017,
      path: '/test',
      query: 'directConnection=true',
    },
    replicaSetUrl: {
      _tag: 'Url',
      scheme: 'mongodb',
      guestPort: 27017,
      path: '/test',
      query: 'directConnection=true',
    },
  },
}
