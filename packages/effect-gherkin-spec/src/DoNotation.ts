import { TaskRef } from '@systemfsoftware/effect-spec-runtime'
import type { Check, Expect } from '@systemfsoftware/vitest'
import { type Asserted, step } from '@systemfsoftware/vitest/integration'
import { Cause, Clock, Context, Duration, Effect, Exit, Schedule } from 'effect'
import { dual } from 'effect/Function'
import { StepError } from './StepError.schema.js'
import * as SuiteScope from './SuiteScope.js'

export interface PollOptions {
  /**
   * The interval between poll attempts.
   * Default: '50 millis'
   */
  readonly interval?: Duration.Input | undefined
  /**
   * Maximum duration to wait before timing out and failing.
   * Default: '5 seconds'
   */
  readonly timeout?: Duration.Input | undefined
}

const readInterval = (opts: PollOptions | undefined): Duration.Input | undefined => {
  if (opts === undefined) return undefined
  return opts.interval
}

const fallbackInterval = (val: Duration.Input | undefined): Duration.Input => {
  if (val !== undefined) return val
  return '50 millis'
}

const readTimeout = (opts: PollOptions | undefined): Duration.Input | undefined => {
  if (opts === undefined) return undefined
  return opts.timeout
}

const fallbackTimeout = (val: Duration.Input | undefined): Duration.Input => {
  if (val !== undefined) return val
  return '5 seconds'
}

export const pollSchedule = (opts?: PollOptions) => {
  const interval = fallbackInterval(readInterval(opts))
  const timeout = fallbackTimeout(readTimeout(opts))
  return Schedule.spaced(interval).pipe(Schedule.upTo({ duration: timeout }))
}

/**
 * The test's own `expect`, published by the runner for the scenario it drives. A Then step body
 * receives it as its second parameter, so no step reaches for an import and no step can assert
 * outside the check the ledger sees.
 */
export const StepExpect: Context.Reference<Expect | null> = Context.Reference<Expect | null>(
  '@systemfsoftware/effect-gherkin-spec/StepExpect',
  {
    defaultValue: () => null,
  },
)

/**
 * What a Then step body answers with: the one check of the state it observed, or an Effect that
 * answers with one — a body that must await something before it can check.
 */
export type StepCheck<E = never, R = never> = Check | Effect.Effect<Check, E, R>

const missingExpectText =
  '✗ a Then step has no check callback to read, so it cannot state what it verified. A scenario gets its expect from the test the fork drives: register it through makeFeature and let the fork run it.'
export type VitestTaskContext<Ann = unknown> = TaskRef.VitestTaskContext<Ann>

export const VitestTaskRef = TaskRef.VitestTaskRef

const dispatchAnnotate = (
  annotate: ((msg: string, type?: string) => Promise<void> | void) | undefined,
  message: string,
  type: string,
): Effect.Effect<void> => {
  if (typeof annotate === 'function') {
    return Effect.promise(() => Promise.resolve(annotate(message, type)))
  }
  return Effect.void
}

const recordAnnotation = (
  ctx: VitestTaskContext | null,
  message: string,
  type: string,
): Effect.Effect<void> => {
  if (ctx === null) return Effect.void
  return dispatchAnnotate(ctx.annotate, message, type)
}

const annotateStepResult = (
  taskCtx: VitestTaskContext | null,
  keyword: string,
  resolvedText: string,
  duration: number,
  isSuccess: boolean,
): Effect.Effect<void> => {
  if (isSuccess) {
    return recordAnnotation(taskCtx, `[${keyword.toUpperCase()}] ${resolvedText} - passed (${duration}ms)`, 'notice')
  }
  return recordAnnotation(taskCtx, `[${keyword.toUpperCase()}] ${resolvedText} - failed (${duration}ms)`, 'error')
}

