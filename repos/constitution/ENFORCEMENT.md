# Enforcement

Rules for whoever builds or changes an instrument that grades the maker — lint gates, stream rules, CI checks, thresholds, rubrics, advisors. Never `@`-import this file into a maker's context.

## Mechanism

- Bind each obligation through the strongest mechanism that can carry it, strongest first:
  1. the type system — the illegal state does not construct;
  2. a command that fails — lint, threshold, boundary audit;
  3. a pre-execution refusal — the write or tool call does not happen;
  4. resident prose — the floor; it orients, it does not enforce.
- A post-hoc reminder is prose, not a refusal. If the violating call already executed, the mechanism is rung 4.

## Gate design

- Forbid an outcome; never command a ritual. *Do not ship an export whose dist file is missing*, not *declare a category and write a reason*.
- Key every verdict on a recomputation — source bytes, compiler verdict, rehash — never on a field the graded work's author supplied. When a gate reads a field, recompute that field in the same run.
- Resolve every uncertainty against the permissive outcome: unparseable output degrades to revise, never to pass; an absent grant means required; an unreadable input is surfaced, never skipped; a dead run never reports itself running.
- Assert the input set, not only its contents: an empty corpus, an empty mutated set, or a missing input goes red. A gate that cannot fail is a certificate, not enforcement.

## Changing an instrument

- An instrument change lands alone, in its own commit, observed failing before and passing after, for the reason it states — by hands that do not hold the work the instrument judges.
- Never loosen a threshold, budget, glob, or baseline to make in-flight work pass. The same hands in a second commit is the same cheat.
- When the maker escalates an ungated principle (CONST-E7), you build the instrument and land it through your own channel; only then does the maker's work proceed.

## Enrollment

- Enroll over a clean tree only: migrate every live violation first, then enroll at error. A baseline or allowlist of existing violations is suppression with a date on it.
- A rule registered only in its own test harness is not enrolled. Prove carriage by driving the published artifact the way a consumer resolves it.
- `warn` is forbidden: error with a clean tree, or off with the reason named.
- Delete the retired shape from every owner at enrollment. Two conventions standing is the next agent imitating the wrong one.

## Gate economy

- Every gate names the mistake it prevents. A gate that cannot name one does not land.
- Judge gate work by net line delta; subtraction must leave an artifact.
- The enforcement surface is read-only to the agents it governs.

## Corpus

One entry per law in `CONSTITUTION.md`: its frozen handle, the ids it absorbs, the questions a reviewer asks with their criteria, the mechanism rungs that bind it, its severity and waiver, and the failure incidents that justify it. Judging rules bind the reviewer, not the maker. Retired ids name an obligation that was removed, and are never cited.

