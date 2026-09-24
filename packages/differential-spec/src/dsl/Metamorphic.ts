import { it } from '@effect/vitest'
import type { Effect } from 'effect'
import * as fc from 'fast-check'
import type { DualExecutionSupervisorOptions } from '../core/DualExecutionSupervisor.js'
import { runMetamorphicWithShrink } from '../core/DualExecutionSupervisor.js'

export interface MetamorphicBuilder<Input, Output> {
  readonly relation: (options: {
    readonly transformInput: (input: Input) => Input
    readonly assertOutput: (output1: Output, output2: Output) => boolean
  }) => {
    readonly on: (arb: fc.Arbitrary<Input>, options?: DualExecutionSupervisorOptions) => void
  }
}

export const on = <Input, Output, E>(
  name: string,
  system: (input: Input) => Effect.Effect<Output, E>,
): MetamorphicBuilder<Input, Output> => ({
  relation: ({ transformInput, assertOutput }) => ({
    on: (arb, options) => {
      it.effect(name, () => runMetamorphicWithShrink(system, arb, transformInput, assertOutput, options))
    },
  }),
})
