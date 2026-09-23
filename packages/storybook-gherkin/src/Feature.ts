import { Cause, Context, Deferred, Effect, Exit, Fiber } from 'effect'
import { dual } from 'effect/Function'
import { screen } from 'storybook/test'

import {
  BackgroundNotGiven,
  CaptureDecodeFailed,
  EmptyScenario,
  MissingThen,
  OutlineDuplicateRowName,
  OutlineEmpty,
  OutlineInconsistentKeys,
  OutlineMissingCapture,
  UnresolvedCapture,
} from './Errors.schema.js'
import type { ConcreteKeyword, ExampleRow, PlayContext, Step, StepContext, StepModel } from './Steps.js'
import { displayPattern, isStep, renderStepText, resolveKeywords, StepTag } from './Steps.js'

export interface StorySpec<TArgs = unknown> {
  readonly name: string
  readonly play: (context: PlayContext<TArgs>) => Promise<void>
}

export interface ScenarioOptions {
  /** Capture values for a plain (non-outline) scenario, keyed by capture name. */
  readonly with?: Readonly<Record<string, string>>
}

export interface FeatureOptions {
  /**
   * Context that interprets a scenario's step program at the play edge,
   * defaulting to `Context.empty()`. Supply a context carrying services
   * or a custom scheduler to make them available to the run.
   */
  readonly context?: Context.Context<never>
}

/**
 * Anything positional after the scenario name: a step, a step group from
 * `Steps(...)` / `From(...)`, or — in first position only — an options object.
 */
export type StepArg<TArgs> = Step<TArgs> | readonly Step<TArgs>[]

/**
 * A scenario title names a concrete situation in natural-language prose. Two
 * shape checks keep DAMP `Should_[Behavior]_When_[Condition]` unit-test names —
 * and every concatenated-token title shaped like one — out of the call site:
 *  1. the literal must not start with `Should`;
 *  2. the literal must contain at least one ASCII space (a single-word title is
 *     a test name, not prose).
 * Either check failing maps to `ScenarioTitleRejected`, so the call fails to
 * type-check with the rule in the diagnostic. Non-literal titles (widened
 * `string`) pass through untouched — a runtime guard would catch those, but
 * the brand is the contract this skill ships.
 */
export type ScenarioTitleRejected<T extends string> =
  | `Scenario titles are natural-language prose of a concrete situation, not DAMP Should_[Behavior]_When_[Condition] unit-test names. Got: ${T}`
  | `Scenario title must be natural-language prose (at least one space separates words); got: ${T}`

export type ScenarioTitle<T extends string> = T extends `Should${string}` ? ScenarioTitleRejected<T>
  : T extends `${string} ${string}` ? T
  : ScenarioTitleRejected<T>

export interface ScenarioFn<TArgs> {
  <TName extends string>(name: ScenarioTitle<TName>, ...steps: readonly StepArg<TArgs>[]): StorySpec<TArgs>
  <TName extends string>(
    name: ScenarioTitle<TName>,
    options: ScenarioOptions,
    ...steps: readonly StepArg<TArgs>[]
  ): StorySpec<TArgs>
}

export interface OutlineBuilder<TArgs> {
  readonly examples: (
    rows: readonly ExampleRow[],
  ) => Record<string, StorySpec<TArgs>>
}

export interface OutlineFn<TArgs> {
  <TName extends string>(name: ScenarioTitle<TName>, ...steps: readonly StepArg<TArgs>[]): OutlineBuilder<TArgs>
  <TName extends string>(
    name: ScenarioTitle<TName>,
    options: ScenarioOptions,
    ...steps: readonly StepArg<TArgs>[]
  ): OutlineBuilder<TArgs>
}

export interface RuleScope<TArgs> {
  readonly scenario: ScenarioFn<TArgs>
  readonly scenarioOutline: OutlineFn<TArgs>
}

export interface Feature<M, TArgs = unknown> {
  readonly meta: M
  readonly type: <TNext>() => Feature<M, TNext>
  readonly background: (...steps: readonly Step<TArgs>[]) => void
  readonly scenario: ScenarioFn<TArgs>
  readonly scenarioOutline: OutlineFn<TArgs>
  readonly rule: (name: string) => RuleScope<TArgs>
}

const displayKeyword = (model: StepModel): string => {
  if (model.keyword === 'Star') return '*'
  return model.keyword
}

