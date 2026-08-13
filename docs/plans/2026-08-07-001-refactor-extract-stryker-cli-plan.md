---
title: Extract the Stryker CLI into its own Effect package - Plan
type: refactor
date: 2026-08-07
topic: extract-stryker-cli
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Extract the Stryker CLI into its own Effect package - Plan

## Goal Capsule

- **Objective:** Move the `stryker` CLI out of `@systemfsoftware/stryker-js-core` into a new published package `@systemfsoftware/stryker-js-cli` that owns the bin and the interpretation edge, leaving core's published entry inert on import. Replace core's module-state presentation layer with a run-event sink that the CLI assembles into an Effect `Stream`, so all terminal, mode, colour, timing, and framing concerns leave the library. Route the moved code through the `effect-dmmf` cell taxonomy, enrol the package in the architecture rule bundle, and replace every mock-based CLI test with contract tests that install the real packed tarball and run the real binary.
- **Product authority:** User, this session (2026-08-07), who directed that the presentation redesign be folded into this plan rather than deferred, and that process-level behavior be proved by running a real process rather than by spying on one.
- **Authority hierarchy:** `CONSTITUTION.md` governs; `AGENTS.md` governs below it; this plan governs below both. Where this plan and a gate disagree, the gate wins and this plan is corrected.
- **Execution profile:** Three pull requests, in order. **PR-0** lands the contract harness and characterization suite against today's in-core bin. **PR-A** replaces core's presentation layer with a sink and retires every mock-based spec that layer made possible. **PR-B** performs the extraction and closes with the Evaluator commit. Thirteen units.
- **Open blockers:** None.
- **Stop conditions:** Halt and raise an architecture finding at any relocation whose mechanical tripwire (KTD3) fails, or any cell-routing question that cannot be answered without widening a `mutate` glob, inventing an error variant, or adding a lint suppression. Halt also on any attempt to satisfy a process-level requirement (R33) with a double instead of a process.
- **Tail ownership:** Ends at a green root `pnpm check` plus a green contract lane. Publishing is human-controlled (REPO-P1).

---

## The Halt

**The extraction's original move set cannot be done, and the reason is the finding. The extraction itself can.**

The first draft assumed six modules were CLI-owned and would move out with the CLI. Four of the six are load-bearing inside core's own retained runtime:

- `output-mode.ts` <- `stryker.ts`:8 (`detectMode`, `isColorEnabled`), `reporters/broadcast-reporter.ts`:9, `reporters/mutation-test-report-helper.ts`:15
- `progress-stream.ts` <- `stryker.ts`:17 (`emitPhase`), `reporters/mutation-test-report-helper.ts`:16, `reporters/progress-stream-reporter.ts`:4
- `reporters/verdict-envelope.ts` <- `reporters/mutation-test-report-helper.ts`:21
- `config/fork-schema.ts` <- `config/options-validator.ts`:18, `process/1-prepare-executor.ts`:6

`stryker.ts` is the `Stryker` class - core's programmatic API, which stays. Moving `output-mode.ts` would leave it unresolvable, and the only repair would be core importing from the CLI package. But the CLI already imports `Stryker` from core (`stryker-cli.ts`:50). That is a workspace cycle, and `turbo.json`'s `build` task orders by `dependsOn: ["^build"]`, which cannot order a cycle. The repo would not build.

Duplicating the four modules into both packages is not forbidden by anything in the original plan, and it is the worst available outcome: two copies of the output path diverging silently, with the contract lane watching only one of them.

**What the entanglement actually says.** Three of the four are not config; they are _presentation_. `detectMode()` reads `process.stdout.isTTY`; `emitPhase()` does a synchronous `writeSync` to fd 1. Both are shell. Core's pipeline calls them from `stryker.ts`:8,17, `broadcast-reporter.ts`:9, and `mutation-test-report-helper.ts`:15,16,21 - so **core calls shell today**, which the Dependency Rule forbids: the shell may call the core, the core may not call the shell and is unaware the shell exists.

That warrant is real, and it is deliberately not the warrant the first draft gave. The first draft argued that "a library that computes mutation scores is deciding how its caller's terminal should look" - an inference from what the package _is_, library versus application. `CONSTITUTION.md` II.6 forbids exactly that inference: purity is judged per function by return type alone, never from a folder, a package, or "library versus application". The conclusion survives; the reasoning that reached it does not.

**But direction is not the whole defect, and fixing only direction would have shipped the defect behind an interface.** An earlier revision proposed a nine-method presentation port: mode interrogation, four emit methods, progress recording, run-id access, plus an inert default binding. Look at what that port would have wrapped. `progress-stream.ts` holds five module-level mutable bindings (`config`:177, `progress`:180, `heartbeat`:183, `terminalWritten`:190, `runId`:193), a `setInterval` heartbeat, a `terminalWritten` boolean that refuses every line after the first terminal one, and a `resetStream()` whose own docstring at :359-363 calls it a "test seam". `isStreamEnabled()` is `config !== null && !terminalWritten` - state by presence, which `CONSTITUTION.md` I.5 names as a defect outright.

The module documents its own escape from supervision. `writeLine`'s comment at :201-207 explains that a consumer closing the pipe early makes the write throw EPIPE "from the unref'd heartbeat timer, **outside the Effect fiber, so nothing would catch it**", so the error is swallowed by hand and two module bindings are set to mark the stream permanently dead.

A port over that surface is a port over a singleton. The arrow flips and every one of those defects survives, now behind an interface that `port-public-iff-consumer-binds` makes **published surface** the moment the CLI binds it. `CONSTITUTION.md` V.4 forbids speculative structure and V.7 answers with subtraction. So the nine-method port is withdrawn.

**The replacement is strictly smaller than the port.** Core stops owning presentation and starts emitting data:

- The four emit methods collapse into **one** tagged-union event pushed to a sink.
- The three mode methods leave core entirely. All five core callsites (`stryker.ts`:47-53, `broadcast-reporter.ts`:45-47, `mutation-test-report-helper.ts`:71) use mode to decide presentation - which fd logs go to, whether a progress bar renders, how a report prints. None is a mutation-computation decision. They become plain values supplied inward.
- `streamRunId` becomes a field on the header event. `recordProgress` becomes a fold at the consumer.

Nine methods become one sink function plus three passed-in values. Nothing crossing the seam is behaviour; it is data and one dependency the consumer binds, which is `CONSTITUTION.md` II.1 exactly.

**Consequence:** PR-A is scheduled ahead of the extraction. It is no longer elective, because the extraction now depends on it: the CLI cannot own the terminal until core stops writing to it. The fourth entangled module, `config/fork-schema.ts`, is not entangled at all - it is core config validation, was misclassified, and stays.

---

## Problem Frame

`packages/stryker-js/core/src/stryker-cli.ts` is 1041 lines and holds the whole CLI. It reaches the outside world through the package's published entry:

- `packages/stryker-js/core/src/index.ts`:2 imports `./stryker-cli.js`, and :5 re-exports `runStrykerCli`.
- `packages/stryker-js/core/src/stryker-cli.ts`:3 calls `guardMinimalNodeVersion()` at module top level, and that function throws on a version mismatch (`stryker-cli.ts`:1032-1040).
- The built artifact carries it: `dist/index.mjs`:4392 is a bare top-level `guardMinimalNodeVersion();`.

So `import '@systemfsoftware/stryker-js-core'` - the programmatic path to the `Stryker` class - executes a process-version check and can throw at import. The published entry is not inert. Separately, `runStrykerCli` executes `cliLayer`, the runtime main, and `process.exit` (`stryker-cli.ts`:1005-1009), and it is a declared export.

Two settled rulings name this directly. `inert-composition-value` rules that a package may publish adapter bindings only as inert, lazy values that construct a description and execute nothing, and that any published value whose import performs an observable effect is a hidden composition root. `rootless-interpretation-edge` atom A13 requires a library's interpretation edge to be genuinely absent and supplied per consuming process, not hidden or relocated inside the package.

**The second problem is that core owns a terminal.** `progress-stream.ts` is not Effect-aware at all - it imports `writeSync` from `node:fs` and nothing from `effect`. Measured on this repo, only three files under `packages/stryker-js/core/src/` touch the Effect runtime: `stryker-cli.ts` (leaving), `llms-manifest.ts` (a type-only `@effect/cli/Command` import, leaving), and `output-mode.ts`. Core's pipeline - `stryker.ts`, the reporters, the executor chain - is upstream-shaped promise-and-injector code with no Effect in it. So the presentation layer is a hand-rolled singleton sitting inside a library, and the library's own comment records that its timer runs outside the only fiber that could supervise it.

**The third problem is the test suite, and it is the reason the contract lane exists.** Eight files cover the CLI, and seven of them replace at least one of the three things that _are_ the CLI's contract - the eighth, `output-mode.spec.ts`, mocks nothing and is a pure-function spec:

- `vi.mock('node:fs')` substitutes `writeSync`, the only writer of the NDJSON stream and the error envelope, in **seven** files (`cli-options.spec.ts`:25, `error-envelope.spec.ts`:23, `llms-manifest.spec.ts`:20, `progress-stream.spec.ts`:36, `removed-surface.spec.ts`:29, `survivors.spec.ts`:30, `verdict-envelope.spec.ts`:27).
- `process.exit` is spied to a no-op in three files, and the asserted "exit code" is read back out of the fake: `const exitCode = exitMock.mock.calls[0]?.[0]` (`removed-surface.spec.ts`:230).
- `console.log` and `console.error` are silenced in four files (`cli-options.spec.ts`:55-56).
- The clock is faked to test real timers, in **six** blocks: `progress-stream.spec.ts`:210, :226, :259, :289, :360, :380 call `vi.useFakeTimers()`, advanced at :215, :231-232, :265, :294, :370, :388, with `vi.useRealTimers()` at :129. What that proves is that the fake advanced.
- The sharpest pair is :359-390, which tests **EPIPE**: `writeSync` is mocked to throw it, the clock is faked to fire the heartbeat, `clearInterval` is spied on the global at :381, and the assertion is that `clearInterval` ran. A reader closing a pipe under a live writer is simulated end to end by doubles - there is no pipe, no reader, and no writer in the test.

`error-envelope.spec.ts`:16-17 comments that `writeSync` is used so `process.exit` cannot drop the write, then mocks both - the one property the comment names is the one property the test cannot observe. A no-op `process.exit` also lets execution continue past the point a real process dies, so write-after-exit, unflushed streams, hangs, and a nonzero exit that never fires are all invisible. Nothing in the repo executes the real `bin/stryker.js` as a process.

This is one defect with one shape: **a process was replaced by a description of a process.** Exit status, bytes arriving on a real descriptor, a timer firing in real time, a pipe closing under the writer, a signal arriving mid-run - none of these has an in-process double that can be wrong in the same way the real thing can. R33 states the rule this plan follows and KTD4 states why containers are the venue.

**Measured at plan time: the mock surface is wider than eight files, and it is wider in a way that fixes a scheduling error.** Six of the eight specs bind the `progress-stream`/`output-mode` module API that PR-A deletes - `error-envelope`, `llms-manifest`, `output-mode`, `progress-stream`, `survivors`, `verdict-envelope` - and so does a ninth file this plan previously deferred as untouched. `log-sink.spec.ts` builds a frozen contract double of the **entire** `progress-stream` module in a `vi.hoisted` block at :23-51 - `configureStream`, `streamRunId`, `isStreamEnabled`, `emitPhase`, `recordProgress`, `emitTerminal`, `resetStream` - registers it with `vi.mock('../../src/progress-stream.js')` at :53, and proves phase ordering through `streamMocks.emitPhase.mock.invocationCallOrder` (:234-238, :246) and a `__state.emittedPhases` array the double maintains (:228, :245, :257). The other two, `cli-options.spec.ts` and `removed-surface.spec.ts`, touch neither module's API and instead read the run's stdout out of `fsMocks.writeSync.mock.calls` filtered on fd 1 (`cli-options.spec.ts`:237-239, `removed-surface.spec.ts`:231-233). PR-A stops routing that stdout through `writeSync`, so both arrays go empty and both files fail on a positive count - `expect(stdoutLines.length).toBeGreaterThanOrEqual(2)` at `cli-options.spec.ts`:240 and `expect(stdoutLines).toHaveLength(2)` at `removed-surface.spec.ts`:235. **All nine files therefore break in PR-A**, which is what the consequence in KTD10 rests on.

---

## Key Technical Decisions

### KTD1. The moved code is transport, and the taxonomy already has cells for all of it

