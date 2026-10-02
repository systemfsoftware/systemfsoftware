/**
 * @internal The lawful property engine (R11-R15): a property names the function under test, takes a budget
 * that merges its own fields over the configured default over `runs: 100`, accepts only a literal boolean
 * verdict (or an `Effect` of one), judges coverage classes with QuickCheck's sequential test, and defers the
 * constant-impostor verdict to the end of the file.
 *
 * `of` accepts what upstream accepts — a tuple or record of Schemas or Arbitraries (KTD10) — and `holds`
 * receives the generated values exactly as drawn, typed by the gens that produced them.
 */
import * as Arbitrary from 'effect/Arbitrary'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Random from 'effect/Random'
import * as Ref from 'effect/Ref'
import * as Schema from 'effect/Schema'
import { callFrame, withRaisingFrame } from '../call-site.js'
import { InvalidBudget } from '../errors.schema.js'
import { type TestIdentity, witnessOf } from '../failure-record.js'
import { countHit, type CoverageClass, type CoverageDraw, type CoverageFailure, judgeCoverage } from './coverage.js'
import { checkDefaultsKey, type ProvidedCheckDefaults } from './defaults.js'
import {
  CoverageBelowMinimum,
  NonBooleanVerdict,
  PropertyRefuted,
  type PropertyRun,
  PropertyRunCount,
  PropertySeed,
  PropertyShrinkCount,
  SelfModelLaw,
  type VerdictKind,
} from './error.schema.js'
import { type FileLedger, type Impostor, impostorOf, type Opaque, type Refutation, type Subject } from './impostor.js'
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
import { type PropertyReplayValue, replayOfToken } from './replay.js'
import { resolveSeed, topUpSeed } from './seed.js'

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
  /**
   * The property's own run count. Omitted, the configured default applies; when the run provides none,
   * the built-in default of 100 does.
   */
  readonly runs?: N & PropertyRuns<N>
  /** Labelled input predicates, each with the minimum share of runs it must see (R14). */
  readonly cover?: Readonly<Record<string, readonly [CoveragePredicate<G>, number]>>
  /** The property's own check options, merged field by field over the provided and built-in defaults. */
  readonly arbitrary?: Arbitrary.CheckOptions
}

/** @internal */
export interface PropertyTask {
  /** The property's run-time identity (KTD3): its package, project-relative file and full name. */
  readonly identity: TestIdentity
  /** The absolute path of the test file, which the seed store is written beside (KTD6). */
  readonly filepath: string
  /** The provided property budget, or `undefined` when the run provided none. */
  readonly budget: ProvidedCheckDefaults | undefined
}

