import { Cause, Context, Deferred, Effect, Exit, Fiber } from 'effect'
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
} from './errors.js'
import type { ExampleRow, PlayContext, Step, StepContext, StepModel } from './steps.observer.js'
import { displayPattern, isStep, renderStepText, resolveKeywords } from './steps.observer.js'

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

export interface ScenarioFn<TArgs> {
  (name: string, ...steps: readonly StepArg<TArgs>[]): StorySpec<TArgs>
  (name: string, options: ScenarioOptions, ...steps: readonly StepArg<TArgs>[]): StorySpec<TArgs>
}

export interface OutlineBuilder<TArgs> {
  readonly examples: (
    rows: readonly ExampleRow[],
  ) => Record<string, StorySpec<TArgs>>
}

export interface OutlineFn<TArgs> {
  (name: string, ...steps: readonly StepArg<TArgs>[]): OutlineBuilder<TArgs>
  (name: string, options: ScenarioOptions, ...steps: readonly StepArg<TArgs>[]): OutlineBuilder<TArgs>
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

const displayKeyword = (model: StepModel): string => model.keyword === 'Star' ? '*' : model.keyword

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

/**
 * Total classification of an interpreted program's `Exit`, shared by the play
 * edge and the step bridge: interruption resolves silently, success returns
 * the value, and any other cause is rethrown as the original error instance
 * (`Cause.squash`) so Storybook's panel keeps the matcher diff.
 */
const squashExit = <A>(exit: Exit.Exit<A, unknown>): A | undefined =>
  Exit.match(exit, {
    onSuccess: (value) => value,
    onFailure: (cause) => {
      if (Exit.hasInterrupts(exit)) return undefined
      throw Cause.squash(cause)
    },
  })

/**
 * One scenario step, composed as an Effect. Storybook's instrumented `step`
 * expects a promise whose settlement tracks the step's work, so the body runs
 * in a child fiber that settles a deferred; the bridge promise given to
 * `ctx.step` awaits that deferred and rejects with the step's original error.
 * The bridge interprets only this pure signalling effect; user code runs in
 * the single play-edge interpretation. The `ensuring` finalizer interrupts
 * the child on every parent exit — success (no-op on a joined fiber),
 * failure, and interruption — so an independently failed `ctx.step` never
 * orphans a running step body.
 */
const runStep = <TArgs>(
  step: Step<TArgs>,
  values: Readonly<Record<string, string>>,
  stepCtx: StepContext<TArgs>,
  ctx: PlayContext<TArgs>,
): Effect.Effect<void, CaptureDecodeFailed> => {
  const label = `${displayKeyword(step.model)} ${renderStepText(step.model, values)}`
  return Deferred.make<Exit.Exit<void, CaptureDecodeFailed>>().pipe(
    Effect.flatMap((done) => {
      const bridge = (): Promise<void> =>
        Effect.runPromiseExit(
          Deferred.await(done).pipe(
            Effect.flatMap((exit) =>
              Exit.match(exit, {
                onSuccess: () => Effect.void,
                onFailure: (cause) => Exit.hasInterrupts(exit) ? Effect.void : Effect.failCause(cause),
              })
            ),
          ),
        ).then(squashExit)
      return Effect.forkChild(
        step.run(values, stepCtx).pipe(
          Effect.exit,
          Effect.flatMap((exit) => Deferred.succeed(done, exit)),
          Effect.ensuring(Deferred.interrupt(done).pipe(Effect.asVoid)),
        ),
      ).pipe(
        Effect.flatMap((fiber) =>
          Effect.promise(() => Promise.resolve(ctx.step(label, bridge))).pipe(
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
  return Effect.forEach(ordered, (s) => runStep(s, values, stepCtx, ctx), { discard: true })
}

/** The single interpretation edge of the package. */
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

const validateScenarioSteps = (
  fullName: string,
  models: readonly StepModel[],
  withRecord: Readonly<Record<string, string>>,
): void => {
  if (models.length === 0) {
    throw EmptyScenario.make({ scenario: fullName })
  }
  if (!resolveKeywords(models).some((r) => r.resolved === 'Then')) {
    throw MissingThen.make({ scenario: fullName })
  }
  for (const stepModel of models) {
    for (const cap of stepModel.captures) {
      const hasDefault = cap.default !== undefined
      const hasWith = Object.prototype.hasOwnProperty.call(withRecord, cap.name)
      if (!hasDefault && !hasWith) {
        throw UnresolvedCapture.make({
          scenario: fullName,
          step: displayPattern(stepModel),
          capture: cap.name,
        })
      }
    }
  }
}

const isScenarioOptions = <TArgs>(value: StepArg<TArgs> | ScenarioOptions): value is ScenarioOptions =>
  !isStep<TArgs>(value) && !Array.isArray(value)

const parseScenarioArgs = <TArgs>(
  rest: readonly (StepArg<TArgs> | ScenarioOptions)[],
): { readonly options: ScenarioOptions | undefined; readonly steps: readonly Step<TArgs>[] } => {
  const firstArg: StepArg<TArgs> | ScenarioOptions | undefined = rest[0]
  const options: ScenarioOptions | undefined = firstArg !== undefined && isScenarioOptions<TArgs>(firstArg)
    ? firstArg
    : undefined
  const body = options === undefined ? rest : rest.slice(1)
  const steps: Step<TArgs>[] = []
  for (const item of body) {
    if (isStep<TArgs>(item)) {
      steps.push(item)
    } else if (Array.isArray(item)) {
      for (const inner of item) {
        if (!isStep<TArgs>(inner)) {
          throw new TypeError(`Steps group contains a non-step value of type ${typeof inner}`)
        }
        steps.push(inner)
      }
    } else {
      throw new TypeError(`Scenario arguments must be steps or step groups; got type ${typeof item}`)
    }
  }
  return { options, steps }
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
  ): unknown {
    const { options, steps } = parseScenarioArgs(rest)
    const fullName = prefix === '' ? name : `${prefix}: ${name}`
    const withRecord: Readonly<Record<string, string>> = options?.with ?? {}
    validateScenarioSteps(fullName, steps.map((s) => s.model), withRecord)
    return {
      name: fullName,
      play: (ctx: PlayContext<TArgs>) =>
        interpretPlay(context, executeSteps([...background, ...steps], withRecord, ctx), ctx),
    }
  }
  return scenario
}

const validateOutlineRows = (
  rows: readonly ExampleRow[],
  captureNames: ReadonlySet<string>,
  fullName: string,
): void => {
  if (rows.length === 0) throw OutlineEmpty.make({ outline: fullName })
  const seenRowNames = new Set<string>()
  const firstKeys = sortKeys(Object.keys(rows[0] ?? {}).filter((k) => k !== 'name'))
  for (const row of rows) {
    if (seenRowNames.has(row.name)) {
      throw OutlineDuplicateRowName.make({ outline: fullName, name: row.name })
    }
    seenRowNames.add(row.name)
    const actual = sortKeys(Object.keys(row).filter((k) => k !== 'name'))
    if (actual.length !== firstKeys.length || actual.some((k, i) => k !== firstKeys[i])) {
      throw OutlineInconsistentKeys.make({
        outline: fullName,
        row: row.name,
        expected: [...firstKeys],
        actual: [...actual],
      })
    }
    for (const cap of captureNames) {
      if (!Object.prototype.hasOwnProperty.call(row, cap)) {
        throw OutlineMissingCapture.make({
          outline: fullName,
          row: row.name,
          capture: cap,
        })
      }
    }
  }
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
    const fullName = prefix === '' ? name : `${prefix}: ${name}`
    const withRecord: Readonly<Record<string, string>> = options?.with ?? {}
    const models = steps.map((s) => s.model)
    if (models.length === 0) {
      throw EmptyScenario.make({ scenario: fullName })
    }
    if (!resolveKeywords(models).some((r) => r.resolved === 'Then')) {
      throw MissingThen.make({ scenario: fullName })
    }
    const captureNames = new Set<string>()
    for (const m of models) for (const c of m.captures) captureNames.add(c.name)

    const buildRowSpec = (row: ExampleRow): StorySpec<TArgs> => ({
      name: `${fullName} — ${row.name}`,
      play: (ctx: PlayContext<TArgs>) =>
        interpretPlay(
          context,
          executeSteps([...background, ...steps], { ...withRecord, ...rowValuesFor(row) }, ctx),
          ctx,
        ),
    })

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

const makeBackground = <TArgs>(background: Step<TArgs>[]) => (...steps: readonly Step<TArgs>[]): void => {
  const resolvedKeywords = resolveKeywords(steps.map((s) => s.model))
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const resolvedEntry = resolvedKeywords[i]
    if (step === undefined || resolvedEntry === undefined) continue
    if (resolvedEntry.resolved !== 'Given') {
      throw BackgroundNotGiven.make({
        step: displayPattern(step.model),
        resolved: resolvedEntry.resolved,
      })
    }
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

/**
 * Declare a feature: a story set whose scenarios execute as CSF `play`
 * functions. `options.context` (default `Context.empty()`) is the Effect
 * context interpreting each scenario's composed step program exactly once,
 * at the play edge.
 */
export const feature = <M>(meta: M, options: FeatureOptions = {}): Feature<M> =>
  makeFeature<M>(meta, options.context ?? Context.empty())

export const Steps = <TArgs>(...steps: readonly Step<TArgs>[]): Step<TArgs>[] => [...steps]

interface StoryWithPlay<TArgs> {
  readonly play?: (context: PlayContext<TArgs>) => Promise<void> | void
}

export const From = <TArgs>(story: StoryWithPlay<TArgs>): Step<TArgs>[] => {
  const play = story.play
  if (play === undefined) return []
  const step: Step<TArgs> = {
    _tag: 'Step',
    model: { keyword: 'Given', parts: ['the prior scenario completed'], captures: [] },
    run: (_values: Readonly<Record<string, string>>, ctx: StepContext<TArgs>) =>
      Effect.promise(() => Promise.resolve(play(ctx.context))),
  }
  return [step]
}
