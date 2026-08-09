# @systemfsoftware/oxlint-plugin-effect-schema

Oxlint rules for the Effect Schema cell — how a schema is declared, and what an authored schema test is allowed to assert.

## Rules

| Rule                        | What it enforces                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `ban-effect-schema-imports` | Import `Schema` from `effect`, never from the deprecated `@effect/schema` package.                                             |
| `ban-data-taggederror`      | Use `Schema.TaggedError`, never `Data.TaggedError`.                                                                            |
| `no-manual-tag-member`      | A union member literal or interface body must not hand-declare `_tag`; use `TaggedStruct` / `TaggedError` and derive the type. |
| `no-manual-tag-property`    | A class must not declare its own `_tag`; use `TaggedClass` / `TaggedError`.                                                    |
| `no-schema-law-duplicate`   | A `*.schema.property.test.ts` may state only refusals — never `ruleOfSchemas`, `Schema.equivalence`, `Schema.encodedSchema`.   |

## Why a schema property test exists at all

`ruleOfSchemas` generates a round-trip pair for every exported schema, and draws every input from that schema's **own arbitrary**. So each input already satisfies the refinement under test, and the law reduces to "values built to match the refinement match the refinement". No generated law can reach **rejection**.

That gap — and only that gap — is what a `*.schema.property.test.ts` is for. Its generators must be derived from the domain contract, never from the refinement literal, or the test inherits the same circularity it exists to escape.

## Enrollment

Turned on by `@systemfsoftware/oxlint-config/base`, which spreads `configs.recommended.rules`.

## Migrating manual `_tag` members

`no-manual-tag-member` flags hand-declared `_tag` members in union-member type
literals and in interface bodies. The migration is message-guided (there is no
auto-fix — the prescription cannot be inferred mechanically), one of three
branches:

Plain variants — `S.TaggedStruct`, with the type derived from the schema:

```ts
// before
type Direction = { readonly _tag: 'Up' } | { readonly _tag: 'Down'; readonly distance: number }

// after
const Direction = S.Union(
  S.TaggedStruct('Up', {}),
  S.TaggedStruct('Down', { distance: S.Number }),
)
type Direction = S.Schema.Type<typeof Direction>
```

Error-shaped variants (fields drawn from `name`/`message`/`cause` only) —
`S.TaggedError`:

```ts
// before
interface WriteFailed {
  readonly _tag: 'write-failed'
  readonly cause: unknown
}

// after
class WriteFailed extends S.TaggedError<WriteFailed>()('write-failed', { cause: S.Unknown }) {}
```

Type-parameter or schema-restating members — declare the schema and derive the
type (`S.Schema.Type<typeof X>`); a recursive union's members keep explicit
type anchors, because deriving a recursive type from its own schema const is
circular (TS2502/TS2456).

The rule's `allow` option keys are **case-insensitive tag values**, not
declaration names: `{ allow: ['Legacy'] }` silences the member tagged `Legacy`
while a sibling tagged `Modern` is still reported. Every member — named or
anonymous — can be keyed by its tag value. An entry that stops firing (its
members migrated or vanished) is stale and should be removed in the same
change.

## Testing

Each rule ships a RuleTester suite at `src/rules/__tests__/<rule>.test.ts`, with 100% mutation coverage required.
