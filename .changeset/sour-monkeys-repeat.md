---
"@systemfsoftware/vitest": minor
---

Adds the `@systemfsoftware/vitest/kernel` subpath, the refusal kernel behind the `it` lanes: `makeLedger` (checks counted per observed state and per check kind, with an optional per-kind window limit), `expectFor` (refusal tables, ordered subjects for a library's own values, and extra statics as data), `drive` (a step interpreter that admits and runs each yielded value and decides what opens a new observed state), `mintCheck`, `Handle` and `makeHandle` (a non-Effect step so a yielded `Effect.sleep` is not a step), the `Gate`, `RequirementOf` and `BodyRefusal` types with caller-supplied texts, and `installGuard`, `markTask` and `isMarked`. The `it` lanes pass the fork's own tables and one check per state, so their behaviour is unchanged.
