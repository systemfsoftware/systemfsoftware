import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { check, manifest, manifestOf, runSystemf, unitList, unitShow } from '@systemfsoftware/systemf'
import type { CliRun } from '@systemfsoftware/systemf'
import { decodeResponse, Response } from '@systemfsoftware/systemf/json'
import { afterAll } from '@systemfsoftware/vitest'
import { Effect, Result, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import { Command } from 'effect/unstable/cli'
import { cleanupFixtures, writeFixture } from './__fixtures__/fixture-package.js'

const Feature = makeFeature({ it })

const LINKED = writeFixture({
  prefix: 'systemf-contract-linked-',
  name: '@systemfsoftware/contract-linked',
  files: [
    {
      path: 'src/mod.ts',
      contents:
        "import { Supervisor } from '@systemfsoftware/effect-daemon-spec'\ndeclare function build(): Supervisor.Medium.Medium<() => void>\nexport const LinkedMedium = build()\n",
    },
    {
      path: 'tests/medium.conformance.test.ts',
      contents:
        "import { Conformance } from '@systemfsoftware/conformance-spec'\nimport { LinkedMedium } from '../src/mod.js'\nConformance.stopped(LinkedMedium)\n",
    },
  ],
})

const UNLINKED = writeFixture({
  prefix: 'systemf-contract-unlinked-',
  name: '@systemfsoftware/contract-unlinked',
  files: [
    {
      path: 'src/mod.ts',
      contents:
        "import { Cell } from '@systemfsoftware/effect-cell-types'\nexport const LooseCell: Cell.Cell<number> = Cell.id<number>()\n",
    },
  ],
})

const NO_TSCONFIG = writeFixture({
  prefix: 'systemf-contract-no-tsconfig-',
  name: '@systemfsoftware/contract-no-tsconfig',
  noTsconfig: true,
  files: [{ path: 'src/mod.ts', contents: 'export const answer = 42\n' }],
})

const FIXTURES = [LINKED, UNLINKED, NO_TSCONFIG]

afterAll(() => {
  cleanupFixtures(FIXTURES)
})

const failureCode = <A, E extends { readonly code: string }>(result: Result.Result<A, E>): string =>
  Result.match(result, { onFailure: (failure) => failure.code, onSuccess: () => 'none' })

const decodeLine = (run: CliRun): Effect.Effect<Response, Schema.SchemaError> =>
  Schema.decodeEffect(Schema.fromJsonString(Response))(run.stdout[0] ?? '')

const typeOf = (envelope: Response): string => ('type' in envelope ? envelope.type : 'error')

const codeOf = (envelope: Response): string => ('code' in envelope ? envelope.code : 'none')

const unitModulesOf = (envelope: Response): readonly string[] =>
  'type' in envelope && envelope.type === 'unit.list' ? envelope.data.units.map((row) => row.module) : []

const manifestDataOf = (envelope: Response) =>
  'type' in envelope && envelope.type === 'manifest' ? envelope.data : undefined

const versionInFile = (text: string): string => text.match(/"version"\s*:\s*"([^"]+)"/u)?.[1] ?? ''

const packageJsonVersion: Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> = Effect.orDie(
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const file = yield* path.fromFileUrl(new URL('../package.json', import.meta.url))
    const text = yield* fs.readFileString(file)
    return versionInFile(text)
  }),
)

