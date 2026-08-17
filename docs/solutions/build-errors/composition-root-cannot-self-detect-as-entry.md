---
title: "a module that self-detects as the process entry cannot survive code splitting"
date: 2026-08-17
category: build-errors
module: stryker-js-mutation-run
problem_type: build_error
component: tooling
symptoms:
  - "forked child process exits 0 with empty stdout and stderr"
  - "parent reports ChildProcessCrashedError: Child process ... exited unexpectedly with exit code 0 (without signal). Stdout and stderr were empty."
  - "every CI mutation job fails while every unit suite stays green"
  - "guard code is present and correct in the source module yet never fires in the built artifact"
root_cause: bundler_layout
resolution_type: architectural_change
severity: high
tags:
  - rolldown
  - tsdown
  - code-splitting
  - composition-root
  - child-process
  - entry-point
  - import.meta.url
  - silent-pass
---

# A module that self-detects as the process entry cannot survive code splitting

## Problem & Observable Boundary

The mutation-run child worker was a declared build entry module that both exported a behavior-bearing class (`ChildProcessProxyWorker`) and self-detected as the process entry with a guard comparing `import.meta.url` against `process.argv[1]`. Adding a shared message-protocol schema made the module share code with sibling entries, so rolldown hoisted the module body into a shared chunk and emitted a 126-byte pure re-export as the entry. The guard now lives in the chunk, where `import.meta.url` can never equal `process.argv[1]` (the entry path), so it is unfalsifiably false.

The forked child loads the re-export, constructs nothing, and exits 0 with empty stdout and stderr. The parent — which listens for a `'close'` event and treats an unannounced exit as a crash — reports `ChildProcessCrashedError: Child process ... exited unexpectedly with exit code 0 (without signal). Stdout and stderr were empty.` Every mutation job in the run died, because every one of them spawns a checker child.

Boundary: the defect exists only in the **built artifact's module layout**, never in `src`. Unit suites compile and exercise the module through the package source condition and stay green, so a change that breaks the child worker on every real run passes all unit gates. The failure is observable only at a process boundary the unit suite never crosses.

## Mechanism & Failure Modes

1. **Self-detection as a declaration of entry.** `if (fileURLToPath(import.meta.url) === process.argv[1]) { new ChildProcessProxyWorker(createInjector) }` assumes the module's own body stays in its entry file. That assumption is private to the author and invisible to the bundler.
2. **Hoisting into a shared chunk.** Once the module shares code with a sibling entry, rolldown hoists the body into a chunk and the entry becomes a pure re-export of the hoisted class. The guard's module, its `import.meta.url`, and its `process.argv[1]` comparison all move into the chunk.
3. **Two names for "this file", both wrong.** In the chunk, `import.meta.url` names the chunk while `process.argv[1]` names the entry. They can never be equal, so the guard is _unfalsifiably false_: correct in the source, dead in the artifact, with no test able to observe the difference except one that forks the built entry.
4. **Silent exit reads as crash.** An empty-successful child handshake is not a loud failure in the child; the parent's `close` handler converts it into `ChildProcessCrashedError`. The child does not write anything to stdout or stderr, so the error message carries no clue that the guard was the cause.

## Architectural Invariant

**A module that both exports a behavior-bearing value and self-detects as the process entry cannot survive code splitting.** The composition root belongs in a dedicated entry whose _execution_ IS the declaration, so no runtime guard is needed. A declared entry module is either pure surface or an ordinary unit — never both:

```ts
// the unit — exports behavior, has zero module-level side effects
export class ChildProcessProxyWorker { … }

// the bootstrap entry — a no-export module whose whole body is the composition root
import { ChildProcessProxyWorker } from '<unit>'
new ChildProcessProxyWorker(createInjector) // unconditional, no argv / import.meta inspection
```

The invariant this buys: an unconditional bootstrap in a no-export entry cannot silently no-op. If the file executes, the worker starts and handshakes. There is no condition for a wrong answer to falsify. If the entry is split, the module stays a pure surface — the side effect never lived in it.

## Candidates, and why the losers lost

| option                        | mechanism                                                                                    | verdict    |
| ----------------------------- | -------------------------------------------------------------------------------------------- | ---------- |
| (a) robust guard              | compare `basename(import.meta.url)` to `basename(process.argv[1])`                           | loses      |
| (b) env-marker guard          | key the guard on the `STRYKER_MUTATOR_WORKER` env var the parent already stamps into `fork`  | loses      |
| (c) argv marker               | pass an explicit `--bootstrap` marker to `fork` and test `process.argv`                      | loses      |
| (d) dedicated bootstrap entry | split into a pure unit + a no-export entry whose body is the composition root, guard deleted | **winner** |

The deciding criterion: **(a)–(c) all keep asking a question about bundler layout or ambient environment, and all still fail silently when the answer is wrong.** A robust basename guard still depends on the body living in the entry; an env guard depends on the parent reliably stamping and the child faithfully inheriting the variable; an argv marker depends on `fork` passing it verbatim through `execArgv`. Every one of those is another coupling the next bundler change can break, with the same silent exit-0 signature. (d) removes the question entirely — there is no condition, so there is nothing to be wrong about.

Honesty where it is due: (b) and (c) are cheaper and would have worked for this incident. This decision is not made because the cheaper options fail — it is made because a composition root carried in a self-detecting module is a latent invariant violation, and a guard is a patch that keeps the violation alive. The structural fix deletes the class of bug rather than the single instance.

## The reversing observation

The decision is wrong if an emitted bootstrap entry's body no longer contains the composition root — e.g. a future refactor reintroduces the guard, or the entry again becomes a pure re-export of a unit that _also_ self-detects. The check, concretely: **the built `-main` entry must execute `new ChildProcessProxyWorker(...)` unconditionally, with no conditional around it.** A future agent re-introducing a `process.argv` / `import.meta.url` inspection in the entry has re-created the original defect and should be reverted.

## Canon

The composition root is executed at the process entry point, one root per process (Seemann, _Dependency Injection_: the object graph is finally composed at the composition root). A declared entry module is either pure surface or an ordinary unit, never both. These are reasoning the reader can re-derive, not links to an internal wiki.

## Verification & The Gate

No unit test can observe module layout, so the gate must be a process test. The resolving integration test forks the **built** child entry and requires the child's `Ready` handshake (`{ kind: ParentMessageKind.Ready }`) to arrive; a child that exits without handshaking fails the test. It is authored at `packages/stryker-js/mutation-run/tests/child-process-proxy-worker-bootstrap.integration.test.ts`.

Code smell to lint for elsewhere: a behavior-bearing exported module ending in `if (fileURLToPath(import.meta.url) === process.argv[1]) { … }` — a composition root wearing a guard. The composition root lives in its own entry or it does not live at all.

## Related

- `docs/solutions/build-errors/dts-emitter-drops-bundled-entry-reexports.md` — adjacent class: a bundler artifact layout defect, green in-suite, broken only across the package boundary.
- `docs/solutions/build-errors/exports-types-rollup-drift.md` — same class: the shipped artifact diverges from what every in-repo gate checks.
