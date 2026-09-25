import type { Asserted } from '@systemfsoftware/vitest/integration'
import { step } from '@systemfsoftware/vitest/integration'
import type { Context } from 'effect'
import { Effect, Layer } from 'effect'
import { dual } from 'effect/Function'

import type { GherkinEffect, GherkinScope, GivenStage, InitialStage, StepText, WhenStage } from '../DoNotation.js'
import { resolveText, StageTypeId, stageWhen, stepWrapAt } from '../DoNotation.js'
import { specSite } from '../SpecSite.js'
import type { StepError } from '../StepError.schema.js'

type NoInfer<A> = [A][A extends A ? 0 : never]

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

const pairwiseForImpl = <Identifier, Service, RA = never, RB = never>(
  matrix: PairwiseMatrix<Identifier, RA, RB>,
  service: Context.Service<Identifier, Service>,
): (
  text: StepText,
) => <N extends string, A extends object & (InitialStage | GivenStage | WhenStage), Out, E>(
  name: N,
  f: (scope: NoInfer<A>) => (svc: Service) => Effect.Effect<Out, E, never>,
) => <E1, R1>(
  self: GherkinEffect<A, E1, R1>,
) => GherkinEffect<
  Omit<A, typeof StageTypeId> & Record<N, PairwiseResult<Out>> & WhenStage,
  E1 | StepError,
  R1 | RA | RB | Asserted
> => {
  type DualReq = RA | RB
  const bindPairwise = (text: StepText) => {
    const site = specSite()
    function pairwiseStep<N extends string, A extends object & (InitialStage | GivenStage | WhenStage), Out, E>(
      name: N,
      f: (scope: NoInfer<A>) => (svc: Service) => Effect.Effect<Out, E, never>,
    ): <E1, R1>(
      self: GherkinEffect<A, E1, R1>,
    ) => GherkinEffect<
      Omit<A, typeof StageTypeId> & Record<N, PairwiseResult<Out>> & WhenStage,
      E1 | StepError,
      R1 | RA | RB | Asserted
    >
    function pairwiseStep<E, Out = unknown>(
      name: string,
      f: (scope: object) => (svc: Service) => Effect.Effect<Out, E, never>,
    ) {
      return <E1, R1>(self: GherkinEffect<object, E1, R1>) =>
        self.pipe(
          Effect.flatMap((scope): Effect.Effect<GherkinScope<object & WhenStage>, StepError, DualReq | Asserted> => {
            const resolvedText = resolveText(text, scope)
            const workload = Effect.gen(function*() {
              const svc = yield* service
              return yield* f(scope)(svc)
            })
            const runOn = (side: { readonly name: string; readonly layer: Layer.Layer<Identifier, never, DualReq> }) =>
              stepWrapAt(
                'pairwise',
                `${resolvedText} [${side.name}]`,
                site,
                workload.pipe(Effect.provide(Layer.fresh(side.layer))),
              )
            return step(
              runOn(matrix.a).pipe(
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
                      ...stageWhen,
                    })),
                  )
                ),
              ),
            )
          }),
        )
    }
    return pairwiseStep
  }
  return bindPairwise
}

export const pairwiseFor: {
  <Identifier, Service, RA = never, RB = never>(
    service: Context.Service<Identifier, Service>,
  ): (
    matrix: PairwiseMatrix<Identifier, RA, RB>,
  ) => (
    text: StepText,
  ) => <N extends string, A extends object & (InitialStage | GivenStage | WhenStage), Out, E>(
    name: N,
    f: (scope: NoInfer<A>) => (svc: Service) => Effect.Effect<Out, E, never>,
  ) => <E1, R1>(
    self: GherkinEffect<A, E1, R1>,
  ) => GherkinEffect<
    Omit<A, typeof StageTypeId> & Record<N, PairwiseResult<Out>> & WhenStage,
    E1 | StepError,
    R1 | RA | RB | Asserted
  >
  <Identifier, Service, RA = never, RB = never>(
    matrix: PairwiseMatrix<Identifier, RA, RB>,
    service: Context.Service<Identifier, Service>,
  ): (
    text: StepText,
  ) => <N extends string, A extends object & (InitialStage | GivenStage | WhenStage), Out, E>(
    name: N,
    f: (scope: NoInfer<A>) => (svc: Service) => Effect.Effect<Out, E, never>,
  ) => <E1, R1>(
    self: GherkinEffect<A, E1, R1>,
  ) => GherkinEffect<
    Omit<A, typeof StageTypeId> & Record<N, PairwiseResult<Out>> & WhenStage,
    E1 | StepError,
    R1 | RA | RB | Asserted
  >
} = dual(2, pairwiseForImpl)
