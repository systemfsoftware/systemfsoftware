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

| Export         | What it is                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sharedConfig` | pnpm package manager, per-test coverage analysis, incremental runs that also read every `reports/stryker-incremental-*.json` record, `reports/mutation/` HTML and JSON reports, a break threshold of 100, a 60-minute dry-run limit, and `ignorePatterns` that keep `reports/`, `coverage/` and the mutation baseline files out of the sandbox and out of the digest that decides reuse |

A config that sets its own `ignorePatterns` replaces this list. Of the files Stryker writes, it leaves out of the digest only `stryker.log` and the paths the current run is configured to write: its temp directory, `incrementalFile`, progress stream, and HTML and JSON reports with their SARIF and reproducer files. Any other file left in the project is hashed like source, and several of them change between runs: the record a `stryker run --shard` child was seeded from, left at `reports/stryker-incremental.json` because the child writes its own `--incrementalFile` outside the project; a prior record that `incrementalSources` matches; test-runner output under `coverage/`; a progress stream that a run ending early wrote under the default name `reports/mutation-stream.jsonl`; and a `<record>.<random>.tmp` file that an interrupted record write left beside the record. When one of them changes, every open-closure and static mutant runs again. Each of these files that lands inside the project is under `reports/` or `coverage/`, so this list ignores them all.

To split a run, use `stryker plan` and `stryker run --shard <k>/<n>` from `@systemfsoftware/stryker-js`; the config needs no shard setting.

`STRYKER_CONCURRENCY` overrides the worker count.

## License

[Apache-2.0](./LICENSE)
