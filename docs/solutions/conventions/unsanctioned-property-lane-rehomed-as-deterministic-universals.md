---
title: "Unsanctioned property lane re-homed as deterministic universals inside the gherkin feature"
date: 2026-09-18
category: conventions
module: "Cell ADT parity (packages/effect-cell-types, oxlint-plugin-test-placement)"
problem_type: convention
component: testing_framework
severity: medium
applies_when:
  - "authoring law properties over public non-workflow exports"
  - "lint names a three-lane test taxonomy"
  - "plan text names an unsanctioned test file"
tags: [test-lanes, oxlint, gherkin, property-testing, const-e9]
---

# Unsanctioned property lane re-homed as deterministic universals inside the gherkin feature

## Context

The cell-adt parity plan authored a law-property file path at `src/__tests__/cell-arrows.property.test.ts` — planned, never created — beside the Cell public arrows: identity (`andThen`/`id` both sides), input-fixing (`flatMap`'s inner cell observes the original input for every generated input), error-confinement (`orElse`'s fallback runs exactly when the wrapped run fails with `E`). Its Test Layer Classification admitted that file as "required" alongside the gherkin integration feature for scenario and trace-order observables.

The file is unsanctioned by every lane of the placement law at once, and no rename saves it. A dummy `src/*.workflow.ts` created only to legitimize the property test's location was rejected as a vacuous smoke and deleted; an in-source `import.meta.vitest` fallback failed because the arrows are public exports; a fixed-batch "sampled numbers" scenario was rejected as a weakening of the universal and corrected to a deterministic diverse batch (session history). The shipped resolution keeps the universal and changes the mechanism: deterministic-universal scenarios inside the gherkin integration feature.

## Failure Mechanics

Four lanes reject the plan-authored file, each on a different axis:

1. **`no-test-file-in-src` / `src-property-test-cell` (colocation shape).** Under `src/`, the only sanctioned test file is a single-segment `<stem>.workflow.property.test.ts` inside a sanctioned test directory, beside the `<stem>.workflow.ts` it covers. `cell-arrows` is a multi-segment stem over kernel arrows; renaming to `cell.workflow.property.test.ts` would lie about the subject — no `cell.workflow.ts` exists, and `WORKFLOW_TEST_BASENAME` (`/^[^.]+\.workflow\.property\.test\.ts$/`) forbids the multi-segment stem anyway. The rule's own fix text routes a kernel suite to an in-source block — but `in-source-test-targets-private` bans in-source blocks that touch only exported bindings, and every arrow the laws quantify over is exported.

2. **`test-suffix-outside-src` (the outside lane).** Moved below `src/`, a `.property.test.ts` suffix is still banned: the one behaviour suffix outside `src/` is `.integration.test.ts`, and `behaviour-test-requires-gherkin` binds that lane to a single `makeFeature` structure.

3. **`property-file-purity` (the content axis).** A property file admits only `it.prop`/`it.effect.prop` with boolean predicates; the arrow laws need `Effect.runSync` comparisons, trace arrays, and multi-value assertions. Conversely `PROPERTY_TEST_SUFFIX` makes any FastCheck import inside an integration file a violation, so `it.prop` cannot simply move into the gherkin file. The purity rule forces a choice between the two homes, and the placement rules have already eliminated the property home.

4. **The plan-lane mismatch (process axis).** A plan that names a test file without deriving it from the lane taxonomy authors an unsanctionable artifact; under CONST-E9 the correction re-homes the work — never the instrument.

## The Invariant

$$
\text{sanctioned}(\text{test}) \iff \text{derives from what it calls} \times \text{where its subject lives}
$$

A test's home is derived from its subject's shape (workflow / kernel / public surface) and its lane's purity contract — never asserted by a plan's filename, and never rescued by a stand-in subject created to justify a location. When no lane admits a needed verification, the universal survives by changing mechanism, not by weakening to samples or bending the instrument.

## Guidance

Place Cell arrow-law coverage in `tests/*.integration.test.ts` as deterministic-universal gherkin scenarios:

