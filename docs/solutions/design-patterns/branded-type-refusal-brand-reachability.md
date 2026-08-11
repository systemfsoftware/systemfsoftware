---
title: A branded-type refusal is only as strong as the reachability of its brand symbol
date: "2026-08-11"
category: design-patterns
module: "@systemfsoftware/effect-daemon-spec"
problem_type: design_pattern
component: tooling
severity: high
resolution_type: code_fix
applies_when:
  - Designing an opaque or branded type whose construction is meant to be a compile-time refusal
  - Changing an entry file, adding a namespace re-export, or editing an exports map
  - Auditing a published package surface for leaked internal symbols
  - Reviewing a negative test that carries "@ts-expect-error" to see which case it actually defends
related_components:
  - testing_framework
  - api-extractor
  - packages/effect-daemon-spec
tags:
  - branded-type
  - opaque-type
  - public-surface
  - type-safety
  - negative-test
  - api-extractor
  - reachability
  - exports-map
---

# A branded-type refusal is only as strong as the reachability of its brand symbol

## Context

`@systemfsoftware/effect-daemon-spec` ships a **typed refusal**: a supervision policy must be produced by `Supervision.leader` / `Supervision.worker` / `Supervision.task` / `Supervision.custom` (`packages/effect-daemon-spec/src/supervision-policy/supervision-policy.combinator.ts:40-51`) before it can reach a supervisor. The refusal is enforced structurally:

- `SupervisionPolicy` is branded. `SupervisionPolicyTypeId` is declared in `packages/effect-daemon-spec/src/daemon-spec/brands.kernel.ts:16-19`, alongside `WorkerTypeId` (`:1-4`), `SupervisorTypeId` (`:6-9`), `DynamicSpecTypeId` (`:11-14`), and `MAX_CHILDREN_CEILING` (`:21`).
- The brand key is a required member of the type: `readonly [SupervisionPolicyTypeId]: SupervisionPolicyTypeId` (`packages/effect-daemon-spec/src/daemon-spec/daemon-spec.schema.ts:87-92`, key at `:88`).
- The supervisor entry points `oneForAll` / `oneForOne` / `restForOne` each intersect their opts with `PolicyBuiltFirst<S>` — `packages/effect-daemon-spec/src/supervision-policy/supervisor.combinator.ts`, at lines 29, 36 and 43. `PolicyBuiltFirst` (`packages/effect-daemon-spec/src/daemon-spec/daemon-spec.schema.ts:111-115`) replaces the `supervision` slot with a string-literal refusal sentence (`:114`) whenever `S` is not a branded `Effect<SupervisionPolicy>`.

A refactor that chunked the package entry into concept subpaths broke the guarantee. `packages/effect-daemon-spec/src/daemon-spec/mod.ts` began with `export * as Brands from './brands.kernel.js'`, placing the brand symbols on the **published** `./DaemonSpec` subpath (`package.json:40-44`, source mapping at `:41`). The typed refusal became forgeable by any consumer.

An adversarial reviewer raised it at P1 with `requires_verification: true`; a compile probe settled it. As of writing the fix is **uncommitted** in the working tree.

## Guidance

A branded or opaque typed refusal is only as strong as the reachability of its brand. Three disciplines follow.

**(a) The brand module must be unreachable from every published entry.**

1. Enumerate the entry points from the `exports` map (`packages/effect-daemon-spec/package.json:29-56`): `.`, `./DaemonReporter`, `./DaemonSpec`, `./LeaderLock`, `./SupervisionPolicy`, `./package.json`, with `./internal/*` sealed to `null` (`:56`).
2. Walk each entry's module graph to its leaves.
3. Assert the brand module is not a member. In this package all 13 in-repo importers of `brands.kernel.js` reach it by **relative** path; the only surface reach was the namespace re-export itself. Re-run whenever an entry file or the `exports` map changes.

**(b) The refusal test must mint the brand.**

The unbranded case is not the attack. A hand-built object without the brand key is refused by the sentence — that is the polite case. The attack is a forged brand: the consumer imports the symbol, stamps the key, and the value _satisfies_ `SupervisionPolicy` (`daemon-spec.schema.ts:88`), leaving `PolicyBuiltFirst` (`:111-115`) nothing to refuse.

