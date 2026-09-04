# AGENTS.md — Constitution Repository

Single source of truth for the supreme design law of [System F Software](https://systemfsoftware.com). Consumer repos vendor via `git subtree` + symlink. This repo has no production code, no test suite, and no build step — it is one markdown document plus its governance tooling (corpus validation, commit validation): `CONSTITUTION.md`, resident in every agent's context, all articles, always.

@CONSTITUTION.md

## Startup Workflow

Before making changes:

1. **Read this file** completely.
2. **Confirm the active task** with the user or the agent's task list.
3. **Review recent commits** with `git log --oneline -5`.
4. **Ensure current branch is not `main`** — feature branches only. If on main, create one.

## Working Rules

- **One task at a time.** Finish before starting the next.
- **Conventional commits required.** The commit-msg hook enforces `type(scope): description`. Run `git commit` through the hook — do not bypass with `--no-verify`.
- **Verification required.** Run the verification commands before claiming done.
- **Stay in scope.** Don't modify files unrelated to the task. Scope reduction requires explicit user approval.
- **Leave clean state.** The next session must run verification immediately.

## Amending the Constitution

### Corpus

- **`CONSTITUTION.md` (Resident):** the entire corpus — the Application section plus Articles I–V — loaded in every session. There is no retrieved half and no on-demand trigger: law that is not in the window is not law.

### Writing a Rule

Rules are fenced YAML blocks with: `id`, `title`, `gate`, `do`, `dont`, `harm`, `check` (and optional `example`, `scope`, `layers`).

### Minting an ID

ID format: `CONST-<family><n>`. Pick the next free number in the family (never renumber to close gaps).

| Letter | Family | Purpose |
|---|---|---|
| `G` | Governance | Invoking constitution or resolving priority |
| `E` | Enforcement | Gate design, execution, verification |
| `P` | Purity | Decision functions and side-effect isolation |
| `D` | Domain modelling | Domain types and constraints |
| `B` | Boundary | Core/shell boundaries, effects, adapters |
| `T` | Testing | Testing strategy, mutation, properties |
| `N` | Naming & structure | Module organization and naming |
| `W` | Work discipline | Task scope, bypass declarations, reviews |
| `S` | Subtraction | Code deletion and structural simplification |

### Changing a Rule

- Same obligation reworded / moved: **keep ID**.
- Obligation narrowed, widened, split, or deleted: **retire old ID forever** and mint new one.
## Surface Classes

| Surface | Files | Rule |
|---|---|---|
| **Locked** | `AGENTS.md`, `.husky/_/`, verification scripts | Read and propose changes; do not edit to make verification pass. |
| **Editable** | `deno.json`, `deno.lock`, `commitlint.config.cjs`, `.gitignore`, `.husky/` (hooks only, not `_/`) | Edit freely within the active task. |
| **Human-controlled** | `CONSTITUTION.md`, `README.md`, merging to `main`, pushing, destructive ops | Propose changes; ask the user before acting. |

## Definition of Done

A task is done only when ALL of the following are true:

- [ ] Target changes are applied.
- [ ] Verification commands ran and passed.
- [ ] Commit uses conventional format (`type(scope): description`).
- [ ] Evidence recorded via the runtime memory system and task list.
- [ ] No dirty files left in the working tree.

## Verification Commands

```bash
deno task test                       # one file: schema, coverage, ids, families, dangling citations
deno run --allow-read --allow-env --allow-run npm:@commitlint/cli@21 --from HEAD~1
```

After a commit that deletes, splits, merges, or re-scopes a rule — not after every edit — also run the reassignment check against the revision before it:

```bash
deno task test --against <rev>
```

### Anti-Bypass Rules

- Run the **full command**, not parts in isolation.
- Evidence must be from the **current run**, not a prior session.
- **Any failure blocks done.** Do not bypass with `--no-verify`.
- Do not suppress, skip, or disable checks to make verification pass.

### Hallucination Prevention

- **Read before edit:** before editing a file, read it in the current session. Do not edit from memory.
- **Verify before claim:** before saying "done," the verification command must have run and its output recorded.
- **Search before write:** before writing code that calls a library API, read the actual API surface. Do not generate from training memory.

## Multi-Agent Ownership

When multiple agents work in the same repo:

- Each agent owns a disjoint file/module set.
- An agent must claim a file before editing it.
- Agents may not recursively delegate to each other.
- The one-shot verification must pass before any agent claims done.

## End of Session

Before ending a session:

1. Record current state, blockers, and next steps via the runtime memory system and task list.
2. Commit with a conventional-format message once work is in a safe state.
3. Leave the repo clean — `git status` should show nothing unexpected.

## Escalation

- **Constitution conflict**: `CONSTITUTION.md` is already in context — reread it there, not from disk.
- **Unclear requirements**: Ask the user.
- **Verification failure**: Record via memory, flag for review, do not bypass.
- **Scope ambiguity**: Re-read this file and the Definition of Done.
