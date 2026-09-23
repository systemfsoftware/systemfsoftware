# @systemfsoftware/effect-sim-kernel

A deterministic simulation kernel for [Effect](https://github.com/Effect-TS/effect) v4: it runs any Effect program under a schedule the caller controls, records which fiber ran at every step, detects real-timer escapes and deadlocks, interrupts fibers at chosen steps, and replays a run exactly from its recorded decision path.

The kernel owns the in-process execution environment; judgements (conformance checks, harnesses) consume it and never the reverse.

## Install

```bash
pnpm add @systemfsoftware/effect-sim-kernel effect
```

## Usage

```ts
import { runKernel } from '@systemfsoftware/effect-sim-kernel'
import { Effect } from 'effect'

const program = Effect.gen(function*() {
  // any Effect program, any wrappers
})

const result = await runKernel(program)
// { _tag: "Completed", exit, steps, decisions }
```

`runKernel` returns the program's `Exit`, the decisions the schedule took, and a per-step record of which fiber ran. A failing run returns `_tag: "Failed"` with a structured `failure`:

- `Escape` — the program reached a real timer; the failure names the timer and the call site.
- `Blocked` — the run waits on something outside the process (a real timer, a file, a socket).
- `Deadlock` — nothing can wake a suspended fiber; the failure lists every suspended fiber with the frames it is suspended in.
- `Runaway` — the run passed `maxSteps`.

## Schedules

The zero-preemption schedule is Effect's own dispatcher order: continue the fiber the kernel sliced last, then a fiber woken by in-process work, then the oldest task. A **deviation** from that order costs one preemption.

```ts
await runKernel(program, {
  // replay a recorded schedule exactly (decisions from a previous run)
  path: previous.decisions,
  // or choose beyond the recorded path (PCT, bounded search)
  choose: (choice) => choice.options.length > 1 ? 0 : undefined,
  // interrupt a fiber at a chosen step
  interrupt: { atStep: 7, target: 'root' },
})
```

Each step record tells you which fiber ran, what the default choice was, whether the schedule deviated, and whether the step touched state another fiber can observe (`visible` — the pruning seam for preemption-bounded search).

## In-process wakeups

Promises and `queueMicrotask` that settle inside the process run between kernel steps, and a fiber they wake becomes the next step's scheduling choice — in-process asynchrony never needs a declaration. Only real timers are escapes.

## One kernel at a time

The global hooks (Effect's `Scheduler`, the fiber resume methods, `Ref`/`Deferred` field observation) are installed once and dispatch to the running kernel. A second `runKernel` started while one is active throws immediately instead of sharing the hooks.

## Exploration boundary

Harnesses that build their environment inside a scenario can keep that setup out of the explored prefix:

```ts
import { beginExploration, runKernel } from '@systemfsoftware/effect-sim-kernel'

await runKernel(program, { explore: 'body' })
```

Decisions before `beginExploration` stay on Effect's order and are not recorded.

## Pinned Effect version

The hooks read Effect runtime internals (the `Scheduler` service, `FiberImpl` methods, `Ref`/`Deferred` fields), which is allowed only inside this package. They are pinned to `effect` 4.0.0-rc.116 and throw loudly if a field or method moves. A version change must re-run the kernel's checks.

## Development

```bash
pnpm --filter @systemfsoftware/effect-sim-kernel test
pnpm --filter @systemfsoftware/effect-sim-kernel lint
pnpm --filter @systemfsoftware/effect-sim-kernel typecheck
pnpm --filter @systemfsoftware/effect-sim-kernel build
```