/** @internal */
export interface PropertyRuntime<R> {
  /** Registers the property's program; the runtime runs it inside the test it registers, under that test's binding. */
  readonly register: (
    name: string,
    program: (task: PropertyTask) => Effect.Effect<void, Cause.Cause<NonBooleanVerdict>, never>,
  ) => void
  readonly provide: <A, E>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, never>
  /** The file ledger every property of this runtime records its impostor verdict into (R20, KTD10). */
  readonly ledger: FileLedger
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

type CoverageEntry<G extends Gens> = readonly [CoveragePredicate<G>, number]

type CoverSpec<G extends Gens> = Readonly<Record<string, CoverageEntry<G>>>

type CoverEntries<G extends Gens> = ReadonlyArray<readonly [string, CoverageEntry<G>]>

interface Budget {
  readonly runs: number
  readonly options: Arbitrary.CheckOptions
  readonly seed: number
}

interface Registration<G extends Gens, S extends PropertySubject, E, R> {
  readonly runtime: PropertyRuntime<R>
  readonly name: string
  readonly spec: PropertySpec<G, S, number>
  readonly holds: (subject: S, values: Values<G>) => Verdict<E, R>
  readonly lane: Lane
  readonly gate: boolean
  /** The site the property was declared at, captured there because the fork judges it later (KTD6). */
  readonly site: string | undefined
}

interface Run<G extends Gens, S extends PropertySubject, E, R> {
  readonly name: string
  readonly lane: Lane
  readonly subject: S
  readonly holds: (subject: S, values: Values<G>) => Verdict<E, R>
  readonly arbitrary: Arbitrary.Arbitrary<Values<G>>
  readonly observe: (values: Values<G>) => void
  readonly options: Arbitrary.CheckOptions
  readonly seed: number
  /** The property's declaration site, which its failure leads with (KTD6). */
  readonly site: string | undefined
  /** The file ledger the impostor verdict is recorded into (KTD10). */
  readonly ledger: FileLedger
}

/** The non-boolean verdicts a run saw: every kind returned, and the first drawn values whose verdict was not a boolean. */
interface Violations {
  readonly kinds: Array<VerdictKind>
  drawn: Opaque
  seen: boolean
}

const newViolations = (): Violations => ({ kinds: [], drawn: undefined, seen: false })

interface Checked<G extends Gens> {
  readonly violations: Violations
  readonly result: Arbitrary.CheckResult<Values<G>, Opaque>
}

interface CoverageRecorder<G extends Gens> {
  readonly observe: (values: Values<G>) => void
  readonly judge: () => ReadonlyArray<CoverageFailure>
}

const DEFAULT_RUNS = 100

const isPositiveInteger = (runs: number): boolean => Number.isInteger(runs) && runs > 0

const describeRuns = (runs: number): string => Number.isInteger(runs) ? `${String(runs)}` : 'a non-integer'

const invalidPropertyBudget = (name: string, runs: number): string =>
  `${name}: pass a positive integer \`runs\`; received ${describeRuns(runs)}. Write ${REWRITE}.`

const invalidProvidedBudget = (runs: number): string =>
  `the configured property budget (${checkDefaultsKey}) supplies \`runs\`: ${describeRuns(runs)}; ` +
  'it must be a positive integer.'

const invalidPropertySeed = (name: string, seed: number): string =>
  `${name}: pass a non-negative integer \`seed\`; received ${describeRuns(seed)}. Write ${REWRITE}.`

const isNonInteger = (value: number): boolean => Number.isInteger(value) === false

const isNegative = (value: number): boolean => value < 0

const isInvalidSeedNumber = (value: number): boolean => isNonInteger(value) || isNegative(value)

const isInvalidSeed = (seed: string | number | undefined): seed is number =>
  typeof seed === 'number' && isInvalidSeedNumber(seed)

const requireOwnSeed = (name: string, seed: string | number | undefined): void => {
  if (isInvalidSeed(seed)) throw new InvalidBudget({ detail: invalidPropertySeed(name, seed) })
}

const requirePositiveRuns = (message: (runs: number) => string, runs: number | undefined): void => {
  if (isInvalidRuns(runs)) throw new InvalidBudget({ detail: message(runs) })
}

const isInvalidRuns = (runs: number | undefined): runs is number =>
  runs !== undefined && isPositiveInteger(runs) === false

type BudgetInput = { readonly runs?: number | undefined; readonly arbitrary?: Arbitrary.CheckOptions | undefined }

/** The property's own explicit fields, a property-level `runs` outranking the same field in `arbitrary`. */
const explicitOptions = (spec: BudgetInput): Arbitrary.CheckOptions =>
  spec.runs === undefined ? { ...spec.arbitrary } : { ...spec.arbitrary, runs: spec.runs }

const mergedOptions = (
  provided: ProvidedCheckDefaults | undefined,
  explicit: Arbitrary.CheckOptions,
): Arbitrary.CheckOptions => ({ runs: DEFAULT_RUNS, ...provided, ...explicit })

const resolvedRuns = (options: Arbitrary.CheckOptions): number => options.runs ?? DEFAULT_RUNS

/**
 * The effective check options: the property's own fields over the configured default over `runs: 100`,
 * merged field by field so a property that sets only `runs` still inherits the configured size and caps.
 * The resolved seed replaces the provided and explicit `seed` fields, which are inputs to the derivation
 * rather than a shared stream (KTD4).
 */
const EMPTY_PROVIDED_BUDGET: ProvidedCheckDefaults = {}

const resolveBudget = (name: string, spec: BudgetInput, task: PropertyTask, fresh: number): Budget => {
  const explicit = explicitOptions(spec)
  const provided = task.budget ?? EMPTY_PROVIDED_BUDGET
  requirePositiveRuns((runs) => invalidPropertyBudget(name, runs), explicit.runs)
  requirePositiveRuns(invalidProvidedBudget, provided.runs)
  requireOwnSeed(name, explicit.seed)
  const options = mergedOptions(task.budget, explicit)
  const seed = resolveSeed({ own: explicit.seed, provided: provided.seed, identity: task.identity, fresh })
  return { runs: resolvedRuns(options), options: { ...options, seed }, seed }
}

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

const minimumOf = <G extends Gens>(entry: CoverageEntry<G>): number => entry[1]

const seedClasses = <G extends Gens>(entries: CoverEntries<G>): Map<string, CoverageClass> => {
  const classes = new Map<string, CoverageClass>()
  for (const [label, entry] of entries) classes.set(label, { hits: 0, minimum: minimumOf(entry) })
  return classes
}

const satisfiedLabels = <G extends Gens>(entries: CoverEntries<G>, values: Values<G>): ReadonlyArray<string> =>
  entries.filter(([, entry]) => entry[0](...spreadValues(values))).map(([label]) => label)

const observeRun = <G extends Gens>(
  classes: Map<string, CoverageClass>,
  counter: { runs: number },
  entries: CoverEntries<G>,
  values: Values<G>,
): void => {
  counter.runs = counter.runs + 1
  for (const label of satisfiedLabels(entries, values)) countHit(classes, label)
}

const drawFor = <G extends Gens>(
  entries: CoverEntries<G>,
  arbitrary: Arbitrary.Arbitrary<Values<G>>,
  seed: number,
): CoverageDraw => {
  const drawn = Ref.makeUnsafe(0)
  return {
    more: (count) => {
      const soFar = Effect.runSync(Ref.getAndUpdate(drawn, (total) => total + count))
      const sampled = Effect.runSync(
        Arbitrary.sampleEffect(arbitrary, { count, seed: topUpSeed(seed, soFar) }).pipe(Effect.orDie),
      )
      return sampled.map((values) => satisfiedLabels(entries, values))
    },
  }
}

const noCoverage = <G extends Gens>(): CoverageRecorder<G> => ({
  observe: () => undefined,
  judge: () => [],
})

const liveCoverage = <G extends Gens>(
  cover: CoverSpec<G>,
  arbitrary: Arbitrary.Arbitrary<Values<G>>,
  seed: number,
): CoverageRecorder<G> => {
  const entries: CoverEntries<G> = Object.entries(cover)
  const classes = seedClasses(entries)
  const counter: { runs: number } = { runs: 0 }
  return {
    observe: (values) => observeRun(classes, counter, entries, values),
    judge: () =>
      judgeCoverage({
        classes: Object.fromEntries(classes),
        runs: counter.runs,
        draw: drawFor(entries, arbitrary, seed),
      }),
  }
}

const makeCoverage = <G extends Gens>(
  cover: CoverSpec<G> | undefined,
  arbitrary: Arbitrary.Arbitrary<Values<G>>,
  seed: number,
): CoverageRecorder<G> => cover === undefined ? noCoverage() : liveCoverage(cover, arbitrary, seed)

const verdictKindOf = (verdict: Opaque): VerdictKind => Effect.isEffect(verdict) ? 'effect' : typeof verdict

const noteKind = (violations: Violations, kind: VerdictKind): void => {
  if (violations.kinds.includes(kind) === false) violations.kinds.push(kind)
}

const noteDrawn = (violations: Violations, values: Opaque): void => {
  if (violations.seen === false) {
    violations.seen = true
    violations.drawn = values
  }
}

const noteVerdict = (violations: Violations, verdict: Opaque, values: Opaque): boolean => {
  noteKind(violations, verdictKindOf(verdict))
  noteDrawn(violations, values)
  return true
}

const literalVerdict = (verdict: Opaque, violations: Violations, values: Opaque): boolean =>
  typeof verdict === 'boolean' ? verdict : noteVerdict(violations, verdict, values)

const effectVerdict = <E, R>(
  lane: Lane,
  verdict: Effect.Effect<boolean, E, R>,
  violations: Violations,
  values: Opaque,
): Effect.Effect<boolean, E, R> =>
  lane === 'sync'
    ? Effect.succeed(noteVerdict(violations, verdict, values))
    : Effect.map(verdict, (value) => literalVerdict(value, violations, values))

const verdictFor = <G extends Gens, S extends PropertySubject, E, R>(
  run: Run<G, S, E, R>,
  values: Values<G>,
  violations: Violations,
): Effect.Effect<boolean, E, R> => {
  run.observe(values)
  const verdict = run.holds(run.subject, values)
  return Effect.isEffect(verdict)
    ? effectVerdict(run.lane, verdict, violations, values)
    : Effect.succeed(literalVerdict(verdict, violations, values))
}

const tolerateInterruption = <E>(
  cause: Cause.Cause<E>,
): Effect.Effect<boolean, Cause.Cause<E>> => Cause.hasInterrupts(cause) ? Effect.interrupt : Effect.fail(cause)

const guardedVerdict = <G extends Gens, S extends PropertySubject, E, R>(
  run: Run<G, S, E, R>,
  violations: Violations,
): (values: Values<G>) => Effect.Effect<boolean, Cause.Cause<E>, R> =>
(values) => Effect.catchCause(Effect.suspend(() => verdictFor(run, values, violations)), tolerateInterruption)

const runCheck = <G extends Gens, S extends PropertySubject, E, R>(
  run: Run<G, S, E, R>,
): Effect.Effect<Checked<G>, Cause.Cause<NonBooleanVerdict>, R> => {
  const violations = newViolations()
  return Arbitrary.checkEffect(run.arbitrary, guardedVerdict(run, violations), run.options).pipe(
    Effect.map((result) => ({ violations, result })),
  )
}

const reportOf = <G extends Gens>(checked: Checked<G>): string | undefined =>
  Arbitrary.formatCheckFailure(checked.result)

const seeded = (seed: number): PropertySeed => Option.getOrThrow(Schema.decodeOption(PropertySeed)(seed))

const runCounted = (runs: number): PropertyRunCount => Option.getOrThrow(Schema.decodeOption(PropertyRunCount)(runs))

const propertyRunOf = <G extends Gens, S extends PropertySubject, E, R>(
  run: Run<G, S, E, R>,
  budget: Budget,
): PropertyRun => ({
  name: run.name,
  site: run.site ?? null,
  seed: seeded(budget.seed),
  runs: runCounted(budget.runs),
})

const violationOf = <G extends Gens, S extends PropertySubject, E, R>(
  run: Run<G, S, E, R>,
  budget: Budget,
  checked: Checked<G>,
): NonBooleanVerdict | undefined =>
  checked.violations.kinds.length === 0 ? undefined : new NonBooleanVerdict({
    property: propertyRunOf(run, budget),
    drawn: witnessOf(checked.violations.drawn),
    returned: [...checked.violations.kinds],
  })

const isRefuted = <G extends Gens>(checked: Checked<G>): boolean =>
  checked.violations.kinds.length > 0 || reportOf(checked) !== undefined

const dieWithSite = (error: Error, site: string | undefined): Effect.Effect<never, never, never> =>
  Effect.die(withRaisingFrame(error, site))

const shrinkCounted = (shrinks: number): PropertyShrinkCount =>
  Option.getOrThrow(Schema.decodeOption(PropertyShrinkCount)(shrinks))

const NO_FALSIFICATION = { counterexample: witnessOf(undefined), shrinks: shrinkCounted(0) }

const falsificationOf = (
  falsified: Arbitrary.Falsified<Opaque, Opaque> | undefined,
): Pick<PropertyRefuted, 'counterexample' | 'shrinks'> =>
  falsified === undefined
    ? NO_FALSIFICATION
    : { counterexample: witnessOf(falsified.shrunkInput), shrinks: shrinkCounted(falsified.shrinks) }

const refutedOf = <G extends Gens>(
  property: PropertyRun,
  checked: Checked<G>,
  replay: PropertyReplayValue | undefined,
): PropertyRefuted => {
  const fields = { property, ...falsificationOf(falsifiedOf(checked.result)) }
  return replay === undefined ? new PropertyRefuted(fields) : new PropertyRefuted({ ...fields, replay })
}

const dieReported = <G extends Gens, S extends PropertySubject, E, R>(
  run: Run<G, S, E, R>,
  budget: Budget,
  checked: Checked<G>,
  replay: PropertyReplayValue | undefined,
  site: string | undefined,
): Effect.Effect<never, never, never> => dieWithSite(refutedOf(propertyRunOf(run, budget), checked, replay), site)

const dieUncovered = <G extends Gens, S extends PropertySubject, E, R>(
  run: Run<G, S, E, R>,
  budget: Budget,
  classes: ReadonlyArray<CoverageFailure>,
  site: string | undefined,
): Effect.Effect<never, never, never> =>
  dieWithSite(new CoverageBelowMinimum({ property: propertyRunOf(run, budget), classes }), site)

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
  const verdict: Refutation = {
    refuted: isRefuted(checked),
    property: propertyRunOf(run, budget),
    frozen: impostor.frozen(),
  }
  run.ledger.record(run.subject, verdict)
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
  const failures = coverage.judge()
  return failures.length === 0
    ? gateRun(run, budget, gate)
    : dieUncovered(run, budget, failures, run.site)
}

