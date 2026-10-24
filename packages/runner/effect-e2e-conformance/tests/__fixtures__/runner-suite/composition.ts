import { NodeHttpClient, NodeServices } from '@effect/platform-node'
import { Engine } from '@systemfsoftware/effect-e2e/engine'
import type { RunnerOptions } from '@systemfsoftware/effect-e2e/runner'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'

import { BILLING_SITE, ENGINE_OPENS, SUITE_OUTPUT } from './site.js'

const recordOpen = Layer.effectDiscard(
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    yield* fs.makeDirectory(SUITE_OUTPUT, { recursive: true })
    yield* fs.writeFileString(ENGINE_OPENS, 'opened\n', { flag: 'a' })
  }).pipe(Effect.orDie),
).pipe(Layer.provide(NodeServices.layer))

/**
 * The suite's composition root, as a generated `runner.ts` writes it (design §2.1): Node platform layers, the web
 * adapter key bound to the in-memory engine, and no environment, so the run is hermetic.
 */
export const options: RunnerOptions = {
  platform: Layer.mergeAll(NodeServices.layer, NodeHttpClient.layerUndici),
  engines: {
    '@systemfsoftware/effect-e2e-web': {
      identity: { adapter: 'memory', kind: 'web' },
      version: '0.0.0-conformance',
      layer: Layer.merge(Engine.layerTest(BILLING_SITE), recordOpen),
    },
  },
  env: {},
  defaults: { ci: false, projectId: 'runner-suite', cores: 1 },
  version: '0.0.0-conformance',
}
