import { screen } from 'storybook/test'

import {
  BackgroundNotGiven,
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

/**
 * Anything positional after the scenario name: a step, a step group from
 * `Steps(...)` / `From(...)`, or — in first position only — an options object.
 */
export type StepArg<TArgs> = Step<TArgs> | readonly Step<TArgs>[]

export interface ScenarioFn<TArgs> {
  (name: string, ...steps: readonly StepArg<TArgs>[]): StorySpec<TArgs>
  <TOptions extends ScenarioOptions>(
    name: string,
    options: TOptions,
    ...steps: readonly StepArg<TArgs>[]
  ): StorySpec<TArgs> & Omit<TOptions, 'with'>
}

export interface OutlineBuilder<TArgs, TOptions extends ScenarioOptions = ScenarioOptions> {
  readonly examples: (
    rows: readonly ExampleRow[],
  ) => Record<string, StorySpec<TArgs> & Omit<TOptions, 'with'>>
}

export interface OutlineFn<TArgs> {
  (name: string, ...steps: readonly StepArg<TArgs>[]): OutlineBuilder<TArgs>
  <TOptions extends ScenarioOptions>(
    name: string,
    options: TOptions,
    ...steps: readonly StepArg<TArgs>[]
  ): OutlineBuilder<TArgs, TOptions>
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

const executeSteps = async <TArgs>(
  ordered: readonly Step<TArgs>[],
  values: Readonly<Record<string, string>>,
  ctx: PlayContext<TArgs>,
): Promise<void> => {
  const stepCtx = buildStepContext(ctx)
  let prev: Promise<unknown> = Promise.resolve()
  for (const s of ordered) {
    prev = prev.then(() => {
      const model = s.model
      const label = `${displayKeyword(model)} ${renderStepText(model, values)}`
      return ctx.step(label, () => s.run(values, stepCtx))
    })
  }
  await prev
}

const rowValuesFor = (row: ExampleRow): Readonly<Record<string, string>> =>
  Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'name'))

const sortKeys = (keys: readonly string[]): readonly string[] => {
  const sorted = keys.slice()
  sorted.sort()
  return sorted
}

const omitWith = (options: ScenarioOptions): Record<string, unknown> =>
  Object.fromEntries(Object.entries(options).filter(([k]) => k !== 'with'))

