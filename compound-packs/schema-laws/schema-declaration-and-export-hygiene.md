---
title: Schema files must export schemas only and reside in dedicated schema or workflow modules
applies_when:
  - declaring, exporting, or organizing Effect Schemas across package modules
  - reviewing module exports in *.schema.ts files
  - authoring domain entity types and codecs
tags: [schema, module-hygiene, schema-declaration-location, oxlint-plugin-effect-schema, pure-core]
---

Clean architectural boundaries require clear separation between schema declarations and runtime codec execution.

### 1. Dedicated Schema File Location

Per `@systemfsoftware/oxlint-plugin-effect-schema` rule `schema-declaration-location`:

- Schemas must be declared in either a `*.schema.ts` file or the `<stem>.workflow.ts` that directly owns the command and decision contracts.
- Schemas must never be declared inline in arbitrary utility files, services, or test files where they escape law discovery.

### 2. Schemas Only in `*.schema.ts`

Per rule `schema-file-exports-schemas-only`:

- A `*.schema.ts` module may export **only** schema declarations and the associated type vocabulary (`export type`, `export interface`).
- **No Runtime Codec Instances**: Banned from export are runtime codec runners (`S.encodeSync`, `S.decodeSync`, `S.decodeUnknownSync`, `Arbitrary.schema`, etc.). The file declares the schema; callers apply the codec at the point of use.
- **No Barrel Re-exports**: Schema files must not act as re-export hubs (`export * from ...`).

### 3. Tagged Errors and Structs

- Use `Schema.TaggedError`, never `Data.TaggedError` (`ban-data-taggederror`).
- Use `Schema.TaggedStruct` or `Schema.TaggedClass` rather than manually declaring `_tag` property signatures (`no-manual-tag-member`, `no-manual-tag-property`).

```ts
// WRONG: Exporting runtime codecs and mixing schemas with execution
// User.schema.ts
export const User = S.Struct({ id: S.String, name: S.String })
export const decodeUser = S.decodeSync(User) // BANNED: Runtime codec in schema file!
export const parseUser = (raw: unknown) => User.decode(raw) // BANNED

// RIGHT: Schema declarations and type vocabulary only
// User.schema.ts
import { Schema as S } from 'effect'

export interface User extends S.Schema.Type<typeof User> {}
export const User = S.Struct({
  id: S.String,
  name: S.String,
})
```

Gate: `@systemfsoftware/oxlint-plugin-effect-schema` (`schema-declaration-location`, `schema-file-exports-schemas-only`, `ban-data-taggederror`).