| Code                                                                            | Cell       | Basis                                                                           |
| ------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| `resolveCliExitCode`, `remediationFor`, `buildErrorEnvelope`                    | `handler`  | Error-to-transport-status mapping is `architect-handler` HD3's stated job       |
| commander-characterization arg parsers (tri-state flags, `parseCleanDirOption`) | `acl`      | Unidirectional foreign-to-domain translation: argv strings into typed values    |
| `isMutationTestResultShape`                                                     | `acl`      | A decode of a foreign report shape                                              |
| `sourceContentHashesOf`                                                         | not kernel | `stryker-cli.ts`:483 calls `readSourceFile`, which calls `readFileSync` at :460 |
| `survivorMutateSpans` / `admitSurvivorsRun`                                     | open       | `workflow` only if a real error channel exists, else `kernel` - resolved in U6  |

### KTD2. The mutation gate is the wrong observer here, and there is no other hard gate in the repo today

`handler`, `acl`, and `adapter` are all on the `guard-mutate-scope.mjs` `FORBIDDEN` list, and the script's own header states why: a shell cell decides nothing, so every mutant is equivalent or is killed by a composition test that was proving something else. A CLI is shell. The new package gets a `stryker.config.json` if and only if U6 lands genuine `*.workflow.ts` or `*.schema.ts` content, and not on workflow content alone.

### KTD3. Misfit protocol - now with a mechanical tripwire

The `AGENTS.md` Editable rule forbids weakening a rule, threshold, budget, or glob to make the current change pass, and requires any loosening to carry its own commit and its own reason. The original protocol named three halt triggers - widening a `mutate` glob, inventing an error variant, adding a suppression - and all three are _evasion_ triggers. None would have fired on the defect in "The Halt", which is why that defect reached a written plan.

So the protocol carries a mechanical tripwire. Before relocating any module out of a package, assert that every remaining importer in the source package is itself moving in the same unit. Run the repo's `grep` tool - shell `grep`/`rg` are blocked in this harness - with this pattern, scoped to the source package's `src`:

```
pattern: from '\.\.?/(.*/)?<mod>\.js'
path: packages/stryker-js/core/src
```

`<mod>` is the module basename, e.g. `output-mode`. The predicate is **not** "zero hits"; the CLI imports every module in the move set, so a raw zero-hit rule would false-positive on all of them. Subtract the files moving in the same unit; any importer that survives that subtraction is a halt. A `import type` hit is erased at runtime and creates no cycle, so it may be resolved by relocating the type declaration rather than by halting.

Verified against this repo on 2026-08-07, which is what makes the tripwire a rule rather than a suggestion (USER-V4): `output-mode` returns six hits, five outside the move set (`stryker.ts`:8, `broadcast-reporter.ts`:9, `mutation-test-report-helper.ts`:15, plus two type-only) - a halt, correctly. `llms-manifest` returns one hit, `stryker-cli.ts`:30, which is itself moving - clean, correctly.

The scan is static, so it cannot see a dynamic `import()` keyed by a plugin name string. That gap is named in Open Questions and closed in U4 before the deletions land.

A surviving importer is a halt, not a signal to duplicate. **Duplicating a module into both packages is prohibited outright** - it produces two copies of one behavior with the contract suite watching only one. On a halt: produce an architecture finding naming the code, the cell or package it wants, and the rule that refuses it. Resolve it in its own PR ahead of the work.

### KTD4. The contract lane runs a real process in a container, because the properties at stake have no honest double

Two reasons, and the second is the stronger one.

**Packaging.** Spawning `bin/stryker.js` from the repo resolves dependencies through the workspace symlink farm and never exercises the tarball, so it cannot observe a missing `dependencies` entry, the `exports` map, installed bin resolution, or a pinned Node. The Node-version guard needs a Node the host does not have.

**Process semantics.** Exit status, bytes on a real file descriptor, a timer firing in real time, backpressure and drain, a pipe closing under the writer, and a signal arriving mid-run are properties of a process. Substituting `process.exit`, `writeSync`, `process.stdout.write`, or the clock does not weaken the test - it removes the subject. `removed-surface.spec.ts`:230 reads its "exit code" out of the spy that replaced the exit; `error-envelope.spec.ts`:16-17 names the write-survives-exit property and mocks both halves of it; `progress-stream.spec.ts`:210-215 advances a fake clock and concludes the heartbeat works; :359-390 tests EPIPE with a mocked `writeSync` that throws, a fake clock, and a spy on global `clearInterval`. Each passes while observing nothing, and the last is the clearest: every participant in a broken-pipe scenario - the pipe, the reader, the writer, and the clock - has been replaced by a description of itself. A container costs 0.5-11 seconds per case, and one deliberately slow case costs about 15 (U2). That is the price of the only venue where these properties exist.

This is why R33 routes every process-level requirement to the lane by category rather than case by case, and why the lane fails loudly rather than skipping when no runtime is reachable.

### KTD5. The contract lane is a separate lane, not part of `test`

Core's `vitest.config.ts`:7 sets `include: ['test/**/*.spec.ts']`. A file at `__tests__/*.integration.test.ts` matches neither clause, so it would be silently discovered as zero tests and report green - the same false green this plan exists to remove, one layer deeper. The lane gets its own config, its own script, and its own `check:ci` step.

### KTD6. Core is not decomposed into cells; its presentation layer is replaced, not ported

Core keeps its upstream-shaped promise-and-injector code, its `Stryker` class, and its cell-free structure. It is not pulled into the cell taxonomy. The single change is that core stops owning a terminal: it accepts a sink and pushes typed events into it. That is a replacement at one named seam, not a decomposition.

**Core does not return a `Stream`, and this is the decision that keeps PR-A small.** A `Stream`-producing core would have to become Effect-native through `stryker.ts`, every reporter, and the executor chain - a migration this plan does not authorize and KTD6 forbids. Instead the sink is a plain synchronous function, `(event: RunEvent) => void`, and the **CLI** wraps it: `Stream.asyncPush`'s register callback runs at the CLI's composition root and hands the push function inward. Core's promise code calls it with no Effect knowledge at the callsite.

The sink is provided through core's **existing** `coreTokens` injector, not through an Effect `Layer`. That honors KTD6 precisely, and it retires a named failure mode from the withdrawn port design: there is no per-run child `Layer` that could shadow the CLI's binding, because core's side of the seam has no `Layer` in it.

### KTD7. Consumers ADD the CLI package; they never drop core

All 23 `stryker.config.json` files in the repo extend `@systemfsoftware/stryker-js-core/config/base`, which core publishes as a subpath. Under pnpm's strict layout a bare specifier resolves against a package's own direct dependencies, so removing core from a consumer's `devDependencies` would break config resolution even though the bin still works. Exact counts: 22 packages run `stryker run`; core runs `node ./bin/stryker.js run`; 23 declare core; all 23 configs extend `config/base`.

### KTD8. The exemption narrowing lands in PR-B, as its own commit

`scripts/check-lint-coverage.mjs` exempts `packages/stryker-js/` by path prefix, so a new package at `packages/stryker-js/cli/` inherits the exemption and its enrolment would be unenforced - a later commit could delete `extends: [base]` and no gate would notice. Narrowing that prefix edits an Evaluator surface, so it is its own commit with the gate observed red before and green after.

### KTD9. `Stream` is the right primitive, and `Terminal.display` is the wrong surface

Two real streaming CLIs, examined independently, land the same architecture, and neither has anything resembling a presentation port.

**omp** gives its engine no presentation vocabulary at all. `AgentSession` emits a typed `AgentSessionEvent` union through `#emit` (`agent-session.ts`:1898-1918) and every consumer calls `subscribe` (:3483-3490): the interactive TUI controller, the print/JSON line writer, the RPC frame encoder. The engine carries no `isTTY`, no colour, no phase strings, and no fd writes. Output mode is an explicit `--mode` flag (`cli/args.ts`:23, `cli/flag-tables.ts`:124), never a probe of the terminal; TTY and `COLORTERM` decide only byte-level colour capability (`terminal-capabilities.ts`:501-529). The final record is guaranteed by an ordered stdout writer whose tail is awaited before teardown: `writeStdoutLine` chains each write on the previous one's completion callback (`print-mode.ts`:175-191) and `await stdoutTail` runs before `session.dispose()` (:308-309), explicitly fixing a truncation class where a large final event is dropped when the process exits before the pipe drains.

**opencode** does the same, Effect-natively: core publishes typed domain events into a `PubSub` (`packages/core/src/event.ts`), the transport wraps that bus with a `Queue.dropping(256)` subscriber and a 15-second heartbeat (`packages/server/src/handlers/event.ts`), and consumers subscribe. Core is render-agnostic; every TTY check lives in the CLI or TUI. Termination is signalled by a **domain event in the stream** (`session.status:idle`, `session/status.ts`:39-45) that the consumer loop breaks on (`run.ts`:785-793) - not by EOF and not by a flush hack. Stryker already has that event; it is the `verdict` line. Its `terminalWritten` boolean is that idea implemented as mutable state.

Three consequences, each cited to the installed dependency tree (`effect@3.22.1`, `@effect/platform@0.97.1`, `@effect/platform-node@0.97.1`, `@effect/platform-node-shared@0.50.1`, `@effect/cli@0.77.0`):

1. **No inert default is needed, and none is created.** A consumer that does not exist simply does not subscribe. The withdrawn port needed a no-op default precisely because an unbound site had to compile, and that default permitted the bug it was meant to prevent. Absence of a sink is the off switch.
2. **NDJSON goes through a `Sink`, not `Terminal.display`.** `Terminal.display` takes a whole string, appends no newline, and is the interactive prompting surface - `@effect/cli` 0.77.0's own `Prompt` uses it that way (`internal/prompt.ts`:177-178). The platform ships `NodeSink.stdout: Sink<void, string | Uint8Array, never, PlatformError>` (`NodeSink.ts`:42-68), which writes item by item and waits on `"drain"` when `writable.write` returns false. Line framing is ours: map to JSON, `Stream.intersperse("\n")`, then run the sink.
3. **`Terminal.isTTY` is a trap and must not be used.** The `Terminal` interface declares `columns`, `rows`, and `isTTY` (`@effect/platform/src/Terminal.ts`:20-45), but the Node implementation returns only `{columns, readInput, readLine, display}` - verified in compiled `dist/cjs/internal/terminal.js`:77-82. It type-checks and is absent at runtime. Mode resolution reads `process.stdout.isTTY` once at the CLI edge instead.

`Stream.asyncPush` (since 3.6.0) is the producer constructor that fits: its emit operations are synchronous and return a boolean reporting whether the value was taken, so a promise-based caller can push without suspending. Buffer strategy is explicit - `Stream.async` defaults to `Queue.bounded(16)` with suspend semantics, while `asyncPush` defaults to an unbounded mailbox (`internal/stream.ts`:466-483, 600-633). `Stream.asyncInterrupt` does not exist in 3.22.1 and must not be cited.

### KTD10. PR-A retires the mock suite, because PR-A is what invalidates it

The Problem Frame's measurement forces a schedule change. Six of the eight CLI specs import the module API PR-A deletes, `log-sink.spec.ts` substitutes that module wholesale, and the remaining two read the run's stdout out of a `writeSync` mock PR-A stops using, so their stdout arrays go empty and they fail on a positive count. Nine files, all red, none of them for a defect in the product.

There are three candidate responses and two are inadmissible. Keeping a `resetStream`/`configureStream` shim so the doomed specs still compile is dead scaffolding whose only consumer is a test that is about to be deleted. Repairing the two remaining specs in place is the second, and it is inadmissible for a subtler reason worth stating, because it is the trap an implementer falls into when the instruction is "fix the tests rather than delete them". Both break on a **positive** count over an abandoned channel, which is loud. But the same files carry **negative** assertions over that channel - `removed-surface.spec.ts`:244-246 asserts that no fd-2 write occurred - and a negative assertion over a channel nobody writes to any more is trivially, permanently true. Here it is shadowed by the earlier failure at :235 and never runs. A repair that fixes the loud positive assertion while keeping the negative one restores a green test whose remaining guarantee is vacuous. Deletion is the only response that removes both halves.

So **all eight CLI specs are deleted in PR-A, and `log-sink.spec.ts` is rewired in PR-A.** The previous plan's U10 is retired as a separate unit; its work is U14. R22's ordering constraint is still satisfied, because PR-0's contract lane lands and goes green before PR-A begins - the net exists before the mocks come out.

This tightens a requirement rather than loosening one. The withdrawn plan conceded that the write-spy count could reach only 1, because `log-sink.spec.ts` mocks `process.stderr.write` and `process.stdout.write` to test core-owned `LoggingBackend` and was out of scope. It is now in scope, and both halves improve: its phase-ordering assertions bind the recording sink instead of substituting a module, and its `LoggingBackend` assertions take an in-memory `Writable`, which is the seam `NodeSink.fromWritable` already exposes. All four searches in R25 now reach zero.

---

## Requirements

**Presentation replacement (PR-A)**

