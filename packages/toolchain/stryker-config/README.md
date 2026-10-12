# @systemfsoftware/stryker-config

The StrykerJS settings System F Software packages share, including the one set of files mutation testing mutates: every `*.workflow.ts` under `src/`.

## Install

Add it as a devDependency. It is distributed as a workspace tarball of the [systemfsoftware flake](https://github.com/systemfsoftware/systemfsoftware) (`packages.<system>.stryker-config`), which `lib.mkConsumerStore` serves to an offline pnpm install.

Its one peer, `@systemfsoftware/stryker-js` `^17.0.0`, is optional: the package imports nothing from Stryker, it only produces the options you hand to it.

## Usage

```ts
// stryker.config.ts
import { sharedConfig } from '@systemfsoftware/stryker-config'

export default {
  ...sharedConfig,
  testRunner: { plugin: import.meta.resolve('@systemfsoftware/stryker-js-vitest-runner') },
}
```

A config spreads `sharedConfig` and sets no `mutate` of its own. The Mutation workflow's planner refuses a package whose config does, and a package with no `src/**/*.workflow.ts` carries no Stryker config and no `mutation` script.

## Exports

| Export           | What it is                                                                                                                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflowMutate` | the mutated set, frozen: `src/**/*.workflow.ts` minus `src/**/__tests__/**`                                                                                                                                                                         |
| `sharedConfig`   | pnpm package manager, per-test coverage analysis, incremental runs, `reports/mutation/` HTML and JSON reports, a break threshold of 100, and `mutate`: `workflowMutate`, narrowed to this shard's files when `STRYKER_SHARD=<index>/<count>` is set |

`STRYKER_CONCURRENCY` overrides the worker count.

## License

[Apache-2.0](./LICENSE)
