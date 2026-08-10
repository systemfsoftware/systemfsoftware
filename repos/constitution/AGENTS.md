# AGENTS.md — Constitution Repository

Single source of truth for [`CONSTITUTION.md`](CONSTITUTION.md) — the supreme design law of [System F Software](https://systemfsoftware.com). Consumer repos vendor via `git subtree` + symlink. This repo has no production code, no test suite, and no build step — it is a markdown document plus its governance tooling (commit validation, agent harness).

## Startup Workflow

Before making changes:

1. **Read this file** completely.
2. **Read @CONSTITUTION.md** — every directive in there binds this repo too.
3. **Confirm the active task** with the user or the agent's task list.
4. **Review recent commits** with `git log --oneline -5`.
5. **Ensure current branch is not `main`** — feature branches only. If on main, create one.

## Working Rules

- **One task at a time.** Finish before starting the next.
- **Conventional commits required.** The commit-msg hook enforces `type(scope): description`. Run `git commit` through the hook — do not bypass with `--no-verify`.
- **Verification required.** Run the verification commands before claiming done.
- **Stay in scope.** Don't modify files unrelated to the task. Scope reduction requires explicit user approval.
- **Leave clean state.** The next session must run verification immediately.

## Amending the Constitution

### Writing a rule

A rule is a fenced YAML block carrying `id`, `title`, `gate`, `do`, `dont`, `harm`, `check`, and — only where wrong and right look alike — `example`, `scope`, or `layers`. Do not restate that list anywhere: `pnpm test` owns it, and rejects a missing field, an unknown one, or an unregistered `gate` value.

### Minting an id

A rule id is `CONST-<family><n>`. Pick the family letter from what the rule is **about**, never from the article it lands in — a family spans articles, which is why `CONST-P3` (purity) lives in Article II. The number is the next free one in that family: mint order, not a position.

| letter | family | fires when you are |
|---|---|---|
| `G` | Governance | invoking the constitution, or resolving it against another document |
| `E` | Enforcement | deciding how a principle is enforced, or claiming done |
| `P` | Purity | writing or classifying a decision function |
| `D` | Domain modelling | declaring a domain type |
| `B` | Boundary | moving data or control between the core and the outside |
| `T` | Testing | choosing, writing, or judging a test |
| `N` | Naming & structure | placing or naming a module |
| `W` | Work discipline | deviating mid-task — shrinking scope, skipping challenge, breaking a rule |
| `S` | Subtraction | about to add code, copy a pattern, or patch a symptom |

A one-member family is correct; never merge families to balance their sizes. A new letter must be added to `FAMILIES` in the validator in the same change — the gate rejects an unregistered one.

### Changing an existing rule

The identifier tracks the **obligation**, not the sentence. Ask: would an agent that complied with the old text still comply with the new one?

| operation | identifier |
|---|---|
| moved to another article | keep — position is not identity |
| reworded, same obligation | keep, however extensive the rewrite |
| obligation narrowed or widened | new id; the old number stays vacant |
| split in two | the part carrying the original obligation keeps the id |
| merged from two | keep either id; the other number stays vacant |
| deleted | the number stays vacant, forever |

There is no retirement ledger and no backwards compatibility. Never renumber to close a gap: a gap is free, and a citation into one resolves to nothing — which is loud. A reused number resolves silently, to the wrong rule.

This is gated rather than requested because the remaining defect is the quiet one — an id that survives while its rule changes underneath it. Of the surfaces citing an id, only a gate script fails loudly, so run the reassignment check below after any commit that re-scopes a rule.

## Surface Classes

| Surface | Files | Rule |
|---|---|---|
| **Locked** | `AGENTS.md`, `.husky/_/`, verification scripts | Read and propose changes; do not edit to make verification pass. |
| **Editable** | `package.json`, `pnpm-lock.yaml`, `commitlint.config.cjs`, `.gitignore`, `.husky/` (hooks only, not `_/`) | Edit freely within the active task. |
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
pnpm test                          # schema, coverage, ids, families, dangling citations
pnpm exec commitlint --from HEAD~1
```

After a commit that deletes, splits, merges, or re-scopes a rule — not after every edit — also run the reassignment check against the revision before it:

```bash
pnpm test -- --against <rev>
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

- **Constitution conflict**: Consult @CONSTITUTION.md. If letter and purpose diverge, purpose governs.
- **Unclear requirements**: Ask the user.
- **Verification failure**: Record via memory, flag for review, do not bypass.
- **Scope ambiguity**: Re-read this file and the Definition of Done.
