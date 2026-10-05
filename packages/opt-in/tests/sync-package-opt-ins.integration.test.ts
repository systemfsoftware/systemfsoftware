import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { optIn, runSync, type SyncOptions } from '@systemfsoftware/opt-in'
import { Effect, Result } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'

const Feature = makeFeature({ it })

const PRESET_PACKAGE = `${
  JSON.stringify(
    {
      name: '@systemfsoftware/tsconfig',
      exports: { './effect': './effect.json', './effect/entrypoint': './effect-entrypoint.json' },
    },
    null,
    2,
  )
}\n`

const PRESET_LIBRARY = `{
  // fixture library preset
  "compilerOptions": {
    "plugins": [
      {
        "name": "@effect/language-service",
        "keyPatterns": [],
        "diagnosticSeverity": { "globalDate": "error" }
      }
    ]
  }
}
`

const OPT_INS_SOURCE = `export default [
  {
    name: 'fixture-opt-in',
    owner: '@fixture-owner',
    reason: 'a sufficiently long fixture reason',
    grant: { _tag: 'DiagnosticExclusion', diagnostic: 'globalDate', role: 'library' },
  },
]
`

const TSCONFIG_APP = `{
  // fixture library tsconfig
  "extends": "@systemfsoftware/tsconfig/effect",
  "compilerOptions": { "strict": true }
}
`

const writeFixtureFile = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  file: string,
  contents: string,
): Effect.Effect<void, PlatformError> =>
  fs.makeDirectory(path.dirname(file), { recursive: true }).pipe(Effect.andThen(fs.writeFileString(file, contents)))

const makeFixture = Effect.gen(function*() {
  const fs = yield* Effect.service(FileSystem.FileSystem)
  const path = yield* Effect.service(Path.Path)
  const dir = yield* fs.makeTempDirectory({ prefix: 'opt-in-fixture-' })
  yield* writeFixtureFile(fs, path, path.join(dir, 'opt-ins.ts'), OPT_INS_SOURCE)
  yield* writeFixtureFile(fs, path, path.join(dir, 'tsconfig.app.json'), TSCONFIG_APP)
  yield* writeFixtureFile(
    fs,
    path,
    path.join(dir, 'node_modules/@systemfsoftware/tsconfig/package.json'),
    PRESET_PACKAGE,
  )
  yield* writeFixtureFile(
    fs,
    path,
    path.join(dir, 'node_modules/@systemfsoftware/tsconfig/effect.json'),
    PRESET_LIBRARY,
  )
  return dir
})

const editBlock = (dir: string) =>
  Effect.gen(function*() {
    const fs = yield* Effect.service(FileSystem.FileSystem)
    const path = yield* Effect.service(Path.Path)
    const file = path.join(dir, 'tsconfig.app.json')
    const contents = yield* fs.readFileString(file)
    yield* fs.writeFileString(
      file,
      contents.replace(
        '"name": "@effect/language-service",',
        '"name": "@effect/language-service",\n      "handEdit": true,',
      ),
    )
  })

const sync = (options: SyncOptions) => runSync(options)

const exercise = (dir: string) =>
  Effect.gen(function*() {
    const fs = yield* Effect.service(FileSystem.FileSystem)
    const path = yield* Effect.service(Path.Path)
    const first = yield* sync({ dir, check: false })
    const written = yield* fs.readFileString(path.join(dir, 'tsconfig.app.json'))
    const clean = yield* sync({ dir, check: true })
    yield* editBlock(dir)
    const edited = yield* sync({ dir, check: true })
    return {
      firstExit: first.exitCode,
      cleanExit: clean.exitCode,
      editedExit: edited.exitCode,
      named: edited.messages.some((message) => message.includes('tsconfig.app.json')),
      fixturePreset: !written.includes('effectInFailure'),
    }
  })

const judge = (input: object): boolean => Result.isSuccess(optIn(input))

Feature('Opting a package into the repo shared guards')
  .live('the sync command reads and writes a real temp directory through Node services')
  .withScenarioLayer(nodeServicesLayer)
  .body(({ scenario }) => {
    scenario(
      'A handle without its @, an empty reason, and a nine-character reason are refused',
      Gherkin.Do.pipe(
        Given('the opt-in constructor')('judge', () => Effect.succeed(judge)),
        When('it judges four inputs')('verdicts', (s) =>
          Effect.succeed({
            noAt: s.judge({
              name: 'valid-name',
              owner: 'ryan',
              reason: 'a sufficiently long reason',
              grant: { _tag: 'PassWithNoTests' },
            }),
            emptyReason: s.judge({
              name: 'valid-name',
              owner: '@owner',
              reason: '',
              grant: { _tag: 'PassWithNoTests' },
            }),
            shortReason: s.judge({
              name: 'valid-name',
              owner: '@owner',
              reason: 'ninechars',
              grant: { _tag: 'PassWithNoTests' },
            }),
            valid: s.judge({
              name: 'valid-name',
              owner: '@owner',
              reason: 'exactly ten',
              grant: { _tag: 'PassWithNoTests' },
            }),
          })),
        Then('only the valid opt-in decodes')((s, expect) =>
          expect(s.verdicts).toEqual({ noAt: false, emptyReason: false, shortReason: false, valid: true })
        ),
      ),
    )

    scenario(
      'A package with a library opt-in syncs its plugin block and detects a hand-edit',
      Gherkin.Do.pipe(
        Given('a fixture package with one library opt-in')('dir', () => makeFixture),
        When('sync writes, checks, then checks a hand-edited block')('runs', (s) => exercise(s.dir)),
        Then('the block is written, the clean check exits 0, and the edited check names the file')((s, expect) =>
          expect(s.runs).toEqual({ firstExit: 0, cleanExit: 0, editedExit: 1, named: true, fixturePreset: true })
        ),
      ),
    )
  })
