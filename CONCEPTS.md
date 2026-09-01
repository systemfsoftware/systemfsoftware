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

### internal folder

A source directory whose path contains a segment exactly equal to `internal` (`src/internal`, `src/**/internal`). Exports in those files carry the TSDoc `@internal` tag. The tag is forbidden outside those folders. Workspace typecheck still sees the declarations through `@systemfsoftware/source`; the published `exports.types` artifact omits them.

_Avoid:_ treating a filename substring as the folder (`internalize.ts` is not an internal folder)

### Externalized dependency

A package.json `dependencies` (or `peerDependencies`) entry that tsdown leaves as a bare import in the tsdown output instead of inlining — the consumer's environment must provide it at runtime. The counterpart, a `devDependencies` entry, is inlined into the output. The dependency category therefore decides what a published tarball still needs from outside: anything private or unpublishable must never be externalized, because no consumer environment can provide it. Distinct from `bundledPackages`, which inlines _types_ into the api-extractor rollup — this concept concerns _runtime code_ in the tsdown output.

### bundledPackages

A `bundledPackages` array entry in `api-extractor.json` listing workspace dependencies whose types should be inlined into the rollup output. Inlining means consumers don't have to install the dep at all for type resolution — the rollup contains everything. Used when a package is a structural re-export layer (barrels from one or more workspace deps) so its published types stand alone.

### Package boundary audit

The turbo `boundaries` query verdict that a package only imports packages it declares as dependencies — the check that fails with `cannot import package X because it is not a dependency`. A green audit therefore names every runtime import reachable from a package's source within its manifest. An undeclared import that resolves through pnpm hoisting ships silently — installs and builds pass — until this audit runs, so a manifest change is unverified until the boundaries query is clean, and a diagnostic means a missing declaration, never a wrong import.

### Toolchain bootstrap cycle

A mutual dev-dependency between two of this repo's own tooling packages, arising because the repo self-hosts what it publishes: a lint plugin governs the mutation tooling, while that same mutation tooling exercises the plugin's own tests. The class is legitimate at the package level — each edge exists because the depending package's _verification_ needs it — but false at the build level: a devDependency is not a build input, and a package-level mutual devDependency turns the topological build dependency into an unschedulable loop that masks every other fault in the tree behind a single graph error.

The repo's instance is resolved at the package level (2026-08-10): the lint plugin is loaded by its consumers via a filesystem path into its built bundle, so the ported packages carry no workspace edge into the plugin and the graph holds only one-way edges out of it. The real artifact ordering (fork lint consumes the plugin's `dist`) is expressed as an explicit task edge in the consumers' `turbo.json` rather than a package edge. A reintroduced mutual devDependency returns loudly but non-fatally — turbo's package-graph validation and pnpm's install check both print stderr warnings on every command (`pnpm check` still exits 0; the retained plugin build override also keeps the hard task-graph error from returning), and pnpm's `ignore-workspace-cycles` silences only pnpm's own warning. Distinct from an externalized dependency, which concerns what a published tarball needs at runtime; this concept concerns only what must be built before what.

### Bin target

The file a workspace package's `bin` field names as the executable its command resolves to. When that file is build output rather than a committed source file, it does not exist at install time, so the package must build itself during install for the link to succeed.

The package manager links command shims twice per install, once before lifecycle scripts and once after, and the second pass exists precisely so a target built by a script gets linked. A shim whose target is absent in both passes is skipped with a warning, never an error, and no later install revisits a package already considered linked — so a link that failed once stays failed for the life of the checkout, and every command depending on it is missing while the install reports success.

## Build cache

### Input-hash completeness

The property a cached task's key must have before its stored verdict can be trusted: every input capable of changing the task's answer is inside the key. A key is complete or it is not — partial completeness buys nothing, because the single uncovered input is the one that returns a stale pass.

Completeness spans four classes of input, and only the first is covered by default: the files the task reads, the environment variables its command's shell expansion reads, the tool binaries an install-time script may swap while the declared dependency version holds still, and the task's own definition. The failure it prevents is silent and directional — an incomplete key does not slow a gate or error it, it lets the gate report a pass for work that never ran. Enabling a cache and closing its key's holes therefore belong in one change rather than in sequence, since every verdict stored or restored in between was produced under a key known to be incomplete.

