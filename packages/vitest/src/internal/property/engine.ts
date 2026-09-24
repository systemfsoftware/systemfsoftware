/**
 * @internal The lawful property engine (R11-R15): a property names the function under test, requires a
 * budget, accepts only a literal boolean verdict (or an `Effect` of one), judges coverage classes with
 * QuickCheck's sequential test, and defers the constant-impostor verdict to the end of the file.
 *
 * `of` accepts what upstream accepts — a tuple or record of Schemas or Arbitraries (KTD10) — and `holds`
 * receives the generated values exactly as drawn, typed by the gens that produced them.
 */
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import * as Arbitrary from 'effect/unstable/arbitrary/Arbitrary'
import * as V from 'vitest'
import { MissingBudget, NonBooleanVerdict } from '../errors.schema.js'
import { CoverageBelowMinimum, type CoverageClass, type CoverageDraw, judgeCoverage } from './coverage.js'
import { VacuousProperty } from './error.schema.js'
import { type Impostor, impostorOf, makeFileLedger, type Opaque, type Refutation, type Subject } from './impostor.js'
import {
  deterministicHolds,
  idempotentHolds,
  invariantHolds,
  type LawApi,
  type LawKind,
  type LawSubject,
  metamorphicHolds,
  modelHolds,
  roundTripHolds,
  spreadValues,
} from './kinds.js'

/** @internal */
export type ArbitraryInput = Schema.Top | Arbitrary.Arbitrary<Schema.Top['Type']>

/** @internal */
export type Gens = ReadonlyArray<ArbitraryInput> | { readonly [key: string]: ArbitraryInput }

type Generated<I> = I extends Schema.Schema<infer T> ? T : I extends Arbitrary.Arbitrary<infer A> ? A : never

/** @internal */
export type Values<G extends Gens> = { readonly [K in keyof G]: Generated<G[K]> }

/** @internal */
export type ElementValues<G extends Gens> = G extends ReadonlyArray<ArbitraryInput> ? Generated<G[number]> : never

/** @internal */
export type PropertySubject = Subject

/** @internal */
export type CoveragePredicate<G extends Gens> = (...values: ReadonlyArray<ElementValues<G>>) => boolean

type PropertyRuns<N extends number> = number extends N ? number
  : `${N}` extends `-${bigint}` ? never
  : `${N}` extends `${bigint}` ? (N extends 0 ? never : N)
  : never

/** @internal */
export interface PropertySpec<G extends Gens, S extends PropertySubject, N extends number> {
  readonly of: G
  readonly subject: S
  readonly runs: N & PropertyRuns<N>
  /** Labelled input predicates, each with the minimum share of runs it must see (R14). */
  readonly cover?: Readonly<Record<string, readonly [CoveragePredicate<G>, number]>>
  /** Passed through to Effect's Arbitrary checker beside the required `runs` (size, seed, shrink budget). */
  readonly arbitrary?: Arbitrary.CheckOptions
}

/** @internal */
export interface PropertyRuntime<R> {
  /** Registers the property's program; the runtime runs it inside the test it registers, under that test's binding. */
  readonly register: (
    name: string,
    program: () => Effect.Effect<void, Cause.Cause<NonBooleanVerdict>, never>,
  ) => void
  readonly provide: <A, E>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, never>
}

/** @internal */
export interface PropApi<R> {
  readonly prop: <const G extends Gens, S extends PropertySubject, N extends number>(
    name: string,
    spec: PropertySpec<G, S, N>,
    holds: (subject: S, values: Values<G>) => boolean,
  ) => void
  readonly effectProp: <const G extends Gens, S extends PropertySubject, N extends number, E>(
    name: string,
    spec: PropertySpec<G, S, N>,
    holds: (subject: S, values: Values<G>) => Effect.Effect<boolean, E, R>,
  ) => void
  readonly law: LawApi
}

const REWRITE = 'it.prop(name, { of, subject, runs }, holds)'

type Lane = 'sync' | 'effect'

type Verdict<E, R> = boolean | Effect.Effect<boolean, E, R>

type CoverSpec<G extends Gens> = Readonly<Record<string, readonly [CoveragePredicate<G>, number]>>

interface Budget {
  readonly runs: number
  readonly options: Arbitrary.CheckOptions
}

