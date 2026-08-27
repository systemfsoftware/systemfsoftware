# @systemfsoftware/effect-schema-discovery

Extracts exported Effect `Schema` declarations from TypeScript source files, providing AST-based schema discovery for `@systemfsoftware/effect-schema-vite`.

## Quick Start

```ts
import { findExportedSchemas } from '@systemfsoftware/effect-schema-discovery'

const schemas = findExportedSchemas('src')
```

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/core/effect/schema/discovery#readme).
