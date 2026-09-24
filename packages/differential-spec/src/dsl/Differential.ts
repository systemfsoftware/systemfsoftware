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

export const compare = <Input, OutputA, OutputB, E>(
  name: string,
  targets: {
    readonly reference: (input: Input) => Effect.Effect<OutputA, E>
    readonly candidate: (input: Input) => Effect.Effect<OutputB, E>
  },
): DifferentialBuilder<Input, OutputA, OutputB> => ({
  on: (arb, options) => ({
    assert: (oracle) => {
      it.effect(name, () => runDifferentialWithShrink(targets.reference, targets.candidate, arb, oracle, options))
    },
  }),
})
