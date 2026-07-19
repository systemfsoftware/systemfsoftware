# AGENTS.md — `@systemfsoftware/effect-gherkin-spec`

> **Location:** `packages/effect-gherkin-spec/` — Gherkin BDD for Effect-TS + Vitest. Universal agent rules live in the root `AGENTS.md`; this file carries only `effect-gherkin-spec/`-specific deltas.

Step definitions compose as `Effect<StepResult, StepError>`. Scenario Outline tables expand into parameterized test cases. All step types are branded — use the provided factory, never raw constructors.

## Key invariants

- Each `Given`/`When`/`Then` returns a typed `Step` — compose with `*>` / `flatMap`, never imperatively.
- `ScenarioOutline` expansion MUST preserve type safety across table rows.
- Test runner integration is through `@effect/vitest`, not raw vitest.
