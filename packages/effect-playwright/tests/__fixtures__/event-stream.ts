import { Effect, Stream } from 'effect'

export const firstEvent = <A>(stream: Stream.Stream<A>) =>
  Effect.forkChild(Stream.runHead(stream), { startImmediately: true })
