# oxlint-guard-hook

Leaf plugin; root `AGENTS.md` governs. This file holds only the plugin-local operational facts.

- **Run the check locally:** `deno task check` (type-check + lint of `src/lint-guard.ts`, the only source file).
- **No test suite:** the behavior suite was intentionally removed. Verify behavior by invoking the hook contract or editing a scratch file in a project with oxlint configured.
- **Formatting:** repository dprint config via `pnpm exec dprint fmt` from the repo root.
- **Hooks config:** `hooks/hooks.json` passes the plugin's own `deno.jsonc` via `--config`; the command expects Deno 2.x on `PATH`.
- **License:** Apache-2.0 (matches the repo root); `plugin.json` declares it.
