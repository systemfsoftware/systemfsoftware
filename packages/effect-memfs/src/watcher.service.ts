import { Context, type Effect, type Scope, type Stream } from 'effect'
import type * as FileSystem from 'effect/FileSystem'
import type * as PlatformError from 'effect/PlatformError'

export type WatchEvents = Stream.Stream<FileSystem.WatchEvent, PlatformError.PlatformError>

export interface WatcherShape {
  readonly start: (path: string, options?: FileSystem.WatchOptions) => Effect.Effect<WatchEvents, never, Scope.Scope>
  readonly openWatches: Effect.Effect<ReadonlyArray<string>>
  readonly awaitOpen: (path: string) => Effect.Effect<void>
}

export class Watcher extends Context.Service<Watcher, WatcherShape>()('@systemfsoftware/effect-memfs/Watcher') {}
