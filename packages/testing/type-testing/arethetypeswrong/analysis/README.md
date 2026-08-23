# @systemfsoftware/arethetypeswrong

> The analysis engine behind [arethetypeswrong.github.io](https://arethetypeswrong.github.io) — check an npm tarball's entry points, module kinds, and export bindings before you publish.

Analyzes a package tarball the way Node and TypeScript will actually resolve it: entry-point discovery from `package.json` (`main`, `exports`, `bin`), per-entry `commonjs` / `ESM` resolution, and export-shape checks. Use it to catch publish-time mistakes locally instead of after `npm publish`.

> [!WARNING]
> This package is pre-1.0 (`4.0.0` under `v0` semver). Patch and minor releases may change the public API. Pin the version in production.

## What it does

A single `checkPackage` call returns a structured analysis or a set of diagnostics. Each entry point is checked under every relevant resolution kind:

- **Entrypoint resolution** — does every `exports` subpath, `main`, and `bin` target resolve to a file that exists, and are `null`-target exclusions pruned correctly?
- **Module-kind agreement** — does the file's actual module kind (`commonjs` vs `ESM` vs `JSON`) match what the package's `type` and file extension imply?
- **Export bindings** — do named exports, default exports, and `export =` / `module.exports` line up between the type and implementation entry points?
- **CJS-only default** — flags a CJS file that only exports a default where an `esModuleInterop` consumer would get a wrapper.
- **Unexpected module syntax** — flags `import`/`export` in a CJS context and `require`/`module.exports` in an ESM context at the reported `pos`/`end`.
- **Internal resolution errors** — surfaces TypeScript's own resolution failures with the failing specifier and mode.

Results are typed with Effect Schema and carry `pos`/`end` for precise diagnostics.

## Install

```bash
pnpm add @systemfsoftware/arethetypeswrong
```

```bash
npm install @systemfsoftware/arethetypeswrong
```

Requires Node `>=24` and `typescript@6.0.3` on the `catalog:attw` line (the 6.x JS bridge — see [TypeScript version](#typescript-version)).

## Quick start

Check an in-memory package:

```ts
import { checkPackage } from '@systemfsoftware/arethetypeswrong'
import { createPackage } from '@systemfsoftware/npm-package'

const pkg = createPackage(
  {
    'package.json': JSON.stringify({ name: 'demo', version: '1.0.0', type: 'module' }),
    'index.d.ts': 'export declare const x: number',
    'index.js': 'export const x = 1',
  },
  'demo',
  '1.0.0',
)

const result = await checkPackage(pkg)

if ('entrypoints' in result) {
  console.log(Object.keys(result.entrypoints))
  // e.g. [ ".", "./utils", "./features/*.js" ]
} else {
  for (const problem of result.problems) {
    console.error(problem.kind, problem.entrypoint, problem.pos)
  }
}
```

Mount the same tree on an in-memory filesystem (keys stay `/node_modules/<name>/…`):

```ts
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { toDirectoryJSON } from '@systemfsoftware/npm-package'
import { Effect } from 'effect'

const tree = {
  'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
  'index.js': 'export const x = 1',
}
const contents = toDirectoryJSON(tree, 'demo')
// `contents` is a plain `Record<string, string>` like `{ '/node_modules/demo/package.json': '...' }`
const fs = MemoryFileSystem.make(contents as never)
const bytes = await Effect.runPromise(fs.readFile('/node_modules/demo/package.json'))
const text = new TextDecoder().decode(bytes)
```

Check a real tarball on disk:

```ts
import { checkPackage } from '@systemfsoftware/arethetypeswrong'
import { createPackageFromTarballData } from '@systemfsoftware/npm-package'
import { readFile } from 'node:fs/promises'

const data = await readFile('./my-package-1.2.3.tgz')
const pkg = createPackageFromTarballData(data)
const analysis = await checkPackage(pkg)
// `analysis` is `Analysis` with `entrypoints` or `problems`
```

Filter entry points:

```ts
const result = await checkPackage(pkg, {
  includeEntrypoints: ['./utils'],
  excludeEntrypoints: [/^.\/internal\//],
  entrypoints: ['.', './cli'], // exhaustive override
})
```

Prefer the CLI for one-off checks:

```bash
pnpm dlx @systemfsoftware/arethetypeswrong-cli ./my-package-1.2.3.tgz
```

## Checks

| Check                       | What it reports                                                          |
| --------------------------- | ------------------------------------------------------------------------ |
| `entrypointResolutions`     | Missing or mis-resolving entry points from `exports` / `main` / `bin`    |
| `moduleKindDisagreement`    | File extension/`type` says ESM but file is CJS (or vice versa)           |
| `exportDefaultDisagreement` | `export default` present in types but not JS (or the reverse)            |
| `namedExports`              | Named export in types but not in JS (or the reverse)                     |
| `cjsOnlyExportsDefault`     | CJS file that only has `module.exports =` / `exports.default`            |
| `unexpectedModuleSyntax`    | ESM syntax in a CJS file or CJS syntax in an ESM file                    |
| `internalResolutionError`   | TypeScript failed to resolve a specifier under a given `resolution-mode` |

Each diagnostic includes `kind`, `entrypoint`, `resolutionKind` (`node10` / `node16` / `bundler`), and `pos`/`end` when applicable. See [`Problem.schema.ts`](./src/Problem.schema.ts) and [`Analysis.schema.ts`](./src/Analysis.schema.ts) for the full types.

## Configuration

No configuration file is required. Options are passed per call:

```ts
type CheckPackageOptions = {
  entrypoints?: string[] // exhaustive list, disables auto-discovery
  includeEntrypoints?: string[] // added to discovered entry points
  excludeEntrypoints?: (string | RegExp)[] // removed after discovery
  entrypointsLegacy?: boolean // also consider all published files
}
```

Entrypoint discovery reads `package.json` `exports`, `main`, `bin`, and `types`/`typings`. Published files are those not excluded by `.npmignore` / `files` / `.gitignore` semantics.

## TypeScript version

This package runs on the **TypeScript 6.x JS bridge** (`typescript@^6.0.3` via `catalog:attw`). TypeScript 7 is a native Go compiler with no JS `createProgram` / `resolveModuleName` / `CompilerHost` API, so the analysis engine cannot run on it. The bridge line is the last TypeScript with the full JS compiler surface. Majors are never automated — see [`.github/dependabot.yml`](../../../.github/dependabot.yml) and the decision record at [`docs/solutions/tooling-decisions/arethetypeswrong-core-requires-js-typescript-api.md`](../../../docs/solutions/tooling-decisions/arethetypeswrong-core-requires-js-typescript-api.md).

Snapshot fixtures (`moment@2.29.1`, `react@18.2.0`) embed the compiler version in resolution traces and were regenerated for `6.0.3`.

## Contributing

Development setup, build, and test workflow: [`AGENTS.md`](./AGENTS.md).

## License

[Apache-2.0](../../../LICENSE) — same as the upstream `arethetypeswrong.github.io`.
