import { Match, Predicate, Schema } from 'effect'

export const SocketChunk = Schema.Union([Schema.String, Schema.Uint8Array])
export type SocketChunk = typeof SocketChunk.Type

const decoder = new TextDecoder()

export const textOf = (chunk: SocketChunk): string =>
  Match.value(chunk).pipe(
    Match.when(Predicate.isString, (text) => text),
    Match.orElse((bytes) => decoder.decode(bytes)),
  )
