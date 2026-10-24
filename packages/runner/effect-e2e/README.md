# @systemfsoftware/effect-e2e

Effect-native end-to-end testing. This package is the runtime-neutral core: a suite's `e2e.config.ts` builds its config with `defineConfig` and the `web()` engine spec, and the runner decodes that plain data once at the edge with `decodeConfig`, failing `ConfigInvalid` with the key path of any unknown or invalid value. Importing the package runs nothing.

## Install

Add it as a devDependency. It is distributed as a workspace tarball of the [systemfsoftware flake](https://github.com/systemfsoftware/systemfsoftware) (`packages.<system>.effect-e2e`), which `lib.mkConsumerStore` serves to an offline pnpm install. Its dependencies come along with the tarball, and a consumer's `package.json` depends on it as `file:.sfs-deps/<name>-<version>.tgz`.

Its peers are `effect` (`^4`) and `vitest` (`^5.0.5`); the suite must provide both.

## Usage

`effect-e2e init` from [`@systemfsoftware/effect-e2e-cli`](../effect-e2e-cli) scaffolds a suite. The files below are what `init` writes for the web engine and the OpenRouter gateway, with the project id filled in as `my-suite`. `init` also writes `global-setup.ts` (`makeGlobalSetup(config, options)`) and a second example test, `tests/example-agent.e2e.ts`.

`e2e.config.ts` is the suite's edge and the only file that reads `process.env`:

```ts
import { defineConfig, web } from '@systemfsoftware/effect-e2e'

// The suite's edge: the only file in the suite that reads process.env.

const API_KEY_ENV = 'OPENROUTER_API_KEY'

/** The environment the runner resolves secrets and the model API key from. */
export const env: Readonly<Record<string, string | undefined>> = process.env

/** CI runs retry once, use one worker, and only read the replay cache. */
export const ci: boolean = (process.env['CI'] ?? '') !== ''

/** Why the agent example cannot run here, or false when the model gateway's API key is set. */
export const agentSkip: string | false = (process.env[API_KEY_ENV] ?? '') === ''
  ? `${API_KEY_ENV} is not set, so the agent has no model gateway to call`
  : false

export const baseUrl: string = process.env['BASE_URL'] ?? 'http://localhost:3000'

export const engine = web({ browser: 'chromium', headless: true })

export default defineConfig({
  projectId: 'my-suite',
  targets: [{
    name: 'web',
    engine,
    app: { url: baseUrl, identity: 'my-suite' },
  }],
  agents: {
    default: {
      model: { gateway: 'openrouter', model: 'deepseek/deepseek-flash-latest', apiKeyEnv: API_KEY_ENV },
    },
  },
})
```

`tests/example.e2e.ts` is one test file:

```ts
import { expect, test } from '@systemfsoftware/effect-e2e/runner'

test('the home page shows a heading', async ({ app, screen }) => {
  await app.open('/')
  await expect(screen.getByRole('heading')).toBeVisible()
})
```

`runner.ts` is the suite's composition root: the one place that chooses the platform and the engine adapter.

```ts
import { NodeHttpClient, NodeServices } from '@effect/platform-node'
import * as WebEngine from '@systemfsoftware/effect-e2e-web'
import adapter from '@systemfsoftware/effect-e2e-web/package.json' with { type: 'json' }
import framework from '@systemfsoftware/effect-e2e/package.json' with { type: 'json' }
import { makeRunner, type RunnerOptions } from '@systemfsoftware/effect-e2e/runner'
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
  defaults: { ci, projectId: 'my-suite', cores: availableParallelism() },
  version: framework.version,
}

export default makeRunner(config, options)
```

`vitest.config.ts` points Vitest at the runner, the global setup and the effect-e2e test file globs:

```ts
import { e2eTestFiles, exitCodeReporter } from '@systemfsoftware/effect-e2e/runner'
import { sourceResolveConditions } from '@systemfsoftware/vitest-config'
import { configDefaults, defineConfig } from 'vitest/config'

import config, { baseUrl } from './e2e.config.ts'

const setExitCode = (code: number): void => {
  process.exitCode = code
}

export default defineConfig({
  ...sourceResolveConditions,
  test: {
    include: [...e2eTestFiles.include],
    exclude: [...configDefaults.exclude, ...e2eTestFiles.exclude],
    includeSource: [],
    env: { BASE_URL: baseUrl },
    runner: './runner.ts',
    globalSetup: ['./global-setup.ts'],
    reporters: ['default', exitCodeReporter(setExitCode)],
    testTimeout: config.timeout ?? 120_000,
  },
})
```

## Entry points

Each entry is a separate subpath export: `.` is built from `src/mod.ts`, and each other entry from `src/<name>/mod.ts`. Importing any entry runs nothing.

| Entry      | Holds                                                                                                                                                                                                 |
| :--------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.`        | Config: `defineConfig`, `web`, `decodeConfig`, `e2eConfigSchema` and the `Target`, `AgentConfig`, `ReporterConfig` schemas; `ConfigInvalid`, `credentials`, `secrets`, `unique`, `exitCodeOf`         |
| `./engine` | The `Engine` service and its failures, actions, locators, observations, routes and semantic-node schemas                                                                                              |
| `./model`  | The `ModelGateway` service, model request and response schemas, and the `OpenAiCompatible` adapter                                                                                                    |
| `./cache`  | The `CacheStore` service and its results, the in-memory and file stores (`MemoryCacheStore`, `FileCacheStore`), and trace entries                                                                     |
| `./agent`  | The `act`, `assert`, `extract` and `waitFor` operations with their records, and the `SecretLedger` service                                                                                            |
| `./run`    | The `TestSession` and `Telemetry` services, the artifact stores, `admitTest` and `makeAttemptLog`, `ResultDirectory`, and the OTLP telemetry                                                          |
| `./report` | The `Report1` schema, `report1JsonSchema`, `buildReport`, `decodeReport`, `emitReports`, `mergeReports`, and the `json`, `junit`, `list` and `markdown` renderers                                     |
| `./runner` | `makeRunner`, `makeGlobalSetup`, the `test`, `expect` and hook functions, the fixture types, `exitCodeReporter` and `e2eTestFiles`. It imports from `vitest` (the test API) and from no Node built-in |

## Report

Each run writes a `report-1` document (`schema: 'report-1'`). `report1JsonSchema()`, exported from `@systemfsoftware/effect-e2e/report`, returns the JSON Schema of that document as a draft 2020-12 document.

## Credits

effect-e2e rebuilds [TesterArmy's `e2e`](https://github.com/tester-army/e2e) and keeps its user contract. It contains source ported from `e2e` at commit `72abdddd961e2e3a7d24c973eeb2783bea43ee47` (npm `e2e` 0.21.2), which is Apache-2.0. TesterArmy's NOTICE is reproduced verbatim below; the [repository NOTICE](https://github.com/systemfsoftware/systemfsoftware/blob/main/NOTICE) lists it for this package.

```text
e2e
Copyright 2026 TesterArmy, Inc.

This product includes software developed at TesterArmy, Inc.
(https://tester.army).
```

Apache-2.0. Ported in part from [tester-army/e2e](https://github.com/tester-army/e2e). Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/runner/effect-e2e#readme).
