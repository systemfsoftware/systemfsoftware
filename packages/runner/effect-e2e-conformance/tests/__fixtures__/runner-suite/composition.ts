import { NodeHttpClient, NodeServices } from '@effect/platform-node'
import { RUN_OVERRIDE_ENV } from '@systemfsoftware/effect-e2e'
import { Engine } from '@systemfsoftware/effect-e2e/engine'
import type { RunnerOptions } from '@systemfsoftware/effect-e2e/runner'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

import { ci } from './e2e.config.js'
import { BILLING_SITE, ENGINE_OPENS, PLANTED_SECRET, PLANTED_SECRET_ENV, SUITE_OUTPUT } from './site.js'

const recordOpen = Layer.effectDiscard(
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    yield* fs.makeDirectory(SUITE_OUTPUT, { recursive: true })
    yield* fs.writeFileString(ENGINE_OPENS, 'opened\n', { flag: 'a' })
  }).pipe(Effect.orDie),
).pipe(Layer.provide(NodeServices.layer))

const aiTraceOverride = Config.String(RUN_OVERRIDE_ENV.aiTrace).pipe(Config.option, Effect.runSync)

/**
 * The suite's composition root, as a generated `runner.ts` writes it (design §2.1): Node platform layers, the web
 * adapter key bound to the in-memory engine, and an environment holding only the planted secret and the run's
 * ai-trace override, so the run is otherwise hermetic.
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
  env: {
    [PLANTED_SECRET_ENV]: PLANTED_SECRET,
    ...Option.match(aiTraceOverride, {
      onNone: () => ({}),
      onSome: (value) => ({ [RUN_OVERRIDE_ENV.aiTrace]: value }),
    }),
  },
  defaults: { ci, projectId: 'runner-suite', cores: 4 },
  version: '0.0.0-conformance',
}