Completeness is only half the criterion, and pursued alone it produces the opposite failure — see Volatile input and Key partition. The key must move exactly when the answer can change, and never otherwise.

### Relocatable output

An artifact a cached task may declare as an output, on the criterion that it stays true when restored into a checkout other than the one that produced it. Restoration writes the stored bytes back verbatim and rewrites nothing inside them, so an artifact embedding absolute paths or other machine-local state is not relocatable and must be left undeclared even though caching it would be faster.

The criterion binds hardest where several working trees of one repository share a cache, which is the default rather than the exception — the sharing is automatic unless a cache location is pinned explicitly. Where an output is not relocatable the honest declaration is none at all: the pass-or-fail verdict and the logs still cache, and the machine-local artifact stays where it was built.

### Volatile input

A file inside a task's input set that a normal run of the pipeline itself rewrites, so the key moves although the answer did not. Tool-written state is the whole class: a task runner's own per-task logs, a compiler's incremental state, build output. It is the mirror image of an incomplete key — completeness fails silently toward a stale pass, volatility fails loudly toward a permanent miss.

Volatility is contagious across packages, which is what makes it hard to see. A shared configuration package globbed wholesale into every dependent's input set carries its own tool-written state along with the config, so running that one package's task rewrites state that every dependent hashes, and the whole graph misses on the next run. The glob is the defect, not the shared dependency. A cross-package invalidation of this kind cannot be observed in a run that filters the graph down, because the filter drops the very task whose run does the rewriting.

What hides volatile state inside a key is that an explicitly declared input glob is not subject to the repository's ignore rules — only a task runner's default input set is. Generated output is conventionally ignored, so the reasonable belief that an ignored file cannot be in a key is false for exactly the globs broad enough to sweep one up. Excluding the volatile state a directory holds today is therefore a blacklist, correct only until some tool writes somewhere new, and the class is wider than build output: coverage and report artifacts qualify, and where the task that hashes them does not depend on the task that writes them, their presence at hash time is a scheduling race rather than a property of the tree. The durable form names the consumable surface instead — the authored sources and manifests a dependent may legitimately read — so a directory created later cannot enter the key by default. The same inversion applies wherever a task's declared inputs and its command's own traversal rules are maintained separately: the command's ignore list is the input contract, and any file the task hashes but the command refuses to read is volatile by construction.

### Key partition

A split of one task's cache into disjoint sets, caused by a value that varies with who invoked the task rather than with what the task must answer. Command-line arguments and declared environment variables both enter the key, so an entry point that passes different flags — or reads a variable only some callers set — hashes the same work under a different key and can never reuse another caller's entry.

A partition is not always a defect: where two callers genuinely require different answers, keying them apart is correct. The test is whether the varying value can change the task's verdict. A flag that alters only how a result is presented cannot, so keying on it buys no safety and costs every hit; a variable that selects a different check does, and belongs in the key. Where the split is deliberate rather than forced — separating two audiences for one verdict — prefer a marker every caller in that audience sets deterministically over one that merely happens to be present. A variable that changes the answer belongs in the key regardless of how few callers set it.

### Stale pass

A pass a cached task restores rather than earns, for work whose answer has changed since the verdict was stored. It is the silent direction of cache failure: nothing errors and nothing slows, so a gate reports success for a check that never ran.

A key can be complete with respect to every input it declares and still return one, because the tools that produce the answer are not themselves inputs. The exposed shape is any task that regenerates an artifact and compares it against a committed copy: the comparison keeps passing for as long as the key holds still while the generator moves underneath it, so the drift becomes visible only when some unrelated edit happens to move the key. Detection from inside the cache is impossible by construction, since a hit is precisely the decision not to look. The remedies are to bring whatever can move the answer into the key, or to leave the comparison uncached.

## Release pipeline

### intent versioning

