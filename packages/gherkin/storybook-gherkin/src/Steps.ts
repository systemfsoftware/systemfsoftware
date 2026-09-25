import { Array as Arr, Effect, Match, Schema } from 'effect'
import { dual } from 'effect/Function'
import type { screen, UserEventObject } from 'storybook/test'
import type { Simplify, UnionToIntersection } from 'type-fest'

import type { Capture } from './Capture.js'
import { CaptureDecodeFailed, DuplicateCapture } from './Errors.schema.js'

export type Keyword = 'Given' | 'When' | 'Then' | 'And' | 'But' | 'Star'

export type ConcreteKeyword = 'Given' | 'When' | 'Then'

type AnyConstraintDecoder<A = unknown> = Schema.ConstraintDecoder<A>
type AnyValue<V = unknown> = V
type AnyEffect<E, R, A = unknown> = Effect.Effect<A, E, R>

export interface CaptureModel {
  readonly name: string
  /** Service-free decode view — the v4 counterpart of the removed no-context alias. */
  readonly schema: AnyConstraintDecoder | undefined
  readonly default: string | undefined
}

export interface StepModel {
  readonly keyword: Keyword
  /** Static segments around the holes — length is always captures.length + 1. */
  readonly parts: readonly string[]
  readonly captures: readonly CaptureModel[]
}

export type ExampleRow = { readonly name: string } & Readonly<Record<string, string>>

const emptyIfMissing = (part: string | undefined): string => {
  if (part === undefined) return ''
  return part
}

const joinStep = (
  step: StepModel,
  renderHole: (cap: CaptureModel) => string,
): string =>
  [
    emptyIfMissing(step.parts[0]),
    ...step.captures.flatMap((cap, i) => [renderHole(cap), emptyIfMissing(step.parts[i + 1])]),
  ].join('')

export const displayPattern = (step: StepModel): string => joinStep(step, (cap) => `{${cap.name}}`)

const firstString = (left: string | undefined, right: string): string => {
  if (left !== undefined) return left
  return right
}

const holeText = (cap: CaptureModel, values: Readonly<Record<string, string>>): string => {
  const fromValues = values[cap.name]
  if (fromValues !== undefined) return fromValues
  return firstString(cap.default, `{${cap.name}}`)
}

const renderStepTextImpl = (step: StepModel, values: Readonly<Record<string, string>>): string =>
  joinStep(step, (cap) => holeText(cap, values))

export const renderStepText: {
  (values: Readonly<Record<string, string>>): (step: StepModel) => string
  (step: StepModel, values: Readonly<Record<string, string>>): string
} = dual(2, renderStepTextImpl)

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

export type Canvas = typeof screen

export type StepFn = (label: string, fn: () => Promise<void>) => Promise<void> | void

export interface Report<Result = unknown> {
  readonly type: string
  readonly version?: number
  readonly result: Result
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
  readonly globals: Record<string, AnyValue>
  readonly parameters: Record<string, AnyValue>
  readonly loaded: Record<string, AnyValue>
  readonly abortSignal: AbortSignal
  readonly reporting: ReportingAPI
}