interface Registration<G extends Gens, S extends PropertySubject, E, R> {
  readonly runtime: PropertyRuntime<R>
  readonly name: string
  readonly spec: PropertySpec<G, S, number>
  readonly holds: (subject: S, values: Values<G>) => Verdict<E, R>
  readonly lane: Lane
  readonly gate: boolean
}

interface Run<G extends Gens, S extends PropertySubject, E, R> {
  readonly name: string
  readonly lane: Lane
  readonly subject: S
  readonly holds: (subject: S, values: Values<G>) => Verdict<E, R>
  readonly arbitrary: Arbitrary.Arbitrary<Values<G>>
  readonly observe: (values: Values<G>) => void
  readonly options: Arbitrary.CheckOptions
}

interface Checked<G extends Gens> {
  readonly violations: ReadonlyArray<string>
  readonly result: Arbitrary.CheckResult<Values<G>, Opaque>
}

interface CoverageRecorder<G extends Gens> {
  readonly observe: (values: Values<G>) => void
  readonly judge: () => string | undefined
}

const isPositiveInteger = (runs: number): boolean => Number.isInteger(runs) && runs > 0

const describeRuns = (runs: number): string => Number.isInteger(runs) ? `${String(runs)}` : 'a non-integer or absent'

const missingBudget = (name: string, runs: number): string =>
  `${name}: pass a positive integer \`runs\`; received ${describeRuns(runs)}. Write ${REWRITE}.`

const requireBudget = (
  name: string,
  spec: { readonly runs: number; readonly arbitrary?: Arbitrary.CheckOptions },
): Budget => {
  if (isPositiveInteger(spec.runs) === false) throw new MissingBudget({ detail: missingBudget(name, spec.runs) })
  return withBudget(spec)
}

const withBudget = (spec: { readonly runs: number; readonly arbitrary?: Arbitrary.CheckOptions }): Budget => ({
  runs: spec.runs,
  options: { ...spec.arbitrary, runs: spec.runs },
})

const toArbitrary = (input: ArbitraryInput): Arbitrary.Arbitrary<Opaque> =>
  Schema.isSchema(input) ? Arbitrary.schema(input) : input

const assignArbitrary = (
  built: Record<string, Arbitrary.Arbitrary<Opaque>>,
  of: { readonly [key: string]: ArbitraryInput },
  key: string,
): void => {
  const input = of[key]
  if (input !== undefined) built[key] = toArbitrary(input)
}

const recordArbitraries = (
  of: { readonly [key: string]: ArbitraryInput },
): Record<string, Arbitrary.Arbitrary<Opaque>> => {
  const built: Record<string, Arbitrary.Arbitrary<Opaque>> = {}
  for (const key of Object.keys(of)) assignArbitrary(built, of, key)
  return built
}

const isTupleOf = (of: Gens): of is ReadonlyArray<ArbitraryInput> => Array.isArray(of)

/**
 * The Arbitrary of the generated values. The overload carries `Values<G>` for callers; the implementation
 * only produces the runtime shape, which is the tuple or the record the gens described.
 */
function arbitraryOf<G extends Gens>(of: G): Arbitrary.Arbitrary<Values<G>>
function arbitraryOf(of: Gens): Arbitrary.Arbitrary<Opaque> {
  return isTupleOf(of) ? Arbitrary.all(of.map(toArbitrary)) : Arbitrary.all(recordArbitraries(of))
}

const minimumOf = <G extends Gens>(cover: CoverSpec<G>, label: string): number => {
  const entry = cover[label]
  return entry === undefined ? 0 : entry[1]
}

const seedClasses = <G extends Gens>(cover: CoverSpec<G>): Map<string, CoverageClass> => {
  const classes = new Map<string, CoverageClass>()
  for (const label of Object.keys(cover)) classes.set(label, { hits: 0, minimum: minimumOf(cover, label) })
  return classes
}

const satisfies = <G extends Gens>(cover: CoverSpec<G>, label: string, values: Values<G>): boolean => {
  const entry = cover[label]
  return entry === undefined ? false : entry[0](...spreadValues(values))
}

const satisfiedLabels = <G extends Gens>(cover: CoverSpec<G>, values: Values<G>): ReadonlyArray<string> =>
  Object.keys(cover).filter((label) => satisfies(cover, label, values))

