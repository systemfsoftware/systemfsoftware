import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { build, type Ledger, run, type RunError } from '@systemfsoftware/debt-ledger'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array as Arr, Effect, Match, Option, Result } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'

const Feature = makeFeature({ it })

const CONFIG_SOURCE = `export default { roots: ['.'], exclude: [], mdPath: 'debt.md', jsonPath: 'debt.json' }\n`

const OPT_INS_SOURCE =
  `export default [{ name: 'fixture-rule', owner: '@ryanleecode', reason: 'a sufficiently long fixture reason', grant: { _tag: 'OxlintRule', rule: 'fixture-rule', files: ['src/**'], options: [] } }]\n`

const cleanOxlint = `export default { rules: { 'fixture-rule': 'off' } }\n`
const undeclaredOxlint = `export default { rules: { 'fixture-rule': 'off', 'orphan-rule': 'off' } }\n`

const TSGO_CONFIG_SOURCE = `{
  "extends": "@systemfsoftware/tsconfig/effect",
  "compilerOptions": {
    "plugins": [{
      "name": "@effect/language-service",
      "diagnosticSeverity": {},
      "overrides": [{
        "include": ["src/cli.ts"],
        "options": { "diagnosticSeverity": { "strictEffectProvide": "off" } }
      }]
    }]
  }
}\n`

const TSGO_EXCLUSION_OPT_INS =
  `export default [{ name: 'cli-provides-node-services', owner: '@ryanleecode', reason: 'a sufficiently long fixture reason', grant: { _tag: 'DiagnosticExclusion', diagnostic: 'strictEffectProvide', role: 'library', files: ['src/cli.ts'] } }]\n`

const OTHER_FILE_OPT_INS =
  `export default [{ name: 'cli-provides-node-services', owner: '@ryanleecode', reason: 'a sufficiently long fixture reason', grant: { _tag: 'DiagnosticExclusion', diagnostic: 'strictEffectProvide', role: 'library', files: ['src/other.ts'] } }]\n`

const NO_OPT_INS = `export default []\n`

const errorTag = (error: RunError): string =>
  Match.value(error).pipe(
    Match.tag('UndeclaredEntries', () => 'UndeclaredEntries'),
    Match.tag('StaleDeclarations', () => 'StaleDeclarations'),
    Match.tag('ArtifactDrift', () => 'ArtifactDrift'),
    Match.tag('ArtifactMissing', () => 'ArtifactMissing'),
    Match.orElse(() => 'other'),
  )

const makeFixture = (oxlintSource: string) =>
  Effect.gen(function*() {
    const fs = yield* Effect.service(FileSystem.FileSystem)
    const path = yield* Effect.service(Path.Path)
    const dir = yield* fs.makeTempDirectory({ prefix: 'debt-ledger-fixture-' })
    yield* fs.writeFileString(path.join(dir, 'debt-ledger.config.ts'), CONFIG_SOURCE)
    yield* fs.writeFileString(path.join(dir, 'oxlint.config.ts'), oxlintSource)
    yield* fs.writeFileString(path.join(dir, 'opt-ins.ts'), OPT_INS_SOURCE)
    return dir
  })

const makeTsgoFixture = (optInsSource: string) =>
  Effect.gen(function*() {
    const fs = yield* Effect.service(FileSystem.FileSystem)
    const path = yield* Effect.service(Path.Path)
    const dir = yield* fs.makeTempDirectory({ prefix: 'debt-ledger-tsgo-' })
    yield* fs.writeFileString(path.join(dir, 'debt-ledger.config.ts'), CONFIG_SOURCE)
    yield* fs.writeFileString(path.join(dir, 'opt-ins.ts'), optInsSource)
    yield* fs.writeFileString(path.join(dir, 'tsconfig.app.json'), TSGO_CONFIG_SOURCE)
    yield* fs.makeDirectory(path.join(dir, 'src'), { recursive: true })
    yield* fs.writeFileString(path.join(dir, 'src/cli.ts'), 'export const entrypoint = 1\n')
    return dir
  })

