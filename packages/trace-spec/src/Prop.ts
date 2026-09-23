import { Effect, Layer, Option, Schema } from 'effect'
import { dual } from 'effect/Function'
import type * as Scope from 'effect/Scope'
import type { TestContext } from 'vitest'
import * as Contract from './Contract.js'
import { Break, Hold } from './Verdict.schema.js'
import type { Verdict } from './Verdict.schema.js'

const isHold = Schema.is(Hold)
const isBreak = Schema.is(Break)

const annotate = (context: TestContext | undefined, message: string): Effect.Effect<void> =>
  Option.match(Option.flatMap(Option.fromNullishOr(context), (task) => Option.fromNullishOr(task.annotate)), {
    onNone: () => Effect.void,
    onSome: (record) => Effect.promise(() => Promise.resolve(record(message, 'info'))),
  })

const dumpMessageOf = (verdict: Verdict, dumpPath: string | null): Option.Option<string> =>
  Option.map(
    Option.flatMap(Option.liftPredicate(verdict, isBreak), () => Option.fromNullishOr(dumpPath)),
    (path) => `trace contract failed; observed graph dumped to ${path}`,
  )

const announce = (
  context: TestContext | undefined,
  verdict: Verdict,
  dumpPath: string | null,
): Effect.Effect<void> =>
  Option.match(dumpMessageOf(verdict, dumpPath), {
    onNone: () => Effect.void,
    onSome: (message) => annotate(context, message),
  })

const predicateImpl = <Input, Output, E, Provided, Required>(
  title: string,
  contract: Contract.Contract<Input, Output, E, Provided>,
  scenario: Layer.Layer<Contract.Services<Provided>, never, Required>,
): (
  input: Input,
  context: TestContext | undefined,
) => Effect.Effect<boolean, Contract.JudgeFailure<E>, Scope.Scope | Required> => {
  const checked = (input: Input, context: TestContext | undefined) =>
    Contract.judge(contract, input, { dumpName: title }).pipe(
      Effect.tap((judgment) => announce(context, judgment.verdict, judgment.dumpPath)),
      Effect.map((judgment) => isHold(judgment.verdict)),
      Effect.provide(Layer.fresh(scenario)),
    )

  return (input, context) => checked(input, context)
}

export const predicate: {
  <Input, Output, E, Provided, Required>(
    contract: Contract.Contract<Input, Output, E, Provided>,
    scenario: Layer.Layer<Contract.Services<Provided>, never, Required>,
  ): (
    title: string,
  ) => (
    input: Input,
    context: TestContext | undefined,
  ) => Effect.Effect<boolean, Contract.JudgeFailure<E>, Scope.Scope | Required>
  <Input, Output, E, Provided, Required>(
    title: string,
    contract: Contract.Contract<Input, Output, E, Provided>,
    scenario: Layer.Layer<Contract.Services<Provided>, never, Required>,
  ): (
    input: Input,
    context: TestContext | undefined,
  ) => Effect.Effect<boolean, Contract.JudgeFailure<E>, Scope.Scope | Required>
} = dual(3, predicateImpl)

if (import.meta.vitest !== void 0) {
  // Dynamic import: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@effect/vitest')

  it.prop(
    '∀e_BreakWithDump_∈Messages',
    [Break, Schema.String],
    ([verdict, path]) => Option.exists(dumpMessageOf(verdict, path), (message) => message.includes(path)),
  )

  it.prop(
    '∀h_Hold_⊥Messages',
    [Hold, Schema.String],
    ([verdict, path]) => Option.isNone(dumpMessageOf(verdict, path)),
  )

  it.prop(
    '∀b_BreakWithoutDump_⊥Messages',
    [Break],
    ([verdict]) => Option.isNone(dumpMessageOf(verdict, null)),
  )
}
