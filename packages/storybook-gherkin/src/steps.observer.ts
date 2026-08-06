import { Array as Arr, Either, Match, Schema } from 'effect'
import type { screen, UserEventObject, within } from 'storybook/test'
import type { Simplify, UnionToIntersection } from 'type-fest'

import type { Capture } from './capture.observer.js'
import { CaptureDecodeFailed, DuplicateCapture } from './errors.js'

export type Keyword = 'Given' | 'When' | 'Then' | 'And' | 'But' | 'Star'

export type ConcreteKeyword = 'Given' | 'When' | 'Then'

export interface CaptureModel {
  readonly name: string
  readonly schema: Schema.Schema.AnyNoContext | undefined
  readonly default: string | undefined
}

export interface StepModel {
  readonly keyword: Keyword
  /** Static segments around the holes — length is always captures.length + 1. */
  readonly parts: readonly string[]
  readonly captures: readonly CaptureModel[]
}

export type ExampleRow = { readonly name: string } & Readonly<Record<string, string>>

export const displayPattern = (step: StepModel): string =>
  [
    step.parts[0] ?? '',
    ...step.captures.flatMap((cap, i) => [`{${cap.name}}`, step.parts[i + 1] ?? '']),
  ].join('')

export const renderStepText = (step: StepModel, values: Readonly<Record<string, string>>): string =>
  [
    step.parts[0] ?? '',
    ...step.captures.flatMap((cap, i) => [
      values[cap.name] ?? cap.default ?? `{${cap.name}}`,
      step.parts[i + 1] ?? '',
    ]),
  ].join('')

const resolveKeyword = (keyword: Keyword, previous: ConcreteKeyword): ConcreteKeyword =>
  Match.value(keyword).pipe(
    Match.when('Given', () => 'Given' as const),
    Match.when('When', () => 'When' as const),
    Match.when('Then', () => 'Then' as const),
    Match.when('And', () => previous),
    Match.when('But', () => previous),
    Match.when('Star', () => previous),
    Match.exhaustive,
  )

export const resolveKeywords = <S extends { readonly keyword: Keyword }>(
  steps: readonly S[],
): readonly (S & { readonly resolved: ConcreteKeyword })[] => {
  const initial: ConcreteKeyword = 'Given'
  return Arr.mapAccum(steps, initial, (previous: ConcreteKeyword, s) => {
    const resolved = resolveKeyword(s.keyword, previous)
    return [resolved, { ...s, resolved }]
  })[1]
}

export type Canvas = ReturnType<typeof within>

export type StepFn = (label: string, fn: () => Promise<void>) => Promise<void> | void

export interface Report {
  readonly type: string
  readonly version?: number
  readonly result: unknown
  readonly status: 'failed' | 'passed' | 'warning'
}

export interface ReportingAPI {
  readonly reports: Report[]
  readonly addReport: (report: Report) => void
}

export interface PlayContext<TArgs = unknown> {
  readonly canvas: Canvas
  readonly canvasElement: HTMLElement
  readonly step: StepFn
  readonly userEvent: UserEventObject
  readonly args: TArgs
  readonly globals: Record<string, unknown>
  readonly parameters: Record<string, unknown>
  readonly loaded: Record<string, unknown>
  readonly abortSignal: AbortSignal
  readonly reporting: ReportingAPI
}

export interface StepContext<TArgs = unknown> {
  readonly canvas: Canvas
  readonly screen: typeof screen
  readonly userEvent: UserEventObject
  readonly step: StepFn
  readonly args: TArgs
  readonly globals: Record<string, unknown>
  readonly parameters: Record<string, unknown>
  readonly loaded: Record<string, unknown>
  readonly canvasElement: HTMLElement
  readonly abortSignal: AbortSignal
  readonly reporting: ReportingAPI
  readonly context: PlayContext<TArgs>
}

export type Hole = Capture | string | number

export type CapsOf<THoles extends readonly Hole[]> = THoles extends readonly [] ? {}
  : Simplify<
    UnionToIntersection<
      { [K in keyof THoles]: THoles[K] extends Capture<infer N, infer A> ? { [P in N]: A } : {} }[number]
    >
  >