export interface StepContext<TArgs = unknown> {
  readonly canvas: Canvas
  readonly screen: typeof screen
  readonly userEvent: UserEventObject
  readonly step: StepFn
  readonly args: TArgs
  readonly globals: Record<string, AnyValue>
  readonly parameters: Record<string, AnyValue>
  readonly loaded: Record<string, AnyValue>
  readonly canvasElement: HTMLElement
  /**
   * Fires on story teardown (remount, navigation, HMR). Since the 2026-08-09
   * Effect-composition refactor, the play edge interrupts the in-flight step
   * on abort — steps no longer run to completion after teardown. The step
   * handler's own promise is abandoned, not cancelled: observe this signal
   * for cleanup or to race long-running work.
   */
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

const STEP_TAG = 'Step'
export const StepTag = { _tag: STEP_TAG } as const
export type StepTag = typeof StepTag

export interface Step<TArgs = unknown> extends StepTag {
  readonly model: StepModel
  readonly run: (
    values: Readonly<Record<string, string>>,
    ctx: StepContext<TArgs>,
  ) => Effect.Effect<void, CaptureDecodeFailed>
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

const partAt = (statics: TemplateStringsArray, index: number): string => emptyIfMissing(statics[index])

const appendLiteral = (current: string, literal: string, trailing: string): string => current + literal + trailing

const consumeNonStringHole = (
  current: string,
  hole: Exclude<Hole, string>,
  trailing: string,
  parts: string[],
  captures: CaptureModel[],
): string => {
  if (typeof hole === 'number') return appendLiteral(current, String(hole), trailing)
  parts.push(current)
  captures.push({ name: hole.name, schema: hole.schema, default: hole.default })
  return trailing
}

const consumeHole = (
  current: string,
  hole: Hole,
  trailing: string,
  parts: string[],
  captures: CaptureModel[],
): string => {
  if (typeof hole === 'string') return appendLiteral(current, hole, trailing)
  return consumeNonStringHole(current, hole, trailing, parts, captures)
}

const rememberCapture = (model: StepModel, seen: Set<string>, cap: CaptureModel): void => {
  if (seen.has(cap.name)) {
    throw DuplicateCapture.make({ step: displayPattern(model), name: cap.name })
  }
  seen.add(cap.name)
}

const assertUniqueCaptures = (model: StepModel, captures: readonly CaptureModel[]): void => {
  const seen = new Set<string>()
  for (const cap of captures) {
    rememberCapture(model, seen, cap)
  }
}

const buildModel = (
  keyword: Keyword,
  statics: TemplateStringsArray,
  holes: readonly Hole[],
): StepModel => {
  const parts: string[] = []
  const captures: CaptureModel[] = []
  let current = partAt(statics, 0)
  for (const [i, hole] of holes.entries()) {
    current = consumeHole(current, hole, partAt(statics, i + 1), parts, captures)
  }
  parts.push(current)
  const model: StepModel = { keyword, parts, captures }
  assertUniqueCaptures(model, captures)
  return model
}

const captureRaw = (
  cap: CaptureModel,
  values: Readonly<Record<string, string>>,
): string | undefined => {
  const fromValues = values[cap.name]
  if (fromValues !== undefined) return fromValues
  return cap.default
}

const rawOrEmpty = (raw: string | undefined): string => {
  if (raw === undefined) return ''
  return raw
}

const decodeCapture = (
  cap: CaptureModel,
  values: Readonly<Record<string, string>>,
  model: StepModel,
): AnyEffect<CaptureDecodeFailed, never> => {
  const raw = captureRaw(cap, values)
  if (cap.schema === undefined) return Effect.succeed(raw)
  return Schema.decodeEffect(cap.schema)(raw).pipe(
    Effect.mapError((error) =>
      CaptureDecodeFailed.make({
        step: displayPattern(model),
        capture: cap.name,
        value: rawOrEmpty(raw),
        cause: error,
      })
    ),
  )
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
  ): AnyValue {
    return <TArgs = unknown>(handler: StepHandler<CapsOf<typeof holes>, TArgs>): Step<TArgs> => {
      const model = buildModel(keyword, statics, holes)
      const _step: Step<TArgs> = {
        ...StepTag,
        model,
        run: (values: Readonly<Record<string, string>>, ctx: StepContext<TArgs>) =>
          Effect.forEach(model.captures, (cap) => decodeCapture(cap, values, model)).pipe(
            Effect.flatMap((decoded) => {
              const caps: Record<string, AnyValue> = {}
              for (const [cap, value] of Arr.zip(model.captures, decoded)) caps[cap.name] = value
              return Effect.promise(() => Promise.resolve(handler(ctx, caps)))
            }),
          ),
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

const isNonNullObject = (value: unknown): value is object => {
  if (typeof value !== 'object') return false
  return value !== null
}

const hasModelAndRun = (value: object): boolean => {
  if (!('model' in value)) return false
  return 'run' in value
}

const hasStepFields = (value: object): boolean => {
  if (Reflect.get(value, '_tag') !== STEP_TAG) return false
  return hasModelAndRun(value)
}

export const isStep = <TArgs>(value: unknown): value is Step<TArgs> => {
  if (!isNonNullObject(value)) return false
  return hasStepFields(value)
}
