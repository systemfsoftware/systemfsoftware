import { Match, Predicate } from 'effect'

const decoder = new TextDecoder()

export const textOf = (chunk: string | Uint8Array): string =>
  Match.value(chunk).pipe(
    Match.when(Predicate.isString, (text) => text),
    Match.orElse((bytes) => decoder.decode(bytes)),
  )