The pnpm-native release model the repo uses since leaving semantic-release (2026-08-10): the manifest `version` is the source of truth for what a package will publish, not a placeholder a tool overwrites. A change is recorded with `pnpm change`, which writes a `.changeset/` intent; a push to `main` runs `pnpm version -r`, which consumes pending intents and bumps the manifests; the Release PR commits those bumps.

Because the manifest version is what npm carries, the first release of a package publishes that string verbatim — there is no "dev" placeholder convention here. Adopting semantic-release's `0.0.0-development` placeholder would ship `0.0.0-development` as a package's literal debut version.

### intent liveness

The property that every pending `.changeset/` intent names only packages that
are live workspace members at the tree being judged — any bump class, `none`
included. The changeset gate checks it for every pending intent at head on
every PR, so a package deletion that does not sweep the intents naming it
fails that PR instead of failing the Release. The verdict extracts frontmatter
key names liberally (any scalar value, comments included) and filters by
membership — under-extraction is the only fatal direction — and treats an
unreadable pending set as failure, never as "nothing stale".

### Release PR

The pull request (`changeset-release/main`, opened by the Release workflow on push to `main`) that carries the version bumps produced by consuming `.changeset/` intents. Merging it runs the gate, then the publish job, which publishes via npm OIDC trusted publishing with provenance and tags each released package. It can only open when workflow permissions allow GitHub Actions to create pull requests.

### semantic-release

The npm publish orchestrator the repo used before adopting intent versioning: triggered by push to `main`, it analyzed commits since the last release tag per package, derived the next semver from conventional-commit types, and called `pnpm publish`. Retired 2026-08-10; its conventions (notably the `0.0.0-development` placeholder version) are incompatible with intent versioning and must not be reintroduced.

## Validation tooling

### attw

`arethetypeswrong` — the type-resolution validator. `attw --pack .` runs against the package tarball the same way npm would install it, validating that `exports` declarations resolve to consistent types across node10 / node16-CJS / node16-ESM / bundler. Catches downstream-facing drift that workspace-local checks miss.

## Gate provenance

### Evaluator surface

A file whose job is to judge other work — a gate, a scoring harness, a forge workflow, a contribution check. What sets it apart is not its contents but a commit rule: it never changes in the same commit as the work it judges, because a change that moves both the work and its judge leaves no evidence which of the two produced the green result.

Evolving one means its own commit, the reason stated, and the gate observed red before and green after for the intended reason. An agent that can edit its own evaluator can pass by editing it, so the surface is held outside whatever it scores.

### Ritual gate

A gate that checks a proxy for a claim and then reports the claim. It asks whether a justification has the right shape — a field is present, a reason is non-empty, a digest was written — and announces that the underlying requirement was met. Because the proxy is always satisfiable by the same author who supplies it, the gate has full precision against nothing, and a green run teaches every later reader that something was verified when nothing was.

The distinguishing question is whether the check recomputes anything the writer did not supply. A gate that only reads back what a writer stamped is a ritual regardless of how strict its wording is.

### Provenance manifest

The closed registry that admits each root-level tooling script by declared category, so a script's right to exist is stated rather than inferred from its presence on disk. Adding a script means editing the manifest, and the manifest is itself an Evaluator surface — which deliberately forces that edit into its own commit.

### Known-bad fixture

An artifact that deliberately contains the violation a gate claims to detect, run before the real check so that a non-zero finding count proves the gate can fail at all. Paired with a known-good artifact, which must produce zero.

Without the pair, a gate reporting no findings is indistinguishable between two states: a clean tree, or a check that never ran. The fixture is what converts silence into evidence.

### Asserted-executed split

The state where a guard's identity checks — existence, version pin, checksum — describe one filesystem object while the spawn resolves another, so every green assertion certifies a binary that did not run. Bare-name spawns re-enter ambient lookup at execution time, and the split is silent in both directions: a substituted binary keeps the assertions green, and a correctly pinned spawn under a name-keyed grant fails as a permission error rather than a verdict.

The one-object rule closes it: the verified path, the permission grant, and the spawn all name the same object, leaving no resolution step for the environment to decide. A Ritual gate is the special case where nothing is recomputed at all; here something is, but about the wrong object.

