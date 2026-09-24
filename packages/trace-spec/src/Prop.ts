import { TaskRef } from '@systemfsoftware/effect-spec-runtime'
import { Effect, Layer, Option, Schema } from 'effect'
import { dual } from 'effect/Function'
import type * as Scope from 'effect/Scope'
import * as Contract from './Contract.js'
import type { Stimulus } from './Stimulus.js'
import { Break, Hold } from './Verdict.schema.js'
import type { Verdict } from './Verdict.schema.js'

const isHold = Schema.is(Hold)
const isBreak = Schema.is(Break)

const annotate = (message: string): Effect.Effect<void> =>
  Effect.gen(function*() {
    const task = yield* TaskRef.RawVitestTaskRef
    return yield* Option.match(Option.fromNullishOr(task?.annotate), {
      onNone: () => Effect.void,
      onSome: (record) => Effect.promise(() => Promise.resolve(record(message, 'info'))),
    })
  })

const dumpMessageOf = (verdict: Verdict, dumpPath: string | null): Option.Option<string> =>
  Option.map(
    Option.flatMap(Option.liftPredicate(verdict, isBreak), () => Option.fromNullishOr(dumpPath)),
    (path) => `trace contract failed; observed graph dumped to ${path}`,
  )

const announce = (verdict: Verdict, dumpPath: string | null): Effect.Effect<void> =>
  Option.match(dumpMessageOf(verdict, dumpPath), {
    onNone: () => Effect.void,
    onSome: (message) => annotate(message),
  })

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
): (
  subject: Stimulus<Input, Output, E, Provided>,
  input: Input,
) => Effect.Effect<boolean, Contract.JudgeFailure<E>, Scope.Scope | Required> => {
  const checked = (subject: Stimulus<Input, Output, E, Provided>, input: Input) =>
    Contract.judge(judgedOver(contract, subject), input, { dumpName: title }).pipe(
      Effect.tap((judgment) => announce(judgment.verdict, judgment.dumpPath)),
      Effect.map((judgment) => isHold(judgment.verdict) && consumedInput(judgment, input)),
      Effect.provide(Layer.fresh(scenario)),
    )

  return (subject, input) => checked(subject, input)
}

export const predicate: {
  <Input, Output, E, Provided, Required>(
    contract: Contract.Contract<Input, Output, E, Provided>,
    scenario: Layer.Layer<Contract.Services<Provided>, never, Required>,
  ): (
    title: string,
  ) => (
    subject: Stimulus<Input, Output, E, Provided>,
    input: Input,
  ) => Effect.Effect<boolean, Contract.JudgeFailure<E>, Scope.Scope | Required>
  <Input, Output, E, Provided, Required>(
    title: string,
    contract: Contract.Contract<Input, Output, E, Provided>,
    scenario: Layer.Layer<Contract.Services<Provided>, never, Required>,
  ): (
    subject: Stimulus<Input, Output, E, Provided>,
    input: Input,
  ) => Effect.Effect<boolean, Contract.JudgeFailure<E>, Scope.Scope | Required>
} = dual(3, predicateImpl)

if (import.meta.vitest !== void 0) {
  // Dynamic import: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@effect/vitest')

  it.prop(
    '∀e_BreakWithDump_∈Messages',
    { of: [Break, Schema.String], subject: dumpMessageOf, runs: 100 },
    (messageOf, [verdict, path]) => Option.exists(messageOf(verdict, path), (message) => message.includes(path)),
  )

  it.prop(
    '∀h_Hold_⊥Messages',
    { of: [Hold, Schema.String], subject: dumpMessageOf, runs: 100 },
    (messageOf, [verdict, path]) => Option.isNone(messageOf(verdict, path)),
  )

  it.prop(
    '∀b_BreakWithoutDump_⊥Messages',
    { of: [Break], subject: dumpMessageOf, runs: 100 },
    (messageOf, [verdict]) => Option.isNone(messageOf(verdict, null)),
  )
}
