# @systemfsoftware/api-extractor

An Effect-native API surface review and `.d.ts` declaration rollup engine for TypeScript libraries.

Forked from `@microsoft/api-extractor@7.59.1` (microsoft/rushstack@bc4cd29, MIT License) and re-architected onto Effect 4. It reads the `api-extractor.json` files your packages already have and rewrites nothing else.

```bash
pnpm add -D @systemfsoftware/api-extractor
```

## Why this fork exists

It runs the same reviewer the Rushstack tool runs, with three things the upstream package cannot do:

1. **Namespace barrel rollups.** Upstream fails to bundle declarations for modern namespace re-exports (`export * as Atom from './Atom.js'`), emitting circular declarations when a sibling module imports the barrel back. This engine lowers namespaces to top-level aliases and emits rollups that compile.
2. **Native quiet mode.** `--quiet`/`-q` and a root-level `"quiet": true` suppress the banner and success chatter on a clean run while warnings and errors still print, so consumers stop wrapping the CLI in a filter script.
3. **Config compatibility, unchanged.** Existing schema-v7 `api-extractor.json` files run without migration: `<projectFolder>`, `<lookup>`, `<pkgname>`/`<unscopedPackageName>` tokens, and `extends` chains all resolve as upstream resolves them, and the reports it writes are byte-identical to upstream's.

## Install

```bash
pnpm add -D @systemfsoftware/api-extractor
```

## CLI usage

```bash
# Verify a report without rewriting it; silent when clean.
api-extractor run --quiet

# Rewrite the report from the current source.
api-extractor run --local

# Scaffold a starting api-extractor.json.
api-extractor init
```

`run` accepts `--config`/`-c`, `--local`/`-l`, `--verbose`/`-v`, `--diagnostics`, `--typescript-compiler-folder`, `--print-api-report-diff`, and `--quiet`/`-q`. The root command accepts `--debug`/`-d`.

## Quiet contract

Under `--quiet`, or with `"quiet": true` in the config, a clean run exits 0 and prints nothing on stdout. Warnings, errors, and diagnostics still print — a drifted report under `--quiet` prints its out-of-date warning and exits non-zero.

Verbosity precedence is `--diagnostics` > `--verbose` > `--quiet` > config `"quiet"` > default.

## Configuration

`api-extractor.json` is the upstream schema, read as-is. Reports land in the configured `apiReport.reportFolder` (default `etc/`). A run without `--local` verifies the committed report and fails on drift; `--local` rewrites it. `tsdoc-metadata.json` is written by default; `docModel.enabled: true` is refused, because emitting the `.api.json` doc model is out of scope for this package.

## Programmatic usage

The package root exports one namespace, `Extractor`. `Extractor.run` takes an extraction request and returns an `Effect` resolving to an `ExtractionDecision` — a passed or failed outcome carrying the error and warning counts and one outcome per report. Configuration, compiler, and analysis failures are typed `ExtractorError` variants on the error channel.

```ts
import * as NodeServices from '@effect/platform-node/NodeServices'
import { Extractor } from '@systemfsoftware/api-extractor'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

const program = Extractor.run({
  configFilePath: './api-extractor.json',
  options: { localBuild: true, cliFlags: { quiet: true } },
}).pipe(
  Effect.provide(Layer.mergeAll(NodeServices.layer, Extractor.layer())),
)

await Effect.runPromise(program)
```

`Extractor.layer()` binds the console `MessageWriter` writing to `process.stdout` and `process.stderr`; pass `Extractor.layer({ stdout, stderr })` to capture the run's lines in your own streams. The Node services layer supplies `FileSystem` and `Path`. The namespace also exports the composed `Extractor.cell`, the extraction request and outcome schemas, the error union, the `MessageWriter` service, and `Extractor.version`. Analyzer, collector, generator, and enhancer modules are internal.

## License

Apache-2.0. Portions are derived from `microsoft/rushstack` `apps/api-extractor`, MIT-licensed; the third-party notice reproduces the upstream MIT notice.
