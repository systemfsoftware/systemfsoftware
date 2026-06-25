import type { Context } from 'effect'
import { Cause, Effect, Layer } from 'effect'

import type { GherkinEffect, StepText } from '../do-notation.js'
import { StepError } from '../step-error.js'

type NoInfer<A> = [A][A extends unknown ? 0 : never]

const resolveStepText = (text: StepText, scope: object): string => {
  if (typeof text === 'function') return text(scope)
  return text
}

const stepWrap = <A, E, R>(
  keyword: string,
  text: string,
  body: Effect.Effect<A, E, R>,
): Effect.Effect<A, StepError, R> =>
  body.pipe(
    Effect.catchAllCause((cause) => Effect.fail(new StepError({ keyword, text, cause: Cause.squash(cause) }))),
  )

export type PairwiseResult<A> = {
  readonly a: A
  readonly b: A
  readonly aLabel: string
  readonly bLabel: string
}

export interface PairwiseMatrix<Identifier = unknown, RA = never, RB = never> {
  readonly a: { readonly name: string; readonly layer: Layer.Layer<Identifier, never, RA> }
  readonly b: { readonly name: string; readonly layer: Layer.Layer<Identifier, never, RB> }
}

export const pairwiseFor = <Identifier, Service, RA = never, RB = never>(
  matrix: PairwiseMatrix<Identifier, RA, RB>,
  service: Context.Tag<Identifier, Service>,
) => {
  type DualReq = RA | RB
  const bindPairwise = (text: StepText) => {
    function step<N extends string, A extends object, Out, E>(
      name: N,
      f: (scope: NoInfer<A>) => (svc: Service) => Effect.Effect<Out, E, never>,
    ): <E1, R1>(
      self: GherkinEffect<A, E1, R1>,
    ) => GherkinEffect<A & Record<N, PairwiseResult<Out>>, E1 | StepError, R1 | RA | RB>
    function step(
      name: string,
      f: (scope: object) => (svc: Service) => Effect.Effect<unknown, unknown, never>,
    ) {
      return <E1, R1>(self: GherkinEffect<object, E1, R1>) =>
        self.pipe(
          Effect.flatMap((scope) => {
            const resolvedText = resolveStepText(text, scope)
            const workload = Effect.gen(function*() {
              const svc = yield* service
              return yield* f(scope)(svc)
            })
            const runOn = (side: { readonly name: string; readonly layer: Layer.Layer<Identifier, never, DualReq> }) =>
              stepWrap(
                'pairwise',
                `${resolvedText} [${side.name}]`,
                workload.pipe(Effect.provide(Layer.fresh(side.layer))),
              )
            return runOn(matrix.a).pipe(
              Effect.flatMap((a) =>
                runOn(matrix.b).pipe(
                  Effect.map((b) => ({
                    ...scope,
                    [name]: {
                      a,
                      b,
                      aLabel: matrix.a.name,
                      bLabel: matrix.b.name,
                    },
                  })),
                )
              ),
            )
          }),
        )
    }
    return step
  }
  return bindPairwise
}