const bumpHit = (classes: Map<string, CoverageClass>, label: string): void => {
  const prior = classes.get(label)
  if (prior !== undefined) classes.set(label, { hits: prior.hits + 1, minimum: prior.minimum })
}

const observeRun = <G extends Gens>(
  classes: Map<string, CoverageClass>,
  counter: { runs: number },
  cover: CoverSpec<G>,
  values: Values<G>,
): void => {
  counter.runs = counter.runs + 1
  for (const label of satisfiedLabels(cover, values)) bumpHit(classes, label)
}

const drawFor = <G extends Gens>(cover: CoverSpec<G>, arbitrary: Arbitrary.Arbitrary<Values<G>>): CoverageDraw => ({
  more: (count) =>
    Effect.runSync(Arbitrary.sampleEffect(arbitrary, { count }).pipe(Effect.orDie)).map((values) =>
      satisfiedLabels(cover, values)
    ),
})

const noCoverage = <G extends Gens>(): CoverageRecorder<G> => ({
  observe: () => undefined,
  judge: () => undefined,
})

const liveCoverage = <G extends Gens>(
  cover: CoverSpec<G>,
  arbitrary: Arbitrary.Arbitrary<Values<G>>,
): CoverageRecorder<G> => {
  const classes = seedClasses(cover)
  const counter: { runs: number } = { runs: 0 }
  return {
    observe: (values) => observeRun(classes, counter, cover, values),
    judge: () =>
      judgeCoverage({ classes: Object.fromEntries(classes), runs: counter.runs, draw: drawFor(cover, arbitrary) }),
  }
}

const makeCoverage = <G extends Gens>(
  cover: CoverSpec<G> | undefined,
  arbitrary: Arbitrary.Arbitrary<Values<G>>,
): CoverageRecorder<G> => cover === undefined ? noCoverage() : liveCoverage(cover, arbitrary)

const describeVerdict = (verdict: Opaque): string =>
  Effect.isEffect(verdict) ? 'an Effect, which this lane never runs' : `a ${typeof verdict}`

const nonBoolean = (verdict: Opaque, violations: Array<string>): boolean => {
  violations.push(describeVerdict(verdict))
  return true
}

const literalVerdict = (verdict: Opaque, violations: Array<string>): boolean =>
  typeof verdict === 'boolean' ? verdict : nonBoolean(verdict, violations)

const effectVerdict = <E, R>(
  lane: Lane,
  verdict: Effect.Effect<boolean, E, R>,
  violations: Array<string>,
): Effect.Effect<boolean, E, R> =>
  lane === 'sync'
    ? Effect.succeed(nonBoolean(verdict, violations))
    : Effect.map(verdict, (value) => literalVerdict(value, violations))

const verdictFor = <G extends Gens, S extends PropertySubject, E, R>(
  run: Run<G, S, E, R>,
  values: Values<G>,
  violations: Array<string>,
): Effect.Effect<boolean, E, R> => {
  run.observe(values)
  const verdict = run.holds(run.subject, values)
  return Effect.isEffect(verdict)
    ? effectVerdict(run.lane, verdict, violations)
    : Effect.succeed(literalVerdict(verdict, violations))
}

const tolerateInterruption = <E>(
  cause: Cause.Cause<E>,
): Effect.Effect<boolean, Cause.Cause<E>> => Cause.hasInterrupts(cause) ? Effect.interrupt : Effect.fail(cause)

const guardedVerdict = <G extends Gens, S extends PropertySubject, E, R>(
  run: Run<G, S, E, R>,
  violations: Array<string>,
): (values: Values<G>) => Effect.Effect<boolean, Cause.Cause<E>, R> =>
(values) => Effect.catchCause(Effect.suspend(() => verdictFor(run, values, violations)), tolerateInterruption)

const violationMessage = (name: string, violations: ReadonlyArray<string>): string =>
  `${name}: the property returned no boolean; it returned ${violations.join(', ')}. A property must return a ` +
  `literal boolean verdict — asserting with expect(), or returning an Option, Result or object, is not a verdict; ` +
  `write ${REWRITE}.`

const runCheck = <G extends Gens, S extends PropertySubject, E, R>(
  run: Run<G, S, E, R>,
): Effect.Effect<Checked<G>, Cause.Cause<NonBooleanVerdict>, R> => {
  const violations: Array<string> = []
  return Arbitrary.checkEffect(run.arbitrary, guardedVerdict(run, violations), run.options).pipe(
    Effect.map((result) => ({ violations, result })),
  )
}

