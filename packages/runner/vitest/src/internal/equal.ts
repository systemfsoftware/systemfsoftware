import * as Equal from 'effect/Equal'
import * as V from 'vitest'

let registered = false

/** @internal */
export const registerEqualTester = (): void => {
  if (registered) return
  registered = true
  V.expect.addEqualityTesters([equalTester])
}

const equalTester = (first: Equal.Equal, second: Equal.Equal): boolean | undefined =>
  equalTogether(first, second) ? true : undefined

const equalTogether = (first: Equal.Equal, second: Equal.Equal): boolean =>
  bothEqualable(first, second) && Equal.equals(first, second)

const bothEqualable = (first: Equal.Equal, second: Equal.Equal): boolean =>
  Equal.isEqual(first) && Equal.isEqual(second)