const validateScenarioSteps = (
  fullName: string,
  models: readonly StepModel[],
  withRecord: Readonly<Record<string, string>>,
): void => {
  if (models.length === 0) {
    throw new EmptyScenario({ scenario: fullName })
  }
  if (!resolveKeywords(models).some((r) => r.resolved === 'Then')) {
    throw new MissingThen({ scenario: fullName })
  }
  for (const stepModel of models) {
    for (const cap of stepModel.captures) {
      const hasDefault = cap.default !== undefined
      const hasWith = Object.prototype.hasOwnProperty.call(withRecord, cap.name)
      if (!hasDefault && !hasWith) {
        throw new UnresolvedCapture({
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
): ScenarioFn<TArgs> => {
  function scenario(
    name: string,
    ...steps: readonly StepArg<TArgs>[]
  ): StorySpec<TArgs>
  function scenario<TOptions extends ScenarioOptions>(
    name: string,
    options: TOptions,
    ...steps: readonly StepArg<TArgs>[]
  ): StorySpec<TArgs> & Omit<TOptions, 'with'>
  function scenario(
    name: string,
    ...rest: readonly (StepArg<TArgs> | ScenarioOptions)[]
  ): unknown {
    const { options, steps } = parseScenarioArgs(rest)
    const fullName = prefix === '' ? name : `${prefix}: ${name}`
    const withRecord: Readonly<Record<string, string>> = options?.with ?? {}
    validateScenarioSteps(fullName, steps.map((s) => s.model), withRecord)
    return {
      ...(options === undefined ? {} : omitWith(options)),
      name: fullName,
      play: (ctx: PlayContext<TArgs>) => executeSteps([...background, ...steps], withRecord, ctx),
    }
  }
  return scenario
}

const validateOutlineRows = (
  rows: readonly ExampleRow[],
  captureNames: ReadonlySet<string>,
  fullName: string,
): void => {
  if (rows.length === 0) throw new OutlineEmpty({ outline: fullName })
  const seenRowNames = new Set<string>()
  const firstKeys = sortKeys(Object.keys(rows[0] ?? {}).filter((k) => k !== 'name'))
  for (const row of rows) {
    if (seenRowNames.has(row.name)) {
      throw new OutlineDuplicateRowName({ outline: fullName, name: row.name })
    }
    seenRowNames.add(row.name)
    const actual = sortKeys(Object.keys(row).filter((k) => k !== 'name'))
    if (actual.length !== firstKeys.length || actual.some((k, i) => k !== firstKeys[i])) {
      throw new OutlineInconsistentKeys({
        outline: fullName,
        row: row.name,
        expected: [...firstKeys],
        actual: [...actual],
      })
    }
    for (const cap of captureNames) {
      if (!Object.prototype.hasOwnProperty.call(row, cap)) {
        throw new OutlineMissingCapture({
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
): OutlineFn<TArgs> => {
  function outline(
    name: string,
    ...steps: readonly StepArg<TArgs>[]
  ): OutlineBuilder<TArgs>
  function outline<TOptions extends ScenarioOptions>(
    name: string,
    options: TOptions,
    ...steps: readonly StepArg<TArgs>[]
  ): OutlineBuilder<TArgs, TOptions>
  function outline(
    name: string,
    ...rest: readonly (StepArg<TArgs> | ScenarioOptions)[]
  ): OutlineBuilder<TArgs> {
    const { options, steps } = parseScenarioArgs(rest)
    const fullName = prefix === '' ? name : `${prefix}: ${name}`
    const withRecord: Readonly<Record<string, string>> = options?.with ?? {}
    const extra = options === undefined ? {} : omitWith(options)
    const models = steps.map((s) => s.model)
    if (models.length === 0) {
      throw new EmptyScenario({ scenario: fullName })
    }
    if (!resolveKeywords(models).some((r) => r.resolved === 'Then')) {
      throw new MissingThen({ scenario: fullName })
    }
    const captureNames = new Set<string>()
    for (const m of models) for (const c of m.captures) captureNames.add(c.name)

    const buildRowSpec = (row: ExampleRow): StorySpec<TArgs> & Omit<ScenarioOptions, 'with'> => ({
      ...extra,
      name: `${fullName} — ${row.name}`,
      play: (ctx: PlayContext<TArgs>) =>
        executeSteps([...background, ...steps], { ...withRecord, ...rowValuesFor(row) }, ctx),
    })

    const examples = (
      rows: readonly ExampleRow[],
    ): Record<string, StorySpec<TArgs> & Omit<ScenarioOptions, 'with'>> => {
      validateOutlineRows(rows, captureNames, fullName)
      const out: Record<string, StorySpec<TArgs> & Omit<ScenarioOptions, 'with'>> = {}
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
      throw new BackgroundNotGiven({
        step: displayPattern(step.model),
        resolved: resolvedEntry.resolved,
      })
    }
  }
  background.push(...steps)
}

const makeFeature = <M, TArgs = unknown>(meta: M): Feature<M, TArgs> => {
  const background: Step<TArgs>[] = []
  const feature: Feature<M, TArgs> = {
    meta,
    type: <TNext>(): Feature<M, TNext> => makeFeature<M, TNext>(meta),
    background: makeBackground<TArgs>(background),
    scenario: makeScenario<TArgs>(background, ''),
    scenarioOutline: makeOutline<TArgs>(background, ''),
    rule: (ruleName: string): RuleScope<TArgs> => ({
      scenario: makeScenario<TArgs>(background, ruleName),
      scenarioOutline: makeOutline<TArgs>(background, ruleName),
    }),
  }
  return feature
}

export const feature = <M>(meta: M): Feature<M> => makeFeature<M>(meta)

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
    run: async (_values: Readonly<Record<string, string>>, ctx: StepContext<TArgs>) => {
      await play(ctx.context)
    },
  }
  return [step]
}
