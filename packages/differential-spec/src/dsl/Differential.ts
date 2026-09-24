import { it } from '@effect/vitest'
import type { Effect } from 'effect'
import * as fc from 'fast-check'
import type { DualExecutionSupervisorOptions } from '../core/DualExecutionSupervisor.js'
import { runDifferentialWithShrink } from '../core/DualExecutionSupervisor.js'

export interface DifferentialBuilder<Input, OutputA, OutputB> {
  readonly on: (arb: fc.Arbitrary<Input>, options?: DualExecutionSupervisorOptions) => {
    readonly assert: (oracle: (outputA: OutputA, outputB: OutputB) => boolean) => void
  }
}

export interface Comparison<Input, OutputA, OutputB, E> {
  readonly name: string
  readonly reference: (input: Input) => Effect.Effect<OutputA, E>
  readonly candidate: (input: Input) => Effect.Effect<OutputB, E>
}

export const compare = <Input, OutputA, OutputB, E>(
  comparison: Comparison<Input, OutputA, OutputB, E>,
): DifferentialBuilder<Input, OutputA, OutputB> => ({
  on: (arb, options) => ({
    assert: (oracle) => {
      it.effect(
        comparison.name,
        () => runDifferentialWithShrink(comparison.reference, comparison.candidate, arb, oracle, options),
      )
    },
  }),
})
