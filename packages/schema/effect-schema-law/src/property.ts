import { Cause, Effect, Equal, Exit, Formatter, Schema } from 'effect'
import * as Arbitrary from 'effect/Arbitrary'
import * as fc from 'fast-check'
import { inject, it } from 'vitest'
import { LawDrawFailed, LawErred, type LawFailure, LawRefuted } from './law-failure.schema.js'

interface ProvidedPropertyBudget extends Omit<Arbitrary.CheckOptions, 'replay'> {
  readonly record?: boolean | undefined
}

declare module 'vitest' {
  interface TaskMeta {
    effectVitestMarked?: boolean
  }
  interface ProvidedContext {
    '@systemfsoftware/vitest:property-check'?: ProvidedPropertyBudget
  }
}

type LawInput = Schema.Top | Arbitrary.Arbitrary<Schema.Top['Type']>

type Gens = ReadonlyArray<LawInput>

type Generated<I> = I extends Schema.Schema<infer T> ? T : I extends Arbitrary.Arbitrary<infer A> ? A : never

type Values<G extends Gens> = { readonly [K in keyof G]: Generated<G[K]> }

/** The outcome of one draw: whether the relation held, and whether the draw was an instance of it. */
export interface LawVerdict {
  readonly holds: boolean
  readonly instance: boolean
}

interface PropertySpec<G extends Gens, S> {
  readonly of: G
  readonly subject: S
  readonly runs?: number | undefined
}

/** The widest generation size a law draws at; the registration sample visits every size up to it. */
export const LAW_MAX_SIZE = 10

const DEFAULT_RUNS = 100

const SEED_MAX = 0x7fffffff

const DRAW = fc.record({ seed: fc.integer({ min: 0, max: SEED_MAX }), size: fc.integer({ min: 0, max: LAW_MAX_SIZE }) })

type Draw = { readonly seed: number; readonly size: number }

const toArbitrary = (input: LawInput): Arbitrary.Arbitrary<unknown> =>
  Schema.isSchema(input) ? Arbitrary.schema(input) : input

function arbitraryOf<G extends Gens>(of: G): Arbitrary.Arbitrary<Values<G>>
function arbitraryOf(of: Gens): Arbitrary.Arbitrary<ReadonlyArray<unknown>> {
  return Arbitrary.all(of.map(toArbitrary))
}

const describeError = (error: unknown): string => error instanceof Error ? error.message : Formatter.format(error)

const arbitraryOrFailed = <G extends Gens>(law: string, of: G): Arbitrary.Arbitrary<Values<G>> => {
  try {
    return arbitraryOf(of)
  } catch (error) {
    throw new LawDrawFailed({ law, detail: describeError(error) })
  }
}

const runsField = (budget: ProvidedPropertyBudget | undefined): number | undefined =>
  budget === undefined ? undefined : budget.runs

const providedRuns = (): number | undefined => runsField(inject('@systemfsoftware/vitest:property-check'))

const orDefaultRuns = (runs: number | undefined): number => runs ?? DEFAULT_RUNS

const runsOf = (own: number | undefined): number => orDefaultRuns(own ?? providedRuns())

const detailOf = (cause: Cause.Cause<unknown>): string => Formatter.format(Cause.squash(cause))

const firstDrawn = <V>(law: string, sample: ReadonlyArray<V>): Effect.Effect<V, LawDrawFailed> => {
  const [values] = sample
  return values === undefined
    ? Effect.fail(new LawDrawFailed({ law, detail: 'the Arbitrary produced no value' }))
    : Effect.succeed(values)
}

const drawValues = <V extends ReadonlyArray<unknown>>(
  law: string,
  arbitrary: Arbitrary.Arbitrary<V>,
  draw: Draw,
): Effect.Effect<V, LawDrawFailed> =>
  Arbitrary.sampleEffect(arbitrary, { count: 1, seed: draw.seed, size: draw.size }).pipe(
    Effect.mapError((error) => new LawDrawFailed({ law, detail: Formatter.format(error) })),
    Effect.flatMap((sample) => firstDrawn(law, sample)),
  )

const verdictOf = (law: string, values: ReadonlyArray<unknown>, verdict: boolean): Effect.Effect<void, LawRefuted> =>
  verdict === true ? Effect.void : Effect.fail(new LawRefuted({ law, counterexample: Formatter.format(values) }))

const judgeDraw = <V extends ReadonlyArray<unknown>, E>(
  law: string,
  values: V,
  judge: (values: V) => Effect.Effect<LawVerdict, E>,
): Effect.Effect<LawVerdict, LawFailure> =>
  judge(values).pipe(
    Effect.catchCause((cause) =>
      Effect.fail(new LawErred({ law, counterexample: Formatter.format(values), detail: detailOf(cause) }))
    ),
  )

