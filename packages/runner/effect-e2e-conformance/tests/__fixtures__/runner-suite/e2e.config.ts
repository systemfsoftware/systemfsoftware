import { defineConfig, web } from '@systemfsoftware/effect-e2e'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import { ORIGIN } from './site.js'

// The suite's edge, as a generated e2e.config.ts is: the only fixture file that reads the environment. A scenario
// picks the run shape by setting these variables on the nested run.

export const ci: boolean = Effect.runSync(Config.String('CI').pipe(Config.withDefault(''))) !== ''

const countOf = <K extends 'retries' | 'workers'>(key: K, variable: string): Partial<Record<K, number>> =>
  Config.Int(variable).pipe(
    Config.option,
    Effect.runSync,
    Option.match({ onNone: () => ({}), onSome: (count) => ({ [key]: count }) as Record<K, number> }),
  )

export default defineConfig({
  projectId: 'runner-suite',
  targets: [{ name: 'web', engine: web({ browser: 'chromium' }), app: { url: ORIGIN, identity: 'billing' } }],
  agents: {
    default: {
      model: {
        gateway: 'openai-compatible',
        baseURL: 'http://127.0.0.1:9',
        model: 'never-called',
        apiKeyEnv: 'RUNNER_SUITE_API_KEY',
      },
    },
  },
  cache: { mode: 'off' },
  assertionTimeout: 400,
  ...countOf('retries', 'RUNNER_SUITE_RETRIES'),
  ...countOf('workers', 'RUNNER_SUITE_WORKERS'),
})
