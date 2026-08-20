import { Effect, Schema as S } from 'effect'

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const Options = S.Struct({
  exempt: S.Array(S.String).pipe(
    S.annotate({
      description:
        'File basenames this rule stays silent on (e.g. ["refutation.kernel.property.test.ts"]). An owner who has measured the cost and accepted it names the file here; the property still runs.',
    }),
    S.withDecodingDefaultType(Effect.succeed([])),
  ),
})

export type Options = S.Schema.Type<typeof Options>

export const ITERATOR_METHODS: ReadonlySet<string> = new Set([
  'every',
  'some',
  'map',
  'flatMap',
  'filter',
  'forEach',
  'reduce',
  'reduceRight',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'sort',
])

export const CONSTANT_POOL_ARBITRARIES: ReadonlySet<string> = new Set(['constant', 'constantFrom'])

export const FASTCHECK_NAMESPACES: ReadonlySet<string> = new Set(['fc'])

export const VIOLATION_NAME = 'quantification nested inside a property predicate' as const

export const EXPECTED =
  'per-case cost bounded by the draw, not by the draw times a second traversal — inspect a generated value with a fold whose body calls nothing, or move the inner quantifier into the generator so the shrinker can see it' as const

export const ACTUAL =
  'the predicate iterates a value derived from a generated parameter and calls a free function inside that loop, so cost scales with the drawn size times whatever that call costs' as const

export const FIX =
  "hoist the inner call out of the loop when its result does not vary per element; otherwise assert one drawn element per case and let numRuns supply the quantifier, or generate the pair and compare directly. If the cost is understood and accepted, add this file's basename to the rule's exempt option" as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A property predicate must not quantify over its own generated value and call out again inside that loop. Per-case cost then scales with the drawn size rather than with the draw count, which is the shape Hypothesis reports as nested_given: the suite slows superlinearly as the generator widens, and a CI budget tuned on small draws times out on large ones. Iteration over a bound the generator does not control, and a fold whose body calls nothing, are both fine.',
  },
  schema: [S.toJsonSchemaDocument(Options).schema],
  messages: {
    nestedQuantification: MESSAGE,
  },
} as const
