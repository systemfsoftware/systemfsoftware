import { Conformance } from '@systemfsoftware/conformance-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Context, Duration, Effect, Layer, type Scope } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import type * as PlatformError from 'effect/PlatformError'
import { OpenedNoteText } from './open-file.model.js'

const NOTE = '/notes/hello.txt'

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

export interface OpenFileStopWorld {
  readonly answeredAfterClose: Array<string>
  readonly held: { file?: FileSystem.File }
}

export const openFileStopWorld: Effect.Effect<OpenFileStopWorld> = Effect.sync(() => ({
  answeredAfterClose: [],
  held: {},
}))

const recordStat = (world: OpenFileStopWorld): Effect.Effect<void> => {
  const file = world.held.file
  return file === undefined
    ? Effect.void
    : Effect.match(file.stat, {
      onFailure: () => undefined,
      onSuccess: () => {
        world.answeredAfterClose.push('the borrowed note still answers after being given up')
      },
    })
}

const openFileRule = (world: OpenFileStopWorld): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.suspend(() => {
    if (world.held.file === undefined) {
      return Effect.fail(Conformance.RuleBroken.make({ message: 'the probe never saw the note opened' }))
    }
    return world.answeredAfterClose.length === 0
      ? Effect.void
      : Effect.fail(Conformance.RuleBroken.make({ message: world.answeredAfterClose.join('; ') }))
  })

const borrowedNote = (world: OpenFileStopWorld): Effect.Effect<void, PlatformError.PlatformError, Scope.Scope> =>
  Effect.gen(function*() {
    yield* Effect.addFinalizer(() => recordStat(world))
    const context = yield* Layer.build(MemoryFileSystem.make({ [NOTE]: OpenedNoteText }).layer)
    const fileSystem = Context.get(context, FileSystem.FileSystem)
    const file = yield* fileSystem.open(NOTE, { flag: 'r+' })
    yield* Effect.sync(() => {
      world.held.file = file
    })
    yield* file.readAlloc(5)
    yield* file.writeAll(encode('Z'))
    yield* file.sync
  })

export interface OpenFileStopSpec {
  readonly world: Effect.Effect<OpenFileStopWorld>
  readonly program: (world: OpenFileStopWorld) => Effect.Effect<void, PlatformError.PlatformError, Scope.Scope>
  readonly restart: (world: OpenFileStopWorld) => Effect.Effect<void, PlatformError.PlatformError, Scope.Scope>
  readonly rule: (world: OpenFileStopWorld) => Effect.Effect<void, Conformance.RuleBroken>
  readonly stopWithin: Duration.Input
}

export const openFileStopSpec = (): OpenFileStopSpec => ({
  world: openFileStopWorld,
  program: borrowedNote,
  restart: borrowedNote,
  rule: openFileRule,
  stopWithin: Duration.zero,
})
