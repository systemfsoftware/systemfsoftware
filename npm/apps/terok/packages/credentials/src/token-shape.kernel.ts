import * as A from 'effect/Array'
import { pipe } from 'effect/Function'
import * as Option from 'effect/Option'

export const splitTokens = (input: string): ReadonlyArray<string> =>
  pipe(
    input.split(','),
    A.map((token) => token.trim()),
    A.filter((token) => token.length > 0),
  )

export const parseIndex = (token: string): Option.Option<number> =>
  pipe(
    Option.fromNullable(/^[0-9]+$/.exec(token)?.[0]),
    Option.map((digits) => Number(digits)),
  )

export const uniqueBy = <T>(values: ReadonlyArray<T>, key: (value: T) => string): ReadonlyArray<T> => {
  const seen = new Set<string>()
  const result: T[] = []
  for (const value of values) {
    const k = key(value)
    if (seen.has(k)) continue
    seen.add(k)
    result.push(value)
  }
  return result
}

export const duplicateOf = (values: ReadonlyArray<string>): Option.Option<string> => {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) return Option.some(value)
    seen.add(value)
  }
  return Option.none()
}
