# oxlint-guard-hook

Leaf plugin; root `AGENTS.md` governs. This file holds only the plugin-local operational facts.

- **Run the check locally:** `deno task check` (type-check + lint of `src/` via `deno.jsonc`; entry `src/main.ts`, gate: the task exits 0).
- **Tests:** vitest property suite `src/__tests__/guard.workflow.property.test.ts` plus in-source properties in `src/verdict.ts` (gate: `corepack pnpm exec vitest run` exits 0, 13 tests); mutation gate is CI-only on `src/*.workflow.ts` at 100% (gate: `.github/workflows/mutation.yml`).
- **Behavior smoke:** invoke the hook contract — stdin wire payload to `src/main.ts`; skip exits 0, spawn-failure exits 1 with the prerequisite hint, violation exits 2 with the skills-first diagnostic (gate: the exit code and stderr you observe).
- **Formatting:** repository dprint config via `pnpm exec dprint fmt` from the repo root.
- **Hooks config:** `hooks/hooks.json` passes the plugin's own `deno.jsonc` via `--config`; the command expects Deno 2.x on `PATH`.
- **License:** Apache-2.0 (matches the repo root); `plugin.json` declares it.
