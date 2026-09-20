import { Cause, Clock, Context, Duration, Effect, Exit, Schedule } from 'effect'
import { StepError } from './StepError.schema.js'

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

export interface StepAssertionFailure {
  readonly keyword: string
  readonly text: string
  readonly cause: unknown
}

export interface SoftFailuresContext {
  readonly record: (failure: StepAssertionFailure) => void
  readonly getFailures: () => readonly StepAssertionFailure[]
}

export const makeFreshSoftContext = (): SoftFailuresContext => {
  const failures: StepAssertionFailure[] = []
  return {
    record: (failure) => {
      failures.push(failure)
    },
    getFailures: () => [...failures],
  }
}

export const SoftFailuresRef: Context.Reference<SoftFailuresContext> = Context.Reference<SoftFailuresContext>(
  '@systemfsoftware/effect-gherkin-spec/SoftFailures',
  {
    defaultValue: makeFreshSoftContext,
  },
)
export interface VitestTaskContext {
  readonly annotate?: ((message: string, type?: string) => Promise<void> | void) | undefined
  readonly task?: {
    readonly annotations?: readonly unknown[] | undefined
  } | undefined
}

export const VitestTaskRef: Context.Reference<VitestTaskContext | null> = Context.Reference<VitestTaskContext | null>(
  '@systemfsoftware/effect-gherkin-spec/VitestTask',
  {
    defaultValue: () => null,
  },
)

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
const recordSoftFailure = (keyword: string, text: string, cause: unknown) =>
  Effect.gen(function*() {
    const soft = yield* SoftFailuresRef
    soft.record({ keyword, text, cause })
    const taskCtx = yield* VitestTaskRef
    yield* recordAnnotation(taskCtx, `[${keyword.toUpperCase()}] ${text} - soft-failed`, 'error')
  })
type NoInfer<A> = [A][A extends unknown ? 0 : never]

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

export const resolveText = (text: StepText, scope: object): string => {
  if (typeof text === 'function') return text(scope)
  return text
}

export const stepWrap = <A, E, R>(
  keyword: string,
  text: string,
  body: Effect.Effect<A, E, R>,
): Effect.Effect<A, StepError, R> => {
  const annotated = annotateStep(keyword, text, body)
  return annotated.pipe(
    Effect.catchCause((cause) => Effect.fail(StepError.make({ keyword, text, cause: Cause.squash(cause) }))),
  )
}

export type GherkinEffect<A extends object, E, R> = Effect.Effect<GherkinScope<A>, E, R>

export type AssertedPipeline<R = never> = Effect.Effect<GherkinScope<object & ThenStage>, StepError, R>

const wrapTapResult = <A extends object, E2, R2>(
  raw: Effect.Effect<unknown, E2, R2> | void,
  scope: GherkinScope<A>,
  keyword: string,
  resolvedText: string,
): Effect.Effect<GherkinScope<A>, StepError, R2> => {
  if (Effect.isEffect(raw)) {
    return stepWrap(keyword, resolvedText, raw).pipe(Effect.as(scope))
  }
  return stepWrap(keyword, resolvedText, Effect.void).pipe(Effect.as(scope))
}

