---
title: "Known residuals — ce-code-review 20260720-181925-26b8b902"
branch: feat/omp-plugin-practice
review_run: 20260720-181925-26b8b902
accepted_at: 2026-07-20
---

# Known Residuals — feat/omp-plugin-practice

Findings from ce-code-review run `20260720-181925-26b8b902` (10 reviewers over the branch diff) that were evaluated and deliberately not applied. All other actionable findings (22) were fixed in commits b1b8b42580, 3bd5a74505, 0b4bab7ec0, 3be320bed1.

## 1. hook-dispatcher.ts carries four layers in 531 lines (P2, maintainability)

Settings I/O, process execution, contract parsing, and SDK event binding live in one file. Extraction is a large refactor the plan never scoped; the file is fully tested (36 tests) and every event path is telemetry-instrumented. Revisit when the next hook type forces the file open anyway.

## 2. Hook subprocess trust model matches Claude Code (P1/P2, security advisories)

Hooks spawned from `.claude/settings.json` inherit the full `process.env` and run arbitrary project-controlled commands — this IS the Claude Code hook contract, and omp-claude-compat is the compatibility layer. Filtering env or sandboxing subprocesses would break parity with the thing it clones. The trust boundary is `.claude/settings.json` itself, same as upstream. Accepted as intentional compat behavior.

## 3. MockExtensionAPI partial surface + `as never` casts (P3, testing)

Test mocks cover only `on` + `logger`; the real ExtensionAPI has ~20 methods. A future plugin using `registerTool()`/`registerCommand()` would need the mocks extended. Accepted — current plugins use neither; extending mocks preemptively is speculative API surface.

## 4. Minor advisories (P3)

- mentionPatterns iterates per-skill regexes instead of one alternation (~23µs/tool_call — negligible).
- Per-cwd caches (settings, TOML, compiled guard) grow by project count only — sessions are per-project.
- Module-scoped `let tel` init pattern relies on load-once semantics (documented contract).
- smoke-plugin mock is partial for `--fire` (factories calling registerTool/ctx.setInterval are invisible to it).
- Skill frontmatter `Activation:` prefix + KTD acronyms in skill steps (cosmetic matcher-signal notes).
