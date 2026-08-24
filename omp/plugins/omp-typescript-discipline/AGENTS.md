# AGENTS.md — `omp/plugins/omp-typescript-discipline`

> **Location:** `omp/plugins/omp-typescript-discipline` — TTSR rules only; no runtime code, no fixtures.

- Keep this plugin dependency-free and fixture-free. The rule `no-hand-rolled-std` ships as markdown and is verified via manual regex (`btoa`/`Buffer base64`/`new Promise+setTimeout`/`new Date`/`randomUUID`/`createHash` etc. vs `jsr:@std/*`/`Effect.sleep`), not via checked-in `tests/fixtures` that import `effect` and break `turbo boundaries` (`effect` is not a declared dependency). Gate: `pnpm check:boundaries` must stay green without adding `effect`; `omp ttsr list` shows `no-hand-rolled-std` with `interruptMode: tool-only`.
