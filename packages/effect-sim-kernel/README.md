# @systemfsoftware/effect-sim-kernel

A deterministic simulation kernel for [Effect](https://github.com/Effect-TS/effect) v4: it runs any Effect program under a schedule the caller controls, records which fiber ran at every step, detects real-timer escapes and deadlocks, interrupts fibers at chosen steps, and replays a run exactly from its recorded decision path.

The kernel owns the in-process execution environment; judgements (conformance checks, harnesses) consume it and never the reverse.

## Install

```bash
pnpm add @systemfsoftware/effect-sim-kernel effect
```

## Usage

```ts
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Effect } from 'effect'

const program = Effect.gen(function*() {
  // any Effect program, any wrappers
})

const result = await Kernel.run(program)
// { _tag: "Completed", exit, steps, decisions }
```

`Kernel.run` is dual: `program.pipe(Kernel.run(options))` is the same run. It returns the program's `Exit`, the decisions the schedule took, and a per-step record of which fiber ran. A failing run returns `_tag: "Failed"` with a structured `failure`:

- `Escape` — the program reached a real timer; the failure names the timer and the call site.
- `Blocked` — the run waits on something outside the process (a real timer, a file, a socket).
- `Deadlock` — nothing can wake a suspended fiber; the failure lists every suspended fiber with the frames it is suspended in.
- `Runaway` — the run passed `maxSteps`.

## Schedules

The zero-preemption schedule is Effect's own dispatcher order: continue the fiber the kernel sliced last, then a fiber woken by in-process work, then the oldest task. A **deviation** from that order costs one preemption.

```ts
await Kernel.run(program, {
  // replay a recorded schedule exactly (decisions from a previous run)
  path: previous.decisions,
  // or choose beyond the recorded path (PCT, bounded search)
  choose: (choice) => choice.options.length > 1 ? 0 : undefined,
  // interrupt a fiber at a chosen step
  interrupt: { atStep: 7, target: 'root' },
})
```

Each step record tells you which fiber ran, what the default choice was, whether the schedule deviated, and whether the step touched state another fiber can observe (`visible` — the pruning seam for preemption-bounded search).

## External waits

Stalls on host waits (files, sockets) fail the run by default so an explored schedule stays replayable: the `Blocked` failure names the wait and the resources it holds. One mode awaits them instead:

```ts
// fail fast on any host wait (the default)
await Kernel.run(program, { external: 'fail' })
// wait for real file and socket waits on Effect's order, then keep stepping
await Kernel.run(program, { external: 'await' })
```

A real-timer wait still fails (`Escape`) under `'await'` — timers go through the controlled clock instead. `'await'` beside `path` or `choose` is refused, since an awaited host wait cannot take an explored schedule. For checks that run one ordered program against the real system, use `'await'` with no exploration options.

## One kernel at a time

The global hooks (Effect's `Scheduler`, the fiber resume methods, `Ref`/`Deferred` field observation) are installed for the lifetime of one run and restored at its release. A second `Kernel.run` started while one is active queues behind it, in arrival order, instead of sharing the hooks — one kernel owns the process at a time, so two runs never interleave and a scenario never sees another run's decisions. `Kernel.search`, `Kernel.shrink` and `Kernel.pick` reach the kernel through the same queue, one run at a time.

## Exploration boundary

Harnesses that build their environment inside a scenario can keep that setup out of the explored prefix:

```ts
import { Kernel } from '@systemfsoftware/effect-sim-kernel'

await Kernel.run(program, { explore: 'body' })
```

Decisions before `Kernel.beginExploration` stay on Effect's order and are not recorded.

## Test time

Every clock the program can reach is the kernel's virtual root clock: time moves only when nothing can run, no in-process wait reaches a real timer, and a program that touches one fails the run.

Where a suite would provide `TestClock.layer()`, the harness provides the kernel's test clock instead. Programs keep calling Effect's `TestClock` API — `TestClock.adjust` and `setTime` reach the kernel's clock through the `Clock` service — but they suspend the caller: the kernel moves time only when nothing can run, firing due sleeps in timestamp order with everything they wake run to a stop before the next batch.

```ts
import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { TestClock } from 'effect/testing'

await Kernel.run(program.pipe(Effect.provide(Kernel.TestClock.layer)))

// inside the program:
yield* TestClock.adjust('91 seconds')
```

## Pinned Effect version

The hooks read Effect runtime internals (the `Scheduler` service, `FiberImpl` methods, `Ref`/`Deferred` fields), which is allowed only inside this package. They are pinned to `effect` 4.0.0-rc.117 and throw loudly if a field or method moves. A version change must re-run the kernel's checks.

## Development

```bash
pnpm --filter @systemfsoftware/effect-sim-kernel test
pnpm --filter @systemfsoftware/effect-sim-kernel lint
pnpm --filter @systemfsoftware/effect-sim-kernel typecheck
pnpm --filter @systemfsoftware/effect-sim-kernel build
```