### Advisory step

A pipeline step permitted to fail without failing its job, because the verdict it contributes is carried by something downstream. The permission is granted with one outcome in mind — the judged work scored below a threshold — and silently extends to every other way the step can fail.

The extension is the hazard: an infrastructure failure is not a score outcome, so a run that crashed, timed out, or never started at all is absolved by the same flag. An advisory step is only honest when paired with a separate, non-advisory assertion that the run produced the artifact its verdict is read from.

### Reach

The property a constraint has when it is actually active at the writing act, as opposed to merely being true of the codebase. There are exactly two mechanisms that confer it: the constraint occupies the **window** — the reading surface the author loads — or it **gates** the emission, failing a command that runs as the work is produced. A constraint present in neither changes nothing and can be deleted with no observable effect.

Reach is asserted only by demonstration and never inferred from a green run, because losing it need not produce a complaint: a rule no config opts into still reads as installed, and a document no context loads still reads as policy. Whether a check whose pattern selects nothing is loud about it is an accident of the instrument — some abort, others report success over the empty set — so loudness is no part of the definition. A Stale pass is the cache-flavoured instance of the same silence, and an Advisory step is a gate whose reach was surrendered deliberately. Reach is also lost from outside: a gate sitting inside the write scope of the author it judges does not bind that author, because the threshold and the ignore list are editable in the same change the gate is meant to reject.

### Drifted key

An index key whose assignment nothing verifies. Where a suffix, tag, or path decides which doctrine applies to a file, that assignment is itself a claim, and an unchecked claim moves — a rename reassigns the key without touching anything that reads it.

A drifted key is worse than a missing one. Retrieving nothing leaves the author still looking; retrieving the wrong doctrine leaves the author confident. The same drift un-enrols the file from whatever Verification observer the old key selected. That loss surfaces only if the instrument happens to object to an empty selection, and even then the cheapest repair is to delete the selection — which ends the objection and the observation together, leaving the file with no observer and nothing complaining.

### Constitution watchdog

A `WATCHDOG.md` that `@import`s `CONSTITUTION.md` into the omp advisor's system prompt, making the advisor — a separate model reviewing transcript deltas — police code changes against the 21 `gate: review` rules no command enforces. The 13 rules with lint/type-checker/mutation gates are excluded; the advisor does not re-check what the toolchain already catches. Not a gate: the advisor raises `concern`/`nit`/silent, never pass/fail. The mechanism that gives `gate: review` rules Reach — the constitution was present in neither the window (the primary agent does not read it) nor a gate (no command checks it) until the watchdog put it in the advisor's window.

## Test execution

### Run class

The classification of who invoked a run — an agent, a forge, or a human working locally — which decides how thoroughly the suite executes: how many samples a property test draws, whether coverage is collected, and which reporter receives the output.

The classes are mutually exclusive and ordered, because an agent shell commonly sets the forge's marker as well: an agent run is a development run and takes the fast path even when `CI` is present, so `AGENT` outranks it. Membership is decided by a marker's presence rather than by comparing it against a value, since every producer that means "I am a forge" sets its marker to something and no two of them agree on what — an equality test silently reclassifies every producer whose spelling differs. One definition of the classification is exported and imported everywhere it is read; a second definition is a second opinion, and two will diverge the moment a producer writes a value one of them does not expect. Because the class changes what a run computes rather than only how its output is presented, it is a legitimate cache-key input — see Key partition.

### Contract lane

The verification altitude that exercises a published command-line surface from outside the process that produces it: the package is packed exactly as it would be published, installed into a clean container, and driven as a real program whose observable behavior is then asserted. Distinct from the default test task, which stays container-free and never spawns the shipped artifact.

It exists because a class of properties is process-level by category and admits no honest double: exit status, bytes arriving on a real file descriptor, a timer firing in real elapsed time, a pipe closed by its reader, a signal delivered mid-run, resolution of an installed binary, and whether importing a module has side effects. Substituting the process, the writer, or the clock for any of these asserts the substitute rather than the program, so evidence gathered that way does not count at this altitude — while a logical property, such as the order in which a pipeline emits events, stays at composition altitude and is asserted against a declared port instead. Because the lane depends on a container runtime it can fail for reasons unrelated to the code, and its governing rule is that such a failure must be loud and must name its cause: reporting a skip, or zero passing tests, would make an unrun lane indistinguishable from a passing one, which is the false green the lane was built to remove.

