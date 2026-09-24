import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect, Layer } from 'effect'
import { FileCommand, storeModel } from './__fixtures__/file-system.model.js'
import {
  CheckRejected,
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

Feature('An in-memory store that answers like a real filesystem', { timeout: 120_000 })
  .withLayer(Layer.empty)
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
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
              timeoutMs: 60_000,
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
  })