const falsifiedOf = <G extends Gens>(
  result: Arbitrary.CheckResult<Values<G>, Opaque>,
): Arbitrary.Falsified<Values<G>, Opaque> | undefined => 'replay' in result ? result : undefined

const replayOfChecked = <G extends Gens>(checked: Checked<G>): PropertyReplayValue | undefined =>
  Option.getOrUndefined(
    Option.flatMap(
      Option.fromNullishOr(falsifiedOf(checked.result)),
      (falsified) => Option.fromNullishOr(replayOfToken(falsified.replay)),
    ),
  )

const settleReport = <G extends Gens, S extends PropertySubject, E, R>(
  run: Run<G, S, E, R>,
  budget: Budget,
  coverage: CoverageRecorder<G>,
  gate: boolean,
  report: string | undefined,
  replay: PropertyReplayValue | undefined,
  checked: Checked<G>,
): Effect.Effect<void, Cause.Cause<NonBooleanVerdict>, R> =>
  report === undefined
    ? finishPassed(run, budget, coverage, gate)
    : dieReported(run, budget, checked, replay, run.site)

const settle = <G extends Gens, S extends PropertySubject, E, R>(
  registration: Registration<G, S, E, R>,
  run: Run<G, S, E, R>,
  budget: Budget,
  coverage: CoverageRecorder<G>,
  checked: Checked<G>,
): Effect.Effect<void, Cause.Cause<NonBooleanVerdict>, R> => {
  const violation = violationOf(run, budget, checked)
  return violation === undefined
    ? settleReport(run, budget, coverage, registration.gate, reportOf(checked), replayOfChecked(checked), checked)
    : dieWithSite(violation, registration.site)
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
  seed: budget.seed,
  site: registration.site,
  ledger: registration.runtime.ledger,
})

