---
title: Bash-to-Deno hook ports must preserve set -e and expansion semantics
date: 2026-08-30
category: tooling
module: worktrunk hooks
problem_type: best_practice
component: tooling
severity: high
applies_when:
  - Porting bash lifecycle hooks to Deno TypeScript
  - Verifying a port preserves observable behavior against the original
tags: [bash-port, set-e, exit-code, glob, deno]
---

# Bash-to-Deno hook ports must preserve set -e and expansion semantics

## Context

Porting the 10 bash worktrunk hooks to Deno exposed three silent-behavior gaps that a line-by-line port misses: child exit codes, shell glob semantics, and variable expansion. Each one shipped green and broke the bash contract.

## Guidance

- **Propagate every child exit code.** Bash `set -e` aborts the hook when `npm ci` or `pnpm build` fails. The Deno port must `Deno.exit(code)` on non-zero child output, not log-and-continue:

```ts
const { code } = await cmd.output()
if (code !== 0) {
  console.error(`build exited ${code}`)
  Deno.exit(code)
}
```

- **Do not translate a shell glob to a regex by escaping metacharacters.** Escaping `[` breaks character classes — `[0-9]*-*.md` became `^\[0-9\].*-.*\.md$` and matched nothing. Write the regex from the glob's matched set, or test the port against `shopt -s nullglob` expansion.
- **Bash substitution and JS regex collapse are NOT equivalent.** Bash `${x//--/-}` is one non-overlapping pass: `a---b` -> `a--b`. JS `/--+/g` fully collapses: `a-b`. Port instance/name sanitization with the same pass semantics (`/--/g`), or the derived socket paths diverge.
- **Check template variables against the caller's docs.** wt.toml exposes `{{ primary_worktree_path }}`, not `{{ primary_path }}`; the undefined variable aborts hook expansion at runtime.
- **Verify symlink-removal semantics empirically per runtime.** On Deno 2.9, `Deno.remove` on a symlink removes the link and keeps the target (refutes denoland/deno#1947 claims of target deletion). Do not trust issue-tracker claims over a one-line runtime test.

## Why This Matters

Hooks run as worktree lifecycle callbacks; a hook that exits 0 after a failed install lets the merge proceed with broken state and misattributes later failures. Divergent instance names produce dead MCP sockets that fail confusingly.

## When to Apply

- Any bash-to-TS/Deno port reviewed for behavioral parity.
- Hooks whose failure must block the caller (pre-merge, post-start install/build).

## Examples

- `install-deps.ts` / `generate-artifacts.ts` now exit non-zero when the child command fails (restores `set -e` aborts).
- `codegraph-worktree-mcp.ts` sanitization matches bash's non-overlapping dash collapse.

## Related

- docs/plans/2026-08-30-deno-worktrunk-conversion.md