const runTapBody = <A extends object, E2, R2>(
  f: (a: A) => Effect.Effect<unknown, E2, R2> | void,
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

const tapThen =
  (keyword: string, text: StepText) =>
  <A extends object & (InitialStage | GivenStage | WhenStage | ThenStage), E2 = never, R2 = never>(
    f: (a: NoInfer<A>) => Effect.Effect<unknown, E2, R2> | void,
  ) =>
  <E1, R1>(
    self: GherkinEffect<A, E1, R1>,
  ): GherkinEffect<Omit<A, typeof StageTypeId> & ThenStage, E1 | StepError, R1 | R2> =>
    Effect.flatMap(
      self,
      (scope): Effect.Effect<GherkinScope<Omit<A, typeof StageTypeId> & ThenStage>, StepError, R2> => {
        const resolvedText = resolveText(text, scope)
        const nextScope = { ...scope, ...stageThen }
        return runTapBody(f, scope, keyword, resolvedText).pipe(Effect.as(nextScope))
      },
    )
const handleRawTap = <E2, R2>(
  raw: Effect.Effect<unknown, E2, R2> | void,
  keyword: string,
  resolvedText: string,
): Effect.Effect<void, never, R2> => {
  if (Effect.isEffect(raw)) {
    return raw.pipe(
      Effect.catchCause((cause) => recordSoftFailure(keyword, resolvedText, Cause.squash(cause))),
      Effect.asVoid,
    )
  }
  return Effect.void
}

const runSoftBody = <A extends object, E2, R2>(
  f: (a: A) => Effect.Effect<unknown, E2, R2> | void,
  scope: GherkinScope<A>,
  keyword: string,
  resolvedText: string,
): Effect.Effect<void, never, R2> => {
  try {
    return handleRawTap<E2, R2>(f(scope), keyword, resolvedText)
  } catch (e) {
    return recordSoftFailure(keyword, resolvedText, e)
  }
}

const tapSoft =
  (keyword: string, text: StepText) =>
  <A extends object & (InitialStage | GivenStage | WhenStage | ThenStage), E2 = never, R2 = never>(
    f: (a: NoInfer<A>) => Effect.Effect<unknown, E2, R2> | void,
  ) =>
  <E1, R1>(
    self: GherkinEffect<A, E1, R1>,
  ): GherkinEffect<Omit<A, typeof StageTypeId> & ThenStage, E1 | StepError, R1 | R2> =>
    Effect.flatMap(
      self,
      (scope): Effect.Effect<GherkinScope<Omit<A, typeof StageTypeId> & ThenStage>, StepError, R2> => {
        const resolvedText = resolveText(text, scope)
        const nextScope = { ...scope, ...stageThen }
        return runSoftBody(f, scope, keyword, resolvedText).pipe(Effect.as(nextScope))
      },
    )
const evaluatePollRaw = <E2, R2>(
  raw: Effect.Effect<unknown, E2, R2> | void,
  keyword: string,
  resolvedText: string,
): Effect.Effect<void, StepError, R2> => {
  if (Effect.isEffect(raw)) {
    return raw.pipe(
      Effect.catch((err) =>
        StepError.make({
          keyword,
          text: resolvedText,
          cause: err,
        })
      ),
      Effect.asVoid,
    )
  }
  return Effect.void
}

const evaluatePoll = <A extends object, E2, R2>(
  f: (a: A) => Effect.Effect<unknown, E2, R2> | void,
  scope: GherkinScope<A>,
  keyword: string,
  resolvedText: string,
): Effect.Effect<void, StepError, R2> => {
  try {
    return evaluatePollRaw(f(scope), keyword, resolvedText)
  } catch (e) {
    return StepError.make({
      keyword,
      text: resolvedText,
      cause: e,
    })
  }
}

const runPollBody = <A extends object, E2, R2>(
  f: (a: A) => Effect.Effect<unknown, E2, R2> | void,
  scope: GherkinScope<A>,
  keyword: string,
  resolvedText: string,
  opts?: PollOptions,
): Effect.Effect<void, StepError, R2> => {
  const evaluate = Effect.suspend(() => evaluatePoll(f, scope, keyword, resolvedText))
  return evaluate.pipe(Effect.retry(pollSchedule(opts)))
}

const tapPoll =
  (keyword: string, text: StepText, opts?: PollOptions) =>
  <A extends object & (InitialStage | GivenStage | WhenStage | ThenStage), E2 = never, R2 = never>(
    f: (a: NoInfer<A>) => Effect.Effect<unknown, E2, R2> | void,
  ) =>
  <E1, R1>(
    self: GherkinEffect<A, E1, R1>,
  ): GherkinEffect<Omit<A, typeof StageTypeId> & ThenStage, E1 | StepError, R1 | R2> =>
    Effect.flatMap(
      self,
      (scope): Effect.Effect<GherkinScope<Omit<A, typeof StageTypeId> & ThenStage>, StepError, R2> => {
        const resolvedText = resolveText(text, scope)
        const nextScope = { ...scope, ...stageThen }
        return runPollBody(f, scope, keyword, resolvedText, opts).pipe(Effect.as(nextScope))
      },
    )

const bindPoll = (keyword: 'when', text: StepText, opts?: PollOptions) => {
  function step<
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
  ) => GherkinEffect<Omit<A, typeof StageTypeId> & Record<N, B> & WhenStage, E1 | StepError, R1 | R2>
  function step<
    A extends object & (InitialStage | GivenStage | WhenStage | ThenStage),
    E2 = never,
    R2 = never,
  >(
    f: (a: NoInfer<A>) => Effect.Effect<unknown, E2, R2> | void,
  ): <E1, R1>(
    self: GherkinEffect<A, E1, R1>,
  ) => GherkinEffect<Omit<A, typeof StageTypeId> & WhenStage, E1 | StepError, R1 | R2>
  function step<E2, R2>(...args: BindStepTapArgs<E2, R2> | BindStepBindArgs<E2, R2>) {
    if (args.length === 1) {
      const f = args[0]
      return <E1, R1>(self: GherkinEffect<object, E1, R1>) =>
        self.pipe(
          Effect.flatMap((scope) => {
            const resolvedText = resolveText(text, scope)
            const nextScope = { ...scope, ...stageWhen }
            return runPollBody(f, scope, keyword, resolvedText, opts).pipe(Effect.as(nextScope))
          }),
        )
    }
    const [name, f] = args
    return <E1, R1>(self: GherkinEffect<object, E1, R1>) =>
      self.pipe(
        Effect.flatMap((scope) => {
          const resolvedText = resolveText(text, scope)
          const retrying = stepWrap(
            keyword,
            resolvedText,
            Effect.suspend(() => f(scope)).pipe(Effect.retry(pollSchedule(opts))),
          )
          return retrying.pipe(
            Effect.map((b) => ({ ...scope, [name]: b, ...stageWhen })),
          )
        }),
      )
  }
  return step
}

