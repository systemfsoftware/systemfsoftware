import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { vi } from '@systemfsoftware/vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Scope from 'effect/Scope'

const Feature = makeFeature({ it })

/** Frames under this directory are the package's own module code. */
const SUBJECT_SOURCE = new URL('../src/', import.meta.url).pathname

/** Deep enough to reach module code from inside the Effect runtime's scheduler. */
const STACK_DEPTH = 64

const fromSubject = (): boolean => {
  const limit = Error.stackTraceLimit
  Error.stackTraceLimit = STACK_DEPTH
  const stack = new Error().stack ?? ''
  Error.stackTraceLimit = limit
  return stack.includes(SUBJECT_SOURCE)
}

type Entry = {
  readonly entry: string
  readonly load: () => Promise<object>
}

const ENTRIES: ReadonlyArray<Entry> = [
  { entry: 'the root entry', load: () => import('@systemfsoftware/effect-e2e') },
  { entry: 'the engine entry', load: () => import('@systemfsoftware/effect-e2e/engine') },
  { entry: 'the model entry', load: () => import('@systemfsoftware/effect-e2e/model') },
  { entry: 'the cache entry', load: () => import('@systemfsoftware/effect-e2e/cache') },
  { entry: 'the agent entry', load: () => import('@systemfsoftware/effect-e2e/agent') },
  { entry: 'the run entry', load: () => import('@systemfsoftware/effect-e2e/run') },
  { entry: 'the runner entry', load: () => import('@systemfsoftware/effect-e2e/runner') },
]

/** Evaluates the entry and every module under it again, in a module graph cleared of earlier imports. */
const importFresh = ({ load }: Entry) =>
  Effect.promise(() => {
    vi.resetModules()
    return load()
  })

/** The id the next fiber will get: Effect numbers every fiber it starts from one process-wide counter. */
const nextFiberId = Effect.map(Effect.forkChild(Effect.void), (fiber) => fiber.id + 1)

interface ImportProbe {
  readonly envReads: Array<string>
  readonly scheduled: Array<string>
  readonly restore: () => void
}

/**
 * Records what the package's own frames do while the entry is evaluated: reads of `process.env`,
 * and work handed to a timer, an immediate or the microtask queue - the start of a promise chain,
 * a loop or a fiber that yields. Attribution is by stack, so the harness's own work in the same
 * window is not counted.
 */
const installProbe = (): ImportProbe => {
  const env = process.env
  const schedulers = { setTimeout, setInterval, setImmediate, queueMicrotask }
  const envReads: Array<string> = []
  const scheduled: Array<string> = []
  const noteEnv = (key: PropertyKey): void => void (fromSubject() && envReads.push(String(key)))
  const noteScheduled = (name: keyof typeof schedulers): void => void (fromSubject() && scheduled.push(name))
  process.env = new Proxy(env, {
    get: (target, key) => (noteEnv(key), target[String(key)]),
    has: (target, key) => (noteEnv(key), Reflect.has(target, key)),
    ownKeys: (target) => (noteEnv('*'), Reflect.ownKeys(target)),
  })
  Object.assign(globalThis, {
    setTimeout: (
      ...args: Parameters<typeof setTimeout>
    ) => (noteScheduled('setTimeout'), schedulers.setTimeout(...args)),
    setInterval: (...args: Parameters<typeof setInterval>) => (
      noteScheduled('setInterval'), schedulers.setInterval(...args)
    ),
    setImmediate: (...args: Parameters<typeof setImmediate>) => (
      noteScheduled('setImmediate'), schedulers.setImmediate(...args)
    ),
    queueMicrotask: (...args: Parameters<typeof queueMicrotask>) => (
      noteScheduled('queueMicrotask'), schedulers.queueMicrotask(...args)
    ),
  })
  return {
    envReads,
    scheduled,
    restore: () => {
      process.env = env
      Object.assign(globalThis, schedulers)
    },
  }
}

const probedImport = (entry: Entry) =>
  Effect.acquireUseRelease(
    Effect.sync(installProbe),
    (probe) => Effect.as(importFresh(entry), { envReads: probe.envReads, scheduled: probe.scheduled }),
    (probe) => Effect.sync(probe.restore),
  )

Feature('Importing the core entries')
  .withLayer(Layer.empty)
  .live('the scenarios evaluate the real module graph, which is module-loader I/O')
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'Importing the entry inside a scope registers no finalizer',
      ENTRIES,
      (entry) =>
        Gherkin.Do.pipe(
          Given('an open scope with no finalizers')('scope', () => Scope.make()),
          When('the entry is imported fresh with that scope provided')(
            'imported',
            ({ scope }) => Effect.provideService(importFresh(entry), Scope.Scope, scope),
          ),
          Then('the scope still holds no finalizer')((state, expect) =>
            expect(state.scope.state).toEqual({ _tag: 'Empty' })
          ),
        ),
    )

    scenarioOutline(
      'Evaluating the entry starts no fiber',
      ENTRIES,
      (entry) =>
        Gherkin.Do.pipe(
          Given('the id the next fiber would take')('before', () => nextFiberId),
          When('the entry is evaluated fresh')('imported', () => importFresh(entry)),
          Then('the next fiber takes the id right after it')((state, expect) =>
            Effect.map(nextFiberId, (after) => expect(after - state.before).toBe(1))
          ),
        ),
    )

    scenarioOutline(
      'Evaluating the entry reads no environment and schedules no work',
      ENTRIES,
      (entry) =>
        Gherkin.Do.pipe(
          When('the entry is evaluated fresh under the environment and scheduler probes')('probed', () =>
            probedImport(entry)),
          Then("the package's own code read no variable and scheduled nothing")((state, expect) =>
            expect(state.probed).toEqual({ envReads: [], scheduled: [] })
          ),
        ),
    )
  })
