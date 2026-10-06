import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { build, type Ledger, run, type RunError } from '@systemfsoftware/debt-ledger'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Effect, Match, Result } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'

const Feature = makeFeature({ it })

const CONFIG_SOURCE = `export default {
  roots: ['.'],
  exclude: [],
  presetSources: ['packages/preset-fixture/src/index.ts'],
  mdPath: 'debt.md',
  jsonPath: 'debt.json',
}\n`

const PRESET_SOURCE = `const testFiles = ['**/*.test.ts']
export default { overrides: [{ files: ['**/src/**'], excludeFiles: [...testFiles], rules: { complexity: ['error', { max: 2 }] } }] }\n`

const DECLARED_OPT_INS =
  `export default [{ name: 'complexity-skips-tests', owner: '@ryanleecode', reason: 'a sufficiently long fixture reason', grant: { _tag: 'PresetNarrowing', rule: 'complexity', files: ['**/*.test.ts'] } }]\n`

const STALE_OPT_INS =
  `export default [{ name: 'complexity-skips-tests', owner: '@ryanleecode', reason: 'a sufficiently long fixture reason', grant: { _tag: 'PresetNarrowing', rule: 'complexity', files: ['**/vendor/**'] } }]\n`

const NO_OPT_INS = `export default []\n`

const makeFixture = (optInsSource: string) =>
  Effect.gen(function*() {
    const fs = yield* Effect.service(FileSystem.FileSystem)
    const path = yield* Effect.service(Path.Path)
    const dir = yield* fs.makeTempDirectory({ prefix: 'debt-ledger-narrowing-' })
    const presetDir = path.join(dir, 'packages/preset-fixture')
    yield* fs.writeFileString(path.join(dir, 'debt-ledger.config.ts'), CONFIG_SOURCE)
    yield* fs.makeDirectory(path.join(presetDir, 'src'), { recursive: true })
    yield* fs.writeFileString(path.join(presetDir, 'src/index.ts'), PRESET_SOURCE)
    yield* fs.writeFileString(path.join(presetDir, 'opt-ins.ts'), optInsSource)
    return dir
  })

const narrowingSummaries = (ledger: Ledger): ReadonlyArray<string> =>
  Arr.flatMap(
    ledger.entries,
    (item) =>
      Match.value(item.entry).pipe(
        Match.tag('PresetNarrowing', (narrowing): ReadonlyArray<string> => [
          `${narrowing.package}|${narrowing.rule}|${narrowing.files.join(',')}|${item.status._tag}`,
        ]),
        Match.orElse((): ReadonlyArray<string> => []),
      ),
  )

const grantSummaries = (ledger: Ledger): ReadonlyArray<string> =>
  Arr.flatMap(
    ledger.entries,
    (item) =>
      Match.value(item.entry).pipe(
        Match.tag('Grant', (grant): ReadonlyArray<string> => [`${grant.name}|${item.status._tag}`]),
        Match.orElse((): ReadonlyArray<string> => []),
      ),
  )

const errorOf = (error: RunError): { readonly tag: string; readonly message: string } =>
  Match.value(error).pipe(
    Match.tag('UndeclaredEntries', (undeclared) => ({ tag: 'UndeclaredEntries', message: undeclared.message })),
    Match.tag('StaleDeclarations', (stale) => ({ tag: 'StaleDeclarations', message: stale.message })),
    Match.orElse(() => ({ tag: 'other', message: '' })),
  )

Feature('Checking a preset scope narrowing against the ledger')
  .live('build and check run in-process over real temp trees through Node services')
  .withScenarioLayer(nodeServicesLayer)
  .body(({ scenario }) => {
    scenario(
      'A narrowing declared by its preset package is Declared and the check succeeds',
      Gherkin.Do.pipe(
        Given('a preset that withholds complexity from test files, declared in its opt-ins')(
          'dir',
          () => makeFixture(DECLARED_OPT_INS),
        ),
        When('the ledger is built, rendered and checked')('outcome', (s) =>
          Effect.gen(function*() {
            const first = yield* run(s.dir, false)
            const checked = yield* Effect.result(run(s.dir, true))
            return { narrowings: narrowingSummaries(first.result.ledger), ok: Result.isSuccess(checked) }
          })),
        Then('the narrowing is Declared and the check succeeds')((s, expect) =>
          expect(s.outcome).toEqual({
            narrowings: ['packages/preset-fixture|complexity|**/*.test.ts|Declared'],
            ok: true,
          })
        ),
      ),
    )

    scenario(
      'An undeclared narrowing fails the check and the failure names its rule and glob',
      Gherkin.Do.pipe(
        Given('a preset whose narrowing no opt-in authorizes')('dir', () => makeFixture(NO_OPT_INS)),
        When('the ledger is checked')('outcome', (s) =>
          Effect.result(run(s.dir, true)).pipe(
            Effect.map((result) =>
              Result.match(result, {
                onFailure: (error) => {
                  const { tag, message } = errorOf(error)
                  return {
                    ok: false,
                    tag,
                    namesRule: message.includes('complexity'),
                    namesGlob: message.includes('**/*.test.ts'),
                  }
                },
                onSuccess: () => ({ ok: true, tag: 'none', namesRule: false, namesGlob: false }),
              })
            ),
          )),
        Then('the check fails with UndeclaredEntries naming the rule and the glob')((s, expect) =>
          expect(s.outcome).toEqual({ ok: false, tag: 'UndeclaredEntries', namesRule: true, namesGlob: true })
        ),
      ),
    )

    scenario(
      'A declaration matching no narrowing leaves the narrowing Undeclared and the grant Stale',
      Gherkin.Do.pipe(
        Given('a preset whose opt-in names a glob the preset does not narrow')('dir', () => makeFixture(STALE_OPT_INS)),
        When('the ledger is built and checked')('outcome', (s) =>
          Effect.gen(function*() {
            const { ledger } = yield* build(s.dir)
            const checked = yield* Effect.result(run(s.dir, true))
            return {
              narrowings: narrowingSummaries(ledger),
              grants: grantSummaries(ledger),
              ok: Result.isSuccess(checked),
              tag: Result.match(checked, { onFailure: (error) => errorOf(error).tag, onSuccess: () => 'none' }),
            }
          })),
        Then('the narrowing is Undeclared, the grant is Stale and the check fails')((s, expect) =>
          expect(s.outcome).toEqual({
            narrowings: ['packages/preset-fixture|complexity|**/*.test.ts|Undeclared'],
            grants: ['complexity-skips-tests|Stale'],
            ok: false,
            tag: 'UndeclaredEntries',
          })
        ),
      ),
    )
  })
