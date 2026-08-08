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

### Toolchain bootstrap cycle

A mutual dev-dependency between two of this repo's own tooling packages, arising because the repo self-hosts what it publishes: a lint plugin governs the mutation tooling, while that same mutation tooling exercises the plugin's own tests.

The cycle is legitimate at the package level and false at the build level. Each dependency exists because the depending package's _verification_ needs it, so deleting either one removes a real check rather than a redundant edge. But neither package's build consumes the other's build output, so the build graph must be told per package that a tooling edge carries no build ordering — otherwise the topological build dependency turns the pair into an unschedulable loop and no task runs at all, which masks every other fault in the tree behind a single graph error. Distinct from an externalized dependency, which concerns what a published tarball needs at runtime; this concept concerns only what must be built before what.

## Build cache

### Input-hash completeness

The property a cached task's key must have before its stored verdict can be trusted: every input capable of changing the task's answer is inside the key. A key is complete or it is not — partial completeness buys nothing, because the single uncovered input is the one that returns a stale pass.

Completeness spans four classes of input, and only the first is covered by default: the files the task reads, the environment variables its command's shell expansion reads, the tool binaries an install-time script may swap while the declared dependency version holds still, and the task's own definition. The failure it prevents is silent and directional — an incomplete key does not slow a gate or error it, it lets the gate report a pass for work that never ran. Enabling a cache and closing its key's holes therefore belong in one change rather than in sequence, since every verdict stored or restored in between was produced under a key known to be incomplete.

### Relocatable output

An artifact a cached task may declare as an output, on the criterion that it stays true when restored into a checkout other than the one that produced it. Restoration writes the stored bytes back verbatim and rewrites nothing inside them, so an artifact embedding absolute paths or other machine-local state is not relocatable and must be left undeclared even though caching it would be faster.

The criterion binds hardest where several working trees of one repository share a cache, which is the default rather than the exception — the sharing is automatic unless a cache location is pinned explicitly. Where an output is not relocatable the honest declaration is none at all: the pass-or-fail verdict and the logs still cache, and the machine-local artifact stays where it was built.

## Release pipeline

### semantic-release

The npm publish orchestrator triggered by push to `main`. Runs `pnpm build` per package, then per-package semantic-release which analyzes commits since the last release tag, derives the next semver from conventional-commit types, and calls `pnpm publish`. Each package is released independently based on which files its `commitsForPackage` filter (in `scripts/release-monorepo-filter.mjs`) finds touched.

## Validation tooling

### check-exports

The script at `scripts/check-exports.mjs` that compares each package's `package.json#exports` paths against the actual `dist/` directory. Catches drift where `exports.types` references a file the `build` script never produces. Runs as `pnpm check:exports`, blocking inside `pnpm check`.

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

### Schema weakening

A schema built from another by dropping exactly one arm of its `SchemaAST` — a refinement's predicate, or one side of a transformation — leaving the rest intact. It is the schema-level analogue of an extreme mutation operator: it deletes a unit of the declaration rather than perturbing an expression inside one, which is what makes it able to express contracts a conventional mutator's operator catalogue cannot construct. The walk recurses through composites, rebuilding the enclosing tree around each weakened child, so an arm nested inside a struct field or a union member is reachable. Built in-process from the schema value, so it needs no source rewriting and no instrumenter.

### Witness

An input the weakened schema accepts and the original rejects. It is what promotes an arm to a refutation obligation, and it is existential — so sampling can establish it, which the containment claim it replaced could never do. Recording it is what lets a failure name the specific illegal value now getting through.

### Refutation obligation

A weakening for which a witness exists, and which therefore must be discriminated by some rejection property. The witness is what makes the set honest: a weakening that only loses accepted inputs belongs to the generated laws instead, so demanding a refusal for it would accuse a test of missing a fault another instrument already owns. An arm may be _mixed_ — simultaneously more permissive in one direction and less in another — and a witness still qualifies it, because the permissiveness it adds is real however much it also breaks.

### Obligation node

The `SchemaAST` node a weakening removes, and the identity an obligation is keyed by. Arms reached through different paths, or from different schemas, that remove the same node are one obligation — Effect shares nodes across composed schemas, so three schemas built on one refinement owe one refusal between them, not three. Keying by node rather than by path is also what makes discharge scope-free: a generator discharges a node wherever that node appears, regardless of which file it was declared in.

