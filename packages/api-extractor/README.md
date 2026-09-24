# @systemfsoftware/api-extractor

Standalone, Effect-native API surface review and `.d.ts` declaration rollup engine for TypeScript libraries.

Forked from [`microsoft/rushstack`](https://github.com/microsoft/rushstack) (`apps/api-extractor` v7.59.1, MIT License), re-architected onto Effect 4, and hardened for modern TypeScript module patterns.

```bash
pnpm add -D @systemfsoftware/api-extractor
```

## Why this fork exists

1. **Namespace barrel rollups:** Upstream API Extractor fails when bundling declaration files for modern TypeScript namespace re-exports (`export * as Atom from './Atom.js'`), emitting uncompilable circular declarations when internal modules import from the barrel. This engine lowers namespaces to clean top-level aliases, generating valid rollups for complex namespace architectures.
2. **Severed legacy toolchain:** Replaces the legacy Rushstack runtime (`@rushstack/node-core-library`, `@rushstack/terminal`, `@rushstack/ts-command-line`) with Effect 4 (`effect/unstable/cli`, `@effect/platform-node`) and Node built-ins.
3. **Native `--quiet` execution:** Built-in `--quiet` flag (and `"quiet": true` in `api-extractor.json`) suppresses banner and success chatter on exit 0, eliminating the need for wrapper scripts while preserving actionable diagnostics on warnings and errors.
4. **100% config compatibility:** Operates directly on standard `api-extractor.json` configuration files (schema v7), preserving existing `<projectFolder>`, token expansion, and `extends` semantics without monorepo config migration.

## CLI Usage

```bash
# Standard local validation (silent on clean success)
api-extractor run --local --quiet

# Interactive report update
api-extractor run --local

# Scaffold initial configuration
api-extractor init
```

## Programmatic API

The package root exports a single `Extractor` namespace. `Extractor.run({ configFilePath, options })` returns an `Effect` that resolves to `ExtractionPassed` or `ExtractionFailed` — errors fail the run, and in verification mode warnings fail it too. The outcome carries `errorCount`, `warningCount`, and one outcome per report variant. Config and compiler problems surface as typed `ExtractorError` variants on the error channel.

```ts
import * as NodeServices from '@effect/platform-node/NodeServices'
import { Extractor } from '@systemfsoftware/api-extractor'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

await Effect.runPromise(
  Extractor.run({
    configFilePath: './api-extractor.json',
    options: { localBuild: true, cliFlags: { quiet: true } },
  }).pipe(
    Effect.provide(Layer.mergeAll(NodeServices.layer, Extractor.layer())),
  ),
)
```

`Extractor.layer()` binds the console `MessageWriter`, and the Node services layer supplies `FileSystem` and `Path` — the same composition the CLI uses. Pass `Extractor.layer({ stdout, stderr })` to capture the run's console lines in your own streams instead of `process.stdout` and `process.stderr`.

## License

Apache-2.0