const buildStepContext = <TArgs>(ctx: PlayContext<TArgs>): StepContext<TArgs> => ({
  canvas: ctx.canvas,
  screen,
  userEvent: ctx.userEvent,
  step: ctx.step,
  args: ctx.args,
  globals: ctx.globals,
  parameters: ctx.parameters,
  loaded: ctx.loaded,
  canvasElement: ctx.canvasElement,
  abortSignal: ctx.abortSignal,
  reporting: ctx.reporting,
  context: ctx,
})

type AnyExit<A, E = unknown> = Exit.Exit<A, E>

const squashExit = <A>(exit: AnyExit<A>): A | undefined =>
  Exit.match(exit, {
    onSuccess: (value) => value,
    onFailure: (cause) => {
      if (Exit.hasInterrupts(exit)) return undefined
      throw Cause.squash(cause)
    },
  })

const runStep = <TArgs>(
  step: Step<TArgs>,
  values: Readonly<Record<string, string>>,
  stepCtx: StepContext<TArgs>,
): Effect.Effect<void, CaptureDecodeFailed> => {
  const label = `${displayKeyword(step.model)} ${renderStepText(step.model, values)}`
  return Deferred.make<Exit.Exit<void, CaptureDecodeFailed>>().pipe(
    Effect.flatMap((done) => {
      const bridge = (): Promise<void> =>
        Effect.runPromiseExit(
          // An Exit is itself an Effect in v4 — yielding it re-raises its cause.
          Effect.flatten(Deferred.await(done)),
        ).then(squashExit)
      return Effect.forkChild(
        step.run(values, stepCtx).pipe(
          Effect.exit,
          Effect.flatMap((exit) => Deferred.succeed(done, exit)),
          Effect.ensuring(Deferred.interrupt(done).pipe(Effect.asVoid)),
        ),
      ).pipe(
        Effect.flatMap((fiber) =>
          Effect.promise(() => Promise.resolve(stepCtx.step(label, bridge))).pipe(
            Effect.flatMap(() => Fiber.join(fiber)),
            Effect.ensuring(Fiber.interrupt(fiber).pipe(Effect.asVoid)),
          )
        ),
      )
    }),
  )
}

const executeSteps = <TArgs>(
  ordered: readonly Step<TArgs>[],
  values: Readonly<Record<string, string>>,
  ctx: PlayContext<TArgs>,
): Effect.Effect<void, CaptureDecodeFailed> => {
  const stepCtx = buildStepContext(ctx)
  return Effect.forEach(ordered, (s) => runStep(s, values, stepCtx), { discard: true })
}

const interpretPlay = <A, E>(
  context: Context.Context<never>,
  program: Effect.Effect<A, E>,
  ctx: { readonly abortSignal: AbortSignal },
): Promise<A | undefined> => Effect.runPromiseExitWith(context)(program, { signal: ctx.abortSignal }).then(squashExit)

const rowValuesFor = (row: ExampleRow): Readonly<Record<string, string>> =>
  Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'name'))

const sortKeys = (keys: readonly string[]): readonly string[] => {
  const sorted = keys.slice()
  sorted.sort()
  return sorted
}

const assertNonEmptyScenario = (fullName: string, models: readonly StepModel[]): void => {
  if (models.length === 0) {
    throw EmptyScenario.make({ scenario: fullName })
  }
}

const isThen = (r: { readonly resolved: ConcreteKeyword }): boolean => r.resolved === 'Then'

const assertHasThen = (fullName: string, models: readonly StepModel[]): void => {
  if (!resolveKeywords(models).some(isThen)) {
    throw MissingThen.make({ scenario: fullName })
  }
}

const captureIsBound = (
  cap: { readonly default: string | undefined; readonly name: string },
  withRecord: Readonly<Record<string, string>>,
): boolean => {
  if (cap.default !== undefined) return true
  return Object.prototype.hasOwnProperty.call(withRecord, cap.name)
}

const assertCaptureBound = (
  fullName: string,
  stepModel: StepModel,
  cap: { readonly default: string | undefined; readonly name: string },
  withRecord: Readonly<Record<string, string>>,
): void => {
  if (captureIsBound(cap, withRecord)) return
  throw UnresolvedCapture.make({
    scenario: fullName,
    step: displayPattern(stepModel),
    capture: cap.name,
  })
}

