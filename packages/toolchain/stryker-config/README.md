# @systemfsoftware/stryker-config

The StrykerJS settings System F Software packages share, and a helper that splits a mutation run into shards.

## Install

Add it as a devDependency. It is distributed as a workspace tarball of the [systemfsoftware flake](https://github.com/systemfsoftware/systemfsoftware) (`packages.<system>.stryker-config`), which `lib.mkConsumerStore` serves to an offline pnpm install.

Its one peer, `@systemfsoftware/stryker-js` `^17.0.0`, is optional: the package imports nothing from Stryker, it only produces the options you hand to it.

## Usage

```ts
// stryker.config.ts
import { shardMutate, sharedConfig } from '@systemfsoftware/stryker-config'

export default {
  ...sharedConfig,
  mutate: shardMutate(['src/**/*.ts', '!src/**/*.test.ts']),
}
```

## Exports

| Export                  | What it is                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `sharedConfig`          | pnpm package manager, per-test coverage analysis, incremental runs, `reports/mutation/` HTML and JSON reports, and a break threshold of 100 |
| `shardMutate(patterns)` | with `STRYKER_SHARD=<index>/<count>` set, the patterns plus negations for every file another shard owns; unchanged when it is unset         |

`STRYKER_CONCURRENCY` overrides the worker count.

## License

[Apache-2.0](./LICENSE)
