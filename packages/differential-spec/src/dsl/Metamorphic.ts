import { it, VitestTestContext } from '@effect/vitest'
import { Effect } from 'effect'
import * as fc from 'fast-check'
import type { DualExecutionSupervisorOptions } from '../core/DualExecutionSupervisor.js'
import { runMetamorphicWithShrink } from '../core/DualExecutionSupervisor.js'
import { announceHostBound, checkOptions } from './Registration.js'

export interface MetamorphicBuilder<Input, Output> {
  readonly relation: (options: {
    readonly transformInput: (input: Input) => Input
    readonly assertOutput: (output1: Output, output2: Output) => boolean
  }) => {
    readonly on: (arb: fc.Arbitrary<Input>, options?: DualExecutionSupervisorOptions) => void
  }
}

export interface MetamorphicTarget<Input, Output, E> {
  readonly name: string
  readonly system: (input: Input) => Effect.Effect<Output, E>
}

export const on = <Input, Output, E>(
  target: MetamorphicTarget<Input, Output, E>,
): MetamorphicBuilder<Input, Output> => ({
  relation: ({ transformInput, assertOutput }) => ({
    on: (arb, options) => {
      it(
        `${target.name}`,
        function*({ expect }) {
          const ctx = yield* VitestTestContext
          yield* announceHostBound(options)(ctx)
          yield* runMetamorphicWithShrink(target.system, arb, transformInput, assertOutput, expect, options)
        },
        checkOptions(options),
      )
    },
  }),
})