### Refutation adequacy

The criterion that every obligation node reachable from a schema is discharged by at least one declared refusal generator. It asks for coverage, never uniqueness — whether each node is defended, not whether a given test is its only defender. The distinction is load-bearing: a uniqueness criterion is test-suite minimization, whose fault-detection cost is measured, and it is the error the `soleKills > 0` gate made.

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

## Stryker CLI (agent-first rebuild)

### machine mode (stryker CLI)

The CLI state where output is structured for a machine consumer instead of a human. Activates when stdout is not a TTY, or the `AGENT` environment variable is set to any non-empty value, or a known agent tool variable (`CLAUDECODE`, `CODEX_SANDBOX`, …) is present. Precedence runs explicit `--format`/`--json` first, then the `STRYKER_MODE=human|machine` override, then detection. Machine mode means "non-interactive but everything actionable": full verbosity, structured errors, no prompts, no color — the opposite of CI's minimal-output convention.

### verdict envelope

The JSON object the stryker CLI prints to stdout in machine mode: mutation score, thresholds, per-status mutant counts, test-contribution verdict, per-mutant status for the actionable statuses, the report file path, a run identifier, and the resolved mode with the signal that decided it. Per-mutant entries are keyed on file, location, mutator, and replacement — the same key a survivor re-run matches on, so the envelope alone is enough to address individual survivors. The full mutation report still goes to a file; the envelope is the small, schema-stable contract agents parse instead of scraping human output.

### progress stream

The newline-delimited JSON the stryker CLI writes to stdout in machine mode: a `stream` header first (schema version, run id, resolved mode, deciding signal), then `phase` lifecycle lines, a `plan` line naming the total, `mutant` lines filtered to the actionable statuses (`Survived`, `NoCoverage`, `Timeout`, `RuntimeError`), `tick` heartbeats on an interval, and always a terminal `verdict` or `error` line last. It replaces the deleted `progress-append-only` reporter as the non-TTY progress path, so an agent sees a many-minute run advancing rather than silence followed by a verdict. Human mode keeps the interactive progress bar on stdout instead.

### survivor re-run

An explicit, opt-in stryker run that re-tests only mutants that survived a previous run, reading prior per-mutant status as input. Distinct from incremental mode: incremental is on by default and silently reuses verdicts whose inputs the differ proves unchanged, while a survivor re-run re-tests the named set and reports fresh results.

## Mutation attribution

### test-contribution gate

The check that grades the mutation run's **test set** rather than its mutant set, asking of each authored property test whether the suite would be any weaker without it. It runs as part of the mutation command off the report already in memory, and can fail a run whose score is perfect — a high score says the mutants died, never that every test helped kill one. A package opts out visibly in its config rather than by deleting the test the gate names.

### sole kill

A mutant a given test file is the **only** file credited with killing. Distinct from a plain kill, which several files may share: a file with many shared kills and no sole kill defends nothing the rest of the suite does not already defend. Whether sole kills can be measured at all depends on the run recording every killer rather than stopping at each mutant's first one, so the gate falls back to the weaker "killed nothing at all" question when it cannot.

### toothless test file

A test file whose deletion would leave every mutant just as dead. The claim is counterfactual and therefore only as sound as the run's attribution — a file can look toothless because it genuinely defends nothing, because the run failed to record what it killed, or because the mutant set cannot express the contract the file defends. Only the first is grounds for deleting anything.

### unattributed kill

A mutant that died with no test credited for killing it. It arises when a mutant's death is not observed per-test — a run that hangs is killed wholesale, so no individual test is named — leaving a kill that counts toward the score while belonging to nobody. Any file covering one is **unmeasurable** rather than toothless: it is a live candidate for being the killer, so the counterfactual behind the accusation cannot be evaluated for it.

### collateral kill

A mutant killed because the mutation corrupted a schema's derived arbitrary and some _other_ schema's law then choked on the garbage it generated, rather than because any test observed the mutated contract. It counts toward the score and toward attribution exactly like an observed kill, which is what makes it dangerous: it credits a law that is tautological with respect to the mutated schema, and the credit is then evidence against the hand-authored tests that state the contract properly.