export type StepHandler<TCaps, TArgs = unknown> = (
  ctx: StepContext<TArgs>,
  caps: TCaps,
) => void | Promise<void>

export interface Step<TArgs = unknown> {
  readonly _tag: 'Step'
  readonly model: StepModel
  readonly run: (values: Readonly<Record<string, string>>, ctx: StepContext<TArgs>) => Promise<void>
}

export interface StepBuilder<THoles extends readonly Hole[], TArgs = unknown> {
  (handler: StepHandler<CapsOf<THoles>, TArgs>): Step<TArgs>
}

export type StepCtor = {
  <const THoles extends readonly Hole[]>(
    statics: TemplateStringsArray,
    ...holes: THoles
  ): StepBuilder<THoles>
  <TArgs, const THoles extends readonly Hole[] = readonly Hole[]>(
    statics: TemplateStringsArray,
    ...holes: THoles
  ): StepBuilder<THoles, TArgs>
}

const STEP_TAG = 'Step'

const buildModel = (
  keyword: Keyword,
  statics: TemplateStringsArray,
  holes: readonly Hole[],
): StepModel => {
  const parts: string[] = []
  const captures: CaptureModel[] = []
  let current = statics[0] ?? ''
  for (const [i, hole] of holes.entries()) {
    if (typeof hole === 'string') {
      current += hole + (statics[i + 1] ?? '')
    } else if (typeof hole === 'number') {
      current += String(hole) + (statics[i + 1] ?? '')
    } else {
      parts.push(current)
      current = statics[i + 1] ?? ''
      captures.push({ name: hole.name, schema: hole.schema, default: hole.default })
    }
  }
  parts.push(current)
  const model: StepModel = { keyword, parts, captures }
  const seen = new Set<string>()
  for (const cap of captures) {
    if (seen.has(cap.name)) {
      throw new DuplicateCapture({ step: displayPattern(model), name: cap.name })
    }
    seen.add(cap.name)
  }
  return model
}

const decodeCapture = (
  cap: CaptureModel,
  values: Readonly<Record<string, string>>,
  model: StepModel,
): unknown => {
  const raw = values[cap.name] ?? cap.default
  if (cap.schema === undefined) return raw
  return Either.match(Schema.decodeUnknownEither(cap.schema)(raw), {
    onLeft: (error) => {
      throw new CaptureDecodeFailed({
        step: displayPattern(model),
        capture: cap.name,
        value: raw === undefined ? '' : raw,
        cause: error,
      })
    },
    onRight: (v) => v,
  })
}

const makeStepCtor = (keyword: Keyword): StepCtor => {
  function ctor<const THoles extends readonly Hole[]>(
    statics: TemplateStringsArray,
    ...holes: THoles
  ): StepBuilder<THoles>
  function ctor<TArgs, const THoles extends readonly Hole[]>(
    statics: TemplateStringsArray,
    ...holes: THoles
  ): StepBuilder<THoles, TArgs>
  function ctor(
    statics: TemplateStringsArray,
    ...holes: readonly Hole[]
  ): unknown {
    return <TArgs = unknown>(handler: StepHandler<CapsOf<typeof holes>, TArgs>): Step<TArgs> => {
      const model = buildModel(keyword, statics, holes)
      const _step: Step<TArgs> = {
        _tag: STEP_TAG,
        model,
        run: async (values: Readonly<Record<string, string>>, ctx: StepContext<TArgs>) => {
          const caps: Record<string, unknown> = {}
          for (const cap of model.captures) {
            caps[cap.name] = decodeCapture(cap, values, model)
          }
          await handler(ctx, caps)
        },
      }
      return _step
    }
  }
  return ctor
}

export const Given: StepCtor = makeStepCtor('Given')
export const When: StepCtor = makeStepCtor('When')
export const Then: StepCtor = makeStepCtor('Then')
export const And: StepCtor = makeStepCtor('And')
export const But: StepCtor = makeStepCtor('But')
export const Star: StepCtor = makeStepCtor('Star')

export const isStep = <TArgs>(value: unknown): value is Step<TArgs> => {
  if (typeof value !== 'object' || value === null) return false
  return Reflect.get(value, '_tag') === STEP_TAG &&
    'model' in value &&
    'run' in value
}
