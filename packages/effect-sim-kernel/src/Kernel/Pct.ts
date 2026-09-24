/**
 * Seeded PCT (Burckhardt, Kothari & Musuvathi): each fiber gets a random
 * priority, the highest-priority runnable task runs, and `depth - 1` change
 * points among the first `steps` explored decisions lower the running fiber's
 * priority. A seed replays the whole schedule deterministically, and a
 * parent-owned child-start task is targeted positionally so a newly started
 * child still gets its own chance to run.
 */
import { Effect } from 'effect'
import { dual } from 'effect/Function'

import type { Bound } from './Bound.js'
import { pctDepth, perChangeSeeds } from './Profile.js'
import { run } from './Run.js'
import type { Choice, Decision, RunResult } from './Run.js'

export interface PickOptions {
  readonly seed: number
  readonly depth?: number
  readonly steps: number
}

const mulberry32 = (seed: number): () => number => {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

const NO_FIBER = -1

interface Picker {
  readonly priorities: Map<number, number>
  readonly changes: Map<number, number>
  readonly rng: () => number
  readonly depth: number
}

const changePoints = (rng: () => number, depth: number, steps: number): Map<number, number> => {
  const changes = new Map<number, number>()
  for (let lowered = 1; lowered < depth; lowered++) {
    changes.set(Math.floor(rng() * Math.max(steps, 1)), depth - lowered)
  }
  return changes
}

const fiberIdOf = (choice: Choice, position: number): number | undefined => {
  const option = choice.options[position]
  return option === undefined ? undefined : option.fiberId
}

const fiberKeyOf = (choice: Choice, position: number): number => {
  const id = fiberIdOf(choice, position)
  return id ?? NO_FIBER
}

const priorityOf = (picker: Picker, key: number): number => {
  const known = picker.priorities.get(key)
  if (known !== undefined) return known
  const fresh = picker.depth + picker.rng()
  picker.priorities.set(key, fresh)
  return fresh
}

const scoresOf = (picker: Picker, choice: Choice): ReadonlyArray<number> =>
  choice.options.map((_option, position) => priorityOf(picker, fiberKeyOf(choice, position)))

const highestOf = (scores: ReadonlyArray<number>): number => Math.max(...scores)

const bestPositions = (scores: ReadonlyArray<number>, highest: number): ReadonlyArray<number> =>
  scores.flatMap((score, position) => (score === highest ? [position] : []))

const bestOf = (picker: Picker, choice: Choice): ReadonlyArray<number> => {
  const scores = scoresOf(picker, choice)
  return bestPositions(scores, highestOf(scores))
}

const soleOf = (best: ReadonlyArray<number>): Decision | undefined => (best.length === 1 ? best[0] : undefined)

const randomAmong = (draw: number, best: ReadonlyArray<number>): Decision => {
  const picked = best[Math.floor(draw * best.length)]
  return picked ?? 0
}

const selected = (picker: Picker, best: ReadonlyArray<number>): Decision => {
  const sole = soleOf(best)
  if (sole !== undefined) return sole
  return randomAmong(picker.rng(), best)
}

const bestKey = (choice: Choice, best: ReadonlyArray<number>): number => fiberKeyOf(choice, best[0] ?? NO_FIBER)

const applyChange = (picker: Picker, choice: Choice, best: ReadonlyArray<number>): void => {
  const lowered = picker.changes.get(choice.index)
  if (lowered === undefined) return
  picker.priorities.set(bestKey(choice, best), lowered)
}

export const pick = (options: PickOptions): (choice: Choice) => Decision | undefined => {
  const rng = mulberry32(options.seed)
  const depth = options.depth ?? pctDepth
  const picker: Picker = {
    priorities: new Map(),
    changes: changePoints(rng, depth, options.steps),
    rng,
    depth,
  }
  return (choice: Choice): Decision | undefined => {
    if (choice.options.length <= 1) return undefined
    const best = bestOf(picker, choice)
    applyChange(picker, choice, best)
    return selected(picker, best)
  }
}

export interface PctOptions<A, E> {
  readonly seeds?: number
  readonly depth?: number
  readonly steps?: number
  readonly isFailure?: (result: RunResult<A, E>) => boolean
  readonly maxSteps?: number
}

export interface PctFailure<A, E> {
  readonly seed: number
  readonly result: RunResult<A, E>
}

export interface PctOutcome<A, E> {
  readonly failures: ReadonlyArray<PctFailure<A, E>>
  readonly bound: Bound
}

const failKept = <A, E>(result: RunResult<A, E>): boolean => 'failure' in result

const distinctFibers = <A, E>(result: RunResult<A, E>): number => new Set(result.steps.map((step) => step.fiberId)).size

const stepCountOf = <A, E>(result: RunResult<A, E>): number => result.steps.length

interface Survey {
  steps: number
  fibers: number
}

const surveyed = <A, E>(result: RunResult<A, E>, survey: Survey): Survey => ({
  steps: Math.max(survey.steps, stepCountOf(result)),
  fibers: Math.max(survey.fibers, distinctFibers(result)),
})

const boundOf = (survey: Survey, depth: number, runs: number): Bound => ({
  fibers: survey.fibers,
  operations: survey.steps,
  preemptions: 0,
  depth,
  runs,
  pruning: { enabled: false, disabledBy: [] },
})

const failureOf = <A, E>(
  result: RunResult<A, E>,
  isFailure: (observed: RunResult<A, E>) => boolean,
): boolean => isFailure(result)

interface PctState<A, E> {
  readonly program: Effect.Effect<A, E>
  readonly depth: number
  readonly seeds: number
  steps: number
  readonly isFailure: (observed: RunResult<A, E>) => boolean
  readonly maxSteps: number | undefined
  readonly survey: Survey
  readonly failures: Array<PctFailure<A, E>>
}

type RunOptionsLike = { readonly choose?: (choice: Choice) => Decision | undefined; readonly maxSteps?: number }

const chooserFor = <A, E>(state: PctState<A, E>, seed: number): (choice: Choice) => Decision | undefined =>
  pick({ seed, depth: state.depth, steps: state.steps })

const optionsFor = <A, E>(state: PctState<A, E>, seed: number): RunOptionsLike => {
  const chooser = chooserFor(state, seed)
  if (state.maxSteps === undefined) return { choose: chooser }
  return { choose: chooser, maxSteps: state.maxSteps }
}

const runSeed = <A, E>(state: PctState<A, E>, seed: number): Promise<RunResult<A, E>> =>
  run<A, E>(state.program, optionsFor(state, seed))

const failureFor = <A, E>(
  state: PctState<A, E>,
  seed: number,
  result: RunResult<A, E>,
): PctFailure<A, E> | undefined => (failureOf(result, state.isFailure) ? { seed, result } : undefined)

const collectedFailure = <A, E>(state: PctState<A, E>, seed: number, result: RunResult<A, E>): void => {
  const failure = failureFor(state, seed, result)
  if (failure !== undefined) state.failures.push(failure)
}

const exploreSeeds = <A, E>(state: PctState<A, E>, seed: number): Promise<ReadonlyArray<PctFailure<A, E>>> => {
  if (seed >= state.seeds) return Promise.resolve(state.failures)
  return runSeed<A, E>(state, seed).then((result) => {
    collectedFailure(state, seed, result)
    return exploreSeeds<A, E>(state, seed + 1)
  })
}

const absorbBaseline = <A, E>(state: PctState<A, E>, baseline: RunResult<A, E>): void => {
  const survey = surveyed(baseline, state.survey)
  state.steps = survey.steps
  state.survey.fibers = survey.fibers
  state.survey.steps = survey.steps
}

const baselineOptions = <A, E>(state: PctState<A, E>): RunOptionsLike => {
  if (state.maxSteps === undefined) return {}
  return { maxSteps: state.maxSteps }
}

const seedsOf = (options: { readonly seeds?: number }): number => options.seeds ?? perChangeSeeds

const depthOf = (options: { readonly depth?: number }): number => options.depth ?? pctDepth

const stepsOf = (options: { readonly steps?: number }): number => options.steps ?? 0

const failureCheckOf = <A, E>(options: PctOptions<A, E>): (observed: RunResult<A, E>) => boolean =>
  options.isFailure ?? failKept

const pctImpl = <A, E>(
  program: Effect.Effect<A, E>,
  options: PctOptions<A, E> = {},
): Promise<PctOutcome<A, E>> => {
  const state: PctState<A, E> = {
    program,
    depth: depthOf(options),
    seeds: seedsOf(options),
    steps: stepsOf(options),
    isFailure: failureCheckOf(options),
    maxSteps: options.maxSteps,
    survey: { steps: 0, fibers: 0 },
    failures: [],
  }
  return run<A, E>(program, baselineOptions(state)).then((baseline) => {
    absorbBaseline(state, baseline)
    return exploreSeeds<A, E>(state, 0).then((failures) => ({
      failures,
      bound: boundOf(state.survey, state.depth, state.seeds + 1),
    }))
  })
}

export const pct: {
  <A, E>(options: PctOptions<A, E>): (program: Effect.Effect<A, E>) => Promise<PctOutcome<A, E>>
  <A, E>(program: Effect.Effect<A, E>, options?: PctOptions<A, E>): Promise<PctOutcome<A, E>>
} = dual(
  (args: IArguments): boolean => args.length === 2 || Effect.isEffect(args[0]),
  pctImpl,
)
