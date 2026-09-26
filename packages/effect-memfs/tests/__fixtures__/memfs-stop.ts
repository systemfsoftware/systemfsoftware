import { Conformance } from '@systemfsoftware/conformance-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Context, Duration, Effect, Exit, Layer, Stream } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import type * as PlatformError from 'effect/PlatformError'
import type * as Scope from 'effect/Scope'

export const SCRATCH_ROOT = '/scratch'

export interface MemfsStopWorld {
  readonly watchesAtClose: Array<ReadonlyArray<string>>
  readonly scratchAtClose: Array<ReadonlyArray<string>>
  readonly held: {
    watcher?: MemoryFileSystem.WatcherShape
    fileSystem?: FileSystem.FileSystem
  }
}

export const memfsStopWorld: Effect.Effect<MemfsStopWorld> = Effect.sync(() => ({
  watchesAtClose: [],
  scratchAtClose: [],
  held: {},
}))

const recordWatches = (world: MemfsStopWorld): Effect.Effect<void> => {
  const watcher = world.held.watcher
  return watcher === undefined
    ? Effect.void
    : Effect.map(watcher.openWatches, (paths) => {
      world.watchesAtClose.push(paths)
    })
}

const recordScratch = (world: MemfsStopWorld): Effect.Effect<void> => {
  const fileSystem = world.held.fileSystem
  return fileSystem === undefined
    ? Effect.void
    : Effect.map(Effect.exit(fileSystem.readDirectory(SCRATCH_ROOT)), (read) => {
      world.scratchAtClose.push(Exit.match(read, { onFailure: () => [], onSuccess: (entries) => entries }))
    })
}

const memfsRule = (world: MemfsStopWorld): Effect.Effect<void, Conformance.RuleBroken> => {
  const problems = [
    ...world.watchesAtClose
      .filter((paths) => paths.length > 0)
      .map((paths) => `a watch on ${paths.join(', ')} was still open when the store stopped`),
    ...world.scratchAtClose
      .filter((entries) => entries.length > 0)
      .map((entries) => `the scratch folder still held ${entries.join(', ')} when the store stopped`),
  ]
  return problems.length === 0
    ? Effect.void
    : Effect.fail(new Conformance.RuleBroken({ message: problems.join('; ') }))
}

const watchedStore = (world: MemfsStopWorld): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function*() {
    yield* Effect.addFinalizer(() => recordWatches(world))
    const context = yield* Layer.build(MemoryFileSystem.make({ '/inbox/kept.txt': 'first' }).layer)
    const watcher = Context.get(context, MemoryFileSystem.Watcher)
    yield* Effect.sync(() => {
      world.held.watcher = watcher
    })
    yield* Effect.asVoid(watcher.start('/inbox'))
  })

const watchingALetter = (
  world: MemfsStopWorld,
): Effect.Effect<void, PlatformError.PlatformError, Scope.Scope> =>
  Effect.gen(function*() {
    yield* Effect.addFinalizer(() => recordWatches(world))
    const context = yield* Layer.build(MemoryFileSystem.make({ '/inbox/kept.txt': 'first' }).layer)
    const watcher = Context.get(context, MemoryFileSystem.Watcher)
    const fileSystem = Context.get(context, FileSystem.FileSystem)
    yield* Effect.sync(() => {
      world.held.watcher = watcher
    })
    const events = yield* watcher.start('/inbox')
    yield* fileSystem.writeFileString('/inbox/letter.txt', 'second')
    yield* Stream.runHead(events)
  })

const scratchBorrowed = (
  borrow: Effect.Effect<string, PlatformError.PlatformError, FileSystem.FileSystem | Scope.Scope>,
) =>
(world: MemfsStopWorld): Effect.Effect<void, PlatformError.PlatformError, Scope.Scope> =>
  Effect.gen(function*() {
    yield* Effect.addFinalizer(() => recordScratch(world))
    const context = yield* Layer.build(MemoryFileSystem.make({}).layer)
    const fileSystem = Context.get(context, FileSystem.FileSystem)
    yield* Effect.sync(() => {
      world.held.fileSystem = fileSystem
    })
    yield* borrow.pipe(Effect.provide(context))
  })

export interface MemfsStopSpec {
  readonly world: Effect.Effect<MemfsStopWorld>
  readonly program: (world: MemfsStopWorld) => Effect.Effect<void, PlatformError.PlatformError, Scope.Scope>
  readonly restart: (world: MemfsStopWorld) => Effect.Effect<void, PlatformError.PlatformError, Scope.Scope>
  readonly rule: (world: MemfsStopWorld) => Effect.Effect<void, Conformance.RuleBroken>
  readonly stopWithin: Duration.Input
}

const specOf = (
  program: (world: MemfsStopWorld) => Effect.Effect<void, PlatformError.PlatformError, Scope.Scope>,
): MemfsStopSpec => ({
  world: memfsStopWorld,
  program,
  restart: program,
  rule: memfsRule,
  stopWithin: Duration.zero,
})

export const watchedStoreSpec = (): MemfsStopSpec => specOf(watchedStore)

export const watchingALetterSpec = (): MemfsStopSpec => specOf(watchingALetter)

export const scratchSpec = (
  borrow: Effect.Effect<string, PlatformError.PlatformError, FileSystem.FileSystem | Scope.Scope>,
): MemfsStopSpec => {
  const program = scratchBorrowed(borrow)
  return { world: memfsStopWorld, program, restart: program, rule: memfsRule, stopWithin: Duration.zero }
}
