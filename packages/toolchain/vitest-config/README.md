# @systemfsoftware/vitest-config

The Vitest configuration System F Software packages share: CI-aware timeouts and reporters, coverage settings, source-condition resolution, and a `defineConfig` that adds the `@systemfsoftware/vitest` guard to every block that runs tests.

## Install

Add it as a devDependency together with its peers and the guard's package. It is distributed as a workspace tarball of the [systemfsoftware flake](https://github.com/systemfsoftware/systemfsoftware) (`packages.<system>.vitest-config`), which `lib.mkConsumerStore` serves to an offline pnpm install.

| Package                   | Range                        |
| ------------------------- | ---------------------------- |
| `vitest` (peer)           | `^5`                         |
| `vite` (peer)             | `^8`                         |
| `@systemfsoftware/vitest` | the flake's `vitest` tarball |

`@systemfsoftware/vitest` must be a direct devDependency of the package whose tests run: `defineConfig` looks for it in that package's own `node_modules`.

## Usage

```ts
// vitest.config.ts
import { defineConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({ test: { include: ['tests/**/*.test.ts'] } })
```

`defineConfig` returns a promise, because finding the guard reads the file system. Vitest accepts a promised config.

When the guard is missing, config load fails instead of running the tests unguarded, and the error names the `package.json` to fix.

## Exports

| Export                    | What it is                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `defineConfig`            | Vitest's `defineConfig` with the guard setup file and the fork's provided context added |
| `sharedConfig`            | the shared `test` settings, for a config that does not use `defineConfig`               |
| `sourceResolveConditions` | resolve conditions that read a workspace sibling's source instead of its build          |
| `isCI`                    | whether the run is classified as CI                                                     |

## License

[Apache-2.0](./LICENSE)
