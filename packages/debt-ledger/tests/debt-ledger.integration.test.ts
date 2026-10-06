import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import {
  assembleLedger,
  build,
  type BuildError,
  classify,
  ConfigSeverity,
  DeclaredGrant,
  type Entry,
  InlineDirective,
  joinGrants,
  type JoinIndex,
  Marker,
  type OptInWithPackage,
  renderJson,
  renderMarkdown,
  scanOxlintConfig,
  scanPnpmPatches,
  scanRustFile,
  scanTsconfigFile,
  scanTsFile,
  SkippedTest,
  type Status,
} from '@systemfsoftware/debt-ledger'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { OptIn } from '@systemfsoftware/opt-in'
import { Array as Arr, Effect, Match, Option, Order, Result, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import { LedgerJsonView } from './__fixtures__/ledger-json.schema.js'

const Feature = makeFeature({ it })
const emptyIndex = joinGrants({ configEntries: [], grants: [], patches: [] })

const tagOf = (status: Status): string =>
  Match.value(status).pipe(
    Match.tag('Declared', () => 'Declared'),
    Match.tag('Undeclared', () => 'Undeclared'),
    Match.tag('Stale', () => 'Stale'),
    Match.exhaustive,
  )

const statusTags = (entries: ReadonlyArray<Entry>, index: JoinIndex): ReadonlyArray<string> =>
  entries.map((entry) => tagOf(classify(entry, index)))

const skippedKinds = (entries: ReadonlyArray<Entry>): ReadonlyArray<string> =>
  Arr.flatMap(
    entries,
    (entry) => Match.value(entry).pipe(Match.tag('SkippedTest', (item) => [item.kind]), Match.orElse(() => [])),
  )

const inlineTexts = (entries: ReadonlyArray<Entry>): ReadonlyArray<string> =>
  Arr.flatMap(
    entries,
    (entry) => Match.value(entry).pipe(Match.tag('InlineDirective', (item) => [item.text]), Match.orElse(() => [])),
  )

const rustPaths = (entries: ReadonlyArray<Entry>): ReadonlyArray<string> =>
  Arr.flatMap(entries, (entry) =>
    Match.value(entry).pipe(
      Match.tag('RustAttribute', (item) => [`${item.attribute}(${item.path})`]),
      Match.orElse(() => []),
    ))

const configScopes = (entries: ReadonlyArray<Entry>): ReadonlyArray<string> =>
  Arr.flatMap(
    entries,
    (entry) => Match.value(entry).pipe(Match.tag('ConfigSeverity', (item) => [item.scope]), Match.orElse(() => [])),
  )

const configOnly = (entries: ReadonlyArray<Entry>): ReadonlyArray<ConfigSeverity> =>
  Arr.flatMap(entries, (entry) =>
    Match.value(entry).pipe(
      Match.tag('ConfigSeverity', (item): ReadonlyArray<ConfigSeverity> => [item]),
      Match.orElse((): ReadonlyArray<ConfigSeverity> => []),
    ))

const makeOptIn = (input: object): OptInWithPackage => ({
  package: 'packages/fixture',
  optIn: Option.match(Schema.decodeUnknownOption(OptIn)(input), {
    onNone: () => {
      throw new Error('invalid fixture opt-in')
    },
    onSome: (value) => value,
  }),
})

const errorTag = (error: BuildError): string =>
  Match.value(error).pipe(
    Match.tag('EmptyRoot', () => 'EmptyRoot'),
    Match.tag('ConfigUnreadable', () => 'ConfigUnreadable'),
    Match.tag('MissingRoot', () => 'MissingRoot'),
    Match.orElse(() => 'other'),
  )

const TSGO_DEFAULTS: ReadonlyArray<readonly [string, string]> = [['foo', 'warning']]

const CONFIG_SOURCE =
  `export default { roots: ['.'], exclude: ['debt-ledger.config.ts'], mdPath: 'debt.md', jsonPath: 'debt.json' }\n`

const emptyRootFixture = Effect.gen(function*() {
  const fs = yield* Effect.service(FileSystem.FileSystem)
  const path = yield* Effect.service(Path.Path)
  const dir = yield* fs.makeTempDirectory({ prefix: 'debt-ledger-empty-' })
  yield* fs.writeFileString(path.join(dir, 'debt-ledger.config.ts'), CONFIG_SOURCE)
  return dir
})

Feature('Reading the debt ledger from a real tree')
  .live('the scanners are driven over fixture source and the build runs over a real temp tree through Node services')
  .withScenarioLayer(nodeServicesLayer)
  .body(({ scenario }) => {
    scenario(
      'A directive spelled inside a string literal is not an entry, but a real one is',
      Gherkin.Do.pipe(
        Given('two TypeScript sources')('sources', () =>
          Effect.succeed([
            'const label = "// oxlint-disable"\n',
            '// oxlint-disable-next-line no-explicit-any\nexport const x = 1\n',
          ])),
        When('each is scanned by the lexer and AST')(
          'found',
          (s) => Effect.succeed(s.sources.flatMap((source, index) => scanTsFile({ file: `f${index}.ts`, source }))),
        ),
        Then('only the real directive is an entry')((s, expect) =>
          expect(inlineTexts(s.found)).toEqual(['oxlint-disable-next-line no-explicit-any'])
        ),
      ),
    )

    scenario(
      'Rust allow attributes inside raw strings are skipped and a real clippy allow is an entry',
      Gherkin.Do.pipe(
        Given('one Rust source')(
          'source',
          () => Effect.succeed('const OK: &str = r#"#[allow(x)]"#;\n#[allow(clippy::x)]\nfn f() {}\n'),
        ),
        When('it is scanned by the lexer')(
          'found',
          (s) => Effect.succeed(scanRustFile({ file: 'a.rs', source: s.source })),
        ),
        Then('only the real attribute is an entry')((s, expect) =>
          expect(rustPaths(s.found)).toEqual(['allow(clippy::x)'])
        ),
      ),
    )

    scenario(
      'Skipped test call expressions are entries; registrar factories and prototype-named calls are not',
      Gherkin.Do.pipe(
        Given('a test file')(
          'source',
          () =>
            Effect.succeed(
              "it.skip('a', () => {})\ndescribe.only('b', () => {})\nconst flag = true\nconst viaSkipIf = it.skipIf(flag)\nconst viaRunIf = it.runIf(flag)\nconst text = ({}).toString()\n",
            ),
        ),
        When('it is scanned')('found', (s) => Effect.succeed(scanTsFile({ file: 'a.test.ts', source: s.source }))),
        Then('only the skip and only kinds are found')(
          (s, expect) => expect(skippedKinds(s.found)).toEqual(['skip', 'only']),
        ),
      ),
    )

    scenario(
      'Inline suppressions and skipped tests are never declarable',
      Gherkin.Do.pipe(
        Given('one inline suppression and one skipped test')('entries', () =>
          Effect.succeed([
            InlineDirective.make({ file: 'a.ts', line: 1, family: 'oxlint-disable', text: 'oxlint-disable x' }),
            SkippedTest.make({ file: 'a.test.ts', line: 2, kind: 'skip', name: 'a' }),
          ])),
        When('they are classified')('statuses', (s) => Effect.succeed(statusTags(s.entries, emptyIndex))),
        Then('both are Undeclared')((s, expect) => expect(s.statuses).toEqual(['Undeclared', 'Undeclared'])),
      ),
    )

    scenario(
      'A TODO is declared only as TODO(@owner): reason',
      Gherkin.Do.pipe(
        Given('a declared and a bare marker')('entries', () =>
          Effect.succeed([
            Marker.make({ file: 'a.ts', line: 1, tag: 'TODO', text: 'TODO(@ryanleecode): fix the fan-out' }),
            Marker.make({ file: 'b.ts', line: 1, tag: 'TODO', text: 'TODO tidy this later' }),
          ])),
        When('they are classified')('statuses', (s) => Effect.succeed(statusTags(s.entries, emptyIndex))),
        Then('only the owned one is Declared')((s, expect) => expect(s.statuses).toEqual(['Declared', 'Undeclared'])),
      ),
    )

    scenario(
      'Every off-ish oxlint severity and category normalizes to Undeclared ConfigSeverity',
      Gherkin.Do.pipe(
        Given('a fixture oxlint config')('config', () =>
          Effect.succeed({
            rules: {
              alpha: 'off',
              beta: 'allow',
              gamma: 0,
              delta: ['off', {}],
              epsilon: 'warn',
              zeta: 1,
              eta: 'error',
              theta: 2,
            },
            categories: { correctness: 'off' },
          })),
        When('it is scanned')('outcome', (s) => {
          const found = scanOxlintConfig({ file: 'oxlint.config.ts', value: s.config })
          return Effect.succeed({
            scopes: Arr.sort(configScopes(found), Order.String),
            statuses: statusTags(found, emptyIndex),
          })
        }),
        Then('the hand table of six rules plus one category is reported, all Undeclared')(
          (s, expect) =>
            expect(s.outcome).toEqual({
              scopes: ['alpha', 'beta', 'correctness', 'delta', 'epsilon', 'gamma', 'zeta'],
              statuses: [
                'Undeclared',
                'Undeclared',
                'Undeclared',
                'Undeclared',
                'Undeclared',
                'Undeclared',
                'Undeclared',
              ],
            }),
        ),
      ),
    )

    scenario(
      'A severity reached only through a spread or an extends chain is found',
      Gherkin.Do.pipe(
        Given('a base config and a child spreading one field and extending the base')('config', () => {
          const base = { spread: 'off' as const }
          return Effect.succeed({
            rules: { ...base, direct: 'error' },
            extends: [{ rules: { chained: 'warn' } }],
          })
        }),
        When('it is scanned')(
          'found',
          (s) => Effect.succeed(scanOxlintConfig({ file: 'oxlint.config.ts', value: s.config })),
        ),
        Then('both hidden severities are found')((s, expect) =>
          expect(Arr.sort(configScopes(s.found), Order.String)).toEqual(['chained', 'spread'])
        ),
      ),
    )

    scenario(
      'An omitted tsgo diagnostic with a warning default is Undeclared unless an exclusion is declared',
      Gherkin.Do.pipe(
        Given('a library tsconfig text and a tsgo schema table')('fixture', () =>
          Effect.succeed({
            text:
              '{"extends":"@systemfsoftware/tsconfig/effect","compilerOptions":{"plugins":[{"name":"@effect/language-service","diagnosticSeverity":{}}]}}\n',
            defaults: TSGO_DEFAULTS,
          })),
        When('it is scanned with and without an exclusion')('outcome', (s) => {
          const found = scanTsconfigFile({
            file: 'tsconfig.app.json',
            path: '/tmp/tsconfig.app.json',
            text: s.fixture.text,
            readText: () => Option.none(),
            resolveExtends: () => Option.none(),
            tsgoDefaults: s.fixture.defaults,
          })
          const grants = [makeOptIn({
            name: 'fixture-exclusion',
            owner: '@ryanleecode',
            reason: 'a sufficiently long fixture reason',
            grant: { _tag: 'DiagnosticExclusion', diagnostic: 'foo', role: 'library', files: ['src/**'] },
          })]
          const declaredIndex = joinGrants({ configEntries: configOnly(found), grants, patches: [] })
          return Effect.succeed({
            undeclared: statusTags(found, emptyIndex),
            declared: statusTags(found, declaredIndex),
          })
        }),
        Then('the omission is Undeclared until the exclusion exists, then Declared')((s, expect) =>
          expect(s.outcome).toEqual({ undeclared: ['Undeclared'], declared: ['Declared'] })
        ),
      ),
    )

    scenario(
      'A config severity with no declaration is Undeclared and a declaration with no grant is Stale',
      Gherkin.Do.pipe(
        Given('an off oxlint rule and an opt-in for a different rule')('fixture', () =>
          Effect.succeed({
            config: ConfigSeverity.make({
              file: 'oxlint.config.ts',
              channel: 'oxlint-rule',
              scope: 'foo',
              value: 'off',
              files: ['src/**'],
            }),
            grant: makeOptIn({
              name: 'fixture-rule',
              owner: '@ryanleecode',
              reason: 'a sufficiently long fixture reason',
              grant: { _tag: 'OxlintRule', rule: 'bar', files: ['src/**'], options: [] },
            }),
          })),
        When('configs and grants are joined')('outcome', (s) => {
          const index = joinGrants({ configEntries: [s.fixture.config], grants: [s.fixture.grant], patches: [] })
          const grantEntry = DeclaredGrant.make({
            package: s.fixture.grant.package,
            name: s.fixture.grant.optIn.name,
            reason: s.fixture.grant.optIn.reason,
            owner: s.fixture.grant.optIn.owner,
            variant: s.fixture.grant.optIn.grant._tag,
          })
          return Effect.succeed({
            configStatus: tagOf(classify(s.fixture.config, index)),
            grantStatus: tagOf(classify(grantEntry, index)),
          })
        }),
        Then('the config is Undeclared and the unmatched declaration is Stale')((s, expect) =>
          expect(s.outcome).toEqual({ configStatus: 'Undeclared', grantStatus: 'Stale' })
        ),
      ),
    )

    scenario(
      'A grant whose evidence lies outside the scanned config surfaces is Declared, not Stale',
      Gherkin.Do.pipe(
        Given('an unstable-API grant that no scanned config entry can match')('entry', () =>
          Effect.succeed(
            DeclaredGrant.make({
              package: 'packages/example',
              name: 'unstable-rpc',
              reason: 'the example builds Rpc values, unstable in Effect 4.0.1',
              owner: '@ryanleecode',
              variant: 'UnstableApi',
            }),
          )),
        When('it is classified against an empty join index')(
          'status',
          (s) => Effect.succeed(tagOf(classify(s.entry, emptyIndex))),
        ),
        Then('it is Declared')((s, expect) => expect(s.status).toEqual('Declared')),
      ),
    )

    scenario(
      'The JSON count, the Markdown rows and the per-kind totals are one number',
      Gherkin.Do.pipe(
        Given('a small mixed entry set')('entries', () =>
          Effect.succeed([
            InlineDirective.make({ file: 'a.ts', line: 1, family: 'oxlint-disable', text: 'x' }),
            Marker.make({ file: 'b.ts', line: 2, tag: 'FIXME', text: 'FIXME later' }),
            ConfigSeverity.make({ file: 'c.ts', channel: 'oxlint-rule', scope: 'r', value: 'off', files: [] }),
          ])),
        When('the ledger is assembled and rendered twice')('outcome', (s) => {
          const ledger = assembleLedger({
            entries: s.entries,
            index: emptyIndex,
            channels: ['typescript'],
            fileCount: 3,
          })
          const rows = renderMarkdown(ledger).split('\n').filter((line) => line.startsWith('| `')).length
          const parsed = Schema.decodeUnknownOption(LedgerJsonView)(JSON.parse(renderJson(ledger)))
          const jsonCount = Option.match(parsed, { onNone: () => -1, onSome: (view) => view.entries.length })
          const total = Option.match(parsed, {
            onNone: () => -1,
            onSome: (view) => Object.values(view.totals).reduce((sum, value) => sum + value, 0),
          })
          return Effect.succeed({ rows, jsonCount, total })
        }),
        Then('all three views agree')((s, expect) => expect(s.outcome).toEqual({ rows: 3, jsonCount: 3, total: 3 })),
      ),
    )

    scenario(
      'Permuting the input order produces identical bytes',
      Gherkin.Do.pipe(
        Given('one entry set')('entries', () =>
          Effect.succeed([
            InlineDirective.make({ file: 'a.ts', line: 1, family: 'oxlint-disable', text: 'x' }),
            Marker.make({ file: 'b.ts', line: 2, tag: 'FIXME', text: 'FIXME later' }),
            ConfigSeverity.make({ file: 'c.ts', channel: 'oxlint-rule', scope: 'r', value: 'off', files: [] }),
          ])),
        When('it is assembled in two orders')('outcome', (s) => {
          const render = (entries: ReadonlyArray<Entry>) =>
            renderJson(assembleLedger({ entries, index: emptyIndex, channels: ['t'], fileCount: 1 }))
          return Effect.succeed({
            json: render(s.entries) === render(Arr.reverse(s.entries)),
            markdown: renderMarkdown(
              assembleLedger({ entries: s.entries, index: emptyIndex, channels: ['t'], fileCount: 1 }),
            ) ===
              renderMarkdown(
                assembleLedger({ entries: Arr.reverse(s.entries), index: emptyIndex, channels: ['t'], fileCount: 1 }),
              ),
          })
        }),
        Then('both renders are byte-identical across the permutation')((s, expect) =>
          expect(s.outcome).toEqual({ json: true, markdown: true })
        ),
      ),
    )

    scenario(
      'The workspace patchedDependencies block yields one Patch entry per key',
      Gherkin.Do.pipe(
        Given('a workspace manifest with two patches')(
          'text',
          () =>
            Effect.succeed(
              'patchedDependencies:\n  a@1.0.0: patches/a@1.0.0.patch\n  b@2.0.0: patches/b@2.0.0.patch\n',
            ),
        ),
        When('it is scanned')(
          'found',
          (s) => Effect.succeed(scanPnpmPatches({ file: 'pnpm-workspace.yaml', text: s.text })),
        ),
        Then('each key becomes one Patch entry carrying its dependency and patch')((s, expect) =>
          expect(Arr.map(s.found, (entry) => `${entry.dependency}|${entry.patch}`)).toEqual([
            'a@1.0.0|patches/a@1.0.0.patch',
            'b@2.0.0|patches/b@2.0.0.patch',
          ])
        ),
      ),
    )

    scenario(
      'An empty input root fails with a typed error',
      Gherkin.Do.pipe(
        Given('an empty temp tree with a config')('dir', () => emptyRootFixture),
        When('the ledger is built')('outcome', (s) =>
          Effect.result(build(s.dir)).pipe(Effect.map((result) => ({
            failure: Result.isFailure(result),
            tag: Result.match(result, { onFailure: errorTag, onSuccess: () => 'none' }),
          })))),
        Then('the build fails with EmptyRoot')((s, expect) =>
          expect(s.outcome).toEqual({ failure: true, tag: 'EmptyRoot' })
        ),
      ),
    )
  })
