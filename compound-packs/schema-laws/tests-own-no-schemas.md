---
title: Tests own no schemas, and production exports none just so a test can reach it
applies_when:
  - a test needs a schema, a tagged error, or a refined value to exercise the code under test
  - adding a `*.schema.ts` under `tests/` or `src/__tests__/`
  - exporting a schema, or adding a `package.json` subpath, that only tests import
  - reviewing a test that declares, copies, or aliases a schema
tags: [schema-laws, tests, fixtures, harness, schema-smuggling, leaky-exports]
---

A schema a test declares for itself escapes everything that grades schemas. `@systemfsoftware/effect-schema-vite` scans only `src`, so it gets no generated laws. It drifts from the production type it imitates, and when it models a concept production lacks, it hides the missing type. A copy of a third party's schema passes against itself while the real one changes.

## Rule

1. **Use the real schema.** A test uses the production schema of its own package, the schema the third party exports (for example `Rpc.exitSchema` from `effect/unstable/rpc`), or the built-in (`S.String`, not an exported alias of it).
2. **A missing schema is a finding.** A test that cannot find the domain schema it needs has found a missing production type (`invariants-as-refinements`, `tagged-unions-over-state-by-presence`), or it is testing something production does not do. Add the type to production, or remove the test.
3. **Harness is the exception.** A conformance model's command, response, and state language, and the stand-in API or error through which a test drives a generic library, exist only to drive the test. Harness schemas live in the harness file that uses them (`*.model.ts`, `*.fixture.ts`, or a fixture `*.workflow.ts` under `tests/`), never in a `*.schema.ts`, and are never exported as domain types.
4. **No smuggling.** Production never exports a schema, and never adds a `package.json` subpath, solely so a test can reach it. Type tests (`*.tst.ts`) reach harness schemas with `import type`.

```ts
// wrong: tests/__fixtures__/request.schema.ts
export const Request = Schema.String

// right: the test uses the built-in where it needs it
const routed = routingTo(Schema.String, ...)
```

Working example: `packages/effect-memfs/tests/__fixtures__/open-file.model.ts` (a conformance harness that owns the stand-in failure it probes for).

Gate: `review`. `schema-declaration-location` keeps schemas out of `*.test.ts` files and names the production module or harness file as the fix.
