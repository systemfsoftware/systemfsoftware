# AGENTS.md — systemfsoftware monorepo

Effect-TS libraries + the oxlint plugin enforcing the constitution (at `repos/constitution/`; amend upstream, never vendored copy). Root holds workspace invariants; leaf packages have deltas.

## Stack

| Concern | Tool | Note |
|---------|------|------|
| Pkg mgr | pnpm | `pnpm --filter <pkg> <cmd>` from root; **never** `cd`. No `npx` |
| Types | tsc | `effect-daemon-spec` additionally runs api-extractor |
| Build | tsdown | ESM (`.mjs` + tsc dts). Build output in `dist/` is gitignored |
| Tests | Vitest + `@effect/vitest` + fast-check | PBT on pure core; composition through I/O sandwich |
| Mutation | Stryker (typescript-checker) | Targets pure-core files |
| Lint | oxlint (self-hosted) + dprint | Self-hosted: `@systemfsoftware/oxlint-plugin` lints itself |

## Packages

Published (`"private": false`): effect-gherkin-spec, effect-daemon-spec, oxlint-plugin, effect-schema-law, stryker-plugins, rx-effect, effect-schema-extensions — all as `@systemfsoftware/<name>`. Private: tsconfig, oxlint-config, vitest-config — no `publishConfig`.

🛑 Don't hand-edit `package.json#exports` on tsdown packages — change `tsdown.config.ts`. Dev condition `@systemfsoftware/source`; `default` resolves `dist`. Keep both in sync.

## Repo layout

| Path | Purpose |
|------|---------|
| `packages/<name>/` | Published package |
| `repos/constitution/` | Vendored constitution (locked — read-only) |
| `repos/effect/` | Vendored Effect-TS sources — **consult before using stale APIs** |
| `docs/solutions/` | Past solutions with YAML frontmatter |

Locked: AGENTS.md, repos/. Editable: packages/. Human-controlled: merge/deploy/publish/creds.

## Definition of Done

Evidence from THIS session:
```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test
```
Then `pnpm --filter <pkg> mutation` — **100%** on changed pure-core files. For `effect-daemon-spec`: `pnpm api:check`. Any failure blocks done. **Never** delete `reports/stryker-incremental.json`.

## Version control — jj

jj colocated with git. Direct `git` blocked by hook; `jj …` and package-script git allowed.

| git | jj |
|-----|----|
| status/diff/log | `jj st` / `jj diff` / `jj log --no-graph` |
| commit -m / --amend | `jj commit -m` / `jj squash` |
| rebase / branch / switch | `jj rebase` / `jj bookmark` / `jj edit\|jj new` |
| push / fetch / stash | `jj git push` / `jj git fetch` / named change + `jj edit` |

## Commits

`pnpm exec commitlint`: `type(scope): subject ≤72 chars`. Types: feat/fix/chore/build/ci/deps/docs/perf/refactor/revert/style/test. Scope: package dir or `repo`/`deps`/`release`/`ci`. `feat`/`fix` MUST touch production source; configs/`.claude/` → `chore/build/ci/deps`. GPG-signed `Ryan Lee <drdgvhbh@gmail.com>`. No AI co-author trailers.

🛑 **NEVER enable `isolatedDeclarations`** — incompatible with idiomatic Effect (verified 153 errors).
