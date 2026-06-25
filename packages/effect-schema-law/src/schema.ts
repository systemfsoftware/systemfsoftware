import { it } from '@effect/vitest'
import { Either, Schema, Schema as S } from 'effect'

export const ruleOfSchemas = <A, I>(
  name: string,
  schema: S.Schema<A, I, never>,
): void => {
  const decodeEither = Schema.decodeEither(schema)
  const encodeSync = Schema.encodeSync(schema)
  const typeEq = S.equivalence(schema)
  const encodedEq = S.equivalence(S.encodedSchema(schema))

  it.prop(
    `∀x_${name}Enc_=x`,
    [schema],
    ([value]) => {
      const encoded = encodeSync(value)
      const result = decodeEither(encoded)
      if (Either.isLeft(result)) return false
      const reencoded = encodeSync(result.right)
      return encodedEq(reencoded, encoded)
    },
  )

  it.prop(
    `∀x_${name}_=x`,
    [schema],
    ([value]) => {
      const encoded = encodeSync(value)
      const result = decodeEither(encoded)
      return Either.isRight(result) && typeEq(result.right, value)
    },
  )
}
