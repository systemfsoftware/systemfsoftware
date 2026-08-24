# @systemfsoftware/effect-schema-discovery

Extracts exported Effect `Schema` declarations from TypeScript source files, providing AST-based schema discovery for tooling and test plugins.

This package is primarily consumed by `@systemfsoftware/effect-schema-vite` and `@systemfsoftware/effect-schema-refutation-vite`.

## Quick Start

```ts
import { findExportedSchemas } from '@systemfsoftware/effect-schema-discovery'

const schemas = findExportedSchemas({ dir: 'src' })
```

## API

The public surface is generated from source and tracked in [`etc/effect-schema-discovery.api.md`](./etc/effect-schema-discovery.api.md).

### Functions

- `findExportedSchemas(options: { dir: string })`: Walks source files in `dir` and returns metadata on all exported `Schema` declarations.
- `identityOf(schema)`: Returns a stable string identifier for an AST schema representation.
- `findRefutedIdentities(dir: string)`: Scans source files for registered schema refusal declarations.

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/core/effect/schema/discovery#readme).
