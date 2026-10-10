# @systemfsoftware/tsdown-config

Build-output policy and build guards shared by System F Software's tsdown packages: a quiet log level that keeps every actionable warning, an entry-size budget for startup-sensitive plugins, and an `api-extractor` wrapper that drops its success chatter.

Every entry is plain JavaScript with declaration files, so it loads from `node_modules` under Node 24 without type stripping.

## Install

Add the package as a devDependency. It is distributed as a workspace tarball of the [systemfsoftware flake](https://github.com/systemfsoftware/systemfsoftware) (`packages.<system>.tsdown-config`), which `lib.mkConsumerStore` serves to an offline pnpm install.

| Peer                                 | Needed for                                                     |
| ------------------------------------ | -------------------------------------------------------------- |
| `tsdown` `^0.23.0`                   | `quiet-build` and `eager-entry-budget` in a `tsdown.config.ts` |
| `@microsoft/api-extractor` `^7.59.1` | the `api-extractor-quiet` bin                                  |

Both peers are optional: install the one for the entry you use.

## Usage

### `quiet-build`

Spread it into the config and build with `tsdown -l warn`. The CLI flag silences the startup banner, which is printed before the config loads; `quietBuild` drops the one non-actionable `rolldown-plugin-dts` warning about TypeScript 7's API and leaves every other warning in place.

```ts
// tsdown.config.ts
import { quietBuild } from '@systemfsoftware/tsdown-config/quiet-build'
import { defineConfig } from 'tsdown'

export default defineConfig({ ...quietBuild, entry: ['src/index.ts'] })
```

### `eager-entry-budget`

A rolldown plugin that fails the build when an `index.js` entry statically pulls more than `maxBytes` (default 32 KiB), or leaves `effect` external. Dynamic imports are not counted.

```ts
import { eagerEntryBudget } from '@systemfsoftware/tsdown-config/eager-entry-budget'

export default defineConfig({ entry: ['src/index.ts'], plugins: [eagerEntryBudget({ maxBytes: 64 * 1024 })] })
```

### `api-extractor-quiet`

Runs the `api-extractor` your package resolves from its own `node_modules/.bin`, forwards stderr, and drops only the lines API Extractor prints on success. A non-zero exit prints the full output unfiltered.

```json
{ "scripts": { "api:check": "api-extractor-quiet run" } }
```

## License

[Apache-2.0](./LICENSE)