- R1. No file in core imports a presentation module. Core's pipeline pushes typed run events into a sink it receives through `coreTokens`, and reads no terminal state.
- R2. There is no inert default binding and no no-op port object. An absent sink means no emission, because nothing subscribes (KTD9).
- R3. PR-A changes no observable CLI behavior. The PR-0 contract lane's **normalized** stdout comparison (R23) is identical across it, per stream, and the stream keeps its line kinds, ordering, field structure, 10-second heartbeat cadence, and terminal-line-last guarantee.
- R26. `progress-stream.ts`'s five module-level mutable bindings (`config`:177, `progress`:180, `heartbeat`:183, `terminalWritten`:190, `runId`:193), its `setInterval` heartbeat, its `terminalWritten` guard, and its `resetStream()` test seam (:359-363) are **deleted**, not relocated. No module-level mutable state survives in the replacement.
- R27. No core file reads `process.stdout.isTTY`, `process.env['STRYKER_MODE']`, or `NO_COLOR`. Mode is resolved once at the CLI edge and passed inward as data: whether progress renders, whether colour is enabled, and which writable receives logs. `stryker.ts`:48 stops choosing between `process.stderr` and `process.stdout` and receives the writable instead.
- R28. The heartbeat is a time-driven stream merged into the event stream inside the Effect fiber. No `setInterval` survives, and no write happens outside fiber supervision. The exact merge combinator is confirmed against `effect@3.22.1` at implementation; `Stream.asyncInterrupt` does not exist in that version and must not be used (KTD9).
- R29. The buffer strategy for the event stream is chosen explicitly with a stated reason, not inherited from a default. `Stream.async` defaults to bounded-16 suspend and `asyncPush` to an unbounded mailbox; a mutation run emits per-mutant events, so the choice is load-bearing and is recorded in the code.
- R30. The process does not exit before the stdout sink drains. The terminal line is written by a finalizer that runs on success, on error, and on interruption - not only on the success path.
- R31. A write failure on a closed pipe does not replace the run's classed exit code. Under the sink a failed write surfaces as a typed error in the stream's error channel and must be mapped to the classed exit, not allowed to become exit 1. **The exit status must be captured from the producer, not from the pipeline.** A bare `sh -c 'stryker run | head -5'` reports `head`'s status and never stryker's - verified 2026-08-07: a pipeline whose producer exits 42 into `head -3` reports 0 under plain `sh`, and 42 only under `bash -o pipefail` or `${PIPESTATUS[0]}`. Any assertion written the bare way is green regardless of what the CLI does. The container's shell must therefore be confirmed to support `pipefail`, or the status read explicitly, or the reader closed by the harness rather than by a shell pipe.
- R31a. What "the run's classed code" means for a run terminated before it reaches a verdict is not defined by any shipped path today. U2 characterizes it; if the observed value is unclassed or indistinguishable from a generic failure, that is recorded as a product gap alongside exit classes 3 and 4, and R31's obligation narrows to what it can actually assert: PR-A must not change the observed value, and must not turn it into exit 1.
- R32. `Terminal.isTTY` is not used. It is declared in the interface and absent from the Node layer at 0.97.1 (KTD9).

**Verification venue**

- R33. **A process-level property is asserted only against a real spawned process.** The following are process-level by category, and no in-process double is admissible evidence for any of them: exit status; bytes arriving on a real file descriptor; a timer firing in real elapsed time; write backpressure and drain; a pipe closed by the reader; a signal delivered mid-run; installed bin resolution; and module import purity. For these, substituting `process.exit`, `writeSync`, `process.stdout`/`process.stderr` `write`, `node:fs`, or the clock (`vi.useFakeTimers`, `vi.advanceTimersByTime`) does not weaken the test - it deletes the subject, and the test then passes while observing nothing (KTD4). Every requirement in the list R28, R30, R31, R7, R19, R16, R20 is therefore discharged in the contract lane, never in a unit test.
  The boundary is deliberate and narrow. A **logical** property - the order in which the pipeline emits events, what a decision returns, the shape an encoder produces - is asserted in a composition test that binds the declared sink, which is a dependency port and not a module substitution (R24). Over-reading R33 to mean "no doubles anywhere" would push logical assertions into containers for no gain; under-reading it to mean "a spy is fine if it is convenient" is what produced the suite this plan deletes.

**Packaging (PR-B)**

- R4. A new package `@systemfsoftware/stryker-js-cli` at `packages/stryker-js/cli/` owns the `stryker` bin, with `repository.url` exactly `git+https://github.com/systemfsoftware/systemfsoftware.git` and a matching `repository.directory` (`check-publish-config`).
- R5. The `stryker` bin **name** survives unchanged, so no consumer script text changes.
- R6. Core no longer declares a `bin`, no longer imports `./stryker-cli.js` from `src/index.ts`, and no longer exports `runStrykerCli`. Removing a declared export and a declared `bin` is a **major** change, classified by type-diff against core's previously published `.d.ts` rollup - not by an audit of who is depending on it. The version increment carries the break, and REPO-R1 makes the break mandatory rather than negotiable.
- R7. Importing every declared entry of core in a fresh process produces no observable effect, on a supported Node and on at least one unsupported Node.
- R8. `guardMinimalNodeVersion` is called from the CLI's bin, not at module top level in a published library entry.
- R9. Core's `exports` map changes only through `tsdown.config.ts`'s `entry` map. REPO-S4 forbids hand-editing `package.json#exports` on tsdown packages, and core sets `exports: { devExports: '@systemfsoftware/source' }`.
- R10. 22 consumers **add** the CLI package and keep core (KTD7). Core's own local-path mutation script is updated separately.

**Architecture compliance**

- R11. The new package extends `@systemfsoftware/oxlint-config/base`, delivering the cell-suffix, test-placement, and property-test rules.
- R12. Every `src/` file in the new package carries a sanctioned cell suffix or an exempt name (`index.ts`, `main.ts`, `mod.ts`).
- R13. The effect-entrypoint rules are registered explicitly - they are not in the `effect-dmmf` bundle, and this is the one package whose entire subject is an interpretation edge.
- R14. `check-lint-coverage` requires the new package's enrolment.
- R15. No module is duplicated across packages (KTD3).

**Verification**

- R16. A contract lane installs the packed tarball into a clean container and asserts, against the real process: exit status per reachable exit class, the full stdout NDJSON stream as a normalized line sequence (R23, not only the terminal line), the stderr error envelope, `--llms` output, and bin resolution after install.
- R17a. The lane's **behavioral** assertions are invariant in content across all three PRs: authored against the current in-core bin before PR-A, unchanged in content after PR-A and after PR-B. The assertion file physically relocates in U7, so "unchanged" is verified by diffing the assertion bodies across the move, not by the file's path.
- R17b. Exactly one assertion is designed to flip: the import-purity probe, red by construction in U2 and green in U9. It is excluded from R17a.
- R18. The lane is a separate script excluded from the default `test` task and wired into `check:ci` (KTD5). It runs unconditionally in CI and fails loudly, with a message naming the cause, on each of the three distinct environment failures: no container runtime reachable, a reachable runtime that cannot pull a required image, and a case that exceeds its timeout. None of the three may present as a skip or as zero tests.
- R19. On a container pinned below the engines floor, importing every declared core entry is silent while `stryker --version` fails loudly with the guard's message. The floor is `engines.node` = `">=20.0.0"` (`packages/stryker-js/core/package.json`:105-106), reached by the guard as `strykerEngines.node` via `stryker-package.ts`:19 (`strykerEngines = pkg.engines`) and tested with `semver.satisfies` at `stryker-cli.ts`:1035 - so the image is `node:18-alpine`. The unit names that tag explicitly rather than deriving it, and the lane fails loudly if the tag becomes unavailable rather than silently skipping the probe.
- R20. At least one assertion exercises a real consumer's `extends` resolution against the installed packages, not the CLI in isolation.
- R21. Each new core subpath export added in U7 carries a library-path assertion, not only an import-purity probe.
- R22. Every mock-based spec is deleted only after the contract lane is green. PR-0 lands and passes first; the deletions are in PR-A (KTD10).
- R23. The lane's stdout comparison is normalized before assertion: `runId`, `startedAt`, and `elapsedMs` are replaced with stable placeholders, and `reportFile` is made cwd-relative. What is asserted is line-kind ordering and per-line field structure - never raw bytes. `progress-stream.ts`:266 mints a `runId` from `generateRunId()` (:193 declares the binding, :241 assigns a caller-supplied id), and :227,245,287 stamp `startedAt` and `elapsedMs` on every phase and tick line, so two runs of identical code never produce identical bytes and a byte comparison could not execute. The rule this follows is the recorded-response rule: the format of the data matters rather than the actual data. The comparison is **per stream**: PR-A changes stdout from synchronous `writeSync` to drain-paced sink writes, so relative interleaving between stdout and stderr is not asserted.
- R24. **A test double binds a declared dependency port. It never substitutes a module or a global.** The two halves are one rule with two grounds, and conflating them is what an earlier draft did. **Modules:** substituting a module pins the implementation's file shape, so any refactor breaks a passing test, and a module is not a port - nothing the doctrine can name is being substituted. That is this corpus's own pick, not a captured source's, and it is unopposed here. **Globals:** a spy on `process.exit`, `console.log`, or `process.stdout.write` pins nothing about file shape; it is illegal on the sharper captured ground that interaction-verifying doubles whose assertions name calls rather than outcomes lock in dependencies and can end up only testing themselves. Where the global is a process facility, R33 applies on top and the substitution is not merely brittle but vacuous. The trophy axiom (III.1) bans the pyramid underneath both halves. The five substitutions this plan removes - `vi.mock('node:fs')`, `writeSync`, `process.exit`, `console.log`/`console.error`, `process.stdout`/`process.stderr` `write` - split one to the first ground and four to the second. PR-A is what makes compliance possible: the sink is the declared port, so a recording sink is a legitimate double where `vi.mock('node:fs')` never was - subject to R36, because a legitimate double still owes the real adapter a shared contract.
- R25. Measured on this repo on 2026-08-07, **five** searches across `packages/stryker-js/` and what each must read after U14 - all five reach zero, because KTD10 brings `log-sink.spec.ts` into scope. Four are substitution searches; the fifth is the fake-timer search R33 adds:
  - `vi.mock('node:fs')` **7 files -> 0** (`cli-options`:25, `error-envelope`:23, `llms-manifest`:20, `progress-stream`:36, `removed-surface`:29, `survivors`:30, `verdict-envelope`:27 - every one deleted).
  - `vi.spyOn(process, 'exit')` **3 files -> 0** (`error-envelope`:138,322; `removed-surface`:199; `survivors`:399,461).
  - `vi.spyOn(console,` **4 files -> 0** (`cli-options`:55-56; `error-envelope`:136-137,320-321; `removed-surface`:197-198; `survivors`:397-398,459-460).
  - `vi.spyOn(process.stdout|stderr, 'write')` **2 files -> 0** (`survivors`:374 deleted; `log-sink`:196-197,211-212 rewired to an in-memory `Writable`).
  - `vi.useFakeTimers` **1 file -> 0** - the fifth search, added by R33 and read across both packages: currently **6** occurrences, all in the deleted `progress-stream.spec.ts` (:210, :226, :259, :289, :360, :380), together with `vi.useRealTimers` at :129 and a `vi.spyOn(globalThis, 'clearInterval')` at :381. No replacement may reintroduce any of them to test the heartbeat or the pipe (R28, R31).
- R34. **A negative assertion over a channel the code no longer uses is not evidence, and no test may rest on one.** An assertion of the form "nothing was written here", "this was not called", or "that array is empty" stops being a guarantee the moment the code stops using the channel it names - it becomes permanently, trivially true while reading exactly as it did when it had teeth. This is the failure mode a channel migration produces, and PR-A is a channel migration: `removed-surface.spec.ts`:244-246 asserts that no fd-2 `writeSync` occurred, which PR-A makes vacuous, and it survives review only because the positive assertion at :235 fails first and shadows it. The rule that follows: every negative assertion in either package names the channel it observes and is paired with a positive assertion proving that channel is live in the same test - otherwise a reader cannot tell a real guarantee from a dead one. This is the general form of USER-V5's deletion test, applied to a single assertion rather than a file.
- R35. **The sink token and the run-event type are core's published surface, by the same ruling that killed the nine-method port.** The Halt withdrew that port partly because a port becomes published surface the moment the CLI binds it. After PR-B the CLI is a separate package binding this sink across a package boundary and naming `RunEvent` to type its handler, so the identical trigger fires and the identical consequence must follow. Therefore: the run-event declaration module and the sink token are declared entries in `tsdown.config.ts` (U7), each reachable at exactly one public path, each carrying a library-path assertion (R21), and their addition is classified against the published `.d.ts` rollup as a backward-compatible **minor** (R6) - after which they are locked surface and any later change to the event union's shape is classified on the same rule that governs every other declared entry. A port the CLI binds across a package boundary and the plan never declared is the same defect the Halt refused, arrived at from the other side.
- R36. **The recording sink and the real sink satisfy one shared port-contract suite.** U4 and U14 bind a recording sink at the declared port; the lane drives the real `NodeSink.stdout`-backed one. Two substitutes for one port, exercised in two venues, with nothing asserting they agree - which is exactly the fidelity gap the captured canon this plan already cites at Sources names: a substitute needs additional tests that fail if it does not behave like the real code, and a stub's fidelity is documented by narrow integration tests against the real code. The plan restates that canon and must now discharge it. One suite runs against both bindings and asserts what the port guarantees independently of who implements it: every event pushed is observed, exactly once, in push order, and the terminal event is last. Properties that are the _real_ sink's alone - drain, backpressure, EPIPE, framing - are out of the shared suite by construction and stay lane-only (R33). If the recording sink is later reduced to something with no behavior to disagree about, this requirement is discharged by saying so in the code, not by dropping it silently.

