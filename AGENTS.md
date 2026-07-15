# AGENTS.md — systemfsoftware monorepo

> Effect-TS libraries + the oxlint plugin that enforces the constitution. Root file holds workspace-wide invariants only; tooling-enforced rules (dprint, oxlint, tsconfig) are not duplicated here. Per-package rules live in leaf `AGENTS.md` deltas.

## Supreme law

🛑 **Read `CONSTITUTION.md` (vendored at the repo root via the `vendor/constitution/` subtree) BEFORE any work.** It is the supreme authority — it supersedes this file and every leaf delta. It governs the pure functional core / imperative shell split every package here follows. Amend it only at its source repo (`systemfsoftware/constitution`), never in the vendored copy.

## Stack

- **Package manager** — pnpm (`pnpm-workspace.yaml` is the source of truth). Run scripts as `pnpm --filter <pkg> <cmd>` from root; **never** `cd <dir> && <cmd>`. No `npx` — use `pnpm exec`.
- **Types** — TypeScript 7 via `tsc`; `effect-daemon-spec` additionally runs `tsc` for the api-extractor pipeline.
- **Build** — tsdown (ESM, `.mjs` + `tsc` dts). Build output is **gitignored — never committed.**
- **Tests** — Vitest + `@effect/vitest` + `fast-check` (PBT). Mutation via Stryker with the `typescript-checker`.
- **Lint / format** — oxlint (self-hosted: the repo lints itself with `@systemfsoftware/oxlint-plugin` through `@systemfsoftware/oxlint-config`) + dprint.

## Package layout

| Package                                        | Published as                                | Visibility                |
| ---------------------------------------------- | ------------------------------------------- | ------------------------- |
| `effect-gherkin-spec`                          | `@systemfsoftware/effect-gherkin-spec`      | public                    |
| `effect-daemon-spec`                           | `@systemfsoftware/effect-daemon-spec`       | public                    |
| `oxlint-plugin`                                | `@systemfsoftware/oxlint-plugin`            | public                    |
| `effect-schema-law`                            | `@systemfsoftware/effect-schema-law`        | public                    |
| `stryker-plugins`                              | `@systemfsoftware/stryker-plugins`          | public                    |
| `rx-effect`                                    | `@systemfsoftware/rx-effect`                | public                    |
| `effect-schema-extensions`                     | `@systemfsoftware/effect-schema-extensions` | public                    |
| `tsconfig` · `oxlint-config` · `vitest-config` | —                                           | private (build/test only) |

🛑 **Published packages have no `"private": true`; internal tooling does.** A package that is `private` is never npm-published; do not add a `publishConfig` to one.

## Critical invariants

🛑 **Effect / Mastra / tsdown / Stryker APIs are stale or absent in training data.** Consult the vendored `effect/` sources or the package's own existing code before generating these APIs — do not invent them.

❌ **NO type suppression** — `as any`, `@ts-ignore`, `@ts-expect-error`, empty catch blocks are forbidden.

❌ **NO decode-by-cast** — turn external/untrusted data into domain types through a `Schema` decode, never an `as` assertion. (Constitution §II.5.)

❌ **NO committed build output** — `dist/`, `.turbo/`, `coverage/`, `reports/` are gitignored. Ship source; consumers get `dist` from the npm tarball, not git.

❌ **NO second schema for structured output** — derive JSON Schema from the same Effect `Schema` you decode with.

❌ **NO hand-edit of `package.json#exports` / `publishConfig.exports`** on tsdown-built packages — tsdown regenerates them; change `tsdown.config.ts` instead.

❌ **NO `| head` / `| tail` on bash commands** — the harness truncates already.

⚠️ **`docs/solutions/`** — documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). Relevant when implementing or debugging in documented areas.
⚠️ **The single-source dev condition is `@systemfsoftware/source`.** Package exports map it to `./src/*.ts` so in-repo consumers resolve source (no prebuild); the `default` condition resolves built `dist`. Keep both in sync when adding a subpath.

## `@systemfsoftware/tsconfig`

The shared TypeScript base configs live in `packages/tsconfig/` — one source of truth every package extends. Modernized to 2026 SOTA (es2024 / esnext + the full strict set); bump `target`/`lib`/strictness there.

🛑 **NEVER enable `isolatedDeclarations`.** It is structurally incompatible with idiomatic Effect — `Schema.Class` extends-clauses (TS9021) and inferred `Layer`/`Metric`/`Schema` value exports cannot be annotated, so it forces either banned `@ts-` suppression or de-idiomatized code. Verified empirically (153 errors, ~71% unannotatable). Excluded on purpose; do not "modernize" it back in.

## Definition of Done

Evidence is a runnable command, not "it worked here":

1. `pnpm typecheck` exit 0 — no `any`, no suppression.
2. `pnpm test` exit 0 — property tests on the pure core (≥100 runs, 0 rejects) + composition tests through the I/O sandwich with at least one boundary unmocked. No tautological tests; no pure-core test dressed as integration.
3. `pnpm lint` exit 0 (dprint check + oxlint).
4. Mutation **100%** on changed pure-core files (`pnpm --filter <pkg> mutation`); kill survivors with a sharper property or by deleting the dead branch. **Never** delete `reports/stryker-incremental.json` (gitignored but not disposable — deleting forces a full re-run).
5. `effect-daemon-spec` only: `pnpm --filter @systemfsoftware/effect-daemon-spec api:check` exit 0; commit `etc/*.api.md` when the surface changes.
6. Conventional Commit (lower-case type, ≤72-char header, no scope). Allowed types and rules are enforced by `commitlint.config.ts`. No AI co-author trailers.

## Commits

`pnpm exec commitlint` enforces the type-enum and `type-matches-diff-shape`. Files under `.claude/`, configs, and lockfiles are `chore`/`build`/`ci`/`deps`, not `docs`. `feat`/`fix` MUST touch production source. Commits are GPG-signed as `Ryan Lee <drdgvhbh@gmail.com>`.

**Scopes are allowed and encouraged** (this is a monorepo). The scope is optional; when present it must be a package directory name under `packages/` (the `scope-enum` is derived from the filesystem, so it auto-tracks new packages) or one of `repo` / `deps` / `release` / `ci`. Example: `feat(rx-effect): add fromObservable backpressure`.
