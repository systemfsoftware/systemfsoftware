import { Effect, Layer, Option, Schema } from 'effect'
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

/**
 * The generated-case predicate for one case: a factory that runs the contract's cell with
 * the dump named after the case — so every failing draw overwrites one file and the last
 * failing draw is the shrunk counterexample the runner reports — and answers the verdict as
 * the boolean: `true` while the relation held, `false` on a break, falsifying the property.
 * Only infrastructure refusals — a failing behaviour, an undecodable span, an empty
 * observation — stay on the error channel. The scenario layer is built fresh per draw, so
 * each draw owns its observation window.
 */
export function predicate<Input, Output, E, Provided, Required>(
  title: string,
  contract: Contract.Contract<Input, Output, E, Provided>,
  scenario: Layer.Layer<Contract.CellServices<Provided>, never, Required>,
): (
  input: Input,
  context: TestContext | undefined,
) => Effect.Effect<boolean, Contract.CellFailure<E>, Scope.Scope | Required> {
  const checked = (input: Input, context: TestContext | undefined) =>
    Contract.cell(contract, { dumpName: title }).run(input).pipe(
      Effect.tap((judgment) => announce(context, judgment.verdict, judgment.dumpPath)),
      Effect.map((judgment) => isHold(judgment.verdict)),
      Effect.provide(Layer.fresh(scenario)),
    )

  return (input, context) => checked(input, context)
}

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
