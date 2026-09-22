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

Both Effect-native and Promise-based entrypoints are exposed:

```ts
import { invoke, runEffect } from '@systemfsoftware/api-extractor'

// Promise-based execution (resolves with ExtractorResult, never throws on findings)
const result = await invoke({
  configObjectFullPath: './api-extractor.json',
  localBuild: true,
  quiet: true,
})

console.log(result.succeeded)
```

## License

Apache-2.0
