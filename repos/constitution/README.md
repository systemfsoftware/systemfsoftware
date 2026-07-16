<div align="center">

# Constitution

*Towards unbreakable code — the supreme design law of [System F Software](https://systemfsoftware.com)*

[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Read the Declaration](https://img.shields.io/badge/read-systemfsoftware.com%2Fconstitution-black?style=flat-square)](https://systemfsoftware.com/constitution)

[Articles](#articles) • [Use it](#use-it-in-a-repository) • [Update](#update-a-consumer) • [Amendment](#amendment)

</div>

[`CONSTITUTION.md`](CONSTITUTION.md) is the design law that governs every repository under [System F Software](https://systemfsoftware.com): a pure functional core behind a thin imperative shell, types before logic, the Testing Trophy, and removal over addition. It is **stack-neutral** — it states principles, never tools or languages, so it binds any codebase regardless of stack.

This repository is the **single source of truth**. [systemfsoftware.com/constitution](https://systemfsoftware.com/constitution) renders this file, and consumer repositories vendor it via `git subtree` + symlink — so the constitution is authored in exactly one place and an edit here propagates everywhere, never a copy that silently drifts.

## Articles

| Article | Principle |
| --- | --- |
| **I — The Pure Core** | Decisions are pure; types come first; errors are variants; null is not a state; one path. |
| **II — The Boundary** | Functional core / imperative shell; effects are values; decode never cast; dependencies point inward. |
| **III — Verification** | The Testing Trophy; properties over examples; mutation is the measure. |
| **IV — Organization** | Organized by what it does; names scream the domain; fits in the head. |
| **V — Conduct** | Depth over expedience; challenge before you commit; subtract before you add. |

## Use it in a repository

Vendor the constitution as a squashed, signed subtree, then symlink it to your repo root:

```bash
# 1. Fetch into a named ref (a transient FETCH_HEAD is the failure mode to avoid)
git fetch https://github.com/systemfsoftware/constitution.git main:refs/remotes/vendor/constitution

# 2. Vendor it as a squashed, signed subtree
git subtree add --prefix=vendor/constitution refs/remotes/vendor/constitution --squash -S \
  -m "chore: vendor shared constitution"

# 3. Symlink it to the repo root
ln -s vendor/constitution/CONSTITUTION.md CONSTITUTION.md
```

Reference it from your agent harness (`CLAUDE.md` / `AGENTS.md`) as `@CONSTITUTION.md` — the symlink resolves it.

## Update a consumer

```bash
git fetch https://github.com/systemfsoftware/constitution.git main:refs/remotes/vendor/constitution
git subtree pull --prefix=vendor/constitution refs/remotes/vendor/constitution --squash -S \
  -m "chore: update constitution"
```

> [!NOTE]
> The symlink never changes — it always points at `vendor/constitution/`, so a pull just refreshes the content underneath.

## Amendment

The constitution is amendable by design. An amendment carries a written rationale, a version bump, a date, and a matching update to the consuming `AGENTS.md`.
