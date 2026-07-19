# AGENTS.md — Constitution Repository

> **Location:** `repos/constitution/` — the vendored `CONSTITUTION.md` source for [System F Software](https://systemfsoftware.com). Consumer repos vendor this repo via `git subtree` + symlink. This is **not a code repo** — no production code, no test suite, no build step. Universal agent rules live in the consuming repo's root `AGENTS.md`; this file carries only `constitution/`-specific deltas.

Universal rules (startup workflow, definition of done, verification, working rules, multi-agent ownership, escalation, end-of-session) are inherited from the consuming repo's root `AGENTS.md`. Do **not** restate them here.

## Critical



## Constitution-specific deltas

- **Source of truth:** `CONSTITUTION.md` is supreme design law. Every change to it goes through the constitution's own governance (commit-msg hook + PR review). If a consumer-repo rule conflicts with the constitution, the constitution governs.
- **Vendoring mechanism:** changes propagate to consumers via `git subtree pull`. Do not edit the vendored copy in a consumer repo — `AGENTS.md` marks `repos/constitution/` as locked.
- **Surface classes for `repos/constitution/`** itself: `CONSTITUTION.md`, `README.md`, merging to `main`, pushing, and destructive ops are human-controlled. Propose changes, then ask the user.

## Verification

```bash
pnpm exec commitlint --from HEAD~1
```

Any failure blocks done. Do not bypass with `--no-verify`.

## Hallucination Prevention

- **Read before edit:** before editing `CONSTITUTION.md` or any governance file, read it in the current session.
- **Verify before claim:** the verification command above must have run and its output recorded before saying "done."