## Architecture cells (constitution §I–V)

### Cell

Retired 2026-08-16, and with it the thirteen-role suffix taxonomy: no rule keys on a filename, no config enumerates a sanctioned suffix set, and a file's name grants it nothing. What replaced the suffix as the organizing unit is the **sandwich** — read (impure), decide (pure, inside a `Workflow.make` body), write (impure) — with the `make` boundary, not any name, deciding what the gates bind. See **Drifted key**, whose precedence this retirement makes structural: the measurement (label-routed rules silent on the violating file) is now the shipped state rather than a standing objection.

### Property cell

A property test granted to a pure decision, sitting beside it under a matching name. The grant is deliberately narrow — most code carries no authored property test of its own and is covered at composition altitude instead — and each grant has a specific reason to be there.

A decision earns a property test only when something about it cannot be reached from above: invariants that are universals over generated input, or refusals no generated law can express. Being important, or merely being hard to test through its callers, is not a qualification.

### workflow

The pure decision — one business decision as a pure function: typed command in, `Either<Decision, Error>` out, no I/O. Decision variants are `S.TaggedClass`; error variants are `S.TaggedError`. Dispatch over closed unions uses `Match.value` + `Match.tag` + `Match.exhaustive`; primitives use terminal `Match.orElse`. The `never` error channel is forbidden except for total decisions (`Allow | Block` with no other outcomes). Imported only from sibling workflows and the pure Effect data modules (`Either`, `Match`, `Schema`, `Option`, `ParseResult`) — never the Effect runtime. The gates are enforced, not documented: `Workflow.make` refuses an uninhabited (`never`) or untagged error channel at the construction site via the `InhabitedErrorChannel` and `TaggedErrorChannel` constraints, and the `WorkflowBrand` phantom on `Workflow<C,D,E>` means only `make` produces a value `Cell.decide` accepts.

A workflow is produced by calling `Workflow.make`, not by annotating a value with its type. The annotation form type-checks while deriving none of the channel markers, so it silently forfeits the guarantee the type exists to provide; only `make` infers the decision and error channels from the decider it is handed and derives the markers that make a total decision uncallable.

### Tag carrier

A one-member module-scope pair — `const XTag = { _tag: 'X' } as const` and `type XTag = typeof XTag` — that a variant inherits its discriminant from (`interface X extends XTag`) so the literal is written once and reaches both type space, where `Match.tag` dispatches on it, and value space, where a construction site spreads it. The const-and-type pair sharing one name is forced, not redundant: `interface X extends typeof XTag` is invalid syntax, so a named alias must exist for the interface to extend.

A carrier earns its keep only where the literal has a second consumer — a runtime guard reading `_tag` off an unknown value, say — so that the guard and the type agree by construction. Where the literal has one consumer it is indirection: the honest form is the member, and a rule that refuses the member there is asking for ceremony. Deciding whether the variant should be a union at all comes first (`CONST-S4`): variants no consumer distinguishes are one variant, and deleting one beats picking a constructor for it.

What a carrier does **not** do bounds where it can be the answer, and the bound is wider than it first looks. A carrier is structural — the derived type is a plain intersection, so a hand-written object literal satisfies it, no constructor is forced and no field is validated. So is every alternative in this channel: a `Schema.TaggedClass` instance type is `S["Type"] & Brand` with `Brand = {}`, and an object literal assigned to one compiles — measured, by an `@ts-expect-error` on that assignment being reported unused. `[ClassTypeId]` rides the runtime prototype, not the declared instance type. No tagged declaration here is unforgeable, `Data.TaggedEnum` and the schema class family alike. What a schema buys over a carrier is a codec and a tag derived from one declaration, never protection from a fabricated value; refusing a fabricated value is a constraint on an argument position, and a brand that merely records a constructor ran is provenance rather than a proposition (`docs/solutions/architecture-patterns/constructor-rule-boundary.md`).

