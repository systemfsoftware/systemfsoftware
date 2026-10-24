import type { SuiteAnswers } from './answers.js'

export const runnerTemplate = (answers: SuiteAnswers): string =>
  `import { NodeHttpClient, NodeServices } from '@effect/platform-node'
import framework from '@systemfsoftware/effect-e2e/package.json' with { type: 'json' }
import { makeRunner, type RunnerOptions } from '@systemfsoftware/effect-e2e/runner'
import * as WebEngine from '@systemfsoftware/effect-e2e-web'
import adapter from '@systemfsoftware/effect-e2e-web/package.json' with { type: 'json' }
import * as Layer from 'effect/Layer'
import { availableParallelism } from 'node:os'

import config, { ci, engine, env } from './e2e.config.ts'

// The suite's composition root: the one place that chooses the platform and the engine adapter.
export const options: RunnerOptions = {
  platform: Layer.mergeAll(NodeServices.layer, NodeHttpClient.layerUndici),
  engines: {
    [engine.adapter]: {
      identity: { adapter: engine.adapter, kind: 'web' },
      version: adapter.version,
      layer: WebEngine.layer({ spec: engine, contextHeaders: {} }),
    },
  },
  env,
  defaults: { ci, projectId: ${JSON.stringify(answers.projectId)}, cores: availableParallelism() },
  version: framework.version,
}

export default makeRunner(config, options)
`
