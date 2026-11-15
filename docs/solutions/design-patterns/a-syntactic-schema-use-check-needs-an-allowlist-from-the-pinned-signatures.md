---
title: A syntactic schema-use check needs an allowlist built from the pinned signatures
date: 2026-11-15
category: design-patterns
module: oxlint-plugin-dmmf-workflow
problem_type: design_pattern
component: tooling
severity: high
applies_when:
  - "a lint rule admits an imported binding only when it is used as an Effect Schema"
  - "a rule walks up from a reference through object or array literals to an enclosing S.* call"
  - "a rule trusts a relative import by its file name or a manifest entry by its path"
retire_when: "the rule reads types from the checker instead of syntax, or effect's Schema module stops taking schemas in mixed argument positions"
tags: [oxlint, effect-schema, allowlist, denylist, realpath, decision-code-imports, lint-design]
---

# A syntactic schema-use check needs an allowlist built from the pinned signatures

## Context

`decision-code-imports` admits a workspace binding inside `*.workflow.ts` and `*.schema.ts` only when it is used as a schema. Judging schema use by the enclosing `S.*` call, rather than by the argument slot a reference occupies, left four bypasses in the rule's drafts:

- **Unrestricted container traversal.** Walking up through any object or array literal to any call rooted at `S` admitted `S.String.annotations({ formatter: PI.format })`, `S.makeFilter(PI.isValid)` and `S.Struct({ meta: { fn: PI.format } })`.
- **Denylist gaps.** A denylist of non-schema combinators missed `makeFilterGroup`, `instanceOf` and the options argument of `Union` or `Struct`.
- **Value-taking combinators.** `Literal`, `Literals` and `Enum` take `LiteralValue`, not schemas, so listing them as schema-taking admitted `S.Literal(PI.someConstant)`.
- **Lexical path checks.** Trusting `./x.schema.js` by name let a symlink inside `src/`, a `../scripts/x.schema.ts` and a directory index escape. A kernel proof path checked only for being non-empty proved nothing.

## Guidance

- **Allowlist the slots, never the calls.** Build a table of each schema-taking combinator and which argument index takes a schema, for both the direct and the curried (piped) form. Derive it from the `Schema` type signatures of the effect version the lockfile pins, and re-derive it when that pin moves. Anything absent from the table is not a schema position.
- **A container is a schema position only where the combinator says so.** That means a field value of the fields object of `Struct`, `TaggedStruct`, `Class`, `TaggedClass`, `TaggedError` or `Error`; a member of `Union` or `Tuple`; the first argument and rest members of `TupleWithRest`; or a zero-argument, non-async thunk passed to `suspend`. An annotation, filter, transformation or options object never is.
- **Take slot indices only from the installed `.d.ts`.** Plausible recollections are wrong: in effect 4.1.2 the curried `decodeTo` is `decodeTo(to, transformation)`, there is no `asSchema` export, and `Graph` is `Graph(type, node, edge)`.
- **Judge paths by their real path.** Resolve a relative decision import with `realpathSync`, and require it to be a decision file under the real `src/` of the same package. A manifest's proof path must be an existing file inside the real repository root.
- **Ship no list of existing offenders** (`architecture-patterns/an-escape-hatch-is-an-unfalsified-hypothesis.md`).

## Why This Matters

A denylist fails open: every combinator it forgets, and every one effect adds later, becomes a hole. An allowlist fails closed: a forgotten combinator is a false positive that someone reports and that the next signature check adds. For a boundary whose job is to keep behaviour out, failing closed is the safe default.

## When to Apply

- Writing or reviewing any rule that classifies a reference by the API call around it.
- Bumping the effect pin in a repository whose rules carry such a table.

## Examples

```typescript
// Reported: annotation, filter and option slots are not schema positions
S.String.annotations({ formatter: PI.format })
S.makeFilter(PI.isValid)
S.Union([A, B], { options: PI.opts })
S.Literal(PI.someConstant)
// Admitted: allowlisted schema slots
S.Struct({ id: PI.MutantId })
S.Union([PI.A, PI.B])
S.suspend(() => PI.Node)
S.Array(PI.Sku)
```

Known residual: `TemplateLiteral` parts may be schemas or literal values, which syntax cannot tell apart. A constant there can only be a literal value, so it carries no behaviour.

## Related

- `docs/solutions/architecture-patterns/an-escape-hatch-is-an-unfalsified-hypothesis.md`
- `docs/solutions/tooling-decisions/changeset-requirement-keys-on-turbo-build-hash.md`: changing the shared `import-origin` package needs an intent for every plugin that bundles it