### Cell constructor

A `make` a cell type exposes so that authors produce that cell by calling it rather than by annotating a value. Its force lives entirely in the parameter type — what the author hands in — and it earns existence only by computing something the author could not write: inferring the cell's channels from the argument and deriving markers from them. A constructor whose rejections all follow from its parameter type alone computes nothing an annotation would not, and is ceremony rather than enforcement.

A constructor and a boundary-keyed rule are disjoint instruments, never substitutes: the constructor binds where the value is produced, while the rule reads the body the constructor was handed, so shipping one retires none of the other. A single constructor types the seam between phases and cannot type a sequence — ordering is not expressible over one value — so the types whose composer the effect library already supplies do not need one.

A **chain** of constructors does type the sequence, which is how a shell's order becomes a compile-time fact rather than a claim beside it. Each phase's return type carries a required member whose name is the sentence stating what must be called next, and the next phase's parameter demands that member; composing them in the wrong order omits it, so the compiler reports the missing member and prints the sentence. The stages are siblings rather than a hierarchy — under a hierarchy a later stage is assignable to an earlier parameter, so an inversion compiles — and the sentence survives into the published declaration as the member's own name, which is what carries it into a consumer's compiler.

### Wire declaration

A schema for a payload the workspace does not own, restated in members it does. Its members carry a mark, and a marked member is one this workspace declares the type of, so naming a vendor's type inside a declaration — or a workspace-local alias of one, which defeats any specifier-keyed predicate — is a compile error at the authoring site rather than a lint finding elsewhere. The refusal travels to consumers through the published declaration file, which is the one channel a library controls.

The mark is a phantom on the schema and never on the decoded value, because a brand on the value forces nothing: a schema's own escape hatch and a bare cast each produce a branded value with every refinement skipped. What the mark cannot do is refuse a determined author. TypeScript is structural, so any value legitimately carrying the phantom donates it to any other type by intersection, and that route names nothing — no constructor, no alias, no marker. A wire declaration therefore refuses the accidental case, and deciding admissibility for the rest belongs to a checker that resolves where a member's type was declared, never how it came to be marked.

### Description

One sandwich, authored as a `Cell.layer` spec — read (impure), decode and decide (pure), encode (pure), write (impure) — and compiled into a Cell: a single function from command to response. The assembler chains the phases in that order internally; the author cannot author a different order, and a hand-built record claiming one is not expressible on the published surface. A **phase** is one named step — a read, a decode, a decision, an encode, or a write. One Cell is one sandwich; a site whose real order writes before it can classify is two Cells composed in the calling `Effect.gen` (or through `Cell.andThen`), with the shell owning the binding between them — a later read that needs durable state an earlier write created reads it by re-gathering, and a response that becomes the next command travels as an ordinary generator binding.

The phases demand services by yielding them, and the Cell's `R` channel carries what the bodies yielded: the composition root provides once, and a missing provide is a compile error at the run site, not a runtime surprise. The error channel is the interpreter's truth — read, decode, and write refusals fail; a decide refusal is the outcome the encode and write receive.

A write phase may promote a decide `Left` into `Effect.fail` when the refusal is operationally fatal to the process — that promotion is the executor's shell policy, declared by the write's own error channel, never a phase convention the seam types name.

An impure phase's interior is not type-visible, so no count of I/O operations is claimed or enforced: a read may gather a product across its interior — bumping a counter and returning the resulting rate is one such product — and fan-in is expressed that way rather than by relaxing the chain. A pure phase is one expression and performs no I/O. That last sentence is a design rule, and only part of it is machine-decided: the lint rule on phase bodies reads the call graph reachable from the body through module-level helpers, so an I/O call written in the body or in a helper beside it is caught, while one reached through a closure-captured binding is not. The undecided half stays a rule the author keeps, not a claim the gate has checked.

### Vocabulary

