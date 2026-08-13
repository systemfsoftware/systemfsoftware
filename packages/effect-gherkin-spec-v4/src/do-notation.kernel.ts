import { Cause, Effect } from 'effect'
import { StepError } from './step-error.kernel.js'

type NoInfer<A> = [A][A extends unknown ? 0 : never]

const GherkinScopeTypeId: unique symbol = Symbol.for('@systemfsoftware/gherkin/GherkinScope')

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
): Effect.Effect<A, StepError, R> =>
  body.pipe(
    Effect.catchCause((cause) => Effect.fail(StepError.make({ keyword, text, cause: Cause.squash(cause) }))),
  )

export type GherkinEffect<A extends object, E, R> = Effect.Effect<GherkinScope<A>, E, R>

const tapStep = (keyword: string, text: StepText) =>
<A extends object, E2 = never, R2 = never>(
  f: (a: NoInfer<A>) => Effect.Effect<unknown, E2, R2> | void,
) =>
<E1, R1>(self: GherkinEffect<A, E1, R1>): GherkinEffect<A, E1 | StepError, R1 | R2> =>
  Effect.flatMap(self, (scope): Effect.Effect<GherkinScope<A>, StepError, R2> => {
    const resolvedText = resolveText(text, scope)
    let raw: Effect.Effect<unknown, E2, R2> | void
    try {
      raw = f(scope)
    } catch (e) {
      return Effect.fail(StepError.make({ keyword, text: resolvedText, cause: e }))
    }
    if (Effect.isEffect(raw)) {
      return stepWrap(keyword, resolvedText, raw).pipe(Effect.as(scope))
    }
    return Effect.succeed(scope)
  })

type BindStepTapArgs = [f: (scope: object) => Effect.Effect<unknown, unknown, unknown> | void]
type BindStepBindArgs = [name: string, f: (scope: object) => Effect.Effect<unknown, unknown, unknown>]

const bindStep = (keyword: 'given' | 'when', text: StepText) => {
  function step<N extends string, A extends object, B, E2, R2>(
    name: N,
    f: (a: NoInfer<A>) => Effect.Effect<B, E2, R2>,
  ): <E1, R1>(
    self: GherkinEffect<A, E1, R1>,
  ) => GherkinEffect<A & Record<N, B>, E1 | StepError, R1 | R2>
  function step<A extends object, E2 = never, R2 = never>(
    f: (a: NoInfer<A>) => Effect.Effect<unknown, E2, R2> | void,
  ): <E1, R1>(self: GherkinEffect<A, E1, R1>) => GherkinEffect<A, E1 | StepError, R1 | R2>
  function step(...args: BindStepTapArgs | BindStepBindArgs) {
    if (args.length === 1) {
      return tapStep(keyword, text)(args[0])
    }
    const [name, f] = args
    return <E1, R1>(self: GherkinEffect<object, E1, R1>) =>
      self.pipe(
        Effect.flatMap((scope) => {
          const resolvedText = resolveText(text, scope)
          return stepWrap(keyword, resolvedText, f(scope)).pipe(
            Effect.map((b) => ({ ...scope, [name]: b })),
          )
        }),
      )
  }
  return step
}

const _given = (text: StepText) => bindStep('given', text)
const _when = (text: StepText) => bindStep('when', text)
const _then = (text: StepText) => tapStep('then', text)
const _and = (text: StepText) => tapStep('and', text)
const _but = (text: StepText) => tapStep('but', text)

const emptyScope: GherkinScope<Record<string, never>> = { [GherkinScopeTypeId]: GherkinScopeTypeId }

export type ScopeMap = Readonly<Record<string, Effect.Effect<unknown, never, unknown>>>

export type ScopeServices<S extends ScopeMap> = {
  readonly [K in keyof S]: S[K] extends Effect.Effect<infer A, never, infer _R> ? A : never
}

export type ScopeIdentifiers<S extends ScopeMap> = {
  [K in keyof S]: S[K] extends Effect.Effect<infer _A, never, infer R> ? R : never
}[keyof S]

function makeScope<S extends ScopeMap>(map: S): GherkinEffect<ScopeServices<S>, never, ScopeIdentifiers<S>>
function makeScope(map: ScopeMap): Effect.Effect<GherkinScope<Record<string, unknown>>, never, unknown> {
  return Effect.gen(function*() {
    const out: Record<string, unknown> = { [GherkinScopeTypeId]: GherkinScopeTypeId }
    for (const [key, tag] of Object.entries(map)) {
      out[key] = yield* tag
    }
    return { ...out, [GherkinScopeTypeId]: GherkinScopeTypeId }
  })
}

export const Gherkin = {
  Do: Effect.succeed(emptyScope),
  startWith: <A extends object>(bindings: A): GherkinEffect<A, never, never> =>
    Effect.succeed({ ...bindings, [GherkinScopeTypeId]: GherkinScopeTypeId }),
  scope: makeScope,
  Given: _given,
  When: _when,
  Then: _then,
  And: _and,
  But: _but,
} as const

export const { Given, When, Then, And, But } = Gherkin