---

## Implementation Units

### PR-0 - Contract harness and characterization

#### U1. [Contract lane decision and wiring]

- **Goal:** Decide and wire where the contract lane runs, before any test is written.
- **Requirements:** R18.
- **Dependencies:** none.
- **Files:**
  - `packages/stryker-js/core/vitest.contract.config.ts` (create - its own `include` for the contract path, and a `testTimeout`/`hookTimeout` sized for the slowest case, not just container start. The budget must cover the ~25-second heartbeat fixtures **and** the `SIGINT` and closed-pipe cases, whose behavior is unknown at plan time and could be a hang: a timeout there must surface as a named characterization failure, never as a generic exec error that reads like infrastructure flake)
  - `packages/stryker-js/core/package.json` (modify - add a `test:contract` script and the `testcontainers` devDependency; leave `test` untouched)
  - `pnpm-workspace.yaml` (modify - add `testcontainers` to the catalog; it clears `minimumReleaseAge: 1440` and needs no `minimumReleaseAgeExclude` change, which REPO-S2 forbids outright)
  - `turbo.json` (modify - declare the `test:contract` task)
  - root `package.json` (modify - add the lane as its own step in `check:ci`)
- **Approach:** Core's `vitest.config.ts`:7 pins `include: ['test/**/*.spec.ts']`; do not widen it. A second config owns the contract path so the default `test` task stays container-free. The lane must fail with a named error when no container runtime is reachable - never skip. Locally, Podman satisfies it through `DOCKER_HOST`.
- **Execution note:** This is packaging and infrastructure. Prove it by running the lane with a deliberately unreachable `DOCKER_HOST` and confirming a loud, named failure.
- **Test scenarios:**
  - `pnpm --filter @systemfsoftware/stryker-js-core test` discovers the same specs as before, and zero contract tests.
  - `pnpm --filter @systemfsoftware/stryker-js-core test:contract` discovers the contract file.
  - With `DOCKER_HOST` pointed at nothing, the lane exits nonzero with a message naming the missing runtime - it does not report zero tests and pass.

#### U2. [Characterization suite against the current bin]

- **Goal:** Pin the CLI's real observable behavior before anything moves, including the process-level paths PR-A rewrites.
- **Requirements:** R16, R17a, R17b (red half), R19 (red half), R20, R23, R31a (characterization half), R33, R34.
- **Dependencies:** U1.
- **Files:**
  - `packages/stryker-js/core/__tests__/cli-contract.integration.test.ts` (create)
  - `packages/stryker-js/core/__tests__/fixtures/minimal-project/` (create - one source file, one passing test, enough to reach a score)
  - `packages/stryker-js/core/__tests__/fixtures/slow-project/` (create - a fixture whose run exceeds **two** `TICK_INTERVAL_MS` periods, so roughly 25 seconds at the current 10-second interval. The margin is load-bearing: `progress-stream.ts`:254-256 arms the heartbeat with `setInterval(emitTick, TICK_INTERVAL_MS)` and immediately `unref()`s it, so a fixture that barely exceeds one interval races the terminal write and yields a test that is green most of the time)
- **Approach:** `pnpm pack` the current core, start a `node:<version>-alpine` container, install the tarball, drive the installed `stryker` binary. Assert on the real exit status and the real captured stdout/stderr - never on a spy. Capture the **full** stdout stream and assert on the whole normalized line sequence (R23).
- **Execution note:** Characterization coverage (CONSTITUTION III.5). Write it against behavior as observed, not as intended. Where observed behavior looks wrong, record it and keep the assertion - a behavior change is out of scope here.
  **The fixture set is sized by what PR-A rewrites, which is the correction this revision makes.** An earlier draft used one fast fixture and then deferred the tick, EPIPE, and signal paths as unexercised - while PR-A rewrites exactly those three. A net with a hole where the change lands is not a net. R33 forbids closing that hole with a fake clock or a write spy, so it is closed with real fixtures: a slow project reaches the heartbeat in real time, a closed pipe is a real `| head -5`, and a signal is really delivered. The residual limit is now narrow and stated in the file: exit classes 3 and 4 remain unreachable because no shipped path sets them (Scope Boundaries).
  Cost, stated honestly rather than minimised: the two slow cases (this unit and U13) are roughly 25 seconds each, and the lane runs on the order of twenty container `exec` calls at 0.5-11 seconds apiece, so budget **two to five minutes** for the whole lane rather than the "about 15 seconds" an earlier draft implied by quoting only the single slow case. That is affordable precisely because the lane is a separate `check:ci` step and never taxes `pnpm test`. If it later becomes the binding constraint, the escape is to let the CLI's composition root parameterize the tick interval - timing is a CLI concern under R28, so that is an architectural knob rather than a test hook - and it is not taken now, because it adds observable surface.
- **Test scenarios:**
  - A successful run on the minimal fixture exits 0 and the terminal stdout line is a `verdict` event carrying the score.
  - A config error exits 2 and the terminal line is an `error` event carrying `code`, `error`, and `remediation`.
  - A verdict below the break threshold exits 1.
  - The stream opens with a `stream` header and every line carries a `kind`; phase lines precede mutant lines. Full-sequence assertion over the normalized stream (R23), not last-line.
  - **Heartbeat, in real time:** the slow fixture's stream contains **at least one** `tick` line between phase lines, and no `tick` line appears after the terminal line. Never an exact tick count - the interval is wall-clock and the count is not deterministic. No fake clock (R33).
  - **Closed pipe:** the run whose stdout is closed after five lines terminates without hanging, and **the producer's** exit status is captured (`pipefail` or `${PIPESTATUS[0]}`, never the bare pipeline's status - R31) and recorded as characterized behavior.
  - **Signal:** a real `SIGINT` delivered mid-run to the real pid. The **exit status is deterministic and is pinned exactly**: `stryker-cli.ts`:993-994 installs the handler and the teardown at :1014-1018 returns `onExit(128 + signal)`, so SIGINT yields 130. The stream's last line is **not** deterministic - which phase the signal lands in varies with wall-clock timing under CI load - so assert only the structural invariant: the last line is a terminal line, and no line follows it. Never pin the identity of that line or the phase reached.
  - `--llms` exits 0 and writes the manifest to stdout.
  - stderr in machine mode carries the run's log lines **and** no machine-stream lines. R34 requires the pairing: the negative half alone would stay green if stderr fell silent entirely, which is exactly what a mis-wired R27 would cause.
  - A fixture consumer whose `stryker.config.json` extends `@systemfsoftware/stryker-js-core/config/base` resolves that config against the installed packages (R20).
  - **Red-by-design:** on `node:18-alpine`, one major below core's declared `"node": ">=20.0.0"` floor (`package.json`:105-106), `node -e "import('@systemfsoftware/stryker-js-core')"` throws today. Land as `it.fails` with a comment naming U9 as the unit that flips it. Verified red: `dist/index.mjs`:4392 calls `guardMinimalNodeVersion()` at module top level.

### PR-A - Replace core's presentation layer with a sink

#### U3. [Declare the run-event union and the sink token]

- **Goal:** Give core a vocabulary for what it emits, with no behavior attached.
- **Requirements:** R1, R2, R35.
- **Dependencies:** U2 (the characterization net must exist and be green first).
- **Files:** `packages/stryker-js/core/src/` - the run-event declaration module and the `coreTokens` entry for the sink. Name both here at plan time so U4's dependency has a concrete target, and note that U7 declares both as public entries (R35) - the path chosen here is the one that becomes locked surface, so choose it as a surface path, not as an internal convenience.
- **Approach:** One tagged union covering exactly the line kinds the stream emits today, keyed by `kind`, carrying the fields `progress-stream.ts` stamps. There are **nine**, not seven: the run kinds `stream` header, `phase`, `tick`, `plan`, `mutant`, `verdict`, `error`, plus the two terminal kinds an earlier draft missed - `help` (`StreamHelpLine`, declared at `progress-stream.ts`:130, pushed at `stryker-cli.ts`:937) and `manifest` (`StreamManifestLine`, declared at :141, pushed at `stryker-cli.ts`:693). Both reach stdout through `emitTerminal`, so omitting them would fail this unit's own exhaustiveness test below and would leave R16's `--llms` lane assertion with no post-PR-A encoding.
- **No union over all nine exists today, and this unit is the first to declare one.** An earlier draft claimed `help` and `manifest` were "already members of the existing `StreamLine` union"; there is no `StreamLine` type in the repo. What exists is `StreamTerminalLine` (`progress-stream.ts`:154-158), a union of exactly the four **terminal** kinds - `verdict` (as the inline `VerdictEnvelope & { kind: 'verdict' }` at :155), `error`, `help`, `manifest`. The other five kinds - `stream`, `phase`, `plan`, `mutant`, `tick` - are standalone interfaces that no union covers, and `emitTick` is module-private at :221. So this unit's scope is larger than "rename an existing union": it declares the first total union over the emitted vocabulary, and `StreamTerminalLine` becomes the terminal subset of it rather than the thing it is derived from. The `verdict` member carries `VerdictEnvelope`, which stays in core (U6) - that is what makes the union declarable in core without a reverse import.
- **Approach, continued:** The sink is `(event: RunEvent) => void`. Add the token to core's existing `coreTokens`; do not introduce an Effect `Layer` on core's side (KTD6). No inert default and no no-op object (R2). Declaration only - `CONSTITUTION.md` III.4 keeps behavior out of a declaration file, and the mutator does not cover one.
- **Test scenarios:**
  - The union is exhaustive over the line kinds U2's normalized sequence observed - a kind the lane saw and the union cannot express is a gap, and the lane's recording is the reference.
  - No test asserts on the declaration's source text or type shape (USER-V5). This unit's correctness is carried by U4 and U13 consuming it and by the lane.

#### U4. [Route core's pipeline through the sink and delete the module-state stream]