const program = <G extends Gens, S extends PropertySubject, E, R>(
  registration: Registration<G, S, E, R>,
  task: PropertyTask,
): Effect.Effect<void, Cause.Cause<NonBooleanVerdict>, R> =>
  Effect.gen(function*() {
    const fresh = (yield* Random.nextInt) >>> 0
    const budget = resolveBudget(registration.name, registration.spec, task, fresh)
    const arbitrary = arbitraryOf(registration.spec.of)
    const coverage = makeCoverage(registration.spec.cover, arbitrary, budget.seed)
    const run = checkOf(registration, arbitrary, budget, coverage.observe)
    const checked = yield* runCheck(run)
    yield* settle(registration, run, budget, coverage, checked)
  })

const programOf = <G extends Gens, S extends PropertySubject, E, R>(
  registration: Registration<G, S, E, R>,
): (task: PropertyTask) => Effect.Effect<void, Cause.Cause<NonBooleanVerdict>, never> =>
(task) => registration.runtime.provide(program(registration, task))

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
    const registration: Registration<G, S, E, R> = { runtime, name, spec, holds, lane, gate, site: callFrame() }
    runtime.register(name, programOf(registration))
  }

  const refuseSelfModel = (name: string): void => {
    const site = callFrame()
    runtime.register(name, (_task) => dieWithSite(new SelfModelLaw({ name, site: site ?? null }), site))
  }

  const gated = <G extends Gens, S extends PropertySubject, N extends number>(
    name: string,
    spec: PropertySpec<G, S, N>,
    holds: (subject: S, values: Values<G>) => boolean,
    kind: LawKind,
    exempt: boolean,
  ): void => {
    if (exempt) runtime.ledger.recordExempt(name, kind)
    body(registeredName(name, kind, exempt), spec, holds, 'sync', exempt === false)
  }

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