const reportOf = <G extends Gens>(checked: Checked<G>): string | undefined =>
  Arbitrary.formatCheckFailure(checked.result)

const violationOf = <G extends Gens>(name: string, checked: Checked<G>): string | undefined =>
  checked.violations.length === 0 ? undefined : violationMessage(name, checked.violations)

const isRefuted = <G extends Gens>(checked: Checked<G>): boolean =>
  checked.violations.length > 0 || reportOf(checked) !== undefined

const dieViolation = (detail: string): Effect.Effect<never, never, never> =>
  Effect.die(new NonBooleanVerdict({ detail }))

const dieReported = (name: string, report: string): Effect.Effect<never, never, never> =>
  Effect.die(new Error(`${name}: the property was falsified. ${report}`))

const dieUncovered = (failure: string): Effect.Effect<never, never, never> =>
  Effect.die(new CoverageBelowMinimum({ message: failure }))

const impostorHolds = <G extends Gens, S extends PropertySubject, E, R>(
  holds: (subject: S, values: Values<G>) => Verdict<E, R>,
  impostor: Impostor<S>,
): (subject: S, values: Values<G>) => Verdict<E, R> =>
(_subject, values) => holds(impostor.impostor, values)

const recordImpostor = <G extends Gens, S extends PropertySubject, E, R>(
  run: Run<G, S, E, R>,
  budget: Budget,
  impostor: Impostor<S>,
  checked: Checked<G>,
): void => {
  const verdict: Refutation = { refuted: isRefuted(checked), frozen: impostor.frozen(), runs: budget.runs }
  gatedLedger.record(run.subject, run.name, verdict)
}

const impostorRun = <G extends Gens, S extends PropertySubject, E, R>(
  run: Run<G, S, E, R>,
  budget: Budget,
): Effect.Effect<void, Cause.Cause<NonBooleanVerdict>, R> => {
  const impostor = impostorOf(run.subject)
  const retry: Run<G, S, E, R> = {
    ...run,
    holds: impostorHolds(run.holds, impostor),
    observe: noObserve,
  }
  return runCheck(retry).pipe(Effect.map((checked) => recordImpostor(retry, budget, impostor, checked)))
}

const noObserve = (): void => undefined

const gateRun = <G extends Gens, S extends PropertySubject, E, R>(
  run: Run<G, S, E, R>,
  budget: Budget,
  gate: boolean,
): Effect.Effect<void, Cause.Cause<NonBooleanVerdict>, R> => gate ? impostorRun(run, budget) : Effect.void

const finishPassed = <G extends Gens, S extends PropertySubject, E, R>(
  run: Run<G, S, E, R>,
  budget: Budget,
  coverage: CoverageRecorder<G>,
  gate: boolean,
): Effect.Effect<void, Cause.Cause<NonBooleanVerdict>, R> => {
  const failure = coverage.judge()
  return failure === undefined
    ? gateRun(run, budget, gate)
    : dieUncovered(`${run.name}: ${failure}`)
}

const settleReport = <G extends Gens, S extends PropertySubject, E, R>(
  run: Run<G, S, E, R>,
  budget: Budget,
  coverage: CoverageRecorder<G>,
  gate: boolean,
  report: string | undefined,
): Effect.Effect<void, Cause.Cause<NonBooleanVerdict>, R> =>
  report === undefined ? finishPassed(run, budget, coverage, gate) : dieReported(run.name, report)

const settle = <G extends Gens, S extends PropertySubject, E, R>(
  registration: Registration<G, S, E, R>,
  run: Run<G, S, E, R>,
  budget: Budget,
  coverage: CoverageRecorder<G>,
  checked: Checked<G>,
): Effect.Effect<void, Cause.Cause<NonBooleanVerdict>, R> => {
  const violation = violationOf(registration.name, checked)
  return violation === undefined
    ? settleReport(run, budget, coverage, registration.gate, reportOf(checked))
    : dieViolation(violation)
}

const checkOf = <G extends Gens, S extends PropertySubject, E, R>(
  registration: Registration<G, S, E, R>,
  arbitrary: Arbitrary.Arbitrary<Values<G>>,
  budget: Budget,
  observe: (values: Values<G>) => void,
): Run<G, S, E, R> => ({
  name: registration.name,
  lane: registration.lane,
  subject: registration.spec.subject,
  holds: registration.holds,
  arbitrary,
  observe,
  options: budget.options,
})