- **Goal:** Remove every presentation import and every piece of terminal state from core.
- **Requirements:** R1, R3, R26, R27, R36.
- **Dependencies:** U3.
- **Files:**
  - `packages/stryker-js/core/src/stryker.ts` (:8, :17, :47-53 - stop calling `detectMode`/`isColorEnabled`, receive the log writable and the colour flag)
  - `packages/stryker-js/core/src/reporters/broadcast-reporter.ts` (:9, :45-47 - receive `progressEnabled` instead of computing it)
  - `packages/stryker-js/core/src/reporters/mutation-test-report-helper.ts` (:15, :16, :21, :71 - push a terminal event instead of calling `emitTerminal`; drop the stored `resolvedMode`)
  - `packages/stryker-js/core/src/reporters/progress-stream-reporter.ts` (:4)
  - `packages/stryker-js/core/src/progress-stream.ts` (delete the module state, the timer, the `terminalWritten` guard, `resetStream`, and the `writeSync` path; what remains, if anything, is declaration and moves to U3's module)
  - `packages/stryker-js/core/src/output-mode.ts` (the mode-resolution functions move to the CLI in U13; `resolveMode` is pure and may travel intact)
- **Approach:** Each pipeline site takes the sink or a plain value. `stryker.ts`:48 currently picks the log writable from the mode; it now receives one. Mode interrogation leaves core entirely (R27) - all five callsites use it for presentation, so nothing in core needs to ask.
- **Execution note:** **Behavior-preserving by proof, not by construction.** There is no default binding to fall back on, so an unwired site is a type error rather than a silent no-op - the improvement over the withdrawn port design. Delete `progress-stream.ts`'s state in this unit; do not leave it in place "until the CLI is wired", because two writers to fd 1 during the transition is the duplication KTD3 prohibits.
  Before deleting, close the tripwire's blind spot: the scan is static, so resolve by hand whether any checker or worker plugin reaches a presentation module through the dynamic plugin loader or the child-process proxy (Open Questions).
- **Test scenarios:**
  - The KTD3 tripwire returns zero surviving importers for `output-mode` and `progress-stream` across `stryker.ts`, `reporters/`, and `process/`.
  - No core file matches `process.stdout.isTTY`, `STRYKER_MODE`, or `NO_COLOR` (R27), and none matches `setInterval` or `writeSync` in the presentation path (R26, R28).
  - **Composition, not process:** a recording sink bound through `coreTokens` receives the phase events in chain order, each before its stage runs - the assertion `log-sink.spec.ts`:224-258 makes today by substituting a module, now made by binding the declared port. This is a logical property and stays out of the container by design (R33's second paragraph).
  - The existing core specs that PR-A does not invalidate pass unchanged. **The eight this PR does invalidate are red from here until U14 deletes them** - see the red-window note in the Verification Contract; per-unit `pnpm check` is scoped to the listed scenarios for U4 and U13, not the full `test` task.
  - **Port parity (R36):** the shared port-contract suite runs against the recording sink bound here and against the real sink U13 assembles, and both satisfy it. The recording sink is a substitute at a declared port, so it owes the real adapter a contract; U13 completes the pair.

#### U13. [Assemble the stream at the CLI's composition root]

- **Goal:** Make the CLI own the terminal: framing, timing, mode, colour, drain, and the exit.
- **Requirements:** R3, R28, R29, R30, R31, R32, R33, R36.
- **Dependencies:** U4. The CLI is still `packages/stryker-js/core/src/stryker-cli.ts` at this point; it relocates in U6.
- **Files:** `packages/stryker-js/core/src/stryker-cli.ts` (the composition root - already imports `Effect`, `Layer`, `Runtime`, `Terminal` at :13-24), plus the mode-resolution and NDJSON-encoding modules it gains from U4's deletions.
- **Approach:** Resolve mode once at the edge from `process.stdout.isTTY`, `STRYKER_MODE`, and `NO_COLOR` - never `Terminal.isTTY`, which is absent from the Node layer at 0.97.1 (R32, KTD9). Build the event stream with `Stream.asyncPush`, whose register callback provides the sink core receives through `coreTokens`; its emit operations are synchronous and return a boolean, which is what lets core's promise code push without suspending. Merge a time-driven heartbeat stream so the tick fires inside the fiber (R28). Encode with a map to JSON plus `Stream.intersperse("\n")` and run into `NodeSink.stdout` (R30) - not `Terminal.display`. Write the terminal line in an `onExit`-class finalizer so it runs on success, error, and interruption, then await the drain before exiting with the classed code (R30). Map a closed-pipe write failure to the classed exit rather than letting it become exit 1 (R31).
- **Execution note:** State the buffer strategy and its reason in the code (R29): `asyncPush` defaults to an unbounded mailbox and `Stream.async` to bounded-16 suspend, and a per-mutant event rate makes that choice load-bearing.
  **Every acceptance below runs in the contract lane against the real binary (R33).** The tick, the drain, the closed pipe, and the interruption are process-level by category, and U2 built the fixtures that reach them. Discharging any of them with `vi.useFakeTimers`, a `writeSync` mock, or a `process.exit` spy is a stop condition, not a shortcut - that combination is what made the deleted suite pass while observing nothing. The only assertion here that is not a lane assertion is mode resolution, which is a pure function over explicit inputs.
- **Test scenarios:**
  - The lane's normalized stdout is identical to its pre-PR-A run, per stream (R3, R17a, R23).
  - The slow fixture still emits at least one `tick` line at the real cadence, and none appears after the terminal line - the timer stops with the stream (R28).
  - The terminal line is present when the run is interrupted by a real `SIGINT` and when the run fails, not only when it succeeds (R30). Asserted as the structural invariant from U2, not as a fixed line.
  - A run whose stdout closes after five lines exits with the producer's classed code, not 1, and does not hang. The status is read through `pipefail` or `${PIPESTATUS[0]}`; a bare pipeline would report the reader's status and pass unconditionally (R31, R31a).
  - A run whose final event is large emits that event completely - the process did not exit before the sink drained (R30).
  - Mode resolution is exercised directly as a pure function over its inputs; no test reads `process.stdout.isTTY` through a global spy (R24, R33).

#### U14. [Retire the mock suite that PR-A invalidates]

- **Goal:** Delete the eight mock-based CLI specs and rewire the ninth file, salvaging only what needs no mock.
- **Requirements:** R22, R24, R25, R33, R34.
- **Dependencies:** U13. Retires the previous plan's U10 (KTD10).
- **Files:**
  - Delete: `packages/stryker-js/core/test/unit/{cli-options,error-envelope,survivors,llms-manifest,removed-surface,progress-stream,output-mode,verdict-envelope}.spec.ts`, plus orphaned fixtures and snapshots.
  - Modify: `packages/stryker-js/core/test/unit/log-sink.spec.ts` - drop the `vi.hoisted` `progress-stream` module double (:23-51) and its `vi.mock` registration (:53), bind the recording sink for the phase-order assertions (:224-258), and replace the `process.stderr`/`process.stdout` `write` spies (:196-197, :211-212) with an in-memory `Writable` passed to `LoggingBackend`.
  - Create: a mock-free spec for the four pure blocks salvaged from `verdict-envelope.spec.ts`, covering `reporters/verdict-envelope.ts`, which stays in core until U6.
- **Approach:** Delete by default; salvage only a block that needs no mock. The sorting rule is mechanical - a block that reads its assertion out of `fsMocks.writeSync.mock.calls` is observing a write channel, so under R33 it has no unit-test form at all; it either already has lane coverage or a lane assertion is added for it. `verdict-envelope.spec.ts` shows the shape: `writtenLines()` (:32-36) maps `fsMocks.writeSync.mock.calls` into strings and only the `MutationTestReportHelper` block (:315) consumes it, while `generateRunId` (:77), `buildVerdictEnvelope` (:89), the 64 KB size bound (:286), and `isActionableStatus` (:299) touch no mock and are real tests of pure functions. Those four are salvaged; the helper block is the lane's.
- **Execution note:** Nothing is ported into core carrying a mock with it. The previous plan instructed "port that assertion first", which was impossible for this file - the helper block's assertions read out of the mock, so porting it would have deleted seven mocks and re-created one.
- **Test scenarios:**
  - R25's four searches all read zero, and the fifth (`vi.useFakeTimers`) reads zero across both packages.
  - `log-sink.spec.ts` passes with no module substitution and no global spy, proving phase order through the bound sink and `LoggingBackend` through an in-memory writable.
  - The four salvaged blocks pass with no mock of any kind.
  - Apply USER-V5's deletion test in reverse: after each removal, the contract lane still fails on a plausible injected defect in the behavior that file claimed to cover.
  - `pnpm --filter @systemfsoftware/stryker-js-core test` passes with no orphaned snapshot or fixture references.

### PR-B - Extraction

#### U5. [New package skeleton, enrolled, with its bin]

- **Goal:** Create `packages/stryker-js/cli/` complete, including the bin file it declares.
- **Requirements:** R4, R5, R11, R12, R13.
- **Dependencies:** U14.
- **Files (all create):** `package.json`, `oxlint.config.ts`, `tsconfig.json`, `tsconfig.build.json`, `tsconfig.node.json`, `tsdown.config.ts`, `vitest.config.ts`, `api-extractor.json`, `AGENTS.md`, `README.md`, `LICENSE`, `src/mod.ts`, `bin/stryker.js`
- **Approach:** Mirror `packages/effect-daemon-spec/` for the config set - the first-party exemplar that follows the cell taxonomy. `oxlint.config.ts` extends `@systemfsoftware/oxlint-config/base` and additionally registers the effect-entrypoint plugin (R13). **Create `bin/stryker.js` in this unit**, not later - declaring a `bin` that points at a nonexistent file leaves invalid published metadata between units. No `stryker.config.json` (KTD2); `AGENTS.md` records why, citing the `guard-mutate-scope.mjs` header.
- **Test scenarios:** none - packaging scaffolding, proved by the gates in the Verification Contract.

#### U6. [Move the CLI and its exclusive modules in as cells]

- **Goal:** Relocate the CLI and the modules PR-A freed, each routed to its cell.
- **Requirements:** R12, R15.
- **Dependencies:** U5.
- **Files:**
  - Move out of core: `stryker-cli.ts`, `llms-manifest.ts`, `mutants/survivors.ts`, plus the mode-resolution and NDJSON-encoding modules U13 created - each only if the KTD3 tripwire is clean for it. Verified 2026-08-07 by importer scan: `llms-manifest.ts` and `mutants/survivors.ts` have exactly one importer each (`stryker-cli.ts`), and `stryker-cli.ts` has exactly one (`index.ts`, which U7 drops). All three are clean.
  - **Stays in core:** `config/fork-schema.ts` (core config validation, used by `options-validator.ts`:18 and `1-prepare-executor.ts`:6); `reporters/mutation-test-report-helper.ts` (core-owned); U3's run-event declaration (core names what it emits).
  - **`reporters/verdict-envelope.ts` stays in core, and an earlier draft of this unit was wrong to move it.** The importer scan finds three: `progress-stream.ts`:6-7 (deleted in U4), `stryker-cli.ts`:48 (moves), and `reporters/mutation-test-report-helper.ts`:21 (**stays**, and calls `buildVerdictEnvelope` at :185). Moving the module would leave a core file importing the CLI package - the exact Dependency Rule inversion this plan exists to remove, and a package cycle, since the CLI already imports `Stryker` from core. It is core-owned on its merits too: it computes the score envelope from a mutation report (`calculateMutationTestMetrics`, thresholds, `judgeTestContribution`) and declares `VerdictEnvelope`, which is the payload of U3's `verdict` run event and therefore part of core's published vocabulary under R35. Its spec stays with it.
  - **The mode types stay in core; only mode resolution leaves.** `OutputMode` and `ModeSignal` are fields of `VerdictEnvelope` (`reporters/verdict-envelope.ts`:86-87), so they are published core vocabulary for the same reason. `detectMode`, `isProgressEnabled`, `isColorEnabled`, the console layers, and the captured-console state are what move. After U4 no core file imports a runtime function from `output-mode.ts`; confirm that before relocating, per KTD3.
  - Into `packages/stryker-js/cli/src/` under cell suffixes per KTD1
- **Approach:** Run the KTD3 tripwire per module immediately before relocating it. Verify each KTD1 routing against the function's real signature before assigning a cell - the table is nominal, so confirm rather than trust it. Resolve `survivorMutateSpans` / `admitSurvivorsRun` against `architect-workflow`'s inhabited-channel gate; a total decision is a kernel, and inventing an error to reach workflow status is forbidden.
- **Technical design:** Directional. `architect-handler` HD3 requires `Match.tag` + `Match.orElse` and bans `switch` on `_tag`. `architect-kernel` KE2 requires domain-blindness and no I/O - the test `sourceContentHashesOf` fails, because :483 calls `readSourceFile`, which calls `readFileSync` at :460.
- **Stop condition (KTD3):** Any surviving importer, any routing that fails inspection, any temptation to duplicate - halt and raise.
- **Test scenarios:**
  - The tripwire returns zero surviving importers for every relocated module.
  - Every relocated file's suffix is sanctioned, and `pnpm --filter @systemfsoftware/stryker-js-cli lint` passes the cell-suffix and test-placement rules.
  - No module named in this unit remains in core.

#### U12. [K-law property tests for the relocated kernels, and the conditional mutation config]

- **Goal:** Give every kernel that landed in U6 its colocated law, and add a `stryker.config.json` if and only if KTD2's trigger fired.
- **Requirements:** R12.
- **Dependencies:** U6. Split out of U6 because U6's acceptance is a fixed file list while this unit's scope is not knowable until U6's routing resolves - a conditional acceptance inside a 1041-line relocation is not a reviewable contract.
- **Files:** `packages/stryker-js/cli/src/__tests__/*.property.test.ts` (create - one per exported kernel law); `packages/stryker-js/cli/stryker.config.json` (create **only** if KTD2's trigger fired)
- **Approach:** `architect-kernel` KE5 requires colocated K-law property tests for every exported law and forbids kernels in a `mutate` glob. Add `stryker.config.json` if and only if U6 landed genuine `*.workflow.ts` or `*.schema.ts` content, per KTD2's authoritative trigger - not on workflow content alone.
- **Test scenarios:**
  - Each exported kernel law has a colocated `*.property.test.ts` asserting it.
  - Property files import `FastCheck` from `effect` and end in a boolean predicate.
  - If KTD2's trigger fired: `stryker.config.json` exists, `pnpm check:mutate-scope` passes, and the mutation gate reaches 100% on the mutated set.
  - If it did not fire: no `stryker.config.json` exists, and `AGENTS.md` records why.

#### U7. [Core goes rootless; bin ownership transfers]

- **Goal:** Remove the interpretation edge from core's published surface.
- **Requirements:** R6, R8, R9, R21, R35.
- **Dependencies:** U6. **U6 and U7 are one atomic pair and land as a single commit.** Between them core does not build: `src/index.ts` still imports `./stryker-cli.js` at :2 after U6 moves that file out, `bin/stryker.js` still imports `runStrykerCli` from `../dist/index.mjs` until U7 deletes it, and the contract lane - still in core until U7 relocates it - would drive a core tarball whose bin is broken. Splitting the pair leaves a window where the per-unit `pnpm check` contract cannot be satisfied for a reason unrelated to any defect.
- **Files:**
  - `packages/stryker-js/core/src/index.ts` (modify - drop the `./stryker-cli.js` import at :2 and the `runStrykerCli` re-export at :5)
  - `packages/stryker-js/core/src/config/config-resolution.ts` (create - surface-only, enumerated re-export of exactly `ConfigReader`, `defaultOptions`, `OptionsValidator`)
  - `packages/stryker-js/core/src/utils/exit-classification.ts` (create - surface-only, enumerated re-export of exactly `ExitClass`, `getPendingExitClasses`, `resolveExitCode`)
  - `packages/stryker-js/core/tsdown.config.ts` (modify - add `entry` entries for the narrow modules, for U3's run-event declaration module (R35), and for any single-module target `.` does not already expose; tsdown regenerates `exports`)
  - `packages/stryker-js/core/api-extractor.json` (create)
  - `packages/stryker-js/core/package.json` (modify - remove `bin` only; remove the `test:contract` script and the `testcontainers` devDependency, which move with the lane)
  - `packages/stryker-js/core/bin/stryker.js` (delete)
  - `packages/stryker-js/core/src/stryker-cli.ts` (delete - it moved in U6)
  - Relocate the contract lane into the new package: `__tests__/cli-contract.integration.test.ts`, both fixture directories, `vitest.contract.config.ts`, the `test:contract` script, and the `testcontainers` devDependency all move to `packages/stryker-js/cli/`
- **Approach:** Check each symbol the CLI needs against core's **current** `.` exports first. `Stryker` is already public at `.`, so the CLI imports it from the package root - adding a `stryker.js` subpath would give one symbol two public paths, which `one-access-path-per-symbol` forbids. Add a subpath only for what `.` does not already expose. Never declare a wildcard barrel as an entry: `config/index.ts` is five `export *` lines, and a wildcard re-export reachable as a declared entry is inadmissible - which is why the two narrow surface modules above exist rather than a barrel entry. Each narrow module is surface-only: enumerated re-exports, no local definitions. All `exports` changes go through `tsdown.config.ts`'s `entry` map, never by hand-editing `package.json#exports` (REPO-S4).
- **Execution note:** `api-extractor.json` is not a review nicety here - it emits the `.d.ts` rollup that R6's major-version classification is diffed against, and core has no `api-extractor.json` today, so `api:check` currently skips core entirely. Create it in this unit or R6 has no carrying artifact. Each `entry` addition emits a dist chunk and a subpath export, so keep the growth to exactly what the CLI imports; a speculative export is structure for a consumer that does not exist (CONSTITUTION V.4).
- **Test scenarios:**
  - The lane's behavioral assertions are unchanged in content across the relocation, verified by diffing the assertion bodies (R17a).
  - `pnpm --filter @systemfsoftware/stryker-js-cli test:contract` packs **both** tarballs, installs both, and passes.
  - Every `entry` addition is imported by the CLI; none is unused; none is a wildcard barrel.
  - No symbol is reachable at two public paths - `check-exports` plus the generated `.d.ts` rollup confirm one path each.
  - Each new subpath carries a library-path assertion exercising its runtime behavior, not only import purity (R21).
  - `api:check` runs against core and its rollup no longer declares `runStrykerCli`; the removal is recorded as major (R6). The same rollup now **does** declare the run-event union and the sink token, and that addition is recorded as a backward-compatible minor (R35) - so the one `api:check` run classifies a removal and an addition in the same pass, and neither is silent.
  - A `tsdown` build after the source deletions produces a `dist/index.mjs` with no unresolved imports and no top-level `guardMinimalNodeVersion()` call.

#### U8. [Consumer wiring - additive]

- **Goal:** Give 22 packages the new bin without breaking config resolution.
- **Requirements:** R5, R10.
- **Dependencies:** U7. Atomic with U7 - bin ownership and consumer wiring cannot land separately without `stryker` being unresolvable in between.
- **Files:** the `devDependencies` block of the 22 packages whose `mutation` script is `stryker run`; `packages/stryker-js/core/package.json` (its own `mutation` script uses `node ./bin/stryker.js run` and needs the new path).
- **Approach:** **Add** `@systemfsoftware/stryker-js-cli`; **keep** `@systemfsoftware/stryker-js-core`. All 23 `stryker.config.json` files extend `@systemfsoftware/stryker-js-core/config/base`, and under pnpm's strict layout that subpath resolves only from a direct dependency (KTD7). The bin name is unchanged, so no script text moves except core's own.
- **Test scenarios:**
  - `pnpm --filter <a representative rewired package> mutation` resolves the bin, resolves `extends`, and starts a run.
  - `check-runtime-deps` passes: no package invokes a bin it does not declare.
  - No consumer lost `@systemfsoftware/stryker-js-core` from its dependencies.

#### U9. [Flip the purity probe]

- **Goal:** Turn U2's red-by-design assertion green.
- **Requirements:** R7, R19, R33.
- **Dependencies:** U7.
- **Files:** the contract lane, now at `packages/stryker-js/cli/` (U7 relocated it), with the core-purity half retained and pointed at the installed core tarball. The lane does not split across packages: core cannot host it, because core devDepending on the CLI package would make `turbo`'s topological `^build` order a cycle, exactly as "The Halt" describes for the runtime direction.
- **Approach:** Remove `it.fails`. Probe every entry in core's regenerated `exports` map, not just `.`. Import purity is process-level (R33): the probe is a real `node -e` in a container, never a module-registry assertion.
- **Test scenarios:**
  - Importing each declared core entry on an unsupported Node exits 0 and writes nothing to stdout or stderr.
  - `stryker --version` on that same container exits nonzero with the guard's message on stderr.
  - Importing each declared core entry on a supported Node exits 0 and writes nothing.

#### U11. [Evaluator commit: narrow the lint-coverage exemption]

- **Goal:** Make the new package's enrolment enforced.
- **Requirements:** R14.
- **Dependencies:** U5. **Its own commit, last in PR-B** (KTD8).
- **Files:** `scripts/check-lint-coverage.mjs`
- **Approach:** Narrow the `packages/stryker-js/` prefix so it no longer covers `packages/stryker-js/cli/`, and amend its reason to say what is now true: the fork _core_ is not Effect cell code, but the CLI package is. Observe red before and green after by temporarily removing `extends: [base]` from the new package, running the gate, confirming it names exactly that package, and restoring.
- **Test scenarios:**
  - `pnpm check:lint-coverage` exits 0 with the package enrolled.
  - It exits nonzero naming `packages/stryker-js/cli/` when the enrolment is removed.
  - No other package's classification changes - diff the gate's full output before and after.

---

## Scope Boundaries

**In scope:** replacing core's presentation layer with a run-event sink and a CLI-owned Effect `Stream` (PR-A); the CLI extraction; cell routing of the moved code; enrolment plus the entrypoint rules; the contract lane, including the fixtures that reach the tick, closed-pipe, and signal paths; deletion of the eight mock-based specs and the rewiring of `log-sink.spec.ts`; the exemption narrowing.

**Out of scope:** decomposing core into cells (KTD6 - core keeps its promise-and-injector pipeline and does not return a `Stream`); changing any CLI behavior, flag, exit code, or stream format; publishing (REPO-P1); resolving the specified-but-unreachable exit classes 3 and 4 from `docs/plans/2026-08-05-001`.

### Deferred to Follow-Up Work

- Wiring exit classes 3 and 4, which `2026-08-05-001` R6 specifies and no shipped path sets. The contract lane cannot reach them, and U2 states that limit. This is the only remaining coverage gap in the lane, and it is a product gap rather than a testing one.
- Parameterizing the tick interval at the CLI's composition root. Named in U2 as the escape if lane runtime becomes the binding constraint, and deliberately not taken now: it adds observable surface to save the two ~25-second slow cases.
- Promoting R25's five searches to a published oxlint rule. The repo publishes a plugin surface, which is where a ban on module substitution and fake clocks belongs; today they are DoD steps, not gates.

The tick, EPIPE, drain, and signal paths are **no longer deferred**. An earlier draft deferred them while PR-A rewrote them; R33 and U2's fixture set close that hole.

---

## System-Wide Impact

- **22 packages** gain a devDependency and keep core (KTD7). Core's own mutation script changes path.
- **All 23 `stryker.config.json`** files keep extending core's `config/base` - untouched.
- **`.github/workflows/mutation.yml`** picks up any new mutation package automatically through `find` (`mutation.yml`:28). No workflow edit either way.
- **CI capability:** the contract lane needs a container runtime. GitHub `ubuntu-latest` ships Docker; locally Podman satisfies it through `DOCKER_HOST`. `pnpm check` stays container-free (KTD5); the lane is its own `check:ci` step, budgeted at two to five minutes, dominated by the two ~25-second heartbeat fixtures.
- **`check-exports`, `check-runtime-deps`, `check-project-references`, `check-publish-config`** all gain a package to validate.
- **Core's public surface** grows by two narrow surface modules, U3's run-event declaration and sink token, plus any single-module entry `.` does not already expose - each on exactly one public path (U7). Core gains an `api-extractor.json`, so `api:check` covers it for the first time, and that one run classifies both the `runStrykerCli` removal (major, R6) and the run-event addition (minor, R35). The run-event union and the sink token are **published surface, not an internal convenience**: after PR-B the CLI binds that sink across a package boundary, which is the same trigger that killed the nine-method port in The Halt, so the same consequence applies and the union's shape is locked from this release forward.
- **Net code effect of PR-A:** deletes five module-level mutable bindings, a `setInterval`, the `terminalWritten` guard, the `resetStream` test seam, and the manual EPIPE swallow, and adds no port interface and no default binding. The withdrawn nine-method port would have added all of that surface and removed none of the state (CONSTITUTION V.7).
- **Doctrine:** the `check-lint-coverage.mjs` exemption reason changes meaning for the fork tree (U11).

---

## Risks and Dependencies

| Risk                                                                                          | Mitigation                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A process-level requirement is discharged with a double, and passes while observing nothing   | R33 names the categories and routes them to the lane; U13's execution note makes it a stop condition; U2 builds the fixtures so the honest venue exists. This is the failure the deleted suite embodies, so the rule is stated by category rather than case by case. |
| PR-A changes observable behavior while only the mocked specs watch it                         | PR-0 lands first and is the characterization net. R3 requires an identical normalized stdout comparison per stream (R23), and the net now covers the tick, closed-pipe, and signal paths PR-A rewrites.                                                              |
| `writeSync` becomes drain-paced, so the last line could be lost on exit                       | R30 requires the terminal line in a finalizer and the drain awaited before exit - the mechanic omp uses (`print-mode.ts`:175-191, 308-309) to fix that exact truncation class. U13 asserts it against a real process with a large final event.                       |
| stdout/stderr interleaving changes because the write mechanism changed                        | R23 asserts per stream, not across streams, and says so. In machine mode logs already go to stderr and the stream to stdout, so no consumer contract depends on the interleaving.                                                                                    |
| `Terminal.isTTY` is used and fails at runtime                                                 | R32 bans it, with the absence verified in compiled `dist/cjs/internal/terminal.js`:77-82 rather than inferred from the interface.                                                                                                                                    |
| An unbounded mailbox grows without limit on a large run                                       | R29 requires the buffer strategy to be chosen explicitly with a stated reason rather than inherited. The consumer drains continuously, so the queue is transient, but the choice is recorded rather than defaulted.                                                  |
| A plugin reaches a presentation module through the dynamic loader, invisible to a static scan | Named in Open Questions and resolved by hand in U4 before the deletions land. The tripwire's blind spot is stated in KTD3 rather than left implicit.                                                                                                                 |
| A module is duplicated instead of halted on                                                   | Prohibited outright (KTD3, R15), with a mechanical tripwire run per module immediately before each relocation, verified against this repo.                                                                                                                           |
| The lane is slow enough to be routinely skipped                                               | Minimal fixture for most cases; one deliberately slow case for the heartbeat; reuse one container across assertions where isolation allows. It is a separate `check:ci` step, so a slow lane never taxes `pnpm test`.                                                |
| No container runtime, so the lane silently no-ops                                             | The lane fails loudly on an unreachable runtime and never skips (U1 proves this with a deliberately broken `DOCKER_HOST`).                                                                                                                                           |
| The package is otherwise ungated - mutation is advisory repo-wide (KTD2)                      | The lane runs unconditionally in CI as its own `check:ci` step. Local `pnpm check` does not exercise behavior, and the DoD says so rather than implying one command covers both.                                                                                     |
| Publishing barrels (`object-utils`, `config/index`) leaks internal structure                  | U7 declares no barrel as an entry - two narrow surface modules re-export exactly the CLI's six symbols. `api-extractor` emits the rollup that shows the result.                                                                                                      |
| `survivorMutateSpans` routing is genuinely ambiguous                                          | KTD3 halt protocol; named as the one open routing call rather than guessed.                                                                                                                                                                                          |
| The deleted mocks are re-created inside the new package                                       | R24 bans module and global substitution outright, R33 makes it vacuous for process facilities, and U14 salvages only mock-free blocks. R25's five searches are the mechanical check, all reading zero.                                                               |

---

## Open Questions

- Does `survivorMutateSpans` / `admitSurvivorsRun` carry a real error channel, making it a `*.workflow.ts`, or is it total and therefore a kernel? Resolved in U6 against the code.
- Which combinator merges the heartbeat into the event stream in `effect@3.22.1`? Resolved in U13 against the installed version. The dossier verified `async`/`asyncPush`/`asyncScoped`/`fromQueue`/`buffer`/`ensuring`/`interruptWhen`/`run`/`runForEach`/`runCollect`/`intersperse`; the merge combinator was not among the citations and is not asserted here. `Stream.asyncInterrupt` does not exist and must not be used.
- Does any checker or worker plugin in the stryker-js ecosystem import a presentation module through the dynamic plugin loader or the child-process proxy? A string-keyed dynamic `import()` would not appear in KTD3's static scan. Resolved in U4 before the deletions land.
- Does the run-event union live in core as a plain declaration module, and does the CLI's encoder need a codec of it? It stays in core (U6), so the cell suffixes do not apply to it; the codec question is settled in U6.
- What is today's real behavior on `SIGINT` mid-run and on a reader-closed pipe? Unknown at plan time, which is why U2 characterizes both rather than asserting an expectation. If the observed behavior is wrong, it is pinned in PR-0 and corrected in its own change, not silently fixed inside PR-A. R31a records the specific sub-question: whether a run terminated before a verdict has a classed exit at all.

---

## Verification Contract

Per unit, from the repo root, after the last edit:

```bash
pnpm check                                                    # container-free
pnpm --filter @systemfsoftware/stryker-js-core test:contract   # contract lane, U1 through U6
pnpm --filter @systemfsoftware/stryker-js-cli  test:contract   # contract lane, U7 onward
```

`check:ci` covers `format:check`, `lint`, `typecheck`, `test`, `attw`, `api:check`, plus `check:mutate-scope`, `check:lint-coverage`, `check:no-hand-rolled-jsonc`, `check:publish-config`, `check:script-provenance`, `check:project-references`, then `check:exports` and `check:runtime-deps` after the build, and - from U1 onward - the contract lane as its own step.

**Two windows where full `pnpm check` cannot hold, and both are scheduled, not accidental.** Naming them here is what keeps an implementer from treating a red tree as a defect and "fixing" it by restoring what the plan is deliberately removing.

- **U4 through U14 (PR-A).** U4 deletes the `progress-stream` module API. From that moment the eight mock-based CLI specs are red - six fail to compile because they import the deleted API, and `cli-options`/`removed-surface` fail on a positive count over a channel that no longer receives writes - until U14 deletes them. R22 is still satisfied: it requires the lane green before the deletions, and PR-0's lane has been green since U2. For U4 and U13 the per-unit gate is the unit's own listed scenarios plus the contract lane, not the full `test` task; the full task is expected green again at U14 and is a hard gate there.
- **U6 through U7 (PR-B).** These are one atomic pair and land as a single commit, so no window is actually observable in history; the gate applies to the pair. Between them core does not build at all - see U7's Dependencies for the three reasons.

No third window exists. Any other red tree during this plan is a defect.

Unit-specific:

- U1: the lane discovers the contract file; the default `test` task does not; a broken `DOCKER_HOST` produces a loud named failure, and an unpullable image tag produces a different, equally loud one - neither reports zero tests (R18).
- U2: the lane runs; the `it.fails` purity probe is observed failing for the stated reason; the slow fixture produces at least one real `tick` line; the closed-pipe case captures the producer's status rather than the reader's; the `SIGINT` case records an exit status and the terminal-line invariant.
- U3: the run-event module and the `coreTokens` entry exist at the paths this unit names; the union covers all nine emitted kinds including `help` and `manifest`; no behavior lives in the declaration.
- U4: the KTD3 tripwire returns zero surviving importers across core's pipeline; no core file matches `isTTY`, `STRYKER_MODE`, `NO_COLOR`, `setInterval`, or the presentation `writeSync`; a bound recording sink observes phase order; the shared port-contract suite passes against the recording sink (R36); the dynamic-loader question is answered.
- U13: the lane's normalized stdout is identical per stream to its pre-PR-A run; the tick, `SIGINT`, drain, and closed-pipe assertions pass **in the lane**, with the closed-pipe status read through `pipefail`/`${PIPESTATUS[0]}`; no new `vi.useFakeTimers` or process spy exists.
- U14: R25's five searches all read zero; `log-sink.spec.ts` passes with no module double and no global spy; the port-contract suite still passes against both bindings (R36).
- U6: `pnpm --filter @systemfsoftware/stryker-js-cli lint` passes cell-suffix and test-placement; no relocated module remains in core.
- U7: `pnpm --filter @systemfsoftware/stryker-js-cli test:contract` passes with both tarballs; `api:check` covers core and records the removal as major and the run-event addition as minor; no symbol has two public paths; the run-event module is a declared entry the CLI imports (R35).
- U8: a representative consumer resolves both bin and `extends`.
- U9: the purity probe passes live across every declared core entry.
- U11: `pnpm check:lint-coverage` observed red with enrolment removed, green with it restored.
- U12: K-laws pass. If KTD2's trigger fired, `pnpm --filter @systemfsoftware/stryker-js-cli mutation` reaches 100%.

---

## Definition of Done

- [ ] No core file imports a presentation module or reads terminal state; core pushes typed run events into a sink received through `coreTokens`, and no inert default or no-op port object exists (R1, R2).
- [ ] `progress-stream.ts`'s module-level mutable bindings, `setInterval`, `terminalWritten` guard, `resetStream` test seam, and manual EPIPE swallow are deleted, not relocated (R26, R28).
- [ ] No core file matches `process.stdout.isTTY`, `STRYKER_MODE`, or `NO_COLOR`; mode is resolved once at the CLI edge and passed inward as data (R27).
- [ ] The CLI owns framing, timing, colour, and the terminal: NDJSON runs through `NodeSink.stdout`, the heartbeat is merged inside the fiber, `Terminal.isTTY` is not used, and the buffer strategy is chosen with a stated reason (R28, R29, R32).
- [ ] Every process-level property is proved against a real spawned process in the contract lane: exit status, real stdout bytes, the heartbeat in real elapsed time, drain before exit, a reader-closed pipe, a delivered `SIGINT`, installed bin resolution, and import purity. None is discharged by a fake clock, a `process.exit` spy, a write spy, or a `node:fs` substitution (R33).
- [ ] The terminal line is written on success, on error, and on interruption, and the process does not exit before the sink drains (R30).
- [ ] A closed pipe does not replace the run's classed exit code, and the assertion reads the **producer's** status through `pipefail` or `${PIPESTATUS[0]}` - never the bare pipeline's, which reports the reader's status and would pass unconditionally (R31). Where no classed exit exists for an early-terminated run, that gap is recorded rather than asserted around (R31a).
- [ ] PR-A changed no observable CLI behavior: the lane's normalized stdout comparison is identical per stream across it (R3, R23).
- [ ] `import '@systemfsoftware/stryker-js-core'` and every other declared core entry produce no observable effect in a fresh process, proved on a container pinned below the supported Node (R7, R19).
- [ ] `@systemfsoftware/stryker-js-cli` owns the `stryker` bin under its unchanged name; core declares none, and core's removal of `bin` and `runStrykerCli` is classified major by type-diff against its previously published `.d.ts` rollup (R4, R5, R6, R8).
- [ ] Core's `exports` map changed only through `tsdown.config.ts`, no wildcard barrel is a declared entry, no symbol has two public paths, and every new subpath carries a library-path assertion (R9, R21).
- [ ] The run-event union and the sink token are declared entries in core's generated `exports`, reachable at exactly one public path each, imported by the CLI across the package boundary, and their addition is recorded as a backward-compatible minor in the same `api:check` run that records the `runStrykerCli` removal as major (R35).
- [ ] One shared port-contract suite runs against both the recording sink and the real sink and passes against each, so the double is proved to agree with the adapter it stands in for rather than merely coexisting with it; drain, backpressure, EPIPE, and framing stay lane-only and out of that suite (R36).
- [ ] No module exists in two packages (R15), and every relocation passed the KTD3 tripwire, including the dynamic-loader check.
- [ ] Every `src/` file in the new package carries a sanctioned cell suffix or an exempt name; the package is enrolled in the rule bundle plus the entrypoint rules (R11, R12, R13).
- [ ] `check-lint-coverage` requires that enrolment, observed red before and green after in U11's own commit (R14).
- [ ] The contract lane runs the real packed tarballs and asserts real exit statuses and the full normalized stdout line sequence; its behavioral assertions are unchanged in content before PR-A, after PR-A, and after PR-B, verified by diffing the assertion bodies across U7's relocation (R16, R17a, R23).
- [ ] Exactly one assertion flipped, once, in U9 - the purity probe (R17b).
- [ ] At least one assertion resolved a real consumer's `extends` against the installed packages (R20).
- [ ] The lane is excluded from the default `test` task and runs unconditionally in CI as its own `check:ci` step (R18).
- [ ] The eight mock-based CLI specs are deleted and `log-sink.spec.ts` is rewired; only mock-free blocks were salvaged, and nothing carrying a mock was ported into core's retained suite (R22).
- [ ] R25's five searches all read zero, and every test double in either package binds a declared dependency port rather than substituting a module, a global, or the clock (R24, R25, R33).
- [ ] Every negative assertion in either package is paired, in the same test, with a positive assertion proving the channel it observes is live - no test rests on a "nothing was written" that a channel migration has made permanently true (R34).
- [ ] 22 consumers gained the CLI package and none lost core (R10).
- [ ] `pnpm check` exits 0 and the contract lane exits 0, both from this session after the last edit (REPO-D1, REPO-A2).

---

## Sources and Research

**Repo evidence**

- `packages/stryker-js/core/src/index.ts`:2,5 - core's entry imports the CLI and re-exports `runStrykerCli`.
- `packages/stryker-js/core/src/stryker-cli.ts`:3 - top-level `guardMinimalNodeVersion()`; :7-25 - the `@effect/cli`, `@effect/platform`, and `effect` imports, all deep specifiers, including `Terminal` at :16; :27-51 - the 12 core-internal imports; :50 - imports `Stryker` from core, which is the direction that makes a reverse import a cycle; :448-486 - `readPriorReport`/`readSourceFile`/`sourceContentHashesOf`, where :483 calls :460 which calls `readFileSync`; :693,937 - the `manifest` and `help` terminal kinds pushed through `emitTerminal`; :993-994 - the `SIGINT`/`SIGTERM` handlers; :1005-1009 - `process.exit`; :1014-1018 - `onExit(128 + signal)`, which makes `SIGINT` a deterministic 130; :1032-1040 - the guard throws, testing `strykerEngines.node` at :1035.
- `packages/stryker-js/core/dist/index.mjs`:4392 - the built artifact carries the top-level guard call, so the impurity is in the published tarball, not only in source.
- `packages/stryker-js/core/src/progress-stream.ts`:1 - `writeSync` from `node:fs` and nothing from `effect`; :6-7 - imports `generateRunId`, `isActionableStatus`, and the `VerdictEnvelope` type from `reporters/verdict-envelope.js`, which is why that module stays in core; :35,42,49 - schema version, 10-second tick interval, the four phases; :130,141 - `StreamHelpLine` and `StreamManifestLine`, the two terminal line kinds an early draft of U3's union omitted; :154-158 - `StreamTerminalLine`, the ONLY union in the file, covering just the four terminal kinds - there is no `StreamLine` type anywhere in the repo, so U3 declares the first total union over all nine; :166 - `STDOUT_FD = 1`; :177,180,183,190,193 - the five module-level mutable bindings (`config`, `progress`, `heartbeat`, `terminalWritten`, `runId`); :209-219 - `writeLine`, whose comment records that EPIPE arrives from the unref'd timer outside the Effect fiber and is therefore swallowed by hand; :221 - `emitTick`, module-private; :254 - the `setInterval` heartbeat, `unref`'d at :256; :266 - the sole `generateRunId()` call; :364 - `resetStream`, documented as a test seam.
- Effect adoption in core, measured by searching for `from 'effect/` and `from '@effect/` across `packages/stryker-js/core/src`: three files only - `stryker-cli.ts`, `output-mode.ts`, and `llms-manifest.ts` (type-only). Core's pipeline has no Effect in it, which is why PR-A gives core a plain sink rather than a `Stream`.
- Mode callsites, all presentation: `stryker.ts`:47-53 picks the log writable and the colour flag; `reporters/broadcast-reporter.ts`:45-47 sets `machineMode` and `progressEnabled`; `reporters/mutation-test-report-helper.ts`:71 stores `resolvedMode`. None is a mutation-computation decision.
- Presentation entanglement: `stryker.ts`:8,17; `reporters/broadcast-reporter.ts`:9; `reporters/mutation-test-report-helper.ts`:15,16,21; `reporters/progress-stream-reporter.ts`:4.
- Config, correctly core: `config/options-validator.ts`:18 and `process/1-prepare-executor.ts`:6 both import `config/fork-schema.js`. `config/index.ts` is five `export *` lines.
- `packages/stryker-js/core/vitest.config.ts`:7 - `include: ['test/**/*.spec.ts']`, which a `__tests__/*.integration.test.ts` file does not match.
- `packages/stryker-js/core/tsdown.config.ts`:13 - `exports: { devExports: '@systemfsoftware/source' }`, so tsdown generates the exports map (REPO-S4).
- Mock inventory, re-measured 2026-08-07 at file granularity - `vi.mock('node:fs')` in seven files (`cli-options`:25, `error-envelope`:23, `llms-manifest`:20, `progress-stream`:36, `removed-surface`:29, `survivors`:30, `verdict-envelope`:27); `vi.spyOn(process, 'exit')` in three (`error-envelope`:138,322; `removed-surface`:199; `survivors`:399,461); `vi.spyOn(console,` in four (`cli-options`:55-56; `error-envelope`:136-137,320-321; `removed-surface`:197-198; `survivors`:397-398,459-460); `vi.spyOn(process.stdout|stderr, 'write')` in two (`survivors`:374; `log-sink`:196-197,211-212); `vi.useFakeTimers` in one (`progress-stream`:210,226,259,289,360,380).
- The EPIPE pair, `progress-stream.spec.ts`:359-390 - `writeSync` mocked to throw EPIPE, clock faked, `clearInterval` spied on the global, asserting that the heartbeat cleared. Cited in KTD4 as the case where every participant in the scenario was replaced by a double.
- Module-API coupling that forces KTD10, six of the eight plus `log-sink`: `error-envelope.spec.ts`:10,142,148,299,324,330; `llms-manifest.spec.ts`:9,121; `output-mode.spec.ts`:4,150-172; `progress-stream.spec.ts`:8-19,121-127; `survivors.spec.ts`:19,401-402,463,469; `verdict-envelope.spec.ts`:9,10,319,435,437. `cli-options.spec.ts` and `removed-surface.spec.ts` import neither module - verified by matching `from '…/(progress-stream|output-mode).js'` per file, which returns 0 for those two and non-zero for the other six. `log-sink.spec.ts` substitutes the whole `progress-stream` module from a `vi.hoisted` block at :23-51 registered at :53, and asserts phase order through `emitPhase.mock.invocationCallOrder` at :234-238,246 plus a `__state.emittedPhases` array at :228,245,257.
- `verdict-envelope.spec.ts` split: `writtenLines()` at :32-36 reads out of `fsMocks.writeSync.mock.calls`, consumed only by the `MutationTestReportHelper` block at :315; the mock-free blocks are `generateRunId`:77, `buildVerdictEnvelope`:89, the 64 KB bound:286, and `isActionableStatus`:299.
- `scripts/guard-mutate-scope.mjs`:1-40 - the `FORBIDDEN` cell list and the header naming the correct observer per cell.
- `scripts/check-lint-coverage.mjs`:23-24 - the `packages/stryker-js/` prefix exemption and its reason.
- `.github/workflows/mutation.yml`:28 - discovery by `find -name stryker.config.json`; :57-64 - `continue-on-error: true`, so the mutation gate is advisory repo-wide.
- Consumer counts, derived by parsing every `packages/**/package.json` and `packages/**/stryker.config.json`: 22 packages run `stryker run`, core runs `node ./bin/stryker.js run`, 23 declare core as a dependency, and all 23 `stryker.config.json` files extend `@systemfsoftware/stryker-js-core/config/base`.
- `packages/effect-daemon-spec/` - the first-party cell-taxonomy exemplar: `src/*.{kernel,schema,adapter,executor}.ts`, `src/__tests__/`, package-root `__tests__/`, `mod.ts` barrel, nine-file config set.
- `docs/plans/2026-08-05-001-feat-agent-friendly-stryker-cli-plan.md` - PR #58's plan, which rebuilt the CLI in-core and proposed no extraction.

**Doctrine**

- `architect-handler` HD3 - error-to-transport-status mapping is the handler cell's stated job.
- `architect-workflow` - the error channel is a precondition of the `.workflow.ts` suffix; a total decision relocates to `.kernel.ts`; inventing an error to qualify is named fraud.
- `architect-kernel` KE2, KE3, KE5 - domain-blindness, and kernel laws proved by colocated property tests rather than by the mutator.
- `CONSTITUTION.md` I.5 (a state machine hidden in a record, state by presence), II.1 (plain serializable data across the seam), II.2 (effects are values, interpreted once at the edge), II.4 (dependencies point inward), II.6 (purity is per function, judged by return type alone, never inferred from a package or from "library versus application"), III.1 (the trophy; the pyramid is banned because it buries logic in I/O), III.4 (behavior lives where the mutator sees it), III.5 (pin behavior before rebuilding), V.1 (fix the root cause), V.3 (precedent is evidence of what exists, never of what is correct), V.4 (no speculative structure), V.6 (no silent bypass), V.7 (subtract before you add).
- `AGENTS.md` Surface Classes (Evaluator changes land alone), Editable rule (never weaken a gate to pass your own change), REPO-S4, REPO-S5, REPO-D1, REPO-P1, REPO-R1.
- `USER-V4` - a gate must execute against the real environment in the session that introduces it. KTD3's tripwire and R25's searches were run against this repo on 2026-08-07 before being written down; R25's counts were corrected by that run, not assumed.
- `USER-V5` - a test that cannot go red on a plausible bug is banned, which is the general form of R33's vacuity finding: a spy that replaced the subject cannot go red on a defect in the subject.
- Rulings restated, with the strength of their ground named, because a ruling grounded in a captured source outranks one that is a local pick among options the sources leave open.
  - **Bedrock - a captured source asserts it.** The shell may call the core; the core may not call the shell and is unaware the shell exists. That is the Dependency Rule, and core calls `detectMode()` and `emitPhase()` today, both of which are shell. Separately, and at the same strength: a snapshot must not embed non-deterministic data, generated ids and timestamps are matched by property rather than by value, and a recorded response is compared on the format of the data rather than the actual data - which is why R23 normalizes instead of comparing bytes. And: removing an exported symbol is a major change, classified against the declared surface by diffing successive published type rollups.
  - **Bedrock - the project decreed it.** Purity is judged per function by its return type alone, never inferred from a folder, a package, or "library versus application" (`CONSTITUTION.md` II.6). This is why the first draft's warrant for PR-A was withdrawn, and why `sourceContentHashesOf` is not a kernel: it reads the disk.
  - **Bedrock - a captured source asserts it, on test doubles.** Mock-based interaction tests tend to lock in implementation, making refactoring difficult, and can end up only testing themselves. A substitute needs additional tests that fail if it does not behave like the real code. A stub's fidelity is documented by narrow integration tests against the real code. A nullable-style default is production code with an off switch, not a test double. Together these are the bedrock under R24 and R33; a narrower pick - that substitution binds declared dependency ports and never modules, because a module-substituting double pins the implementation's file shape, and that coverage runs at composition altitude while middle and shell cells get no colocated unit tests - is a local ruling, unopposed, and is the form R24 states. It is also what makes PR-A a precondition for compliance: before the sink exists, core declares no port, so a module was the only substitution site available.
  - **Local picks, weaker ground, unopposed here.** A package may publish adapter bindings only as inert, lazy values that construct a description and execute nothing; any published value whose import performs an observable effect is a hidden composition root. A library's interpretation edge must be genuinely absent and supplied per consuming process, not hidden or relocated inside the package. A dependency port is public if and only if a consumer is expected to bind or substitute it at their own composition - which is why the withdrawn nine-method port would have been published surface. Every name an entry module exposes is enumerated explicitly; a wildcard re-export is inadmissible in any module reachable as a declared entry, which is why U7 creates two narrow surface modules instead of declaring `config/index.ts` as an entry. Each published symbol is reachable under exactly one canonical public path.

**External**

- `effect@3.22.1`, `@effect/platform@0.97.1`, `@effect/platform-node@0.97.1`, `@effect/platform-node-shared@0.50.1`, `@effect/cli@0.77.0` - versions resolved from this repo's `pnpm-workspace.yaml` catalog and `.pnpm` store; every API claim below cites those installed trees rather than documentation.
  - `Stream.asyncPush` (`src/Stream.ts`:521-527, since 3.6.0) - synchronous, boolean-returning emit operations (`src/StreamEmit.ts`:98-115), unbounded mailbox by default. `Stream.async` (`src/Stream.ts`:432-478) defaults to `Queue.bounded(16)` with suspend semantics (`internal/stream.ts`:466-483). `Stream.asyncInterrupt` does not exist in 3.22.1.
  - `NodeSink.stdout: Sink<void, string | Uint8Array, never, PlatformError>` (`@effect/platform-node/src/NodeSink.ts`:42-68), which waits on `"drain"` when the writable returns false - real backpressure in place of `writeSync`. No line-oriented sink ships; framing is `Stream.intersperse("\n")`.
  - `Terminal` declares `columns`, `rows`, `isTTY`, `readInput`, `readLine`, `display` (`@effect/platform/src/Terminal.ts`:20-105), but the Node implementation returns only `{columns, readInput, readLine, display}` (`@effect/platform-node-shared/src/internal/terminal.ts`:69-82, confirmed in compiled `dist/cjs/internal/terminal.js`:77-82). `display` takes a whole string and appends no newline; `@effect/cli`'s own `Prompt` uses it for interactive prompting (`cli/src/internal/prompt.ts`:177-178).
  - Interruption: the async constructors register `acquireRelease(…, Queue.shutdown / mailbox.shutdown)`, so an interrupted run shuts the mailbox and runs the register's release - but nothing auto-flushes buffered events, which is why R30 puts the terminal line in a finalizer.
  - Testability: no test doubles ship in `@effect/platform` 0.97.1. Substitution is `Layer.succeed`, and `NodeSink.fromWritable` accepts an in-memory `stream.Writable` - the seam U14 uses for `LoggingBackend`.
- **omp** (`@oh-my-pi/*`, installed source): engine emits typed `AgentSessionEvent` via `#emit` (`agent-session.ts`:1898-1918) and `subscribe` (:3483-3490); mode is an explicit `--mode` flag (`cli/args.ts`:23, `cli/flag-tables.ts`:124); colour is env plus `isTTY` (`terminal-capabilities.ts`:501-529); the final record is guaranteed by an ordered stdout writer whose tail is awaited before dispose (`print-mode.ts`:175-191, 308-309; `rpc-mode.ts`:679-689). Its `EventStream` is unbounded with no backpressure, which does not transfer.
- **opencode** (`sst/opencode`, cloned read-only): core publishes typed events into an Effect `PubSub` (`packages/core/src/event.ts`); the SSE transport wraps it with `Queue.dropping(256)` and a 15-second heartbeat (`packages/server/src/handlers/event.ts`); termination is a domain event in the stream (`session/status.ts`:39-45) that the consumer breaks on (`run.ts`:785-793); every TTY check is in the CLI or TUI (`run.ts`:319,416,752; `ui.ts`:49). Its HTTP/SSE boundary does not transfer to an in-process split.
- `testcontainers` 12.1.0 - the lane's container driver, added to the catalog in U1. Verified 2026-08-07: 12.1.0 is `dist-tags.latest`, modified 2026-08-04, so at roughly 72 hours it clears this repo's `minimumReleaseAge: 1440` (24 hours, `pnpm-workspace.yaml`:68). The lane drives it through one primitive, container `exec`. Two executability details were measured rather than assumed, because R33 rests on them. **Pipeline exit status:** a producer exiting 42 into `head -3` reports **0** under plain `sh -c`, and 42 only under `bash -o pipefail` or `${PIPESTATUS[0]}` - so the closed-pipe case must capture the producer's status explicitly or it asserts nothing (R31). **Heartbeat margin:** `progress-stream.ts`:254-256 arms the tick with `setInterval(emitTick, 10_000)` and `unref()`s it, so the slow fixture must clear two intervals, not one, or the case races the terminal write.
- Comparable tools ship their CLI in-core (vitest, eslint, biome, tsdown) or split it (jest: `jest-cli` + `@jest/core`). Context only - CONSTITUTION V.3 makes precedent evidence of what exists, never of what is correct; the decision rests on the import-purity defect and the Dependency Rule.
