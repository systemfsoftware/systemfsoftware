import { Effect, Layer, Schema } from 'effect'
import { dual } from 'effect/Function'
import type * as Scope from 'effect/Scope'
import * as Contract from './Contract.js'
import type { Stimulus } from './Stimulus.js'
import * as TaskAnnounce from './TaskAnnounce.js'
import { Hold } from './Verdict.schema.js'

const isHold = Schema.is(Hold)

/**
 * The contract with its stimulus replaced by the function the property was handed: the impostor gate
 * swaps in a constant fake, so the judgement must reach the stimulus through the argument, never the
 * closure.
 */
const judgedOver = <Input, Output, E, Provided>(
  contract: Contract.Contract<Input, Output, E, Provided>,
  subject: Stimulus<Input, Output, E, Provided>,
): Contract.Contract<Input, Output, E, Provided> => ({ ...contract, stimulus: subject })

/**
 * The run must be the run of the generated input: a stimulus that ignores its input and answers with one
 * frozen run satisfies every relation about that run, so the input pin is what refutes it.
 */
const consumedInput = <Input, Output>(judgment: Contract.Judgment<Input, Output>, input: Input): boolean =>
  judgment.run.input === input

const predicateImpl = <Input, Output, E, Provided, Required>(
  title: string,
  contract: Contract.Contract<Input, Output, E, Provided>,
  scenario: Layer.Layer<Contract.Services<Provided>, never, Required>,
  shared: Layer.Layer<Required, never, never>,
): (
  subject: Stimulus<Input, Output, E, Provided>,
  input: Input,
) => Effect.Effect<boolean, Contract.JudgeFailure<E>, Scope.Scope> => {
  const provided = scenario.pipe(Layer.provideMerge(shared))
  const checked = (subject: Stimulus<Input, Output, E, Provided>, input: Input) =>
    Contract.judge(judgedOver(contract, subject), input, { dumpName: title }).pipe(
      Effect.tap(TaskAnnounce.announceDump),
      Effect.map((judgment) => isHold(judgment.verdict) && consumedInput(judgment, input)),
      Effect.provide(Layer.fresh(provided)),
    )

  return (subject, input) => checked(subject, input)
}

export const predicate: {
  <Input, Output, E, Provided, Required>(
    contract: Contract.Contract<Input, Output, E, Provided>,
    scenario: Layer.Layer<Contract.Services<Provided>, never, Required>,
    shared: Layer.Layer<Required, never, never>,
  ): (
    title: string,
  ) => (
    subject: Stimulus<Input, Output, E, Provided>,
    input: Input,
  ) => Effect.Effect<boolean, Contract.JudgeFailure<E>, Scope.Scope>
  <Input, Output, E, Provided, Required>(
    title: string,
    contract: Contract.Contract<Input, Output, E, Provided>,
    scenario: Layer.Layer<Contract.Services<Provided>, never, Required>,
    shared: Layer.Layer<Required, never, never>,
  ): (
    subject: Stimulus<Input, Output, E, Provided>,
    input: Input,
  ) => Effect.Effect<boolean, Contract.JudgeFailure<E>, Scope.Scope>
} = dual(4, predicateImpl)