type BindStepTapArgs<E, R> = [f: (scope: object) => Effect.Effect<unknown, E, R> | void]
type BindStepBindArgs<E, R> = [name: string, f: (scope: object) => Effect.Effect<unknown, E, R>]

const bindGiven = (keyword: 'given', text: StepText) => {
  function step<N extends string, A extends object & (InitialStage | GivenStage), B, E2, R2>(
    name: N,
    f: (a: NoInfer<A>) => Effect.Effect<B, E2, R2>,
  ): <E1, R1>(
    self: GherkinEffect<A, E1, R1>,
  ) => GherkinEffect<Omit<A, typeof StageTypeId> & Record<N, B> & GivenStage, E1 | StepError, R1 | R2>
  function step<A extends object & (InitialStage | GivenStage), E2 = never, R2 = never>(
    f: (a: NoInfer<A>) => Effect.Effect<unknown, E2, R2> | void,
  ): <E1, R1>(
    self: GherkinEffect<A, E1, R1>,
  ) => GherkinEffect<Omit<A, typeof StageTypeId> & GivenStage, E1 | StepError, R1 | R2>
  function step<E2, R2>(...args: BindStepTapArgs<E2, R2> | BindStepBindArgs<E2, R2>) {
    if (args.length === 1) {
      const f = args[0]
      return <E1, R1>(self: GherkinEffect<object, E1, R1>) =>
        self.pipe(
          Effect.flatMap((scope) => {
            const resolvedText = resolveText(text, scope)
            const nextScope = { ...scope, ...stageGiven }
            return runTapBody(f, scope, keyword, resolvedText).pipe(Effect.as(nextScope))
          }),
        )
    }
    const [name, f] = args
    return <E1, R1>(self: GherkinEffect<object, E1, R1>) =>
      self.pipe(
        Effect.flatMap((scope) => {
          const resolvedText = resolveText(text, scope)
          return stepWrap(keyword, resolvedText, f(scope)).pipe(
            Effect.map((b) => ({ ...scope, [name]: b, ...stageGiven })),
          )
        }),
      )
  }
  return step
}