```ts
// no @ts-expect-error - minting the brand is the attack, and the refusal must still fire
oneForAll({
  name: 'minted-brand-refusal',
  children: [],
  supervision: Effect.succeed({
    [Brands.SupervisionPolicyTypeId]: Brands.SupervisionPolicyTypeId,
    intensity: new BoundedIntensity({ restarts: 1, window: Duration.seconds(1) }),
    backoff: Schedule.exponential(Duration.millis(10)),
    cooldown: Duration.minutes(30),
  }),
  lock: { mode: 'none' },
})
```

Acceptance: `tsc` must fail. If it compiles clean, the brand is reachable from a public entry and the refusal is void. After the fix the import itself fails (`TS2305`), which is the same signal.

**(c) Read the generated API report.**

`packages/effect-daemon-spec/etc/DaemonSpec.api.md` displayed the leak verbatim in a committed artifact: a five-line `export namespace Brands { export { DynamicSpecTypeId, MAX_CHILDREN_CEILING, SupervisionPolicyTypeId, SupervisorTypeId, WorkerTypeId }; }` block. Nobody read it. The regenerated report contains only `export namespace Policy` (`packages/effect-daemon-spec/etc/DaemonSpec.api.md:40-42`) and `export namespace Spec` (`:45-47`).

## Why This Matters

- A type-level refusal is a promise the compiler keeps only while the brand is out of consumer reach. Re-exporting the brand module hands out the key to the lock the package advertises.
- Every gate was green while the guarantee was void. The refusal gate (`packages/effect-daemon-spec/__tests__/supervisor-uniform-behavior.integration.test.ts:20-30`) exercises only the unbranded case, no lint rule models brand reachability, and `pnpm check` passed throughout.
- Type guarantees have a supply chain — entry files, `exports` maps, generated reports. Any link can silently revoke a guarantee without one behavioral test failing.
- The same failure family reached an earlier decision in this repo: a `Deps` `Context.Tag` should expose the minimum and must not leak internal dependencies (auto memory [claude]). Both are internals made reachable through a public surface.

## When to Apply

- Any branded or opaque type used as a refusal at a library boundary.
- Before publishing, or before changing an entry file, a namespace re-export (`export * as X`), or the `exports` map.
- When a refactor re-chunks module layout and entry files are rewritten.
- When a generated API report diff lands, or when a negative test carries `@ts-expect-error` and you need to know which case it defends.

## Examples

The leak, before the fix — former line 1 of `packages/effect-daemon-spec/src/daemon-spec/mod.ts`:

```ts
export * as Brands from './brands.kernel.js'
```

The forgery it enabled:

```ts
import { Brands } from '@systemfsoftware/effect-daemon-spec/DaemonSpec'
supervision: Effect.succeed({
  [Brands.SupervisionPolicyTypeId]: Brands.SupervisionPolicyTypeId,
  intensity,
  backoff,
  cooldown,
})
```

The value satisfies the brand key (`daemon-spec.schema.ts:88`), so `PolicyBuiltFirst` (`:111-115`) never fires and the refusal sentence never appears.

The sealed entry, after the fix (`packages/effect-daemon-spec/src/daemon-spec/mod.ts:1-4`):

```ts
export * as Policy from './daemon-policy.schema.js'
export { BoundedIntensity, MaxChildren } from './daemon-policy.schema.js'
export * as Spec from './daemon-spec.schema.js'
export type { LockConfig } from './daemon-spec.schema.js'
```

Evidence spine — one probe file, U6 gate shape, brand minted, no `@ts-expect-error`:

- **before**: `pnpm --filter @systemfsoftware/effect-daemon-spec typecheck` reported no error — it compiled clean.
- **after**: fails with `TS2305: Module '"../src/daemon-spec/mod.js"' has no exported member 'Brands'`, and the refusal sentence appears in the second error. Full `pnpm check` exits 0.

## Related

- `docs/solutions/build-errors/stale-api-report-outlives-toolchain.md` — the same api-extractor report surface, opposite failure mode: there a stale report made a **red** gate name the wrong cause; here a leaked export made a **green** gate prove nothing. Its "read the report diff" remedy is the detection surface that would have caught this leak.
- `docs/solutions/build-errors/exports-types-rollup-drift.md` — same family: the advertised type surface is only as strong as what a consumer can actually reach.
- `docs/solutions/design-patterns/generated-schema-laws-are-tautological.md` — the schema-side analogue of discipline (b): a hand-authored test earns its place by stating a refusal that can demonstrably fail.
