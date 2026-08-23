# @systemfsoftware/oxlint-plugin-effect-schema

Oxlint rules for Effect Schema declarations — how a schema is declared, and what an authored schema property test is allowed to assert.

## Rules

| Rule                               | What it enforces                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ban-effect-schema-imports`        | Import `Schema` from `effect`, never from the deprecated `@effect/schema` package.                                                                                                                                                                                                                                                              |
| `ban-data-taggederror`             | Use `Schema.TaggedError`, never `Data.TaggedError`.                                                                                                                                                                                                                                                                                             |
| `no-manual-tag-member`             | A type alias, interface, or type literal must not declare a `_tag` property signature; derive the type from `TaggedStruct` / `TaggedError` with `Schema.Type`, or inherit it from a tag carrier.                                                                                                                                                |
| `no-manual-tag-property`           | A class must not declare its own `_tag`; use `TaggedClass` / `TaggedError`.                                                                                                                                                                                                                                                                     |
| `no-schema-law-duplicate`          | A `*.schema.property.test.ts` may state only refusals — never `ruleOfSchemas`, `Schema.equivalence`, `Schema.encodedSchema`.                                                                                                                                                                                                                    |
| `schema-declaration-location`      | A schema declaration (a class extending a Schema factory, or a module-scope const initialized to a `Schema.<member>(...)` call) must live in a `*.schema.ts` file or the `<stem>.workflow.ts` that owns it.                                                                                                                                     |
| `schema-file-exports-schemas-only` | A `*.schema.ts` may export nothing but schemas: schema declarations plus the type vocabulary (type aliases, enums) the schemas are built from. An exported codec const (`S.encodeSync`, `S.decodeSync`, `S.toArbitrary`, ...) and every re-export form are banned — the file declares its schemas, the caller applies them at the point of use. |

## Why a schema property test exists at all

`ruleOfSchemas` generates a round-trip pair for every exported schema, and draws every input from that schema's **own arbitrary**. So each input already satisfies the refinement under test, and the law reduces to "values built to match the refinement match the refinement". No generated law can reach **rejection**.

That gap — and only that gap — is what a `*.schema.property.test.ts` is for. Its generators must be derived from the domain contract, never from the refinement literal, or the test inherits the same circularity it exists to escape.

## Enrollment

Turned on by `@systemfsoftware/oxlint-config/base`, which spreads `configs.recommended.rules`.

## Testing

Each rule ships a RuleTester suite at `src/rules/__tests__/<rule>.test.ts`, with 100% mutation coverage required.
