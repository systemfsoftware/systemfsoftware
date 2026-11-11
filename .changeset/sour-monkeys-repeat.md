---
"@systemfsoftware/vitest": minor
---

Adds the `@systemfsoftware/vitest/kernel` subpath, the refusal kernel behind the `it` lanes: `makeLedger` (one check per observed state, with the refusal text as an option), `expectFor` (refusal tables and ordered subjects for a library's own values, as data; `soft` and `poll` stay refused whatever a table says), `drive` (a step interpreter that admits and runs each yielded value and decides what opens a new observed state), `mintCheck`, `Handle` and `makeHandle` (a non-Effect step so a yielded `Effect.sleep` is not a step), the `Gate`, `RequirementOf` and `BodyRefusal` types with caller-supplied texts, and `installGuard`, `markTask` and `isMarked`. The `it` lanes pass the fork's own tables, so their behaviour is unchanged.
