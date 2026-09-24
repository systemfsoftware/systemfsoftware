import { dual } from 'effect/Function'
import * as Match from 'effect/Match'

const newLineRegExp = /\r\n|\r|\n/g

export const convertToLf = (input: string): string => input.replace(newLineRegExp, '\n')

export const truncateWithEllipsis = dual<
  (maximumLength: number) => (s: string) => string,
  (s: string, maximumLength: number) => string
>(2, (s: string, maximumLength: number): string =>
  Match.value(s.length <= maximumLength).pipe(
    Match.when(true, () => s),
    Match.orElse(() =>
      Match.value(s.length <= 3).pipe(
        Match.when(true, () => s.substring(0, maximumLength)),
        Match.orElse(() => `${s.substring(0, maximumLength - 3)}...`),
      )
    ),
  ))
