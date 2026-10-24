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

interface PropertySpec<G extends Gens, S> {
  readonly of: G
  readonly subject: S
  readonly runs?: number | undefined
}

const DEFAULT_RUNS = 100

const MAX_SIZE = 10

const SEED_MAX = 0x7fffffff

const DRAW = fc.record({ seed: fc.integer({ min: 0, max: SEED_MAX }), size: fc.integer({ min: 0, max: MAX_SIZE }) })

type Draw = { readonly seed: number; readonly size: number }

const toArbitrary = (input: LawInput): Arbitrary.Arbitrary<unknown> =>
  Schema.isSchema(input) ? Arbitrary.schema(input) : input

function arbitraryOf<G extends Gens>(of: G): Arbitrary.Arbitrary<Values<G>>
function arbitraryOf(of: Gens): Arbitrary.Arbitrary<ReadonlyArray<unknown>> {
  return Arbitrary.all(of.map(toArbitrary))
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

const lawAt = <V extends ReadonlyArray<unknown>, E>(
  law: string,
  arbitrary: Arbitrary.Arbitrary<V>,
  holds: (values: V) => Effect.Effect<boolean, E>,
) =>
(draw: Draw): Effect.Effect<void, LawFailure> =>
  drawValues(law, arbitrary, draw).pipe(
    Effect.flatMap((values) =>
      holds(values).pipe(
        Effect.catchCause((cause) =>
          Effect.fail(new LawErred({ law, counterexample: Formatter.format(values), detail: detailOf(cause) }))
        ),
        Effect.flatMap((verdict) => verdictOf(law, values, verdict)),
      )
    ),
  )

const runDraw = async (program: Effect.Effect<void, LawFailure>): Promise<void> => {
  const exit = await Effect.runPromiseExit(program)
  if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
}

const checkLaw = <V extends ReadonlyArray<unknown>, E>(
  law: string,
  arbitrary: Arbitrary.Arbitrary<V>,
  holds: (values: V) => Effect.Effect<boolean, E>,
  runs: number,
): Promise<void> => {
  const at = lawAt(law, arbitrary, holds)
  return fc.assert(fc.asyncProperty(DRAW, (draw) => runDraw(at(draw))), { numRuns: runs, includeErrorInReport: true })
}

const register = (name: string, run: () => Promise<void>): void => {
  it(name, { meta: { effectVitestMarked: true } }, run)
}

export const prop = <const G extends Gens, S>(
  name: string,
  spec: PropertySpec<G, S>,
  holds: (subject: S, values: Values<G>) => boolean,
): void =>
  register(name, () =>
    checkLaw(
      name,
      arbitraryOf(spec.of),
      (values) => Effect.sync(() => holds(spec.subject, values)),
      runsOf(spec.runs),
    ))

export const effectProp = <const G extends Gens, S, E>(
  name: string,
  spec: PropertySpec<G, S>,
  holds: (subject: S, values: Values<G>) => Effect.Effect<boolean, E>,
): void =>
  register(name, () =>
    checkLaw(
      name,
      arbitraryOf(spec.of),
      (values) => Effect.suspend(() => holds(spec.subject, values)),
      runsOf(spec.runs),
    ))

const deterministicHolds = <V extends ReadonlyArray<unknown>, A>(subject: (...values: V) => A, values: V): boolean =>
  Equal.equals(subject(...values), subject(...values))

export const deterministic = <const G extends Gens, A>(
  name: string,
  spec: PropertySpec<G, (...values: Values<G>) => A>,
): void => prop(name, spec, (subject, values) => deterministicHolds(subject, values))