const makeLinkedFixture = () =>
  Effect.gen(function*() {
    const fs = yield* Effect.service(FileSystem.FileSystem)
    const path = yield* Effect.service(Path.Path)
    const dir = yield* fs.makeTempDirectory({ prefix: 'debt-ledger-links-' })
    yield* fs.writeFileString(path.join(dir, 'debt-ledger.config.ts'), CONFIG_SOURCE)
    yield* fs.writeFileString(path.join(dir, 'opt-ins.ts'), NO_OPT_INS)
    yield* fs.makeDirectory(path.join(dir, 'src'), { recursive: true })
    yield* fs.writeFileString(path.join(dir, 'src/keep.ts'), 'export const keep = 1\n')
    yield* fs.makeDirectory(path.join(dir, 'node_modules'), { recursive: true })
    yield* fs.writeFileString(path.join(dir, 'node_modules/lint.ts'), '// oxlint-disable-next-line fixture\n')
    yield* fs.symlink('.', path.join(dir, 'loop'))
    yield* fs.symlink('node_modules', path.join(dir, 'linked'))
    return dir
  })

const configSummaries = (ledger: Ledger): ReadonlyArray<string> =>
  Arr.flatMap(
    ledger.entries,
    (item) =>
      Match.value(item.entry).pipe(
        Match.tag('ConfigSeverity', (config): ReadonlyArray<string> => [
          `${config.channel}|${config.scope}|${config.files.join(',')}|${config.role ?? ''}|${item.status._tag}`,
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

const undeclaredCount = (ledger: Ledger): number =>
  Option.getOrElse(Option.fromNullishOr(ledger.statusTotals['Undeclared']), () => -1)

const buildsThenChecks = (dir: string) =>
  Effect.gen(function*() {
    const first = yield* run(dir, false)
    const outcome = yield* Effect.result(run(dir, true))
    return { ok: Result.isSuccess(outcome), channels: [...first.result.ledger.scannedChannels] }
  })

Feature('Checking a debt ledger tree')
  .live('build, render and check run in-process over real temp trees through Node services')
  .withScenarioLayer(nodeServicesLayer)
  .body(({ scenario }) => {
    scenario(
      'check exits clean when every debt entry is declared and the artifacts match',
      Gherkin.Do.pipe(
        Given('a fixture tree with one declared off rule')('dir', () => makeFixture(cleanOxlint)),
        When('the ledger is built, rendered and checked')('outcome', (s) => buildsThenChecks(s.dir)),
        Then('the check succeeds and reports the scanned channels')((s, expect) =>
          expect(s.outcome).toEqual({ ok: true, channels: ['opt-ins', 'oxlint', 'typescript'] })
        ),
      ),
    )

    scenario(
      'check fails when a fixture adds an undeclared off rule',
      Gherkin.Do.pipe(
        Given('a fixture tree with an off rule that no opt-in authorizes')('dir', () => makeFixture(undeclaredOxlint)),
        When('the ledger is checked')('outcome', (s) =>
          Effect.result(run(s.dir, true)).pipe(Effect.map((result) => ({
            ok: Result.isSuccess(result),
            tag: Result.match(result, { onFailure: errorTag, onSuccess: () => 'none' }),
          })))),
        Then('the check fails with UndeclaredEntries')((s, expect) =>
          expect(s.outcome).toEqual({ ok: false, tag: 'UndeclaredEntries' })
        ),
      ),
    )

    scenario(
      'A file-scoped diagnostic switch-off is declared by its matching exclusion and the check is clean',
      Gherkin.Do.pipe(
        Given('a fixture tree whose override switches one diagnostic off for the CLI entry file')(
          'dir',
          () => makeTsgoFixture(TSGO_EXCLUSION_OPT_INS),
        ),
        When('the ledger is built, rendered and checked')('outcome', (s) =>
          Effect.gen(function*() {
            const first = yield* run(s.dir, false)
            const checked = yield* Effect.result(run(s.dir, true))
            return {
              configs: configSummaries(first.result.ledger),
              grants: grantSummaries(first.result.ledger),
              undeclared: undeclaredCount(first.result.ledger),
              ok: Result.isSuccess(checked),
            }
          })),
        Then('the override and its declaration are Declared, nothing is Undeclared and the check succeeds')(
          (s, expect) =>
            expect(s.outcome).toEqual({
              configs: ['tsgo-diagnostic|strictEffectProvide|src/cli.ts|library|Declared'],
              grants: ['cli-provides-node-services|Declared'],
              undeclared: 0,
              ok: true,
            }),
        ),
      ),
    )

    scenario(
      'A file-scoped diagnostic switch-off without a declaration fails the check',
      Gherkin.Do.pipe(
        Given('a fixture tree whose override switches one diagnostic off and declares no exclusion')(
          'dir',
          () => makeTsgoFixture(NO_OPT_INS),
        ),
        When('the ledger is built and checked')('outcome', (s) =>
          Effect.gen(function*() {
            const { ledger } = yield* build(s.dir)
            const checked = yield* Effect.result(run(s.dir, true))
            return {
              configs: configSummaries(ledger),
              ok: Result.isSuccess(checked),
              tag: Result.match(checked, { onFailure: errorTag, onSuccess: () => 'none' }),
            }
          })),
        Then('the override is Undeclared and the check fails with UndeclaredEntries')((s, expect) =>
          expect(s.outcome).toEqual({
            configs: ['tsgo-diagnostic|strictEffectProvide|src/cli.ts|library|Undeclared'],
            ok: false,
            tag: 'UndeclaredEntries',
          })
        ),
      ),
    )

    scenario(
      'A declaration for a different file leaves the switch-off undeclared and itself stale',
      Gherkin.Do.pipe(
        Given('a fixture tree whose exclusion names a file other than the switch-off scope')(
          'dir',
          () => makeTsgoFixture(OTHER_FILE_OPT_INS),
        ),
        When('the ledger is built')(
          'ledger',
          (s) => build(s.dir).pipe(Effect.map((result) => result.ledger)),
        ),
        Then('the override is Undeclared and the declaration is Stale')((s, expect) =>
          expect({
            configs: configSummaries(s.ledger),
            grants: grantSummaries(s.ledger),
          }).toEqual({
            configs: ['tsgo-diagnostic|strictEffectProvide|src/cli.ts|library|Undeclared'],
            grants: ['cli-provides-node-services|Stale'],
          })
        ),
      ),
    )

    scenario(
      'A tree with a link cycle and an installed dependency directory is scanned without following links',
      Gherkin.Do.pipe(
        Given(
          'a fixture tree with a self-referential link, a link to the dependency directory and a directive inside it',
        )(
          'dir',
          () => makeLinkedFixture(),
        ),
        When('the ledger is built')('outcome', (s) =>
          Effect.result(build(s.dir)).pipe(
            Effect.map((result) =>
              Result.match(result, {
                onFailure: (error) => ({ ok: false, tag: errorTag(error) }),
                onSuccess: (built) => ({
                  ok: true,
                  channels: built.ledger.scannedChannels,
                  inlineFiles: Arr.flatMap(
                    built.ledger.entries,
                    (item) =>
                      Match.value(item.entry).pipe(
                        Match.tag('InlineDirective', (directive): ReadonlyArray<string> => [directive.file]),
                        Match.orElse((): ReadonlyArray<string> => []),
                      ),
                  ),
                }),
              })
            ),
          )),
        Then('the build succeeds, reports the real channels and finds nothing under the links')(
          (s, expect) => expect(s.outcome).toEqual({ ok: true, channels: ['opt-ins', 'typescript'], inlineFiles: [] }),
        ),
      ),
    )
  })