const lawAt = <V extends ReadonlyArray<unknown>, E>(
  law: string,
  arbitrary: Arbitrary.Arbitrary<V>,
  judge: (values: V) => Effect.Effect<LawVerdict, E>,
  note: (verdict: LawVerdict) => void,
  capture: (failure: LawFailure) => void,
) =>
(draw: Draw): Effect.Effect<void, LawFailure> =>
  drawValues(law, arbitrary, draw).pipe(
    Effect.flatMap((values) =>
      judgeDraw(law, values, judge).pipe(
        Effect.tap((verdict) => Effect.sync(() => note(verdict))),
        Effect.flatMap((verdict) => verdictOf(law, values, verdict.holds)),
      )
    ),
    Effect.tapError((failure) => Effect.sync(() => capture(failure))),
  )

const runDraw = async (program: Effect.Effect<void, LawFailure>): Promise<void> => {
  const exit = await Effect.runPromiseExit(program)
  if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
}

/** Runs one law and answers whether any draw was an instance of the relation it states. */
const checkLaw = async <G extends Gens, E>(
  law: string,
  of: G,
  judge: (values: Values<G>) => Effect.Effect<LawVerdict, E>,
  runs: number,
  capture?: (failure: LawFailure) => void,
): Promise<boolean> => {
  const arbitrary = arbitraryOrFailed(law, of)
  let instanced = false
  const note = (verdict: LawVerdict): void => {
    if (verdict.instance) instanced = true
  }
  const remember = capture ?? (() => {})
  const at = lawAt(law, arbitrary, judge, note, remember)
  await fc.assert(fc.asyncProperty(DRAW, (draw) => runDraw(at(draw))), { numRuns: runs, includeErrorInReport: true })
  return instanced
}

const rethrowCaptured = (failure: LawFailure | undefined, error: unknown): never => {
  if (failure !== undefined) throw failure
  throw error
}

export const runLaw = async <G extends Gens, E>(
  law: string,
  of: G,
  judge: (values: Values<G>) => Effect.Effect<LawVerdict, E>,
  runs?: number,
): Promise<boolean> => {
  let failure: LawFailure | undefined
  try {
    return await checkLaw(law, of, judge, orDefaultRuns(runs), (captured) => {
      failure = captured
    })
  } catch (error) {
    return rethrowCaptured(failure, error)
  }
}

interface SkipContext {
  skip(note?: string): unknown
}

const register = (name: string, run: (context: SkipContext) => Promise<void>): void => {
  it(name, { meta: { effectVitestMarked: true } }, run)
}

const asVerdict = (holds: boolean): LawVerdict => ({ holds, instance: true })

export const prop = <const G extends Gens, S>(
  name: string,
  spec: PropertySpec<G, S>,
  holds: (subject: S, values: Values<G>) => boolean,
): void =>
  register(name, async () => {
    await checkLaw(
      name,
      spec.of,
      (values) => Effect.sync(() => asVerdict(holds(spec.subject, values))),
      runsOf(spec.runs),
    )
  })

export const effectProp = <const G extends Gens, S, E>(
  name: string,
  spec: PropertySpec<G, S>,
  holds: (subject: S, values: Values<G>) => Effect.Effect<boolean, E>,
): void =>
  register(name, async () => {
    await checkLaw(
      name,
      spec.of,
      (values) => Effect.suspend(() => holds(spec.subject, values)).pipe(Effect.map(asVerdict)),
      runsOf(spec.runs),
    )
  })

/**
 * Registers a law whose draws may all miss the relation it states. A run that holds without evaluating an instance
 * ends as a skipped test carrying `skipReason`, never as a pass.
 */
export const skipIfUninstanced = (context: SkipContext, instanced: boolean, reason: string): void => {
  if (!instanced) context.skip(reason)
}

export const instancedProp = <const G extends Gens, S>(
  name: string,
  spec: PropertySpec<G, S>,
  judge: (subject: S, values: Values<G>) => LawVerdict,
  skipReason: string,
): void =>
  register(name, async (context) => {
    const instanced = await checkLaw(
      name,
      spec.of,
      (values) => Effect.sync(() => judge(spec.subject, values)),
      runsOf(spec.runs),
    )
    skipIfUninstanced(context, instanced, skipReason)
  })

const deterministicHolds = <V extends ReadonlyArray<unknown>, A>(subject: (...values: V) => A, values: V): boolean =>
  Equal.equals(subject(...values), subject(...values))

export const deterministic = <const G extends Gens, A>(
  name: string,
  spec: PropertySpec<G, (...values: Values<G>) => A>,
): void => prop(name, spec, (subject, values) => deterministicHolds(subject, values))
