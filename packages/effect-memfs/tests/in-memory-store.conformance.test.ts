import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect, Layer, Schema, type Scope } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import type * as PlatformError from 'effect/PlatformError'
import { FileCommand, storeModel } from './__fixtures__/file-system.model.js'
import { SCRATCH_ROOT, scratchSpec, watchedStoreSpec, watchingALetterSpec } from './__fixtures__/memfs-stop.js'
import { SharedLetterCommand, storeResponse } from './__fixtures__/memfs-store.js'

const Feature = makeFeature({ it })

const unprivilegedModel = storeModel(false)

const budgetedHistories = 1000

const borrowedScratchDirectory: Effect.Effect<
  string,
  PlatformError.PlatformError,
  FileSystem.FileSystem | Scope.Scope
> = Effect.flatMap(
  Effect.service(FileSystem.FileSystem),
  (fs) => fs.makeTempDirectoryScoped({ directory: SCRATCH_ROOT, prefix: 'draft-' }),
)

const borrowedScratchFile: Effect.Effect<
  string,
  PlatformError.PlatformError,
  FileSystem.FileSystem | Scope.Scope
> = Effect.flatMap(
  Effect.service(FileSystem.FileSystem),
  (fs) => fs.makeTempFileScoped({ directory: SCRATCH_ROOT, prefix: 'draft-' }),
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
              sequences: budgetedHistories,
              operations: 10,
            }),
        ),
        Then('every run gets the answers a real filesystem would give')((s, expect) =>
          expect(s.report, Conformance.render(s.report)).toMatchObject({ _tag: 'Pass', histories: budgetedHistories })
        ),
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
        Then('every interleaving matches Ada and Bo taking turns one after the other')((s, expect) =>
          expect(s.report, Conformance.render(s.report)).toMatchObject({
            _tag: 'Pass',
            histories: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
          })
        ),
      ),
    )

    scenario(
      'A watch on an in-memory store that is stopped at any point of starting is left open by no stop',
      Gherkin.Do.pipe(
        Given('an in-memory store blueprint holding an inbox folder')(
          'spec',
          () => Effect.succeed(watchedStoreSpec()),
        ),
        When('Ada starts watching the inbox and is stopped at every step of starting')(
          'report',
          (s) => Conformance.stopped({ ...s.spec, unit: MemoryFileSystem.make }),
        ),
        Then('no watch is left open after any stop')((s, expect) =>
          expect(s.report, Conformance.render(s.report)).toMatchObject({
            _tag: 'Pass',
            histories: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
          })
        ),
      ),
    )

    scenario(
      'A watch that reports a letter landing and is stopped at every step leaves no watch open',
      Gherkin.Do.pipe(
        Given('an in-memory store handle holding an inbox folder')(
          'spec',
          () => Effect.succeed(watchingALetterSpec()),
        ),
        When('the inbox is watched, a letter lands in it, and the watch is stopped at every step')(
          'report',
          (s) => Conformance.stopped({ ...s.spec, unit: MemoryFileSystem.make }),
        ),
        Then('no watch is left open after any stop')((s, expect) =>
          expect(s.report, Conformance.render(s.report)).toMatchObject({
            _tag: 'Pass',
            histories: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
          })
        ),
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
            'spec',
            () => Effect.succeed(scratchSpec(row.borrow)),
          ),
          When('a piece of work borrows scratch space under a chosen name and is stopped at every step')(
            'report',
            (s) => Conformance.stopped({ ...s.spec, unit: MemoryFileSystem.make }),
          ),
          Then('the scratch folder holds nothing left behind after any stop')((s, expect) =>
            expect(s.report, Conformance.render(s.report)).toMatchObject({
              _tag: 'Pass',
              histories: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
            })
          ),
        ),
    )
  })
