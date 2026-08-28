# feat: Apply effect-ts/tsgo oxlint rules with warn→error promotion

---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
created: 2026-08-28
---

## Summary

Integrate `@effect/tsgo` oxlint presets (`github.com/effect-ts/tsgo` docs/README.md — Oxlint Setup) into the repo's shared oxlint config so every `effecttsgo/*` rule ships, and promote any preset severity `warn` to `error` because agents ignore warnings. Verification is `oxlint` type-aware run + `pnpm check:local` green.

## Problem Frame

- `package.json` already depends on `@effect/tsgo@^0.36.5` but no package imports its oxlint presets — `packages/lint/oxlint/config/src/oxlint-config.base.ts` enables `typescript/no-unsafe-*` via plugins `typescript, oxc…` without `effecttsgo`.
- Upstream presets (`node_modules/@effect/tsgo/oxlint-presets/recommended.json` etc.) ship ~78 `effecttsgo/*` rules at `warn`; upstream `correctness.json` warns on `floating-effect`, `missing-effect-context` etc. that should fail CI.
- Missing: reproducible wiring (`effect-tsgo patch --oxlint` via `prepare`), schema validation, and deterministic warn→error elevation at the config boundary.

## Requirements

- R1 Apply tsgo rules via `@effect/tsgo/oxlint-presets` in the shared config (not per-package copy-paste).
- R2 Every rule whose preset severity is `warn` must evaluate as `error` (no warnings survive).
- R3 Type-aware mode + `effecttsgo` plugin must be active (tsgo docs: all rules require type-aware).
- R4 Existing `correctness: 'error'` category and custom rules remain authoritative; no rule downgraded.
- R5 Patch lifecycle reproducible: `pnpm install` patches oxlint via `prepare` script.
- R6 No per-package drift: leaf `oxlint.config.ts` files keep `extends: [base]` only.
- R7 Verification is automated: lint gate fails on any tsgo finding.

## Key Technical Decisions

- KTD1 Use `recommended` preset as base, with opt-in `correctness` refinement if audit rejects `recommended` subset — `recommended` is the upstream-recommended default (`@effect/tsgo` README) and covers ~78 rules; `correctness` subset is 18 rules. Decision: start `recommended` promoted to error, audit count of `warn`→`error` delta against repo. Gate: reviewer counts findings before/after.
- KTD2 Elevate via config-time transform `promoteWarnToError(preset)` helper in `config` package, not by forking JSON or hand-listing rules — upstream changes severity/count silently; helper recomputes from preset object. Prevents CHK1 self-certification. Gate: `pnpm --filter @systemfsoftware/oxlint-config build` + snapshot that input `warn` maps to `error`.
- KTD3 Wire via `oxlint.config.ts` TypeScript config (`import { recommended } from "@effect/tsgo/oxlint-presets"`) matching existing `defineConfig` pattern in `packages/lint/oxlint/config/src/oxlint-config.base.ts`, not `oxlintrc.json` extends paths — repo already uses TS config. Gate: `oxlint --print-config` shows `effecttsgo/*`.
- KTD4 Add `effect-tsgo patch --oxlint` to root `prepare` alongside `husky` (README instructs `scripts.prepare = "effect-tsgo patch --oxlint"`). Coexist with husky via `&&` or sequential prepares. Gate: `pnpm install` leaves patched binary verified by `pnpm exec oxlint --version` metadata.
- KTD5 Keep warn→error promotion inside the shared config package, not in CI flag `--deny-warnings` — deny-warnings would also promote unrelated warnings; targeted promotion scopes to `effecttsgo/*`. Gate: `oxlint` output has zero `warn` severities.

## Implementation Units

### U1. Add patch lifecycle + schema wiring

**Goal:** Oxlint binary is patched and configs validate against tsgo schema.
**Requirements:** R3, R5
**Dependencies:** —
**Files:**

- `package.json` (modify — `scripts.prepare`)
- `packages/lint/oxlint/config/src/oxlint-config.base.ts` (modify — reference schema via `$schema` comment or config header)
  **Approach:**

1. Append `effect-tsgo patch --oxlint` to `prepare` (preserve `husky`).
2. Verify `@effect/tsgo` version satisfies patched oxlint/oxlint-tsgolint peer (patch validates internally).
3. No schema file committed; TypeScript import gives completions.
   **Patterns:** existing `prepare: "husky"` in root `package.json`.
   **Test scenarios:**

- `pnpm install` leaves `node_modules/.bin/oxlint` patched (probe: `effect-tsgo` patch idempotent).
- Unpatched state fails fast on `pnpm exec oxlint .` with version mismatch message.
  **Verification:** `pnpm install && pnpm exec oxlint --help` exits 0 without version-mismatch error.