What a Cell states about itself as a const table beside the interpreter: which phases are pure, the module that owns them, which of that module's exports perform I/O, and the names of the shell constructors a composition root calls (`run`, `andThen`, `zip`). Order is not in the table — it is the text of `layerRunner`, which nothing else restates. The table carries only what a rule cannot read off a type, so there is nothing to re-walk and no description object kept alive for consumers to fold.

A vocabulary is the unit of agreement between packages. Where several packages must decide the same question the same way, each reads the vocabulary instead of restating it, and the disagreement they would otherwise have becomes impossible rather than merely unlikely.

### Derived consumer

A package whose behaviour is a function of a vocabulary it reads from elsewhere, carrying none of that vocabulary's words in its own source. The test is one addition at the source: a derived consumer stays correct while its output changes, and a consumer whose output does not change was reading something else.

Derivation is a property of the consumer's source, not of its intent, so it is audited by counting: a census for the vocabulary's own words across the consumer's sources returns zero, and any non-zero count names a copy that will drift. The cheapest and default carrier is a direct runtime import; when a lint plugin depends on a core description package, the dependency graph stays acyclic by delivering the plugin consumer-side via `jsPlugins` rather than aggregating it into a monorepo-wide lint preset.

### Drift gate

A check that re-renders a committed generated artifact from its source and fails when any byte differs, so the artifact is a derivation rather than a copy that happens to agree today. Its remedy is regeneration, never an edit to the artifact.

A drift gate is only as honest as its comparison: cached against an incomplete input set it returns a stale pass, and pointed at an artifact the formatter also rewrites it fights the formatter instead of the drift. The renderer's output must therefore be stable under the repository's formatter, and the comparison must re-run whenever the source moves. Where direct runtime imports are achievable by adjusting delivery topology, direct imports are strictly preferred over generated-artifact drift gates.

### Independent oracle

A deliberate restatement kept so that a derivation has something to disagree with. A derived checker validated only against inputs the same derivation produced cannot fail — an error in the derivation appears identically in the checker and its fixture, and they agree — so exactly one hand-written statement of the truth must survive.

It belongs in the package that owns the value, beside the constructors it checks, never in a consumer: a consumer holding one would be carrying the copy that derivation exists to eliminate. It reads as duplication, which is the hazard — the case for deleting it is always available and always wrong, so the reason it exists is recorded next to it.

### Verification observer

The check that fails when a behaviour changes wrongly — the instrument that actually reads code, as distinct from the contract it declares. The instruments are not interchangeable: a pure decision is read by mutation at the `Workflow.make` boundary, a declaration by authored property laws, and a shell by lint provenance plus composition tests. Enrolling a behaviour in the wrong instrument is a wrong-observer error, and it reads as coverage while measuring nothing.

An observer may also be bought and never given reach: installed as a dependency, invoked by a script, pointed at a config matching no files, and wired into no gate. The author-side cost is paid and the benefit is zero, so an unreached observer is worse than none — it reads as protection in the manifest while nothing ever runs it.

## Schema verification

### Generated schema law

One of the pair of properties — round-trip identity and encode stability — registered automatically for every exported Effect `Schema` in a package, rather than hand-written. Both draw their inputs from the schema's **own** arbitrary, which is itself derived from the refinement under test, so a generated law can only ever assert that values built to satisfy a refinement satisfy it. It therefore covers everything a schema **accepts** and nothing it **rejects**: widening a refinement leaves every generated law green. Treating the pair as full coverage is the mistake it invites.

_Aliases:_ `ruleOfSchemas` pair, the round-trip laws

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

### Plugin hook file

`hooks/hooks.json` at a Claude Code plugin root — the location Claude Code documents under Hook locations. The bridge treats it as another settings source when the plugin is enabled and `.claude-plugin/plugin.json` is present. It is not a project `.claude/settings.json` copy.

### Patch-mode edit

An edit whose entire change arrives as a single patch string, with the target files named inside the patch text, rather than as a path plus discrete before/after pairs. The distinction matters at any boundary that expects the discrete shape: the file being edited and the text being written both have to be recovered by parsing the patch, and a boundary that recovers only one of them yields a payload that looks well-formed to consumers reading the recovered half and empty to consumers reading the other.