const assertCapturesBound = (
  fullName: string,
  stepModel: StepModel,
  withRecord: Readonly<Record<string, string>>,
): void => {
  for (const cap of stepModel.captures) {
    assertCaptureBound(fullName, stepModel, cap, withRecord)
  }
}

const validateScenarioSteps = (
  fullName: string,
  models: readonly StepModel[],
  withRecord: Readonly<Record<string, string>>,
): void => {
  assertNonEmptyScenario(fullName, models)
  assertHasThen(fullName, models)
  for (const stepModel of models) {
    assertCapturesBound(fullName, stepModel, withRecord)
  }
}

const isScenarioOptions = <TArgs>(value: StepArg<TArgs> | ScenarioOptions): value is ScenarioOptions =>
  !isStep<TArgs>(value) && !Array.isArray(value)

const optionsIfPresent = <TArgs>(
  firstArg: StepArg<TArgs> | ScenarioOptions,
): ScenarioOptions | undefined => {
  if (!isScenarioOptions<TArgs>(firstArg)) return undefined
  return firstArg
}

const readOptions = <TArgs>(
  rest: readonly (StepArg<TArgs> | ScenarioOptions)[],
): ScenarioOptions | undefined => {
  const firstArg = rest[0]
  if (firstArg === undefined) return undefined
  return optionsIfPresent(firstArg)
}

const bodyAfterOptions = <TArgs>(
  rest: readonly (StepArg<TArgs> | ScenarioOptions)[],
  options: ScenarioOptions | undefined,
): readonly (StepArg<TArgs> | ScenarioOptions)[] => {
  if (options === undefined) return rest
  return rest.slice(1)
}

const pushInnerStep = <TArgs, I = unknown>(steps: Step<TArgs>[], inner: I): void => {
  if (!isStep<TArgs>(inner)) {
    throw new TypeError(`Steps group contains a non-step value of type ${typeof inner}`)
  }
  steps.push(inner)
}

const pushStepGroup = <TArgs, I = unknown>(steps: Step<TArgs>[], item: readonly I[]): void => {
  for (const inner of item) {
    pushInnerStep(steps, inner)
  }
}

const pushIfGroup = <TArgs>(
  steps: Step<TArgs>[],
  item: StepArg<TArgs> | ScenarioOptions,
): void => {
  if (Array.isArray(item)) {
    pushStepGroup(steps, item)
    return
  }
  throw new TypeError(`Scenario arguments must be steps or step groups; got type ${typeof item}`)
}

const pushScenarioItem = <TArgs>(
  steps: Step<TArgs>[],
  item: StepArg<TArgs> | ScenarioOptions,
): void => {
  if (isStep<TArgs>(item)) {
    steps.push(item)
    return
  }
  pushIfGroup(steps, item)
}

const parseScenarioArgs = <TArgs>(
  rest: readonly (StepArg<TArgs> | ScenarioOptions)[],
): { readonly options: ScenarioOptions | undefined; readonly steps: readonly Step<TArgs>[] } => {
  const options = readOptions(rest)
  const body = bodyAfterOptions(rest, options)
  const steps: Step<TArgs>[] = []
  for (const item of body) {
    pushScenarioItem(steps, item)
  }
  return { options, steps }
}

const qualifyName = (prefix: string, name: string): string => {
  if (prefix === '') return name
  return `${prefix}: ${name}`
}