const annotateStep = <A, E, R>(
  keyword: string,
  resolvedText: string,
  body: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.gen(function*() {
    const taskCtx = yield* VitestTaskRef
    const startTime = yield* Clock.currentTimeMillis
    const exit = yield* Effect.exit(body)
    const endTime = yield* Clock.currentTimeMillis
    const duration = endTime - startTime
    yield* annotateStepResult(taskCtx, keyword, resolvedText, duration, Exit.isSuccess(exit))
    return yield* exit
  })
type NoInfer<A> = [A][A extends A ? 0 : never]

const GherkinScopeTypeId: unique symbol = Symbol.for('@systemfsoftware/gherkin/GherkinScope')
export const StageTypeId: unique symbol = Symbol.for('@systemfsoftware/gherkin/Stage')

export type InitialStage = { readonly [StageTypeId]: 'initial' }
export type GivenStage = { readonly [StageTypeId]: 'given' }
export type WhenStage = { readonly [StageTypeId]: 'when' }
export type ThenStage = { readonly [StageTypeId]: 'then' }

export type Stage = InitialStage | GivenStage | WhenStage | ThenStage

export const stageInitial: InitialStage = { [StageTypeId]: 'initial' }
export const stageGiven: GivenStage = { [StageTypeId]: 'given' }
export const stageWhen: WhenStage = { [StageTypeId]: 'when' }
export const stageThen: ThenStage = { [StageTypeId]: 'then' }

export type GherkinScope<A extends object> = A & {
  readonly [GherkinScopeTypeId]: typeof GherkinScopeTypeId
}

export type StepText<A extends object = object> = string | ((scope: A) => string)

const resolveTextImpl = (text: StepText, scope: object): string => {
  if (typeof text === 'function') return text(scope)
  return text
}

export const resolveText: {
  (scope: object): (text: StepText) => string
  (text: StepText, scope: object): string
} = dual(2, resolveTextImpl)

const stepWrapImpl = <A, E, R>(
  keyword: string,
  text: string,
  body: Effect.Effect<A, E, R>,
): Effect.Effect<A, StepError, R> => {
  const annotated = annotateStep(keyword, text, body)
  return annotated.pipe(
    Effect.catchCause((cause) => Effect.fail(StepError.make({ keyword, text, cause: Cause.squash(cause) }))),
  )
}

export const stepWrap: {
  <A, E, R>(text: string, body: Effect.Effect<A, E, R>): (keyword: string) => Effect.Effect<A, StepError, R>
  <A, E, R>(keyword: string, text: string, body: Effect.Effect<A, E, R>): Effect.Effect<A, StepError, R>
} = dual(3, stepWrapImpl)

export type GherkinEffect<A extends object, E, R> = Effect.Effect<GherkinScope<A>, E, R>

export type AssertedPipeline<R = never> = Effect.Effect<GherkinScope<object & ThenStage>, StepError, R>

/**
 * A Then/And/But body asserts the state the last Given or When produced, and that state is
 * asserted once: a second assertion step before the next Given or When is refused by name.
 */
export type AssertionStateRefused =
  '✗ a second assertion step on the same state. Assert it once in one Then: Then(text)((s, expect) => expect({ a: s.a, b: s.b }).toEqual({...})).'

/**
 * The gate an assertion step's input carries. Its `[StageTypeId]` is a stage a Given or When
 * produced, so a pipeline already past its assertion mismatches with the refusal as the property's
 * type — the compile half of the one-state rule, with the runtime half on the ledger's refusal.
 */
type AssertableScope = {
  readonly [StageTypeId]?:
    | InitialStage[typeof StageTypeId]
    | GivenStage[typeof StageTypeId]
    | WhenStage[typeof StageTypeId]
    | AssertionStateRefused
}

const wrapTapResult = <A extends object, E2, R2, Out = unknown>(
  raw: Effect.Effect<Out, E2, R2> | void,
  scope: GherkinScope<A>,
  keyword: string,
  resolvedText: string,
): Effect.Effect<GherkinScope<A>, StepError, R2> => {
  if (Effect.isEffect(raw)) {
    return stepWrap(keyword, resolvedText, raw).pipe(Effect.as(scope))
  }
  return stepWrap(keyword, resolvedText, Effect.void).pipe(Effect.as(scope))
}

const runTapBody = <A extends object, E2, R2, Out = unknown>(
  f: (a: A) => Effect.Effect<Out, E2, R2> | void,
  scope: GherkinScope<A>,
  keyword: string,
  resolvedText: string,
): Effect.Effect<GherkinScope<A>, StepError, R2> => {
  try {
    return wrapTapResult(f(scope), scope, keyword, resolvedText)
  } catch (e) {
    return stepWrap(keyword, resolvedText, StepError.make({ keyword, text: resolvedText, cause: e })).pipe(
      Effect.as(scope),
    )
  }
}

/**
 * The answer, judged in one place: a check is run as it is, and an Effect that answers with one is
 * run to the check it carries. The annotation says what the union erases to — a check's success is
 * `void` — so the value the flatMap inspects decides which of the two the body answered with.
 */
const producedCheck = <E, R>(produced: StepCheck<E, R>): Effect.Effect<void, E, R | Asserted> => {
  const answer: Effect.Effect<Check | void, E, R | Asserted> = produced
  return Effect.flatMap(answer, (value) => Effect.isEffect(value) ? value : Effect.void)
}

/**
 * Runs one Then-like body: it reads the test's own `expect`, hands it the observed scope, and
 * judges the one check the body answered with. A body that throws while answering fails the step,
 * so nothing escapes the step's error envelope.
 */
const runThenBody = <A extends object, E2, R2>(
  f: (scope: GherkinScope<A>, expect: Expect) => StepCheck<E2, R2>,
  scope: GherkinScope<A>,
  keyword: string,
  resolvedText: string,
): Effect.Effect<void, StepError, R2 | Asserted> =>
  Effect.gen(function*() {
    const expect = yield* StepExpect
    if (expect === null) {
      return yield* StepError.make({ keyword, text: resolvedText, cause: missingExpectText })
    }
    return yield* stepWrap(
      keyword,
      resolvedText,
      Effect.suspend(() => producedCheck(f(scope, expect))),
    )
  })

const tapThen =
  (keyword: string, text: StepText) =>
  <A extends object & (InitialStage | GivenStage | WhenStage | ThenStage), E2 = never, R2 = never>(
    f: (a: NoInfer<A>, expect: Expect) => StepCheck<E2, R2>,
  ) =>
  <E1, R1>(
    self: GherkinEffect<A, E1, R1> & AssertableScope,
  ): GherkinEffect<Omit<A, typeof StageTypeId> & ThenStage, E1 | StepError, R1 | R2 | Asserted> =>
    Effect.flatMap(
      self,
      (scope): Effect.Effect<GherkinScope<Omit<A, typeof StageTypeId> & ThenStage>, StepError, R2 | Asserted> => {
        const resolvedText = resolveText(text, scope)
        const nextScope = { ...scope, ...stageThen }
        return runThenBody(f, scope, keyword, resolvedText).pipe(Effect.as(nextScope))
      },
    )
const bindPoll = (keyword: 'when', text: StepText, opts?: PollOptions) => {
  function whenPollStep<
    N extends string,
    A extends object & (InitialStage | GivenStage | WhenStage | ThenStage),
    B,
    E2,
    R2,
  >(
    name: N,
    f: (a: NoInfer<A>) => Effect.Effect<B, E2, R2>,
  ): <E1, R1>(
    self: GherkinEffect<A, E1, R1>,
  ) => GherkinEffect<
    Omit<A, typeof StageTypeId> & Record<N, B> & WhenStage,
    E1 | StepError,
    R1 | R2 | Asserted
  >
  function whenPollStep<
    A extends object & (InitialStage | GivenStage | WhenStage | ThenStage),
    E2 = never,
    R2 = never,
    Out = unknown,
  >(
    f: (a: NoInfer<A>) => Effect.Effect<Out, E2, R2> | void,
  ): <E1, R1>(
    self: GherkinEffect<A, E1, R1>,
  ) => GherkinEffect<Omit<A, typeof StageTypeId> & WhenStage, E1 | StepError, R1 | R2 | Asserted>
  function whenPollStep<E2, R2>(...args: BindStepTapArgs<E2, R2> | BindStepBindArgs<E2, R2>) {
    if (args.length === 1) {
      const f = args[0]
      return <E1, R1>(self: GherkinEffect<object, E1, R1>) =>
        self.pipe(
          Effect.flatMap((scope): Effect.Effect<GherkinScope<object & WhenStage>, StepError, R2 | Asserted> => {
            const resolvedText = resolveText(text, scope)
            const nextScope = { ...scope, ...stageWhen }
            const attempt = Effect.suspend(() => f(scope) ?? Effect.void).pipe(
              Effect.retry(pollSchedule(opts)),
            )
            return step(stepWrap(keyword, resolvedText, attempt).pipe(Effect.as(nextScope)))
          }),
        )
    }
    const [name, f] = args
    return <E1, R1>(self: GherkinEffect<object, E1, R1>) =>
      self.pipe(
        Effect.flatMap((scope): Effect.Effect<GherkinScope<object & WhenStage>, StepError, R2 | Asserted> => {
          const resolvedText = resolveText(text, scope)
          const retrying = stepWrap(
            keyword,
            resolvedText,
            Effect.suspend(() => f(scope)).pipe(Effect.retry(pollSchedule(opts))),
          )
          return step(
            retrying.pipe(
              Effect.map((b) => ({ ...scope, [name]: b, ...stageWhen })),
            ),
          )
        }),
      )
  }
  return whenPollStep
}

type BindStepTapArgs<E, R, Out = unknown> = [f: (scope: object) => Effect.Effect<Out, E, R> | void]
type BindStepBindArgs<E, R, Out = unknown> = [name: string, f: (scope: object) => Effect.Effect<Out, E, R>]

const bindGiven = (keyword: 'given', text: StepText) => {
  function givenStep<N extends string, A extends object & (InitialStage | GivenStage), B, E2, R2>(
    name: N,
    f: (a: NoInfer<A>) => Effect.Effect<B, E2, R2>,
  ): <E1, R1>(
    self: GherkinEffect<A, E1, R1>,
  ) => GherkinEffect<
    Omit<A, typeof StageTypeId> & Record<N, B> & GivenStage,
    E1 | StepError,
    R1 | R2 | Asserted
  >
  function givenStep<A extends object & (InitialStage | GivenStage), E2 = never, R2 = never, Out = unknown>(
    f: (a: NoInfer<A>) => Effect.Effect<Out, E2, R2> | void,
  ): <E1, R1>(
    self: GherkinEffect<A, E1, R1>,
  ) => GherkinEffect<Omit<A, typeof StageTypeId> & GivenStage, E1 | StepError, R1 | R2 | Asserted>
  function givenStep<E2, R2>(...args: BindStepTapArgs<E2, R2> | BindStepBindArgs<E2, R2>) {
    if (args.length === 1) {
      const f = args[0]
      return <E1, R1>(self: GherkinEffect<object, E1, R1>) =>
        self.pipe(
          Effect.flatMap((scope): Effect.Effect<GherkinScope<object & GivenStage>, StepError, R2 | Asserted> => {
            const resolvedText = resolveText(text, scope)
            const nextScope = { ...scope, ...stageGiven }
            return step(runTapBody(f, scope, keyword, resolvedText).pipe(Effect.as(nextScope)))
          }),
        )
    }
    const [name, f] = args
    return <E1, R1>(self: GherkinEffect<object, E1, R1>) =>
      self.pipe(
        Effect.flatMap((scope): Effect.Effect<GherkinScope<object & GivenStage>, StepError, R2 | Asserted> => {
          const resolvedText = resolveText(text, scope)
          return step(
            stepWrap(keyword, resolvedText, f(scope)).pipe(
              Effect.map((b) => ({ ...scope, [name]: b, ...stageGiven })),
            ),
          )
        }),
      )
  }
  return givenStep
}

const bindWhen = (keyword: 'when', text: StepText) => {
  function whenStep<
    N extends string,
    A extends object & (InitialStage | GivenStage | WhenStage | ThenStage),
    B,
    E2,
    R2,
  >(
    name: N,
    f: (a: NoInfer<A>) => Effect.Effect<B, E2, R2>,
  ): <E1, R1>(
    self: GherkinEffect<A, E1, R1>,
  ) => GherkinEffect<
    Omit<A, typeof StageTypeId> & Record<N, B> & WhenStage,
    E1 | StepError,
    R1 | R2 | Asserted
  >
  function whenStep<
    A extends object & (InitialStage | GivenStage | WhenStage | ThenStage),
    E2 = never,
    R2 = never,
    Out = unknown,
  >(
    f: (a: NoInfer<A>) => Effect.Effect<Out, E2, R2> | void,
  ): <E1, R1>(
    self: GherkinEffect<A, E1, R1>,
  ) => GherkinEffect<Omit<A, typeof StageTypeId> & WhenStage, E1 | StepError, R1 | R2 | Asserted>
  function whenStep<E2, R2>(...args: BindStepTapArgs<E2, R2> | BindStepBindArgs<E2, R2>) {
    if (args.length === 1) {
      const f = args[0]
      return <E1, R1>(self: GherkinEffect<object, E1, R1>) =>
        self.pipe(
          Effect.flatMap((scope): Effect.Effect<GherkinScope<object & WhenStage>, StepError, R2 | Asserted> => {
            const resolvedText = resolveText(text, scope)
            const nextScope = { ...scope, ...stageWhen }
            return step(runTapBody(f, scope, keyword, resolvedText).pipe(Effect.as(nextScope)))
          }),
        )
    }
    const [name, f] = args
    return <E1, R1>(self: GherkinEffect<object, E1, R1>) =>
      self.pipe(
        Effect.flatMap((scope): Effect.Effect<GherkinScope<object & WhenStage>, StepError, R2 | Asserted> => {
          const resolvedText = resolveText(text, scope)
          return step(
            stepWrap(keyword, resolvedText, f(scope)).pipe(
              Effect.map((b) => ({ ...scope, [name]: b, ...stageWhen })),
            ),
          )
        }),
      )
  }
  return whenStep
}

const _given = (text: StepText) => bindGiven('given', text)
const _when = Object.assign((text: StepText) => bindWhen('when', text), {
  poll: (text: StepText, opts?: PollOptions) => bindPoll('when', text, opts),
})
const _then = (text: StepText) => tapThen('then', text)
const _and = (text: StepText) => tapThen('and', text)
const _but = (text: StepText) => tapThen('but', text)

const emptyScope: GherkinScope<InitialStage> = {
  ...stageInitial,
  [GherkinScopeTypeId]: GherkinScopeTypeId,
}

type Top<T = unknown> = T
export type ScopeMap = SuiteScope.ScopeMap

export type ScopeServices<S extends ScopeMap> = SuiteScope.ScopeServices<S>

export type ScopeIdentifiers<S extends ScopeMap> = SuiteScope.ScopeIdentifiers<S>

function makeScope<S extends ScopeMap>(
  map: S,
): GherkinEffect<ScopeServices<S> & GivenStage, never, ScopeIdentifiers<S>>
function makeScope<S extends ScopeMap>(
  map: S,
): Effect.Effect<GherkinScope<Record<string, Top> & GivenStage>, never, ScopeIdentifiers<S>> {
  return Effect.map(SuiteScope.resolve(map), (services) => ({
    ...services,
    ...stageGiven,
    [GherkinScopeTypeId]: GherkinScopeTypeId,
  }))
}

export const Gherkin = {
  Do: Effect.succeed(emptyScope),
  startWith: <A extends object>(bindings: A): GherkinEffect<A & GivenStage, never, never> =>
    Effect.succeed({ ...bindings, ...stageGiven, [GherkinScopeTypeId]: GherkinScopeTypeId }),
  scope: makeScope,
  Given: _given,
  When: _when,
  Then: _then,
  And: _and,
  But: _but,
} as const

export const { Given, When, Then, And, But } = Gherkin
