# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Build pipeline

### `@systemfsoftware/source` custom export condition

A package.json `exports` condition added by the shared tsconfig to every package in this monorepo. When TypeScript resolves a workspace dependency (e.g. `@systemfsoftware/hex-schema`), this condition makes it pick `src/mod.ts` over `dist/index.mjs`. It exists so editors and the dev typecheck see live source, not stale build output. It is _not_ a Node.js condition — running apps with `node` (or api-extractor outside the dev tsconfig) fall through to standard resolution (`default` → `.mjs`).

_Aliases:_ `customConditions: ["@systemfsoftware/source"]`

### tsdown output

The `.d.ts` and `.mjs` files in `packages/<name>/dist/` produced by the `tsdown` build step. For a barrel-re-export package this is `dist/index.d.ts` containing `export * from '@workspace/dep'` — a one-line re-export that depends on the consumer resolving the dep's types. Created fresh on every `pnpm build`; gitignored.

### api-extractor rollup

The consolidated `.d.ts` written by `api-extractor` to `dist/<name>.d.ts` per the `dtsRollup.untrimmedFilePath` config field. Distinct from the tsdown output even when both exist in the same `dist/` directory. The rollup uses `bundledPackages` to inline dependency types, producing a single self-contained type declaration file. `package.json#exports.types` points at the rollup, never at the tsdown output, because consumers get the complete type surface without following workspace-dep chains.

_Avoid:_ "the dist .d.ts" (ambiguous with tsdown output)

### Externalized dependency

A package.json `dependencies` (or `peerDependencies`) entry that tsdown leaves as a bare import in the tsdown output instead of inlining — the consumer's environment must provide it at runtime. The counterpart, a `devDependencies` entry, is inlined into the output. The dependency category therefore decides what a published tarball still needs from outside: anything private or unpublishable must never be externalized, because no consumer environment can provide it. Distinct from `bundledPackages`, which inlines _types_ into the api-extractor rollup — this concept concerns _runtime code_ in the tsdown output.

### bundledPackages

A `bundledPackages` array entry in `api-extractor.json` listing workspace dependencies whose types should be inlined into the rollup output. Inlining means consumers don't have to install the dep at all for type resolution — the rollup contains everything. Used when a package is a structural re-export layer (barrels from one or more workspace deps) so its published types stand alone.

## Release pipeline

### semantic-release

The npm publish orchestrator triggered by push to `main`. Runs `pnpm build` per package, then per-package semantic-release which analyzes commits since the last release tag, derives the next semver from conventional-commit types, and calls `pnpm publish`. Each package is released independently based on which files its `commitsForPackage` filter (in `scripts/release-monorepo-filter.mjs`) finds touched.

## Validation tooling

### check-exports

The script at `scripts/check-exports.mjs` that compares each package's `package.json#exports` paths against the actual `dist/` directory. Catches drift where `exports.types` references a file the `build` script never produces. Wired into root `pnpm check:exports` but not currently in `pnpm check`'s blocking pipeline.

### attw

`arethetypeswrong` — the type-resolution validator. `attw --pack .` runs against the package tarball the same way npm would install it, validating that `exports` declarations resolve to consistent types across node10 / node16-CJS / node16-ESM / bundler. Catches downstream-facing drift that workspace-local checks miss.

## Architecture cells (constitution §I–V)

### workflow

The pure-decision cell type, named `*.workflow.ts`. One business decision as a pure function: typed command in, `Either<Decision, Error>` out, no I/O. Decision variants are `S.TaggedClass`; error variants are `S.TaggedError`. Dispatch over closed unions uses `Match.value` + `Match.tag` + `Match.exhaustive`; primitives use terminal `Match.orElse`. The `never` error channel is forbidden except for total decisions (`Allow | Block` with no other outcomes). Imported only from sibling workflows and the pure Effect data modules (`Either`, `Match`, `Schema`, `Option`, `ParseResult`) — never the Effect runtime. See `skill://architect-workflow` for the nine non-negotiable gates.

## Agent context injection

### Context file

An instruction file the omp host discovers on its own and renders into the system prompt — `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `copilot-instructions.md` and the like, located by the providers under `repos/oh-my-pi/packages/coding-agent/src/discovery/`. The host expands `@`-imports inside each one, dedupes the set by byte-identical content, and reformats the markdown before rendering. Root `<cwd>/CLAUDE.md` is _not_ a context file: the Claude provider resolves only `<cwd>/.claude/CLAUDE.md` and the user-level copy.

_Avoid:_ using this for anything `omp-claude-compat` injects — that is an injected ref, and conflating the two is what caused `AGENTS.md` to reach the prompt twice.

### Injected ref

The target of an `@`-reference inside a `CLAUDE.md` that the host does not discover, materialized into the system prompt by `omp-claude-compat`. Injected refs exist only to cover the host's discovery gap, so a ref pointing at a file that is already a context file is redundant by construction and must be suppressed. Suppression keys on the target's file name, never on its content: the host reformats markdown, so the same file is not byte-identical across the two paths.