const recordOrEmpty = (
  value: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> => {
  if (value === undefined) return {}
  return value
}

const withRecordOf = (options: ScenarioOptions | undefined): Readonly<Record<string, string>> => {
  if (options === undefined) return {}
  return recordOrEmpty(options.with)
}

const makeScenario = <TArgs>(
  background: readonly Step<TArgs>[],
  prefix: string,
  context: Context.Context<never>,
): ScenarioFn<TArgs> => {
  function scenario(
    name: string,
    ...steps: readonly StepArg<TArgs>[]
  ): StorySpec<TArgs>
  function scenario(
    name: string,
    options: ScenarioOptions,
    ...steps: readonly StepArg<TArgs>[]
  ): StorySpec<TArgs>
  function scenario(
    name: string,
    ...rest: readonly (StepArg<TArgs> | ScenarioOptions)[]
  ): StorySpec<TArgs> {
    const { options, steps } = parseScenarioArgs(rest)
    const fullName = qualifyName(prefix, name)
    const withRecord = withRecordOf(options)
    validateScenarioSteps(fullName, steps.map((s) => s.model), withRecord)
    return {
      name: fullName,
      play: (ctx: PlayContext<TArgs>) =>
        interpretPlay(context, executeSteps([...background, ...steps], withRecord, ctx), ctx),
    }
  }
  return scenario
}

const assertOutlineNonEmpty = (rows: readonly ExampleRow[], fullName: string): void => {
  if (rows.length === 0) throw OutlineEmpty.make({ outline: fullName })
}

const isNotName = (k: string): boolean => k !== 'name'

const keysExceptName = (row: object): readonly string[] => sortKeys(Object.keys(row).filter(isNotName))

const firstRowKeys = (rows: readonly ExampleRow[]): readonly string[] => {
  const first = rows[0]
  if (first === undefined) return []
  return keysExceptName(first)
}

const rememberRowName = (seen: Set<string>, row: ExampleRow, fullName: string): void => {
  if (seen.has(row.name)) {
    throw OutlineDuplicateRowName.make({ outline: fullName, name: row.name })
  }
  seen.add(row.name)
}

const keyAtMatches = (actual: readonly string[], expected: readonly string[], i: number): boolean =>
  actual[i] === expected[i]

const keysMatch = (actual: readonly string[], expected: readonly string[]): boolean => {
  if (actual.length !== expected.length) return false
  return actual.every((_, i) => keyAtMatches(actual, expected, i))
}

const assertKeysConsistent = (row: ExampleRow, firstKeys: readonly string[], fullName: string): void => {
  const actual = keysExceptName(row)
  if (keysMatch(actual, firstKeys)) return
  throw OutlineInconsistentKeys.make({
    outline: fullName,
    row: row.name,
    expected: [...firstKeys],
    actual: [...actual],
  })
}

const assertRowHasCapture = (row: ExampleRow, cap: string, fullName: string): void => {
  if (Object.prototype.hasOwnProperty.call(row, cap)) return
  throw OutlineMissingCapture.make({
    outline: fullName,
    row: row.name,
    capture: cap,
  })
}

const assertRowCaptures = (
  row: ExampleRow,
  captureNames: ReadonlySet<string>,
  fullName: string,
): void => {
  for (const cap of captureNames) {
    assertRowHasCapture(row, cap, fullName)
  }
}

const validateOneRow = (
  seenRowNames: Set<string>,
  row: ExampleRow,
  firstKeys: readonly string[],
  captureNames: ReadonlySet<string>,
  fullName: string,
): void => {
  rememberRowName(seenRowNames, row, fullName)
  assertKeysConsistent(row, firstKeys, fullName)
  assertRowCaptures(row, captureNames, fullName)
}

const validateOutlineRows = (
  rows: readonly ExampleRow[],
  captureNames: ReadonlySet<string>,
  fullName: string,
): void => {
  assertOutlineNonEmpty(rows, fullName)
  const seenRowNames = new Set<string>()
  const firstKeys = firstRowKeys(rows)
  for (const row of rows) {
    validateOneRow(seenRowNames, row, firstKeys, captureNames, fullName)
  }
}

const addModelCaptures = (captureNames: Set<string>, m: StepModel): void => {
  for (const c of m.captures) {
    captureNames.add(c.name)
  }
}

const collectCaptureNames = (models: readonly StepModel[]): Set<string> => {
  const captureNames = new Set<string>()
  for (const m of models) {
    addModelCaptures(captureNames, m)
  }
  return captureNames
}

const makeOutline = <TArgs>(
  background: readonly Step<TArgs>[],
  prefix: string,
  context: Context.Context<never>,
): OutlineFn<TArgs> => {
  function outline(
    name: string,
    ...steps: readonly StepArg<TArgs>[]
  ): OutlineBuilder<TArgs>
  function outline(
    name: string,
    options: ScenarioOptions,
    ...steps: readonly StepArg<TArgs>[]
  ): OutlineBuilder<TArgs>
  function outline(
    name: string,
    ...rest: readonly (StepArg<TArgs> | ScenarioOptions)[]
  ): OutlineBuilder<TArgs> {
    const { options, steps } = parseScenarioArgs(rest)
    const fullName = qualifyName(prefix, name)
    const withRecord = withRecordOf(options)
    const models = steps.map((s) => s.model)
    assertNonEmptyScenario(fullName, models)
    assertHasThen(fullName, models)
    const captureNames = collectCaptureNames(models)

    const buildRowSpec = (row: ExampleRow): StorySpec<TArgs> => {
      const values = { ...withRecord, ...rowValuesFor(row) }
      return {
        name: `${fullName} — ${row.name}`,
        play: (ctx: PlayContext<TArgs>) =>
          interpretPlay(
            context,
            executeSteps([...background, ...steps], values, ctx),
            ctx,
          ),
      }
    }

    const examples = (
      rows: readonly ExampleRow[],
    ): Record<string, StorySpec<TArgs>> => {
      validateOutlineRows(rows, captureNames, fullName)
      const out: Record<string, StorySpec<TArgs>> = {}
      for (const row of rows) out[row.name] = buildRowSpec(row)
      return out
    }

    const builder: OutlineBuilder<TArgs> = { examples }
    return builder
  }
  return outline
}

const assertResolvedGiven = <TArgs>(step: Step<TArgs>, resolved: ConcreteKeyword): void => {
  if (resolved === 'Given') return
  throw BackgroundNotGiven.make({
    step: displayPattern(step.model),
    resolved,
  })
}

const assertBackgroundResolved = <TArgs>(
  step: Step<TArgs>,
  resolvedEntry: { readonly resolved: ConcreteKeyword } | undefined,
): void => {
  if (resolvedEntry === undefined) return
  assertResolvedGiven(step, resolvedEntry.resolved)
}

const assertBackgroundStep = <TArgs>(
  step: Step<TArgs> | undefined,
  resolvedEntry: { readonly resolved: ConcreteKeyword } | undefined,
): void => {
  if (step === undefined) return
  assertBackgroundResolved(step, resolvedEntry)
}

const makeBackground = <TArgs>(background: Step<TArgs>[]) => (...steps: readonly Step<TArgs>[]): void => {
  const resolvedKeywords = resolveKeywords(steps.map((s) => s.model))
  for (let i = 0; i < steps.length; i++) {
    assertBackgroundStep(steps[i], resolvedKeywords[i])
  }
  background.push(...steps)
}

const makeFeature = <M, TArgs = unknown>(
  meta: M,
  context: Context.Context<never>,
): Feature<M, TArgs> => {
  const background: Step<TArgs>[] = []
  const feature: Feature<M, TArgs> = {
    meta,
    type: <TNext>(): Feature<M, TNext> => makeFeature<M, TNext>(meta, context),
    background: makeBackground<TArgs>(background),
    scenario: makeScenario<TArgs>(background, '', context),
    scenarioOutline: makeOutline<TArgs>(background, '', context),
    rule: (ruleName: string): RuleScope<TArgs> => ({
      scenario: makeScenario<TArgs>(background, ruleName, context),
      scenarioOutline: makeOutline<TArgs>(background, ruleName, context),
    }),
  }
  return feature
}

const contextOf = (options: FeatureOptions): Context.Context<never> => {
  if (options.context === undefined) return Context.empty()
  return options.context
}

const featureImpl = <M>(meta: M, options: FeatureOptions): Feature<M> => makeFeature<M>(meta, contextOf(options))

/**
 * Declare a feature: a story set whose scenarios execute as CSF `play`
 * functions. `options.context` (default `Context.empty()`) is the Effect
 * context interpreting each scenario's composed step program exactly once,
 * at the play edge.
 */
export const feature: {
  <M>(options: FeatureOptions): (meta: M) => Feature<M>
  <M>(meta: M, options: FeatureOptions): Feature<M>
} = dual(2, featureImpl)

export const Steps = <TArgs>(...steps: readonly Step<TArgs>[]): Step<TArgs>[] => [...steps]

interface StoryWithPlay<TArgs> {
  readonly play?: (context: PlayContext<TArgs>) => Promise<void> | void
}

export const From = <TArgs>(story: StoryWithPlay<TArgs>): Step<TArgs>[] => {
  const play = story.play
  if (play === undefined) return []
  const step: Step<TArgs> = {
    ...StepTag,
    model: { keyword: 'Given', parts: ['the prior scenario completed'], captures: [] },
    run: (_values: Readonly<Record<string, string>>, ctx: StepContext<TArgs>) =>
      Effect.promise(() => Promise.resolve(play(ctx.context))),
  }
  return [step]
}
