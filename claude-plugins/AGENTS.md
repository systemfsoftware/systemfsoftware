# claude-plugins — delta

This tree left the pnpm workspace. It is a Deno 2 workspace, so the root's `pnpm --filter <pkg>` does not reach it.

## Toolchain

- Gate a package from its own directory: `deno task check` (typecheck, lint, format check, tests).
- Behaviour pin: `deno run -A scripts/characterize.ts replay deno`.
- `pnpm check:local` still governs the rest of the repo and does not cover this tree.

## Two traps, both hit here

- **The guard blocks its own repair.** `.claude/settings.json` dogfoods `oxlint-guard`'s PreToolUse config guard from this
  source, and that guard fails closed: every state in which it cannot reach a verdict exits 2. So a broken
  `oxlint-guard/src/config-guard.ts` — or any module it imports — refuses every subsequent edit, including the one that
  would fix it. `ast_edit` is refused too. Recovery is `git checkout -- <file>`, then re-apply the change as **one**
  atomic edit so no intermediate state is unrunnable. Prefer a single multi-hunk edit over a sequence of small ones when
  touching that import graph.
- **`replay` has an oracle that cannot be regenerated.** `oxlint-guard/__fixtures__/characterization/baseline.json` was
  captured from the pre-migration Bun implementation, which no longer exists in the tree. A failing `replay` therefore
  means the port changed behaviour; `characterize.ts capture` is **not** a repair for it, because capturing now records
  the current implementation and silently destroys the only evidence of what the behaviour used to be. New behaviour is
  covered by the normal suites instead, never by re-capturing.
