import * as NodeServices from '@effect/platform-node/NodeServices'
import { FileArtifactStore } from '@systemfsoftware/effect-e2e/run'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'

import {
  brokenLawsOf,
  brokenSubject,
  fileSubject,
  LAW_NAMES,
  type LawVerdict,
  memorySubject,
  proveArtifactStore,
  SCREENSHOT_ARTIFACT,
  SCREENSHOT_PATH,
} from './__fixtures__/artifact-store-laws.fixture.js'

const Feature = makeFeature({ it })

const ARTIFACT_FILE_MODE = 0o600
const PERMISSION_BITS = 0o777

const outcomes = (verdicts: ReadonlyArray<LawVerdict>): ReadonlyArray<string> =>
  verdicts.map((verdict) => `${verdict.law}: ${verdict.expected === verdict.observed ? 'held' : 'broken'}`)

const subjects = { memory: memorySubject, file: fileSubject } as const

const fileStoreIn = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const root = yield* fs.makeTempDirectoryScoped({ prefix: 'effect-e2e-artifacts-' })
  const store = yield* FileArtifactStore.make({ root, output: '.e2e' })
  return { root, store } satisfies { readonly root: string; readonly store: typeof store }
})

Feature('Storing failure evidence in an artifact store')
  .withLayer(Layer.empty)
  .live('the file store writes real files under a temporary directory')
  .body(({ scenario, scenarioOutline }) => {
    scenarioOutline(
      'The <store> artifact store keeps every artifact store law',
      [{ store: 'memory' }, { store: 'file' }] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given(`the ${row.store} artifact store`)('subject', () => Effect.succeed(subjects[row.store])),
          When('the artifact store laws are proven against it')(
            'verdicts',
            ({ subject }) => proveArtifactStore(subject),
          ),
          Then('every law holds')((s, expect) =>
            expect(outcomes(s.verdicts)).toEqual(LAW_NAMES.map((law) => `${law}: held`))
          ),
        ),
    )

    scenarioOutline(
      'A store that <broken> breaks exactly the laws over what it breaks',
      [
        { broken: 'drops-writes', laws: ['put-answers-path', 'last-put-wins', 'no-collision'] },
        { broken: 'keeps-first', laws: ['last-put-wins'] },
        { broken: 'one-file', laws: ['no-collision'] },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given(`the memory store, broken so that it ${row.broken}`)('subject', () =>
            Effect.succeed(brokenSubject(row.broken))),
          When('the artifact store laws are proven against it')('verdicts', ({ subject }) =>
            proveArtifactStore(subject)),
          Then('only the laws over that behaviour are broken')((s, expect) =>
            expect(brokenLawsOf(s.verdicts)).toEqual(row.laws)
          ),
        ),
    )

    scenario(
      'A written artifact is one owner-only file inside its result directory',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a file store over a fresh temporary directory')('opened', () => fileStoreIn),
        When('a screenshot artifact is put')('written', ({ opened }) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem.FileSystem
            const path = yield* Path.Path
            const ref = yield* opened.store.put(SCREENSHOT_ARTIFACT)
            const info = yield* Effect.orDie(fs.stat(path.join(opened.root, ref.path)))
            const files = yield* Effect.orDie(
              fs.readDirectory(path.join(opened.root, '.e2e', 'results', SCREENSHOT_ARTIFACT.directory)),
            )
            return { ref, permissions: info.mode & PERMISSION_BITS, files }
          })),
        Then('the artifact lands at its suite-relative path as one owner-only file')((s, expect) =>
          expect(s.written).toEqual({
            ref: { kind: 'screenshot', path: SCREENSHOT_PATH },
            permissions: ARTIFACT_FILE_MODE,
            files: ['screen.png'],
          })
        ),
      ),
    )

    scenario(
      'A results path that is a regular file fails the put and leaves no temporary file',
      { scenarioLayer: NodeServices.layer },
      Gherkin.Do.pipe(
        Given('a file store whose results path is an existing regular file')('opened', () =>
          Effect.gen(function*() {
            const fs = yield* FileSystem.FileSystem
            const path = yield* Path.Path
            const root = yield* fs.makeTempDirectoryScoped({ prefix: 'effect-e2e-artifacts-' })
            yield* Effect.orDie(fs.makeDirectory(path.join(root, '.e2e'), { recursive: true }))
            yield* Effect.orDie(fs.writeFileString(path.join(root, '.e2e', 'results'), 'occupied'))
            const store = yield* FileArtifactStore.make({ root, output: '.e2e' })
            return { root, store }
          })),
        When('a screenshot artifact is put')('outcome', ({ opened }) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem.FileSystem
            const path = yield* Path.Path
            const failure = yield* Effect.flip(opened.store.put(SCREENSHOT_ARTIFACT))
            const temporary = yield* Effect.orDie(fs.glob('**/*.tmp', { root: path.join(opened.root, '.e2e') }))
            return {
              tag: failure._tag,
              namesPath: failure.message.includes(SCREENSHOT_PATH),
              evidence: failure.evidence,
              temporary,
            }
          })),
        Then('the put fails with a write failure over that path and no temporary file remains')((s, expect) =>
          expect(s.outcome).toEqual({
            tag: 'ARTIFACT_WRITE_FAILED',
            namesPath: true,
            evidence: [{ _tag: 'LogEvidence', text: SCREENSHOT_PATH }],
            temporary: [],
          })
        ),
      ),
    )
  })
