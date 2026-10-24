# @systemfsoftware/effect-e2e-web

The web engine for [`@systemfsoftware/effect-e2e`](../effect-e2e): `layer({ spec, contextHeaders })` provides the core's `Engine` service over a Playwright browser built from a `web({ browser })` spec. This is the only effect-e2e package that imports Playwright; install the browser it launches with `playwright install chromium`.

## Install

Add it as a devDependency. It is distributed as a workspace tarball of the [systemfsoftware flake](https://github.com/systemfsoftware/systemfsoftware) (`packages.<system>.effect-e2e-web`), which `lib.mkConsumerStore` serves to an offline pnpm install. It depends on `@systemfsoftware/effect-e2e`, which comes along with it.

Its peers are `effect` (`^4`) and `playwright` (`^1.64.0`). Then install the browser it launches:

```bash
pnpm exec playwright install chromium
```

## Usage

The suite's `runner.ts` passes this package's `layer` to `makeRunner` in the `engines` map, keyed by the engine's adapter name. `spec` is the `web({ browser })` value exported from the suite's `e2e.config.ts`. The file below is what `effect-e2e init` writes, with the project id filled in as `my-suite`:

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

`contextHeaders` is the set of headers the browser context sends with every request; the scaffold passes none.

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/runner/effect-e2e-web#readme).