### U2. Integrate tsgo preset into shared config with warn→error promotion

**Goal:** `packages/lint/oxlint/config/src/oxlint-config.base.ts` exports `recommended` rules at `error` severity.
**Requirements:** R1, R2, R3, R4
**Dependencies:** U1
**Files:**

- `packages/lint/oxlint/config/src/oxlint-config.base.ts` (modify)
- `packages/lint/oxlint/config/src/promote-warn-to-error.ts` (create — helper)
- `packages/lint/oxlint/config/src/__tests__/promote-warn-to-error.test.ts` (create — unit test for helper)
  **Approach:**

1. Extract helper `promoteWarnToError(rules: Record<string, RuleSeverity>): Record<string,"error">` that maps `warn→error`, leaves `error/off` intact.
2. Import `recommended` from `@effect/tsgo/oxlint-presets`, apply `promoteWarnToError(recommended.rules)` spread into `rules:` after existing rules so tsgo does not override explicit `off` selections.
3. Add `plugins: ['effecttsgo']` or rely on preset's `plugins` (preset already declares it); prefer explicit `plugins` merge to satisfy REPO-A conventions.
4. Keep `options.typeAware: true` (already present, required by tsgo).
   **Patterns:** `...effectDmmf.configs.recommended.rules` spread in same file.
   **Test scenarios:**

- Helper maps `{ "effecttsgo/a":"warn","effecttsgo/b":"error","effecttsgo/c":"off" }` → `{a:"error",b:"error",c:"off"}`.
- Config evaluation contains zero `effecttsgo/*` at `warn` (recompute from preset object, not self-reported field).
- Existing `off` rules (`no-console`, `no-barrels`) remain `off`.
  **Verification:** `pnpm --filter @systemfsoftware/oxlint-config build && node -e "import('./packages/lint/oxlint/config/dist/index.js').then(m=>console.log(Object.values(m.default.rules).filter(v=>v==='warn').length))"` prints 0.

### U3. Suppress or fix baseline findings; enable strict file if desired

**Goal:** Tree passes with new rules; no mass `// oxlint-disable` without justification.
**Requirements:** R2, R7
**Dependencies:** U2
**Files:**

- `packages/**/src/**/*.ts` (modify — fixes for `effecttsgo/*` findings)
- `packages/lint/oxlint/config/src/oxlint-config.base.ts` (modify — targeted overrides if class of findings is false-positive, e.g., fixtures already handled)
  **Approach:**

1. Run `pnpm exec oxlint . --type-aware` and triage buckets (floating-effect, global-* etc.).
2. Prefer fixing (`yield*`, `Effect.gen` corrections) over suppression; where suppression needed, scope to `overrides` by `files:` glob, not inline disables.
3. Consider importing `correctness` instead of `recommended` if `recommended` noise > signal — record decision in plan's KTD1 audit note.
   **Patterns:** existing `overrides` for `**/*.test.ts` and `**/fixtures/**`.
   **Test scenarios:**

- `pnpm turbo lint` passes with no `warn` findings.
- A fixture file still allows `typescript/no-unsafe-*` off but `effecttsgo/*` findings suppressed only where justified (negative: no global `off`).
  **Verification:** `pnpm check:local` lint phase green; `pnpm exec oxlint . --deny-warnings` green.

### U4. Document preset choice and severity policy

**Goal:** Future preset upgrades don't silently reintroduce warns.
**Requirements:** R2
**Dependencies:** U2
**Files:**

- `packages/lint/oxlint/config/README.md` or inline comment in `oxlint-config.base.ts` (modify)
  **Approach:**
- One-paragraph note: which preset is canonical, why `warn→error` helper exists, and that new upstream rules at `warn` auto-promote.
  **Test scenarios:** none — doc only. `Test expectation: none -- prose only`.
  **Verification:** reviewer confirms comment cites `github.com/effect-ts/tsgo` docs + helper name.

## Verification Contract

- `pnpm install` patches oxlint without error.
- `pnpm exec oxlint . --type-aware` reports zero `warn` severities (recomputed from config, not metadata suffix).
- `pnpm --filter @systemfsoftware/oxlint-config test` passes helper unit test.
- `pnpm check:local` (includes `gate:tasks` lint lane) exits 0.

## Definition of Done

- Shared config imports `@effect/tsgo/oxlint-presets` recommended preset and promotes all `warn→error`.
- Leaf configs unchanged except rebuilt against new base.
- No `effecttsgo/*` rule remains at `warn` in printed config.
- CI lint gate fails on any tsgo finding (error severity).

## Scope Boundaries

- Out of scope: enabling `antipattern`, `effect-native`, `style` presets beyond `recommended` (future plan).
- Deferred to follow-up: autofix for `recommended` findings bulk.
