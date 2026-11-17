# @systemfsoftware/effect-schema-discovery

Extracts exported Effect `Schema` declarations from TypeScript source files for `@systemfsoftware/effect-schema-vite`. An export is found when its source declares it the way a schema is declared, or when the TypeScript checker finds its type assignable to `Schema.Top` as resolved from its own module. A schema whose decoded values are errors, such as a tagged error class, is not returned.

## Quick Start

```ts
import { findExportedSchemas } from '@systemfsoftware/effect-schema-discovery'

const schemas = findExportedSchemas('src')
```

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/schema/effect-schema-discovery#readme).