Feature('The published edge: exit codes, envelopes, error codes, and the manifest')
  .live('each scenario runs the real check over fixture packages on disk')
  .withLayer(nodeServicesLayer)
  .body(({ scenario }) => {
    scenario(
      'The published edge is argv in, one line of stdout out, and an exit code',
      Gherkin.Do.pipe(
        Given('a linked and an unlinked package, and this package on disk')(
          'roots',
          () => Effect.succeed({ linked: LINKED, unlinked: UNLINKED }),
        ),
        When('every command runs through the real entry point')('runs', (s) =>
          Effect.gen(function*() {
            const expectedVersion = yield* packageJsonVersion
            const list = yield* runSystemf(['unit', 'list', s.roots.linked, '--json'])
            const uncovered = yield* runSystemf(['unit', 'list', s.roots.unlinked, '--uncovered', '--json'])
            const human = yield* runSystemf(['check', s.roots.unlinked])
            const clean = yield* runSystemf(['check', s.roots.linked, '--json'])
            const missing = yield* runSystemf(['unit', 'show', '--json'])
            const unknown = yield* runSystemf(['nope', '--json'])
            const version = yield* runSystemf(['--version'])
            const manifestRun = yield* runSystemf(['manifest', '--json'])
            const listEnvelope = yield* decodeLine(list)
            const uncoveredEnvelope = yield* decodeLine(uncovered)
            const cleanEnvelope = yield* decodeLine(clean)
            const missingEnvelope = yield* decodeLine(missing)
            const unknownEnvelope = yield* decodeLine(unknown)
            const manifestEnvelope = yield* decodeLine(manifestRun)
            const manifestData = manifestDataOf(manifestEnvelope)
            return {
              list: { exit: list.exitCode, lines: list.stdout.length, type: typeOf(listEnvelope) },
              uncovered: { exit: uncovered.exitCode, modules: unitModulesOf(uncoveredEnvelope) },
              human: {
                exit: human.exitCode,
                fix: human.stdout.some((line) => line.includes('fix:')),
                followUp: human.stdout.some((line) => line.includes('→ systemf unit show')),
              },
              clean: { exit: clean.exitCode, lines: clean.stdout.length, type: typeOf(cleanEnvelope) },
              missing: { exit: missing.exitCode, lines: missing.stdout.length, code: codeOf(missingEnvelope) },
              unknown: { exit: unknown.exitCode, code: codeOf(unknownEnvelope) },
              version: {
                exit: version.exitCode,
                shows: version.stdout.some((line) => line.includes(expectedVersion)),
              },
              manifest: {
                exit: manifestRun.exitCode,
                name: manifestData?.name,
                version: manifestData?.version,
                hasJsonFlag: (manifestData?.commands ?? [])
                  .flatMap((command) => command.flags)
                  .some((flag) => flag.name === 'json'),
              },
              expectedVersion,
            }
          })),
        Then('every command reports what its contract promises')((s, expect) =>
          expect({
            list: s.runs.list,
            uncovered: s.runs.uncovered,
            human: s.runs.human,
            clean: s.runs.clean,
            missing: s.runs.missing,
            unknown: s.runs.unknown,
            version: s.runs.version,
            manifest: s.runs.manifest,
          }).toEqual({
            list: { exit: 0, lines: 1, type: 'unit.list' },
            uncovered: { exit: 0, modules: ['src/mod.ts'] },
            human: { exit: 1, fix: true, followUp: true },
            clean: { exit: 0, lines: 1, type: 'check' },
            missing: { exit: 2, lines: 1, code: 'ERR_MISSING_ARGUMENT' },
            unknown: { exit: 2, code: 'ERR_UNKNOWN_COMMAND' },
            version: { exit: 0, shows: true },
            manifest: {
              exit: 0,
              name: 'systemf',
              version: s.runs.expectedVersion,
              hasJsonFlag: false,
            },
          })
        ),
      ),
    )

    scenario(
      '`check` reports the check envelope data: packages, findings, and a summary',
      Gherkin.Do.pipe(
        Given('an unlinked package')('pkg', () => Effect.succeed(UNLINKED)),
        When('the check runs over it')('data', (s) => check({ cwd: '.', packages: [s.pkg] })),
        Then('the data names the finding, its rule, and the fix')((s, expect) =>
          expect({
            units: s.data.summary.units,
            findings: s.data.findings.length,
            rule: s.data.findings[0]?.rule,
            file: s.data.findings[0]?.file,
            declarations: s.data.findings[0]?.declarations,
            fix: s.data.findings[0]?.fix,
          }).toEqual({
            units: 1,
            findings: 1,
            rule: 'stop-coverage',
            file: 'src/mod.ts',
            declarations: ['LooseCell'],
            fix: 'pass `LooseCell` as `unit` to Conformance.stopped in tests/*.conformance.test.ts',
          })
        ),
      ),
    )

    scenario(
      '`unit list` reports one row per unit with coverage, and `--kind`/`--uncovered` narrow it',
      Gherkin.Do.pipe(
        Given('a linked package')('pkg', () => Effect.succeed(LINKED)),
        When('its units are listed')('lists', (s) =>
          Effect.gen(function*() {
            const all = yield* unitList({ cwd: '.', package: s.pkg })
            const none = yield* unitList({ cwd: '.', package: s.pkg, uncovered: true })
            const handles = yield* unitList({ cwd: '.', package: s.pkg, kind: 'handle' })
            return { all, none, handles }
          })),
        Then('the medium is direct, the uncovered list is empty, and no handle enrolls')((s, expect) =>
          expect({
            rows: s.lists.all.units.map((row) => ({ kind: row.kind, module: row.module, coverage: row.coverage })),
            uncovered: s.lists.none.units.length,
            handles: s.lists.handles.units.length,
          }).toEqual({ rows: [{ kind: 'medium', module: 'src/mod.ts', coverage: 'direct' }], uncovered: 0, handles: 0 })
        ),
      ),
    )

    scenario(
      '`unit show` names the reaching call, and the fix when none reaches the unit',
      Gherkin.Do.pipe(
        Given('a linked package and an unlinked package')(
          'roots',
          () => Effect.succeed({ linked: LINKED, unlinked: UNLINKED }),
        ),
        When('one unit is shown from each')('shown', (s) =>
          Effect.gen(function*() {
            const linked = yield* unitShow({ cwd: '.', package: s.roots.linked, query: 'LinkedMedium' })
            const unlinked = yield* unitShow({ cwd: '.', package: s.roots.unlinked, query: 'LooseCell' })
            return { linked, unlinked }
          })),
        Then('the linked unit names its call and the unlinked unit names the fix')((s, expect) =>
          expect({
            linkedReaches: s.shown.linked.reaches.map((reach) => ({ mode: reach.mode, via: reach.via })),
            unlinkedReaches: s.shown.unlinked.reaches.length,
            fix: s.shown.unlinked.fix,
          }).toEqual({
            linkedReaches: [{ mode: 'direct', via: 'LinkedMedium' }],
            unlinkedReaches: 0,
            fix: 'pass `LooseCell` as `unit` to Conformance.stopped in tests/*.conformance.test.ts',
          })
        ),
      ),
    )

    scenario(
      'An unknown rule, an unknown unit, and a missing tsconfig each carry their error code',
      Gherkin.Do.pipe(
        Given('an unlinked package and a package with no tsconfig')(
          'roots',
          () => Effect.succeed({ unlinked: UNLINKED, noTsconfig: NO_TSCONFIG }),
        ),
        When('each is asked for something it cannot give')('codes', (s) =>
          Effect.gen(function*() {
            const rule = yield* Effect.result(check({ cwd: '.', packages: [s.roots.unlinked], only: ['nope'] }))
            const unit = yield* Effect.result(unitShow({ cwd: '.', package: s.roots.unlinked, query: 'Nowhere' }))
            const config = yield* Effect.result(check({ cwd: '.', packages: [s.roots.noTsconfig] }))
            return { rule, unit, config }
          })),
        Then('the codes are the stable ERR_* literals')((s, expect) =>
          expect({
            rule: failureCode(s.codes.rule),
            unit: failureCode(s.codes.unit),
            config: failureCode(s.codes.config),
          }).toEqual({
            rule: 'ERR_UNKNOWN_RULE',
            unit: 'ERR_UNKNOWN_UNIT',
            config: 'ERR_TSCONFIG_NOT_FOUND',
          })
        ),
      ),
    )

    scenario(
      'The manifest walks the tree and fails a command that declares no result types',
      Gherkin.Do.pipe(
        Given('the built-in command tree and a rogue command')(
          'roots',
          () => Effect.succeed({ rogue: Command.make('rogue') }),
        ),
        When('both manifests are built')('manifests', (s) =>
          Effect.gen(function*() {
            const tree = yield* manifest
            const drift = yield* Effect.result(manifestOf(s.roots.rogue))
            return { tree, drift }
          })),
        Then('the tree lists every command and the rogue command fails its walk')((s, expect) =>
          expect({
            paths: s.manifests.tree.commands.map((command) => command.path.join(' ')),
            exitCodes: s.manifests.tree.exitCodes.map((entry) => entry.code),
            errorCodes: s.manifests.tree.errorCodes.length,
            drift: failureCode(s.manifests.drift),
          }).toEqual({
            paths: [
              'systemf',
              'systemf check',
              'systemf unit',
              'systemf unit list',
              'systemf unit show',
              'systemf manifest',
            ],
            exitCodes: [0, 1, 2],
            errorCodes: 10,
            drift: 'ERR_UNKNOWN',
          })
        ),
      ),
    )

    scenario(
      'A JSON envelope round-trips through the published decoder',
      Gherkin.Do.pipe(
        Given('an unlinked package')('pkg', () => Effect.succeed(UNLINKED)),
        When('a well-formed and a malformed envelope are decoded')('decoded', (s) =>
          Effect.gen(function*() {
            const data = yield* check({ cwd: '.', packages: [s.pkg] })
            const good = yield* Effect.result(decodeResponse({ apiVersion: 1, type: 'check', data }))
            const bad = yield* Effect.result(decodeResponse({ apiVersion: 1, type: 'nope', data }))
            return { good: Result.isSuccess(good), bad: Result.isSuccess(bad) }
          })),
        Then('the well-formed envelope decodes and the malformed one does not')((s, expect) =>
          expect(s.decoded).toEqual({ good: true, bad: false })
        ),
      ),
    )
  })
