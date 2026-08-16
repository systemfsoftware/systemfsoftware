# @systemfsoftware/oxlint-plugin-effect-acl

[![npm](https://img.shields.io/npm/v/@systemfsoftware/oxlint-plugin-effect-acl?style=flat-square)](https://www.npmjs.com/package/@systemfsoftware/oxlint-plugin-effect-acl)
[![license](https://img.shields.io/npm/l/@systemfsoftware/oxlint-plugin-effect-acl?style=flat-square)](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)

> An oxlint plugin for Effect-TS teams who want boundary translations that decode, never cast.

```
x @systemfsoftware/effect-acl(acl-no-as-casts): order.acl.ts is forbidden.
  Expected: a domain value produced by ParseResult.decode(DomainSchema).
  Actual: an 'as Order' assertion.
  Fix: hand the decoded object to ParseResult.decode(DomainSchema) so branding and refinements apply through the schema contract — never assert the brand.

x @systemfsoftware/effect-acl(acl-transform-orfail-required): order.acl.ts is forbidden.
  Expected: at least one schema transform decoding a foreign shape into a branded domain type — v3 S.transformOrFail(From, To, …) or v4 From.pipe(S.decodeTo(S.toType(To), { decode: SchemaGetter.transformOrFail(…) })).
  Actual: no schema transform — no S.transformOrFail call and no S.decodeTo with a SchemaGetter.transformOrFail / SchemaTransformation.transformOrFail getter.
  Fix: declare the crossing as S.transformOrFail(SourceSchema, DomainSchema, { strict: true, decode, encode }) with the inactive direction returning ParseResult.Forbidden — or, in effect v4, SourceSchema.pipe(S.decodeTo(S.toType(DomainSchema), { decode: SchemaGetter.transformOrFail(…), encode: SchemaGetter.forbidden(…) })) — or rename the file if it is not an ACL.

Found 0 warnings and 2 errors.
```

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-effect-acl
```

## The Problem

A `*.acl.ts` is the boundary translation cell: a unidirectional schema transform — v3 `S.transformOrFail(From, To, …)` or v4 `From.pipe(S.decodeTo(S.toType(To), { decode: SchemaGetter.transformOrFail(…) }))` — that decodes a foreign shape (DB row, API payload) into a branded domain type. `as` casts still compile, still pass a standard lint config, and produce a branded value that was never verified — the same failure class as SQL injection bypassing parameterised queries. And a `.acl.ts` with no transform at all is not an ACL, it is a naming convention wearing a suffix.

These rules make that convention executable. Every rule is inert on any file not named `*.acl.ts`.

## Quick Start

```ts
// oxlint.config.ts
import effectAcl from '@systemfsoftware/oxlint-plugin-effect-acl'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin-effect-acl'],
  rules: { ...effectAcl.configs.recommended.rules },
})
```

```bash
pnpm oxlint src
```

On a clean codebase: `Found 0 warnings and 0 errors.`

To adopt gradually, drop the spread and name rules individually as `'@systemfsoftware/oxlint-plugin-effect-acl/<rule>': 'warn'`. Entries placed after the spread override it.

## Rules

| Rule                            | Reports                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acl-transform-orfail-required` | A `.acl.ts` file with no schema transform — no v3 `S.transformOrFail(From, To, …)` call and no v4 `S.decodeTo(To, { decode: SchemaGetter.transformOrFail(…) })` — the ACL cell is a unidirectional transform decoding a foreign shape into a branded domain type; a file without one is not an ACL (rename it) |
| `acl-no-as-casts`               | Any `as` cast in a `.acl.ts` file — branding and typed failures are earned by real decoding through `ParseResult.decode(DomainSchema)`, never asserted (the `S.transformOrFail` options' `ParseResult.decode` call is the fix)                                                                                 |
| `acl-no-anti-pattern-path`      | A `.acl.ts` file placed under a banned directory segment (`core`, `shell`, `util`, `utils`, `helper`, `manager`, `service`) — the path names the bounded context the ACL translates                                                                                                                            |
| `acl-single-transform-export`   | A `.acl.ts` exporting more than one transform — v3 `S.transformOrFail(From, To, …)` or v4 `From.pipe(S.decodeTo(S.toType(To), { decode: SchemaGetter.transformOrFail(…) }))` — or an exported value that is neither the transform nor a source/target Schema declaration                                       |

## FAQ

**Q: `Failed to parse config … Unknown plugin: '@systemfsoftware/oxlint-plugin-effect-acl'`.**
A: The name was placed in oxlint's `plugins` field, which takes built-in namespaces only. JavaScript plugins load through `jsPlugins`; their rules go in `rules`.

**Q: Installed, but nothing is reported.**
A: Every rule is filename-gated. Only `*.acl.ts` files are examined.

**Q: Why doesn't `acl-no-as-casts` flag `!`?**
A: It gates ACL2 of the cell skill, which bans `as` casts specifically. The `!` non-null assertion is covered by oxlint's own `no-non-null-assertion` and is out of this cell's scope.

**Q: Why is my `Schema.transformOrFail` (aliased namespace) reported as missing?**
A: Detection matches the canonical spellings only: v3 `S.transformOrFail(...)` and v4 `S.decodeTo(To, { decode: SchemaGetter.transformOrFail(...) })`, using the canonical identifiers `S`, `SchemaGetter`, and `SchemaTransformation`. Aliasing any of those identifiers (or the namespaces) breaks detection — mirroring the sibling cell plugins. Import the Schema namespace as `S` and the getters under their `effect` export names.

## Requirements

`effect` and TypeScript 5.0+ as peers. Rules read syntax only; no type information or `tsconfig` wiring needed.

## Contributing

[AGENTS.md](https://github.com/systemfsoftware/systemfsoftware/blob/main/packages/oxlint-plugins/effect-acl/AGENTS.md)

## License

[Apache 2.0](https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE)