const program = <G extends Gens, S extends PropertySubject, E, R>(
  registration: Registration<G, S, E, R>,
): Effect.Effect<void, Cause.Cause<NonBooleanVerdict>, R> =>
  Effect.gen(function*() {
    const budget = requireBudget(registration.name, registration.spec)
    const arbitrary = arbitraryOf(registration.spec.of)
    const coverage = makeCoverage(registration.spec.cover, arbitrary)
    const run = checkOf(registration, arbitrary, budget, coverage.observe)
    const checked = yield* runCheck(run)
    yield* settle(registration, run, budget, coverage, checked)
  })

const programOf = <G extends Gens, S extends PropertySubject, E, R>(
  registration: Registration<G, S, E, R>,
): () => Effect.Effect<void, Cause.Cause<NonBooleanVerdict>, never> =>
() => registration.runtime.provide(program(registration))

const selfModelMessage = (name: string): string =>
  `${name}: the model is the subject itself; a model law must compare against an independent oracle.`

const gatedLedger = makeFileLedger((message) => new VacuousProperty({ detail: message }))

V.afterAll(() => {
  gatedLedger.finalise()
})

const registeredName = (name: string, kind: LawKind, exempt: boolean): string =>
  exempt ? `${name} [exempt: ${kind}]` : name

const isSelfModel = <G extends Gens, A>(subject: LawSubject<G, A>, oracle: LawSubject<G, A>): boolean =>
  Object.is(subject, oracle)

/**
 * The property surface over one runtime: `prop`, `effectProp`, and the R13 law kinds routed through the gate.
 *
 * @internal
 */
export const makeProperty = <R>(runtime: PropertyRuntime<R>): PropApi<R> => {
  const body = <G extends Gens, S extends PropertySubject, E>(
    name: string,
    spec: PropertySpec<G, S, number>,
    holds: (subject: S, values: Values<G>) => Verdict<E, R>,
    lane: Lane,
    gate: boolean,
  ): void => {
    const registration: Registration<G, S, E, R> = { runtime, name, spec, holds, lane, gate }
    runtime.register(name, programOf(registration))
  }

  const refuseSelfModel = (name: string): void => {
    runtime.register(name, () => Effect.die(new VacuousProperty({ detail: selfModelMessage(name) })))
  }

  const gated = <G extends Gens, S extends PropertySubject, N extends number>(
    name: string,
    spec: PropertySpec<G, S, N>,
    holds: (subject: S, values: Values<G>) => boolean,
    kind: LawKind,
    exempt: boolean,
  ): void => body(registeredName(name, kind, exempt), spec, holds, 'sync', exempt === false)

  const model = <G extends Gens, A, N extends number, S extends LawSubject<G, A>>(
    name: string,
    spec: PropertySpec<G, S, N>,
    oracle: LawSubject<G, A>,
  ): void =>
    isSelfModel(spec.subject, oracle) ? refuseSelfModel(name) : gated(name, spec, modelHolds(oracle), 'model', false)

  const idempotent = <G extends Gens, N extends number, S extends (value: ElementValues<G>) => ElementValues<G>>(
    name: string,
    spec: PropertySpec<G, S, N>,
  ): void => gated(name, spec, idempotentHolds<G>(), 'idempotent', true)

  const deterministic = <G extends Gens, A, N extends number, S extends LawSubject<G, A>>(
    name: string,
    spec: PropertySpec<G, S, N>,
  ): void => gated(name, spec, deterministicHolds(), 'deterministic', true)

  const law: LawApi = {
    model,
    metamorphic: (name, spec, relation) => gated(name, spec, metamorphicHolds(relation), 'metamorphic', false),
    roundTrip: (name, spec, decode) => gated(name, spec, roundTripHolds(decode), 'roundTrip', false),
    invariant: (name, spec, holds) => gated(name, spec, invariantHolds(holds), 'invariant', false),
    idempotent,
    deterministic,
  }

  return {
    prop: (name, spec, holds) => body(name, spec, holds, 'sync', true),
    effectProp: (name, spec, holds) => body(name, spec, holds, 'effect', true),
    law,
  }
}