1. One `Feature(...)` per file (`behaviour-one-feature-per-file`) driven through `makeFeature` from `@systemfsoftware/effect-gherkin-spec` (`behaviour-test-requires-gherkin`), reaching the public surface through its published import (`tests-import-public-api`).
2. Express each universal as a fixed diverse input batch inside the `When` step — empty, boundary lengths, long repetition, unicode, whitespace, zero-padded — asserting the law for every element in the `Then` step. The scenario "Generated commands keep the identity as both-sided identity" over the ten-input `ids` batch is the template.
3. Keep a single-example scenario beside the batch (the echo scenario beside the identity batch) so the law reads as pinned example plus universal, not as a sampled generator.
4. Shared workflow fixtures live in the integration feature's `__fixtures__` directory (`tests-dir-helpers-in-fixtures`), as the package's own feature fixtures do.

## When to Apply

- Covering execution-combinator laws over a public ADT surface (identity, input-fixing, error-confinement) where the plan instinct is "law properties over generated input".
- Any proposed `src/__tests__/*.property.test.ts` whose stem is not a single-segment `<stem>.workflow` matching a colocated workflow — unsanctioned by construction.
- Reviewing a plan that admits both a property file and an integration file for the same arrows: keep the integration file, delete the property file, fold the universals into batches.
- Does not apply to genuine workflow laws (`<stem>.workflow.property.test.ts` beside `<stem>.workflow.ts`) or kernel/policy/schema invariants, whose home is the in-source block over private bindings.

## Examples

**Before (rejected by every lane)** — the planned shape:

```ts
// src/__tests__/cell-arrows.property.test.ts — never sanctioned
import { it } from '@systemfsoftware/vitest'

it.prop(
  'id is both-sided identity',
  { of: [commandArbitrary], subject: Cell.id<Command>().run, runs: 100 },
  (subject, [cmd]) =>
    // Effect.runSync(subject(cmd)) deep-equals cmd; andThen(id, cell)
    // and andThen(cell, id) agree with cell
    true,
)
```

**After (shipped)** — the deterministic-universal scenario, titled "Generated commands keep the identity as both-sided identity":

```ts
scenario(
  'Generated commands keep the identity as both-sided identity',
  Gherkin.Do.pipe(
    When('a diverse batch runs echo and every identity composition')(
      'run',
      () => {
        const ids = [
          '',
          'a',
          'ab',
          'abc',
          'abcd',
          'abcdefgh',
          'x'.repeat(64),
          'héllo-✓-世界',
          'a b\tc',
          '0000',
        ] as const
        const outcomes = ids.map((raw) => {
          const input = { id: raw }
          return {
            input,
            echo: Effect.runSync(Cell.id<Command>().run(input)),
            left: Effect.runSync(Cell.andThen(Cell.id<Command>(), answeringCell).run(input)),
            right: Effect.runSync(Cell.andThen(answeringCell, Cell.id<string>()).run(input)),
            piped: Effect.runSync(answeringCell.pipe(Cell.andThen(Cell.id<string>())).run(input)),
          }
        })
        return Effect.succeed({ outcomes })
      },
    ),
    Then('every input echoes and every composition agrees')((s) => {
      expect(s.run.outcomes.length).toStrictEqual(10)
      for (const outcome of s.run.outcomes) {
        expect(outcome.echo).toStrictEqual(outcome.input)
        expect(outcome.left).toStrictEqual(outcome.right)
        expect(outcome.left).toStrictEqual(outcome.piped)
      }
    }),
  ),
)
```

The batch is the universal: ten fixed inputs spanning empty, boundary, repetition, unicode, and whitespace, each asserting echo-identity and left/right/piped agreement. The flatMap scenario "flatMap observes the original input across a diverse batch" applies the same shape to the input-fixing law. No generator, no `it.prop`, no `src/` file — one `Feature`, public-API imports, gherkin steps, every placement lane green.

Related: `docs/solutions/architecture-patterns/grain-table-identifier-three-fates.md` (placement lint keys only on statically decidable shapes), `docs/solutions/design-patterns/generated-schema-laws-are-tautological.md` (schema-law placement decision and TP rationale), `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md` (why placement keys on derivation, not filename assertion).
