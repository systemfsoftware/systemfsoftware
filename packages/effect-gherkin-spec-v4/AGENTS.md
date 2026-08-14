# AGENTS.md — `@systemfsoftware/effect-gherkin-spec-v4`

> **Delta**: Gherkin BDD for Effect-TS + Vitest. Root AGENTS.md governs.

Step definitions compose as `Effect<StepResult, StepError>`. Scenario Outline tables expand into parameterized test cases. All step types are branded — use the provided factory, never raw constructors.

**Key invariants:**

- Each `Given`/`When`/`Then` returns a typed `Step` — compose with `*>` / `flatMap`, never imperatively
- `ScenarioOutline` expansion MUST preserve type safety across table rows
- Test runner integration is through `@effect/vitest`, not raw vitest