const bindWhen = (keyword: 'when', text: StepText) => {
  function step<
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
  ) => GherkinEffect<Omit<A, typeof StageTypeId> & Record<N, B> & WhenStage, E1 | StepError, R1 | R2>
  function step<
    A extends object & (InitialStage | GivenStage | WhenStage | ThenStage),
    E2 = never,
    R2 = never,
  >(
    f: (a: NoInfer<A>) => Effect.Effect<unknown, E2, R2> | void,
  ): <E1, R1>(
    self: GherkinEffect<A, E1, R1>,
  ) => GherkinEffect<Omit<A, typeof StageTypeId> & WhenStage, E1 | StepError, R1 | R2>
  function step<E2, R2>(...args: BindStepTapArgs<E2, R2> | BindStepBindArgs<E2, R2>) {
    if (args.length === 1) {
      const f = args[0]
      return <E1, R1>(self: GherkinEffect<object, E1, R1>) =>
        self.pipe(
          Effect.flatMap((scope) => {
            const resolvedText = resolveText(text, scope)
            const nextScope = { ...scope, ...stageWhen }
            return runTapBody(f, scope, keyword, resolvedText).pipe(Effect.as(nextScope))
          }),
        )
    }
    const [name, f] = args
    return <E1, R1>(self: GherkinEffect<object, E1, R1>) =>
      self.pipe(
        Effect.flatMap((scope) => {
          const resolvedText = resolveText(text, scope)
          return stepWrap(keyword, resolvedText, f(scope)).pipe(
            Effect.map((b) => ({ ...scope, [name]: b, ...stageWhen })),
          )
        }),
      )
  }
  return step
}

const _given = (text: StepText) => bindGiven('given', text)
const _when = Object.assign((text: StepText) => bindWhen('when', text), {
  poll: (text: StepText, opts?: PollOptions) => bindPoll('when', text, opts),
})
const _then = Object.assign((text: StepText) => tapThen('then', text), {
  soft: (text: StepText) => tapSoft('then', text),
  poll: (text: StepText, opts?: PollOptions) => tapPoll('then', text, opts),
})
const _and = Object.assign((text: StepText) => tapThen('and', text), {
  soft: (text: StepText) => tapSoft('and', text),
  poll: (text: StepText, opts?: PollOptions) => tapPoll('and', text, opts),
})
const _but = Object.assign((text: StepText) => tapThen('but', text), {
  soft: (text: StepText) => tapSoft('but', text),
  poll: (text: StepText, opts?: PollOptions) => tapPoll('but', text, opts),
})

const emptyScope: GherkinScope<InitialStage> = {
  ...stageInitial,
  [GherkinScopeTypeId]: GherkinScopeTypeId,
}

export type ScopeMap = Readonly<Record<string, Effect.Effect<unknown, never, never>>>

export type ScopeServices<S extends ScopeMap> = {
  readonly [K in keyof S]: S[K] extends Effect.Effect<infer A, never, infer _R> ? A : never
}

export type ScopeIdentifiers<S extends ScopeMap> = {
  [K in keyof S]: S[K] extends Effect.Effect<infer _A, never, infer R> ? R : never
}[keyof S]

function makeScope<S extends ScopeMap>(
  map: S,
): GherkinEffect<ScopeServices<S> & GivenStage, never, ScopeIdentifiers<S>>
function makeScope<S extends ScopeMap>(
  map: S,
): Effect.Effect<GherkinScope<Record<string, unknown> & GivenStage>, never, never> {
  return Effect.gen(function*() {
    const out: Record<string, unknown> = {
      ...stageGiven,
      [GherkinScopeTypeId]: GherkinScopeTypeId,
    }
    for (const [key, tag] of Object.entries(map)) {
      out[key] = yield* tag
    }
    return { ...out, ...stageGiven, [GherkinScopeTypeId]: GherkinScopeTypeId }
  })
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
