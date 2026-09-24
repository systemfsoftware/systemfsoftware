import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect, Layer, type Scope, Stream } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import type * as PlatformError from 'effect/PlatformError'
import { FileCommand, storeModel } from './__fixtures__/file-system.model.js'
import {
  CheckRejected,
  noScratchLeft,
  noWatchLeftOpen,
  passedHistories,
  SharedLetterCommand,
  storeResponse,
} from './__fixtures__/memfs-store.js'

const Feature = makeFeature({ it })

const unprivilegedModel = storeModel(false)

const startWatchingInbox = Effect.flatMap(
  Effect.service(MemoryFileSystem.Watcher),
  (watcher) => watcher.start('/inbox'),
)

const scratchRoot = '/scratch'

const borrowedScratchDirectory: Effect.Effect<
  string,
  PlatformError.PlatformError,
  FileSystem.FileSystem | Scope.Scope
> = Effect.flatMap(
  Effect.service(FileSystem.FileSystem),
  (fs) => fs.makeTempDirectoryScoped({ directory: scratchRoot, prefix: 'draft-' }),
)

const borrowedScratchFile: Effect.Effect<
  string,
  PlatformError.PlatformError,
  FileSystem.FileSystem | Scope.Scope
> = Effect.flatMap(
  Effect.service(FileSystem.FileSystem),
  (fs) => fs.makeTempFileScoped({ directory: scratchRoot, prefix: 'draft-' }),
)

const watchSeeingALetterLand: Effect.Effect<
  void,
  PlatformError.PlatformError,
  MemoryFileSystem.Watcher | FileSystem.FileSystem | Scope.Scope
> = Effect.flatMap(
  Effect.service(MemoryFileSystem.Watcher),
  (watcher) =>
    Effect.flatMap(
      watcher.start('/inbox'),
      (events) =>
        Effect.andThen(
          Effect.flatMap(Effect.service(FileSystem.FileSystem), (fs) =>
            fs.writeFileString('/inbox/letter.txt', 'second')),
          Effect.asVoid(Stream.runHead(events)),
        ),
    ),
)

Feature('An in-memory store that answers like a real filesystem', { timeout: 0 })
  .withLayer(Layer.empty)
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'A thousand runs of writes, reads, folders and removals get the answers a real filesystem would give',
      Gherkin.Do.pipe(
        Given('a fresh in-memory store for an unprivileged user')(
          'store',
          () => Effect.succeed(MemoryFileSystem.make({}).layer),
        ),
        When('a thousand runs of ten file actions each are played against the store')(
          'report',
          (s) =>
            Conformance.sequential(s.store, {
              commands: FileCommand,
              model: unprivilegedModel,
              run: storeResponse,
              sequences: 1000,
              operations: 10,
            }),
        ),
        Then('every run gets the answers a real filesystem would give')((s) => {
          const judged = passedHistories(s.report)
          if (judged !== 1000) throw new CheckRejected({ report: `${judged} runs were judged, not 1000` })
        }),
      ),
    )

    scenario(
      'Ada and Bo writing and reading one letter always see answers that taking turns explains',
      Gherkin.Do.pipe(
        Given('a fresh in-memory store where Ada and Bo share the letter d.txt')(
          'store',
          () => Effect.succeed(MemoryFileSystem.make({}).layer),
        ),
        When('Ada and Bo write and read d.txt in every order their calls can interleave')(
          'report',
          (s) =>
            Conformance.linearizable(s.store, {
              commands: SharedLetterCommand,
              model: unprivilegedModel,
              run: storeResponse,
              fibers: 2,
              operations: 2,
              preemptions: 2,
            }),
        ),
        Then('every interleaving matches Ada and Bo taking turns one after the other')((s) => {
          passedHistories(s.report)
        }),
      ),
    )

    scenario(
      'Starting a watch that is stopped at any point leaves no watch open on the store',
      Gherkin.Do.pipe(
        Given('an in-memory store holding an inbox folder')(
          'store',
          () => Layer.build(MemoryFileSystem.make({ '/inbox/kept.txt': 'first' }).layer),
        ),
        When('Ada starts watching the inbox and is stopped at every step of starting')(
          'report',
          (s) =>
            Conformance.released(Effect.provide(startWatchingInbox, s.store), {
              probe: Effect.provide(noWatchLeftOpen, s.store),
            }),
        ),
        Then('no watch is left open after any stop')((s) => {
          passedHistories(s.report)
        }),
      ),
    )

    scenario(
      'A watch that reports a letter landing and is stopped at every step leaves no watch open',
      Gherkin.Do.pipe(
        Given('an in-memory store holding an inbox folder')(
          'store',
          () => Layer.build(MemoryFileSystem.make({ '/inbox/kept.txt': 'first' }).layer),
        ),
        When('the inbox is watched, a letter lands in it, and the watch is stopped at every step')(
          'report',
          (s) =>
            Conformance.released(Effect.provide(watchSeeingALetterLand, s.store), {
              probe: Effect.provide(noWatchLeftOpen, s.store),
            }),
        ),
        Then('no watch is left open after any stop')((s) => {
          passedHistories(s.report)
        }),
      ),
    )

    scenarioOutline(
      'A scratch <kind> borrowed under a chosen name and stopped at any step leaves nothing behind',
      [
        { kind: 'folder', borrow: borrowedScratchDirectory },
        { kind: 'file', borrow: borrowedScratchFile },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('an in-memory store with nothing in the folder meant for scratch work')(
            'store',
            () => Layer.build(MemoryFileSystem.make({}).layer),
          ),
          When('a piece of work borrows scratch space under a chosen name and is stopped at every step')(
            'report',
            (s) =>
              Conformance.released(Effect.provide(row.borrow, s.store), {
                probe: Effect.provide(noScratchLeft(scratchRoot), s.store),
              }),
          ),
          Then('the scratch folder holds nothing left behind after any stop')((s) => {
            passedHistories(s.report)
          }),
        ),
    )
  })