```yaml
version: 1
laws:
  - law: CONST-D1
    handle: CLOSED-TYPES
    absorbs: [CONST-B5]
    checks:
      - question: "Were the types defined before the behaviour, so that an illegal state does not compile?"
        criteria: "The type checker rejects the illegal state. Starting from functions and adding types after, or a guard for a state the type permits, fails."
      - question: "Technique: does outside data become a domain type only through a decode?"
        criteria: "Bytes, serialized text or a foreign type become a domain type through a decode returning a typed result. An unchecked cast (as, as unknown as, as any) or a suppression comment asserting a shape on outside data fails; command: lint."
    mechanism: [type, command]
    severity: P0
    waiver: "A breach is legal only when the change itself declares it, naming this law and the case; an undeclared breach is P0 (CONST-G3)."
    incidents:
      - "systemfsoftware/systemfsoftware 151b9f4de:packages/effect-daemon-spec/src/internal/with-lock-by-mode.executor.ts:24 (2026-08-15, #166, fix 2d367db70). withLockByMode took a spec and a nullable adapter, so a spec that required the lock, paired with no adapter, ran its body unlocked."
      - "systemfsoftware/systemfsoftware de5414e3a:packages/discern/src/decision.blueprint.ts:461 (2026-09-24, #519, fix 2d4c724ff). classify accepted any `Label extends string` options, so once a string-typed criteria got through, every downstream label check accepted any string."
  - law: CONST-D2
    handle: ERROR-VARIANTS
    absorbs: []
    checks:
      - question: "Does every distinct failure have its own tagged variant?"
        criteria: "Failures are not distinguished by a boolean or string field. Callers branch on the variant tag, never on a field value; command: lint, with review for the branching."
    mechanism: [command]
    severity: P0
    waiver: "A breach is legal only when the change itself declares it, naming this law and the case; an undeclared breach is P0 (CONST-G3)."
    incidents:
      - "systemfsoftware/systemfsoftware 2e8809b55:packages/runner/vitest/src/internal/property/engine.ts:593 (2026-10-06, #650, fix 1f8d87077). An exhausted generator and a real falsification both became one PropertyRefuted built from a fabricated sentinel, so 'never evaluated' read as 'refuted'."
      - "systemfsoftware/systemfsoftware 0c45ffa8c:scripts/tools/publish-and-setup-npm-trust.ts:181 (2026-09-22, #463, fix d8131fa1a). An unreadable registry and a registry with zero trust configs both returned the same empty array, so the bootstrap registered a duplicate publisher the registry rejected with 409."
  - law: CONST-D4
    handle: STATES-AS-UNIONS
    absorbs: []
    checks:
      - question: "Are mutually exclusive states a tagged union, one variant per state carrying only its valid fields?"
        criteria: "A state encoded by which fields are present fails, and wrapping such a field in Option or Maybe renames the hole rather than closing it. The lint flags an optional that correlates with the discriminant, not plain optionals."
      - question: "Is a plain nullable used only for a value absent identically in every state?"
        criteria: "Customer { name, middleName? } is fine. Order { status, shippedAt?, trackingId? } is a state machine hidden in a record."
    mechanism: [command]
    severity: P0
    waiver: "A breach is legal only when the change itself declares it, naming this law and the case; an undeclared breach is P0 (CONST-G3)."
    incidents:
      - "systemfsoftware/systemfsoftware 49b3f7275:packages/testing/mutation/stryker-js/typescript-checker/src/Checker.workflow.ts:64 (2026-09-04, #346, fix 90baa86ab). CheckMutantsDecision encoded 'finished' vs 'retest required' by whether needsRetest was empty, and the shell branched on that field."
      - "systemfsoftware/systemfsoftware eafd889c5:packages/discern/src/Budget.schema.ts:4 (2026-09-25, #547, fix 4a755267a). An absent optional `decisions`/`calls` meant 'no limit', and CaseTrace's optional `reason` was keyed on its status."
  - law: CONST-B1
    handle: EFFECTS-AT-EDGES
    absorbs: [CONST-B2, CONST-B3, CONST-B6, CONST-P1, CONST-P2]
    checks:
      - question: "Is every module split into a pure core of decisions and a thin shell of I/O, with plain serializable data across the seam?"
        criteria: "A boundary object (handler, adapter, middleware) only translates between outside and domain. One that needs its own test suite has logic in it, and the logic moves to the core; review."
      - question: "Are effects returned as lazy values, interpreted once at the edge?"
        criteria: "No eager async result (promise, future, started task) on the public surface; command: lint. Logging, metrics and tracing are decorators on the value, never embedded in a decision."
      - question: "Do reads and writes stay out of the pure steps of a decision?"
        criteria: "No I/O sits between two pure steps. A later read that depends on an earlier decision is pre-fetched, split into a second interaction, or kept openly in the shell, never hidden inside a pure core. A layer that only passes work through, with no read, transform or write, fails. No fixed phase sequence is required: a case may write before it classifies; review."
      - question: "Technique: where one description carries the interaction, do the types carry the phase order?"
        criteria: "Each phase's return type carries the member the next phase's parameter demands, so a wrong order fails to compile; a hand-sequenced order stated in prose decides nothing. A generator body does not preserve order in its type, so the technique does not apply there; type."
      - question: "Technique: is each decision a pure function, data in and a value or typed error out?"
        criteria: "A decision does no I/O, throws nothing, reads no clock and uses no randomness, and returns no effect handle; if it needs the runtime, move the boundary. Command: lint, decisions import no I/O or effect runtime. Purity is judged by return type (CONST-T12's entry)."
      - question: "Technique: does each core decision read as one path?"
        criteria: "Choice is exhaustive dispatch over a closed type, iteration is map or fold; if/else, switch, ternaries, &&/|| for control, and loops do not appear in decision files. Command: lint, cyclomatic complexity 1 on core files. The shell sequences steps and carries no decisions."
    mechanism: [type, command, review]
    severity: P0
    waiver: "A breach is legal only when the change itself declares it, naming this law and the case; an undeclared breach is P0 (CONST-G3)."
    incidents:
      - "systemfsoftware/systemfsoftware 911506389:packages/stryker-js/mutation-run/src/config/resolve-extends.ts:156 (2026-08-17, #195, fix 811f859da). resolveExtendsChain read a file, decided, resolved a specifier and recursed inside one async function, so the effects sat in the middle of the decision."
      - "systemfsoftware/systemfsoftware bda12ddc5:packages/stryker-js/core/src/stryker.ts:47 (2026-08-08, fix 2df51b21e). Core's runMutationTest probed the terminal and wrote phase lines to fd 1 from the middle of the run instead of receiving its sink from the edge."
  - law: CONST-B4
    handle: DEPENDENCIES-INWARD
    absorbs: []
    checks:
      - question: "Do dependencies point inward, with every implementation wired at one composition root?"
        criteria: "The shell imports the core; the core imports no shell, database or framework. Command: import-graph lint."
    mechanism: [command]
    severity: P0
    waiver: "A breach is legal only when the change itself declares it, naming this law and the case; an undeclared breach is P0 (CONST-G3)."
    incidents:
      - "systemfsoftware/systemfsoftware 87ce6a050:packages/stryker-js/cli/src/run-event-stream.adapter.ts:1 (2026-08-16, #173, fix 22fd736ce). The run-event-stream adapter imported NodeStdio and provided it inside itself, below the composition root."
      - "systemfsoftware/systemfsoftware 3d5587876:packages/testing/mutation/stryker-js/platform-node/src/Plugins.ts:14 (2026-09-01, #342, fix 3838c7309). The mutation engine's own modules imported and composed the Node platform layers inline instead of declaring ports bound at the CLI root."
  - law: CONST-N1
    handle: ORGANISED-BY-PURPOSE
    absorbs: [CONST-N2]
    checks:
      - question: "Is code organised by workflow and capability, so that code that changes together lives together?"
        criteria: "One change touches one capability subtree. Organising by what the system has (entities, technical layers) fails; review."
      - question: "Does every file and folder name answer \"of what?\""
        criteria: "Layer names (core, shell), junk drawers (util, service, manager) and a suffix no rule keys on fail. Command: filename lint with allowed suffixes and banned names. A lint that governs only a file's name or placement states no testing requirement and is allowed (CONST-T12)."
    mechanism: [command, review]
    severity: P0
    waiver: "A breach is legal only when the change itself declares it, naming this law and the case; an undeclared breach is P0 (CONST-G3)."
    incidents:
      - "systemfsoftware/systemfsoftware e686ab9b1:pnpm-workspace.yaml:100 (2026-09-05, #357, fix 02c393fcf). Packages were nested into role tiers (core, testing, lint) whose folder names say a layer, not a job."
      - "systemfsoftware/systemfsoftware 01696895c:packages/testing/type-testing/arethetypeswrong/core/package.json:2 (2026-08-23, #241, fix 3d6aa9f9e). The package was named `arethetypeswrong-core`, a layer token, not a capability."
  - law: CONST-N3
    handle: FITS-IN-THE-HEAD
    absorbs: []
    checks:
      - question: "Does each module have one responsibility?"
        criteria: "Fixture difficulty is the decomposition signal: a test that needs elaborate setup means the module holds several responsibilities and is split."
    mechanism: [review]
    severity: P0
    waiver: "A breach is legal only when the change itself declares it, naming this law and the case; an undeclared breach is P0 (CONST-G3)."
    incidents:
      - "systemfsoftware/systemfsoftware 91cefa52c:omp/packages/omp-utils/src/toml-loader.kernel.ts:12 (2026-07-24, fix a7dd87325). One module fused the config declaration, TOML translation, a process-wide cache with a test-only reset, and the file read, so its tests needed a fake file system."
      - "systemfsoftware/systemfsoftware 90baa86ab:packages/lint/oxlint/plugins/meta/core/src/index.ts:86 (2026-09-04, #351, fix ef89c23e7). One plugin package registered 20 rules across five unrelated domains in one module and one mutation cell of about 2,075 mutants that no budget could finish."
  - law: CONST-S1
    handle: ROOT-CAUSE
    absorbs: []
    checks:
      - question: "Does the change name the root cause it fixes?"
        criteria: "A patched symptom, or a boundary bypassed to ship faster, fails. When the design is wrong, the change restructures it."
    mechanism: [review]
    severity: P0
    waiver: "A breach is legal only when the change itself declares it, naming this law and the case; an undeclared breach is P0 (CONST-G3)."
    incidents:
      - "systemfsoftware/systemfsoftware 7a0e98e73:examples/inventory-fulfillment/src/store/ReservationLogDrizzle.ts:88 (2026-09-24, #448, fix b20a70d1d). Every transaction rollback was relabelled a version conflict, so a duplicate-key collision looked like a stock race and retries walked the order into a rollback."
      - "systemfsoftware/systemfsoftware fe16c51ae:.github/workflows/mutation.yml:69 (2026-08-17, fix 7b4e08e24). A fixture that broke the mutation matrix was patched out with a path label instead of selecting by what a target is; when the fixtures moved, five were enrolled, one built to fail."
  - law: CONST-S2
    handle: FIRST-PRINCIPLES
    absorbs: []
    checks:
      - question: "Is every pattern justified by the laws rather than by precedent?"
        criteria: "A choice defended by \"that is how it is done elsewhere\", by the file next to it, or by a prior plan's wording is rejected. Surrounding code is evidence of what exists, never of what is correct; code age grants no immunity."
    mechanism: [review]
    severity: P0
    waiver: "A breach is legal only when the change itself declares it, naming this law and the case; an undeclared breach is P0 (CONST-G3)."
    incidents:
      - "systemfsoftware/systemfsoftware 3d5587876:packages/testing/mutation/stryker-js/platform-node/package.json:2 (2026-09-01, #342, fix 3838c7309). The package carrying the whole mutation engine was named after the runtime, a name a prior plan had written down and later work inherited."
      - "systemfsoftware/systemfsoftware 3488c2eb2:packages/core/effect/daemon-spec/AGENTS.md:49 (2026-09-03, #348, fix b89b52d46). A leaf carried a gate command copied by paraphrase from another file rather than re-derived, and the copy named the wrong task."
  - law: CONST-S4
    handle: SUBTRACT-FIRST
    absorbs: []
    checks:
      - question: "Was removal tried before addition?"
        criteria: "Duplicates are unified, bad states made unrepresentable, a branch deleted instead of guarded. Extending a copy-paste cluster, adding a helper where removing or unifying one does the job, or patching around a rotten core fails. Taste is not rot: \"rotten\" names the invariant the core breaks."
      - question: "What is the net line delta, and does a refactor, improvement or chore that adds lines justify them?"
        criteria: "Review computes the delta from the diff against the merge base of the change and its target branch at the time of review, recomputed whenever the target moves, never from a figure the author supplied. A refactor, improvement or chore that adds net lines states why and names what it deleted; features and their tests are exempt. A fix that leaves a named root violation standing is rejected. A structural rebuild ships a pin on every published path it deletes (CONST-T8)."
      - question: "Technique: does every abstraction the change adds trace to a known requirement?"
        criteria: "Name the requirement or consumer behind each new type, export, module or layer. One built for a hypothetical future consumer fails, and so does an export no consumer uses."
      - question: "Technique: was the outside contract defined first, with use cases, decisions and machinery derived beneath it?"
        criteria: "The published contract exists before the machinery that serves it; machinery with no contract above it fails."
    mechanism: [review]
    severity: P0
    waiver: "A breach is legal only when the change itself declares it, naming this law and the case; an undeclared breach is P0 (CONST-G3)."
    incidents:
      - "systemfsoftware/systemfsoftware 824aa02e8:packages/oxlint-plugins/effect-store/src/rules/cell.ts:6 (2026-08-16, fix 166e6bb65). A suffix-keyed copy-paste rule fleet grew to 100 rules across 21 plugins; effect-store shipped five rules against zero files."
      - "systemfsoftware/systemfsoftware b2ecd0e58:docs/residual-review-findings/attw-dsl-snapshots.md:8 (2026-08-22, #229). Review rejected committed per-recipe snapshot artifacts and a dead parity gate; the merge deleted 119 committed fixture and snapshot files."
  - law: CONST-T8
    handle: PUBLIC-SURFACE
    absorbs: [CONST-T15, CONST-T9, CONST-T14]
    checks:
      - question: "Does every test call a public export, with real inputs and outputs, or a pure decision under mutation?"
        criteria: "Dedicated unit tests for code that only forwards calls fail. I/O code and adapters do not share a mutation run with pure calculation logic. A dependency with only one real implementation is not mocked."
      - question: "Is test investment in order?"
        criteria: "Static analysis first, then properties on the core where the property technique grants them, then composition through the shell, then contracts at the published edge. Each authored test names its observer and its step; no gate on a numeric layer width or a layer-naming table, and no pyramid of helper unit tests."
      - question: "Technique: before a published operation is removed or replaced, are its observables pinned?"
        criteria: "Value, error variant, serialized document and process result are pinned with examples or properties whose expected side is not the implementation under change. While the old operation runs, old and new are compared on the same published inputs until they agree, then old is deleted. Pins call only published names. A mutation or property score is blind to absence and proves nothing about a deleted capability. A persisted gold outlives the old path only when it is externally authored, independently gated and cheap to re-bless."
      - question: "Technique: is a property written only where the published surface cannot reach?"
        criteria: "A property proves a pure decision when a universal over generated input, or a refusal no generated law can express, cannot be reached from the published surface; the type is the generator. Hand-picked example unit tests on the core, and a property for a decision already pinned from above, fail. Each authored property names the universal the surface cannot reach."
    mechanism: [review]
    severity: P0
    waiver: "A breach is legal only when the change itself declares it, naming this law and the case; an undeclared breach is P0 (CONST-G3)."
    incidents:
      - "systemfsoftware/systemfsoftware d8f0d6e75:packages/differential-spec/package.json:14 (2026-09-23, #498, fix 3dde409e9). Tests imported the package's source through a resolve condition, so the published tarball shipped with no dist/ and consumers could not import it."
      - "systemfsoftware/systemfsoftware b83e6425c:packages/arethetypeswrong/cli/src/attw.executor.ts:159 (2026-08-10, fix 7ee1dd2b7). Tests stopped at the handler, so the real binary silently dropped every entrypoints flag and reported no entrypoints with exit 0."
  - law: CONST-T10
    handle: INDEPENDENT-ORACLE
    absorbs: []
    checks:
      - question: "Does every assertion have an oracle the code under test did not produce?"
        criteria: "A spec literal, a fixture not generated by importing the module, a law relating two views of one value, or a second implementation. An expected value computed or recorded by running the code under test, or any build or version of it, fails; collaborator call graphs are not asserted."
      - question: "Does a hand-written refusal stand beside generated round-trip laws at every specifiable refusal boundary?"
        criteria: "Generated accept-laws cover what the type accepts and nothing it should reject, so widening a refinement leaves them green. Sabotage after green: break one core law and one published field; at least one test goes red."
    mechanism: [review]
    severity: P0
    waiver: "A breach is legal only when the change itself declares it, naming this law and the case; an undeclared breach is P0 (CONST-G3)."
    incidents:
      - "systemfsoftware/systemfsoftware 12b663a48:packages/effect-schema-law/__tests__/bounded-union.snapshot.test.ts:141 (2026-08-05, fix 1c9e79034). A snapshot recorded 500 nesting depths sampled from the code's own generator under a fixed seed."
      - "systemfsoftware/systemfsoftware 68d123e53:packages/testing/type-testing/arethetypeswrong/core/tests/snapshots.integration.test.ts:54 (2026-08-22, #229). Each per-recipe snapshot stored the analysis output of the code under test; review at b2ecd0e5:docs/residual-review-findings/attw-dsl-snapshots.md:8 rejected the snapshots as self-satisfying."
  - law: CONST-T3
    handle: TESTS-CAN-FAIL
    absorbs: [CONST-T13]
    checks:
      - question: "Is a named, change-relevant mutated set gated at a perfect kill score?"
        criteria: "The set names the behaviour it covers, and its scope is a cost decision. Suppression comments, narrowing the set after the fact, lowering the gate, and an empty set fail; a raw mutation percentage is never compared across changes or codebases. A survivor is killed with a sharper property or by deleting the dead branch it exploits. Command: mutation gate, break 100."
      - question: "Does every authored property file defend something the rest of the suite does not?"
        criteria: "A run whose mutants all died fails when an authored property file defends nothing else. The opt-out is in the mutation config, never by deleting the named file, and a file that covered an unattributed kill is not accused. The verdict is part of the same run as the score."
    mechanism: [command]
    severity: P0
    waiver: "A breach is legal only when the change itself declares it, naming this law and the case; an undeclared breach is P0 (CONST-G3)."
    incidents:
      - "systemfsoftware/systemfsoftware cca5f66e8:packages/hex-schema/src/hex-string.schema.ts:12 (2026-07-31, fix b5cf2e1d2). The round-trip laws drew inputs from a generator mirroring the pattern under test, so every widening of the pattern survived."
      - "systemfsoftware/systemfsoftware 0b48aea4e:packages/effect-daemon-spec/stryker.config.json:28 (2026-08-05, fix beb24866d). effect-daemon-spec's tests killed no mutant attributed to any test, under a break of 0, so the run scored 33.33 and exited 0; review at a914e31e:docs/residual-review-findings/test-contribution-gate.md:146 recorded it."
  - law: CONST-T12
    handle: TEST-OBLIGATION
    absorbs: [CONST-P3]
    checks:
      - question: "Is what applies to code decided from what the code imports and calls, never from its folder, name or extension?"
        criteria: "No rule, runner, project split or tool chooses the requirement, harness or suite that governs a test from its folder or from any part of its name beyond the generic test-file ending the runner uses to discover tests; that ending decides only that the file runs. Each requirement resolves from the test's imports and calls. A lint that governs only a file's name or placement, against an allowed list or against the file's imports, states no testing requirement and is allowed. Command: lint."
      - question: "Technique: is purity judged by return type alone?"
        criteria: "Pure or effectful is read from the return type, never inferred from a folder, a package, or \"library versus application\"."
    mechanism: [command]
    severity: P0
    waiver: "A breach is legal only when the change itself declares it, naming this law and the case; an undeclared breach is P0 (CONST-G3)."
    incidents:
      - "systemfsoftware/systemfsoftware fe16c51ae:.github/workflows/mutation.yml:69 (2026-08-17, fix 7b4e08e24). Mutation targets were chosen by a path label; when fixtures moved, the label stopped matching and five fixture configs were enrolled, one built to fail."
      - "systemfsoftware/systemfsoftware 824aa02e8:packages/oxlint-plugins/effect-kernel/src/rules/kernel-no-effect-runtime.ts:8 (2026-08-16, fix 166e6bb65). A purity rule applied only to files named *.kernel.ts, so a byte-identical file with another name escaped it."
  - law: CONST-W1
    handle: FULL-SCOPE
    absorbs: []
    checks:
      - question: "Does the delivered scope match the accepted scope?"
        criteria: "Scope is reduced mid-task only with the author's consent; a reduction because the work grew complex fails."
    mechanism: [review]
    severity: P0
    waiver: "A breach is legal only when the change itself declares it, naming this law and the case; an undeclared breach is P0 (CONST-G3)."
    incidents:
      - "systemfsoftware/systemfsoftware 6851d0d4d:docs/plans/2026-09-26-2001-refactor-workflow-only-mutation-plan.md:20 (2026-09-26, #559). Offered to shrink the accepted enrollment by unenrolling ten packages (named at :37-38 of the same file: effect-atom, four effect-daemon media, five oxlint-plugin rule packages); the requester refused."
      - "systemfsoftware/constitution 26a527c07:docs/plans/2026-09-01-0533-retire-the-ttsr-plugin-entirely-plan.md:16 (2026-09-01, #21). The restore kept the plugin alive in reduced form (three rule files and constitution-conduct-review.md); the requester rejected the reduced delivery and required the full removal."
  - law: CONST-E7
    handle: EVIDENCE-NOT-SELF-GRADING
    absorbs: [CONST-E9]
    checks:
      - question: "Does \"done\" name the gate that passed or the test that ran?"
        criteria: "A reported score, a claimed \"it works\", or a report of a gate or test is not the gate or test itself."
      - question: "Do the graded change and any judgment-surface change name different owners?"
        criteria: "Lint configs, rule lists, thresholds, baselines, CI checks, validator scripts, rubrics, coverage floors and review criteria are read-only to the work they grade, whether or not the maker believes they grade this task. Building the gate the work will be graded by, or shaping one so the current work passes, fails, including in a separate commit by the same hands. A needed gate is a proposal to its owner, and the work waits for it."
    mechanism: [review]
    severity: P0
    waiver: "A breach is legal only when the change itself declares it, naming this law and the case; an undeclared breach is P0 (CONST-G3)."
    incidents:
      - "systemfsoftware/constitution 26a527c07:scripts/validate-constitution.ts:38 (2026-09-01, #21). The commit that merged the corpus also flipped the gate that grades it; d311127:docs/plans/2026-09-07-1721-the-maker-never-holds-the-instrument-plan.md:29 recorded it as the violation."
      - "systemfsoftware/systemfsoftware a914e31e7:docs/residual-review-findings/test-contribution-gate.md:31 (2026-08-04). The gate replacement moved the grading script from top-level scripts/ into packages/stryker-plugins/src/test-contribution/, a neutrally named folder of an editable package; review flagged it as lock relocation."
      - "systemfsoftware/systemfsoftware ee74d0b96:docs/residual-review-findings/fix-referenced-project-typecheck.md:45 (2026-08-04). Root guards were relied on to protect main, but five of six never ran in CI because .github/workflows/reusable-checks.yml invoked none of them."
      - "systemfsoftware/systemfsoftware aa1bb6286:packages/core/effect/schema/law/AGENTS.md:15 (2026-08-24, #246, fix 9372ca05a). The package doctrine cited a test command's exit 0 as evidence while the package held zero tests; the empty suite passed."
judging:
  - id: CONST-G3
    handle: P0-VERDICT
    rule: "Every undeclared violation of the constitution found in review is an automatic P0: the change is rejected with no appeal and no downgrade to advisory, P1, P2 or non-blocking. The only legal waiver is a declaration in the change itself, naming the law and the case; a promise of follow-up repair or an expedience plea is not one. A review that waives or downgrades an undeclared violation is rejected."
  - id: CONST-G4
    handle: PURPOSE-READING
    rule: "Invoke a law by showing its harm is present, never by quoting a clause or asking which clause to cite. Where letter and purpose diverge, purpose governs: ask whether the harm occurs here."
  - id: CONST-G5
    handle: SUPREMACY
    rule: "The constitution governs AGENTS.md, lint and ADRs on what a rule should say, where they conflict. On whether a rule held for a specific change, the gate is the final word; a disagreement goes to the channel that owns the instrument, never resolved by the maker editing or overriding the gate. Contestable choices (suffixes, patterns, module shape) live in ADRs, not in the constitution."
retired:
  - id: CONST-D3
    reason: "Obligation removed: no failure was found where a bare primitive stood in for a domain value, and a law stands only on two failure incidents."
  - id: CONST-W2
    reason: "Obligation removed: no failure was found where a large or irreversible choice went unchallenged, and a law stands only on two failure incidents."
  - id: CONST-S3
    reason: "Obligation removed: cut at gate 3, where a blind review found both failure incidents back only \"model only what a known requirement needs\", never \"define the outside contract first\". Its guidance stays as technique checks under SUBTRACT-FIRST (CONST-S4)."
  - id: CONST-W3
    reason: "Obligation removed: one failure incident only, and a law stands on two. The reviewer-side waiver for a declared breach stays in P0-VERDICT (CONST-G3)."
```
