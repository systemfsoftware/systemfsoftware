import { Effect, Schema as S } from 'effect'

export const NAME = 'unknown' as const

export const EXPECTED =
  'unknown only as a generic default (`<A = unknown>`), a type-predicate parameter (`(u: unknown): u is T`), or a catch binding (`catch (e: unknown)`)' as const

export const ACTUAL = 'unknown used as a type outside those positions' as const

export const FIX =
  'Replace `unknown` with the domain type. Keep `unknown` only in `<A = unknown>`, `(u: unknown): u is T` / `asserts u is T`, or `catch (e: unknown)`.' as const

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const OptionsElement = S.Struct({
  allowGenericDefault: S.Boolean.pipe(
    S.annotate({ description: 'Allow unknown as a generic type-parameter default (`<A = unknown>`).' }),
    S.withDecodingDefaultType(Effect.succeed(true)),
  ),
  allowTypePredicate: S.Boolean.pipe(
    S.annotate({ description: 'Allow unknown as a parameter of a type predicate (`(u: unknown): u is T`).' }),
    S.withDecodingDefaultType(Effect.succeed(true)),
  ),
  allowCatchClause: S.Boolean.pipe(
    S.annotate({ description: 'Allow unknown as a catch-clause binding (`catch (e: unknown)`).' }),
    S.withDecodingDefaultType(Effect.succeed(true)),
  ),
})

export const meta = {
  type: 'problem',
  docs: {
    description: 'Ban unknown except as a generic default, a type-predicate parameter, or a catch binding.',
  },
  schema: [S.toJsonSchemaDocument(OptionsElement).schema],
  messages: {
    banned: MESSAGE,
  },
} as const