A consumer that inspects the text of a change must be given that text explicitly — being handed only the path is not equivalent, because it re-reads nothing.

## Stryker CLI (agent-first rebuild)

### machine mode (stryker CLI)

The CLI state where output is structured for a machine consumer instead of a human. Activates when stdout is not a TTY, or the `AGENT` environment variable is set to any non-empty value, or a known agent tool variable (`CLAUDECODE`, `CODEX_SANDBOX`, …) is present. Precedence runs explicit `--format`/`--json` first, then the `STRYKER_MODE=human|machine` override, then detection. Machine mode means "non-interactive but everything actionable": full verbosity, structured errors, no prompts, no color — the opposite of CI's minimal-output convention.

### verdict envelope

The JSON object the stryker CLI prints to stdout in machine mode: mutation score, thresholds, per-status mutant counts, test-contribution verdict, per-mutant status for the actionable statuses, the report file path, a run identifier, and the resolved mode with the signal that decided it. Per-mutant entries are keyed on file, location, mutator, and replacement — the same key a survivor re-run matches on, so the envelope alone is enough to address individual survivors. The full mutation report still goes to a file; the envelope is the small, schema-stable contract agents parse instead of scraping human output.

### progress stream

The newline-delimited JSON the stryker CLI writes to `reports/mutation-stream.jsonl`: a `stream` header first (schema version, run id, resolved mode, deciding signal), then `phase` lifecycle lines, a `plan` line naming the total, one `mutant` line for **every** completed status — `Killed` included, the actionable-only filter surviving only in the verdict envelope — `tick` heartbeats on an interval, and a terminal `verdict` or `error` line on a clean exit. One run per file, truncated at open; a hard kill can leave it without the terminal line, which is the accepted signal of a dead run rather than corruption. It moved off stdout when the file sink landed, so a human renderer owns the console and machines read the file.

### survivor re-run

An explicit, opt-in stryker run that re-tests only mutants that survived a previous run, reading prior per-mutant status as input. Distinct from incremental mode: incremental is on by default and silently reuses verdicts whose inputs the differ proves unchanged, while a survivor re-run re-tests the named set and reports fresh results.

### remembered

A mutant verdict replayed from incremental state without re-executing the mutant — its source file, covering tests, and mutant key unchanged since the verdict was recorded. Replayed with `statusReason: 'Remembered'` and its kill attribution preserved; the differ is the only authority for remembered-ness, and a changed source or covering test demotes the mutant to a re-run. A verdict absent from stored state is never remembered — it runs — so a partial checkpoint degrades to first-run behavior for exactly the mutants it lacks.

### partial results

The per-mutant data a killed run leaves behind, read from its stream. Distinct from a report: partials are marked incomplete, never scored as final, and never turn a missing-report job green. A run that died before completing any mutant has no partials — that is zero progress, an infrastructure failure reported distinctly.

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

## Flagged ambiguities

- "observer" named two different things historically: a retired cell-role suffix, and the verification instrument that reads code. The instrument is **Verification observer**; the suffix was deleted with the taxonomy on 2026-08-16, so the bare word now only ever names the instrument.
- "window" is not minted as an entry, because it already names the model's token budget. The reading surface a constraint must occupy to bind an author is defined inside **Reach** as one of its two mechanisms; the bare word stays with the token budget.
- "dependency rejection" is Seemann's phrase and every model reaches for his post first, where the ruling is a slogan with no selection criterion. This repo takes Wlaschin's reading, which supplies the test — manage a dependency only where it is impure or a strategy — and `REPO-A2` carries the precedence. Cite the test, never the slogan.
- **Cell** and **Drifted key** disagreed about the suffix: the first made it the key that grants a file its powers, the second named an unverified key that a rename silently reassigns. **Drifted key** won, because the disagreement was measured rather than argued — two byte-identical files, one suffixed `kernel` and one `executor`, put the purity rule loud on the first and silent on the second (`docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md`). Those two suffixes are now spelled nowhere in the tree: a name says what a module is of, and the only suffixes left are `.workflow.ts` and `.schema.ts`. A rule keys on the type, the import edge, or the `Workflow.make` boundary — never on a filename.
