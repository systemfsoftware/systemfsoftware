import { Config, Context, Deferred, Effect, Fiber, Layer, Option, Queue, Ref, Schema, Semaphore } from 'effect'
import { dual } from 'effect/Function'
import { beginExploration, run } from './Run.js'
import type { RunHistory } from './Run.js'

/**
 * How much schedule exploration a run buys. `per-change` is the budget a pull
 * request is judged on; `local` is a developer's own machine, which caps the
 * preemption bound and the seed count so feedback stays fast. A local pass is
 * not the verdict: the same checks run at the per-change budget in CI.
 */
export type ProfileName = 'local' | 'per-change'

export const pctDepth = 3

export const perChangeSeeds = 250

export const localSeeds = 25

export const localPreemptions = 1

const PROFILES: Readonly<Record<string, ProfileName>> = { local: 'local' }

const profileOf = (name: string): ProfileName => PROFILES[name] ?? 'per-change'

export const currentProfile: Effect.Effect<ProfileName, Config.ConfigError> = Effect.map(
  Config.option(Config.String('CONFORMANCE_PROFILE')),
  Option.match({ onNone: () => profileOf(''), onSome: profileOf }),
)

const SEEDS: Readonly<Record<ProfileName, number>> = {
  local: localSeeds,
  'per-change': perChangeSeeds,
}

/**
 * Whether the explored part of a run ever had more than one runnable task to
 * pick from — the running fiber's own continuation counts, since a sliced
 * fiber waits in the pending list like any other task. A run without a choice
 * point has exactly one schedule: a seeded replay can only take the decisions
 * the run already took. Steps before `beginExploration` (a case's layer build)
 * are never explored, so they do not count.
 */
const hasChoicePoint = (history: RunHistory): boolean =>
  history.steps.slice(history.steps.length - history.decisions.length).some((step) => step.options > 1)

const seedsWhen = (choicePoint: boolean, profile: ProfileName): number => choicePoint ? SEEDS[profile] : 0

/**
 * The seeded replays a baseline run is worth under a profile. A baseline with
 * no choice point has one schedule, so a seed could only replay it: it gets
 * none. Any other baseline gets the profile's seed count.
 */
const seedsForImpl = (baseline: RunHistory, profile: ProfileName = 'per-change'): number =>
  seedsWhen(hasChoicePoint(baseline), profile)

const isBaselineFirst = (args: IArguments): boolean => typeof args[0] === 'object' && args[0] !== null

export const seedsFor: {
  (baseline: RunHistory, profile?: ProfileName): number
  (profile?: ProfileName): (baseline: RunHistory) => number
} = dual(isBaselineFirst, seedsForImpl)

export const currentSeedsFor = (baseline: RunHistory): Effect.Effect<number, Config.ConfigError> =>
  Effect.map(currentProfile, (profile) => seedsFor(baseline, profile))

const localBoundOf = (requested: number | undefined): number =>
  Math.min(requested ?? localPreemptions, localPreemptions)

const boundImpl = (requested: number | undefined, profile: ProfileName): number | undefined =>
  profile === 'local' ? localBoundOf(requested) : requested

export const preemptionsFor: {
  (requested: number | undefined, profile: ProfileName): number | undefined
  (profile: ProfileName): (requested: number | undefined) => number | undefined
} = dual(2, boundImpl)

