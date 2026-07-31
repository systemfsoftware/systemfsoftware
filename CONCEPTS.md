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

### Cell

The unit this codebase is organized in: one source file doing one job, with a suffix that names that job. The suffix is not decoration — rules key on it, so the name is what grants and denies a file its powers. Which imports it may take, whether it may perform I/O, whether the mutator covers it, and what kind of test it may carry are all decided by the suffix rather than by the file's contents or its directory.

A file whose suffix does not match the job it performs is therefore not a naming problem but a permissions problem: it is being governed as something it is not.

### Property cell

A cell type the taxonomy grants an authored property test, sitting beside the cell under a matching name. Most cells carry no authored test of their own — they are covered at composition altitude instead — so the grant is deliberately narrow and each cell type on the list has a specific reason to be there.

A cell earns a slot only when something about it cannot be reached from above: a decision whose invariants are universals over generated input, or a declaration whose refusals no generated law can express. Being important, or merely being hard to test through its callers, is not a qualification.

### workflow

The pure-decision cell type, named `*.workflow.ts`. One business decision as a pure function: typed command in, `Either<Decision, Error>` out, no I/O. Decision variants are `S.TaggedClass`; error variants are `S.TaggedError`. Dispatch over closed unions uses `Match.value` + `Match.tag` + `Match.exhaustive`; primitives use terminal `Match.orElse`. The `never` error channel is forbidden except for total decisions (`Allow | Block` with no other outcomes). Imported only from sibling workflows and the pure Effect data modules (`Either`, `Match`, `Schema`, `Option`, `ParseResult`) — never the Effect runtime. See `skill://architect-workflow` for the nine non-negotiable gates.

## Schema verification

### Generated schema law

One of the pair of properties — round-trip identity and encode stability — registered automatically for every exported Effect `Schema` in a package, rather than hand-written. Both draw their inputs from the schema's **own** arbitrary, which is itself derived from the refinement under test, so a generated law can only ever assert that values built to satisfy a refinement satisfy it. It therefore covers everything a schema **accepts** and nothing it **rejects**: widening a refinement leaves every generated law green. Treating the pair as full coverage is the mistake it invites.

_Aliases:_ `ruleOfSchemas` pair, the round-trip laws

### Rejection property

A hand-authored property asserting that a schema **refuses** an input — the half of a schema's contract no generated law can reach. Its generator must be derived from the domain contract (what the type promises about its values) and never read back off the refinement literal, because a generator built from the literal reproduces the same circularity that makes generated laws blind.

By design, refusal is the only thing such a test is meant to assert. The mechanical gate is narrower than the rule: it rejects the generated laws' own machinery — round-trip identity, equivalence, encoded-schema stability — rather than proving every remaining assertion is a refusal. The gap between the rule and its gate is held by review.

## Agent context injection

### Context file

An instruction file the omp host discovers on its own and renders into the system prompt — `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `copilot-instructions.md` and the like. The host expands `@`-imports inside each one, dedupes the set by byte-identical content, and reformats the markdown before rendering. Root `<cwd>/CLAUDE.md` is _not_ a context file: the Claude provider resolves only `<cwd>/.claude/CLAUDE.md` and the user-level copy.

_Avoid:_ using this for anything `omp-claude-compat` injects — that is an injected ref, and conflating the two is what caused `AGENTS.md` to reach the prompt twice.

### Injected ref

The target of an `@`-reference inside a `CLAUDE.md` that the host does not discover, materialized into the system prompt by `omp-claude-compat`. Injected refs exist only to cover the host's discovery gap, so a ref pointing at a file that is already a context file is redundant by construction and must be suppressed. Suppression keys on the target's file name, never on its content: the host reformats markdown, so the same file is not byte-identical across the two paths.

## Prompt routing

### Host-bound prompt

A submitted prompt the omp host consumes itself — a slash command, a skill invocation, a shell or python escape, a yield-queue entry — rather than sending it to the model. The host decides by the prompt's opening characters, so the classification is positional: prefixing anything onto the text silently demotes the prompt to a model-bound one, and the command is lost rather than reported. Contrast a model-bound prompt, which reaches the model and may carry hook context ahead of the user's words.

Anything that rewrites a submitted prompt must classify it first and leave a host-bound one byte-identical. Classifying too broadly is the safe error — a model-bound prompt misread as host-bound only delays its hook context by one turn, while the reverse destroys a command.

### Pending hook output

The output of a hook that finished after the dispatch that started it, held until the next model-bound prompt can carry it. One-shot by nature: nothing re-runs the hook that produced it, so it must survive a host-bound prompt instead of being spent on one. The buffer is bounded and drops the oldest entry when full.

Distinct from the output of a hook that runs on every prompt submission, which is recoverable by definition — the same hook produces it again on the next prompt, so holding a copy would only duplicate it.

## Hook bridge

### Hook verdict

The decision a hook's exit status and output are interpreted into before the harness acts on it — allow, block with a reason, or allow with a warning. The hook itself never states the verdict directly; the bridge derives it, which is why a hook's exit conventions and the bridge's interpretation of them have to be read as one contract. A hook that exits successfully having produced no decision must be read as an allow, not as a malformed decision — conflating the two turns every quiet success into a spurious warning.

### Patch-mode edit

An edit whose entire change arrives as a single patch string, with the target files named inside the patch text, rather than as a path plus discrete before/after pairs. The distinction matters at any boundary that expects the discrete shape: the file being edited and the text being written both have to be recovered by parsing the patch, and a boundary that recovers only one of them yields a payload that looks well-formed to consumers reading the recovered half and empty to consumers reading the other.

A consumer that inspects the text of a change must be given that text explicitly — being handed only the path is not equivalent, because it re-reads nothing.
