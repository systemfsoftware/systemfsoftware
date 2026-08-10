import { JSONSchema, Schema as S } from 'effect'

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const Options = S.Struct({
  exempt: S.optionalWith(
    S.Array(S.String).pipe(S.annotations({
      description: 'File basenames this rule stays silent on (e.g. ["recipe.observer.ts"])',
    })),
    { default: () => [] },
  ),
})

export type Options = S.Schema.Type<typeof Options>

export const meta = {
  type: 'problem',
  docs: {
    description:
      'An unbounded collection arbitrary — S.Array, S.Record, or fc.array with no numeric maxLength/maxKeys — that reaches a property generator through an exported recipe is unbounded fan-out: a recursion depth cap (maxDepth) bounds depth only, and per-case cost scales with generated length. A recipe is an exported binding initialized by a call to a builder function (a bare-Identifier callee such as boundedUnion(...)); an exported plain function, class, or member-callee schema declaration (S.Struct(...)) is not, by itself, evidence of a generator. Bounded when the rule can read a numeric literal bound (S.Array/fc.array: maxLength; S.Record: maxLength or maxKeys). The exemption option `exempt` takes file basenames.',
  },
  schema: [
    JSONSchema.make(Options),
  ],
  messages: {
    unboundedFanout: MESSAGE,
  },
} as const
