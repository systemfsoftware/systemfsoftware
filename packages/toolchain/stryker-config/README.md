# @systemfsoftware/stryker-config

The StrykerJS settings System F Software packages share.

## Install

Add it as a devDependency. It is distributed as a workspace tarball of the [systemfsoftware flake](https://github.com/systemfsoftware/systemfsoftware) (`packages.<system>.stryker-config`), which `lib.mkConsumerStore` serves to an offline pnpm install.

Its one peer, `@systemfsoftware/stryker-js` `^17.0.0`, is optional: the package imports nothing from Stryker, it only produces the options you hand to it.

## Usage

```ts
// stryker.config.ts
import { sharedConfig } from '@systemfsoftware/stryker-config'

export default {
  ...sharedConfig,
  mutate: ['src/**/*.ts', '!src/**/*.test.ts'],
}
```

## Exports

| Export         | What it is                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sharedConfig` | pnpm package manager, per-test coverage analysis, incremental runs that also read every `reports/stryker-incremental-*.json` record, `reports/mutation/` HTML and JSON reports, and a break threshold of 100 |

To split a run, use `stryker plan` and `stryker run --shard <k>/<n>` from `@systemfsoftware/stryker-js`; the config needs no shard setting.

`STRYKER_CONCURRENCY` overrides the worker count.

## License

[Apache-2.0](./LICENSE)