export const currentPreemptionsFor = (
  requested: number | undefined,
): Effect.Effect<number | undefined, Config.ConfigError> =>
  Effect.map(currentProfile, (profile) => preemptionsFor(requested, profile))

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@systemfsoftware/vitest')
  // Dynamic: `Pct.ts` imports this module, so a static import would be a cycle.
  const { pick } = await import('./Pct.js')

  class Counter extends Context.Service<Counter, Ref.Ref<number>>()(
    '@systemfsoftware/effect-sim-kernel/test/Counter',
  ) {}

  const Operation = Schema.Literals(['update', 'yieldNow', 'promise', 'queue', 'deferred', 'semaphore', 'allPure'])
  type Operation = typeof Operation.Type

  const Operations = Schema.Array(Operation)

  const ChoiceShape = Schema.Literals(['race', 'interruptedChild'])
  type ChoiceShape = typeof ChoiceShape.Type

  const Profile = Schema.Literals(['local', 'per-change'])

  const bump = (counter: Ref.Ref<number>): Effect.Effect<void> => Ref.update(counter, (count) => count + 1)

  const OPERATIONS: Readonly<Record<Operation, (counter: Ref.Ref<number>) => Effect.Effect<void>>> = {
    update: bump,
    yieldNow: () => Effect.yieldNow,
    promise: () => Effect.asVoid(Effect.promise(() => Promise.resolve(1))),
    queue: () =>
      Effect.flatMap(
        Queue.unbounded<number>(),
        (queue) => Effect.asVoid(Effect.andThen(Queue.offer(queue, 1), Queue.take(queue))),
      ),
    deferred: () =>
      Effect.flatMap(
        Deferred.make<number>(),
        (deferred) => Effect.asVoid(Effect.andThen(Deferred.succeed(deferred, 1), Deferred.await(deferred))),
      ),
    semaphore: (counter) =>
      Effect.flatMap(Semaphore.make(1), (semaphore) => Semaphore.withPermits(semaphore, 1)(bump(counter))),
    allPure: () => Effect.asVoid(Effect.all([Effect.succeed(1), Effect.succeed(2)])),
  }

  const performed = (operations: ReadonlyArray<Operation>, counter: Ref.Ref<number>): Effect.Effect<void> =>
    Effect.forEach(operations, (operation) => OPERATIONS[operation](counter), { discard: true })

  const layerOf = (operations: ReadonlyArray<Operation>): Layer.Layer<Counter> =>
    Layer.effect(Counter, Effect.tap(Ref.make(0), (counter) => performed(operations, counter)))

  /** A case shaped like effect-spec-runtime's: the layer builds, exploration begins, then the body runs. */
  const caseOf = (
    operations: ReadonlyArray<Operation>,
    body: (counter: Ref.Ref<number>) => Effect.Effect<void>,
  ): Effect.Effect<void> =>
    Effect.scoped(Effect.gen(function*() {
      const built = yield* Layer.build(layerOf(operations))
      yield* beginExploration
      return yield* body(Context.get(built, Counter))
    }))

  const raced = (counter: Ref.Ref<number>): Effect.Effect<void> =>
    Effect.gen(function*() {
      const left = yield* Effect.forkChild(bump(counter))
      const right = yield* Effect.forkChild(bump(counter))
      yield* Fiber.join(left)
      yield* Fiber.join(right)
    })

  /** One fiber that ran, and a second task it never let run: a choice point a fiber count misses. */
  const interruptedChild = (counter: Ref.Ref<number>): Effect.Effect<void> =>
    Effect.gen(function*() {
      const child = yield* Effect.forkChild(Effect.andThen(bump(counter), Effect.never))
      yield* Fiber.interrupt(child)
    })

  const CHOICES: Readonly<Record<ChoiceShape, (counter: Ref.Ref<number>) => Effect.Effect<void>>> = {
    race: raced,
    interruptedChild,
  }

  const FORCED_SEEDS = Array.from({ length: localSeeds }, (_entry, seed) => seed)

  const sameDecisions = (left: ReadonlyArray<number>, right: ReadonlyArray<number>): boolean =>
    left.length === right.length && left.every((decision, index) => decision === right[index])

  const replaysUnder = (program: Effect.Effect<void>, baseline: RunHistory, seed: number): Promise<boolean> =>
    run(program, { explore: 'body', choose: pick({ seed, steps: baseline.decisions.length }) }).then((seeded) =>
      sameDecisions(seeded.decisions, baseline.decisions)
    )

  /** Every forced seed takes the baseline's own decisions: the replay premise a zero-seed baseline rests on. */
  const everySeedReplays = (program: Effect.Effect<void>, baseline: RunHistory): Promise<boolean> =>
    FORCED_SEEDS.reduce<Promise<boolean>>(
      (sofar, seed) => sofar.then((replayed) => replayed && replaysUnder(program, baseline, seed)),
      Promise.resolve(true),
    )

  it.effect.prop(
    '∀ops_SeedsFor_=ProfileSeedsOnlyWhereASeedCanLeaveTheBaseline',
    { of: [Operations, Operations, ChoiceShape, Profile], subject: seedsForImpl },
    (seeds, [layerOperations, bodyOperations, shape, profile]) =>
      Effect.gen(function*() {
        const choiceFree = caseOf(layerOperations, (counter) => performed(bodyOperations, counter))
        const withChoice = caseOf(
          layerOperations,
          (counter) => Effect.andThen(performed(bodyOperations, counter), CHOICES[shape](counter)),
        )
        const free = yield* Effect.promise(() => run(choiceFree, { explore: 'body' }))
        const replayed = yield* Effect.promise(() => everySeedReplays(choiceFree, free))
        const chosen = yield* Effect.promise(() => run(withChoice, { explore: 'body' }))
        const verdicts = [seeds(free, profile) === 0, replayed, seeds(chosen, profile) === SEEDS[profile]]
        return verdicts.every((held) => held)
      }),
  )
}
