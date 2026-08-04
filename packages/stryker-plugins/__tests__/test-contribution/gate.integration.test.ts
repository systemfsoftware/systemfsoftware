import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import {
  decideGate,
  filesMissingFromDisk,
  filesNewerThanReport,
  parseMutationReport,
  verdictOf,
} from '../../src/test-contribution/index.js'

import { mutantOf, reportOf } from '../helpers/mutation-report.fixtures.js'

const Feature = makeFeature({ it, layer })

const REPORT_FILE = 'reports/mutation-report.json'
const PROPERTY_SUFFIXES = ['.property.test.ts']

const measure = (raw: unknown) => {
  const report = parseMutationReport(raw)
  return report === undefined ? undefined : verdictOf(report, PROPERTY_SUFFIXES)
}

Feature('Failing a build when a test file defends nothing')
  .body(({ scenario }) => {
    scenario(
      'Should_Fail_When_TheRunLeftNoUsableReport',
      Gherkin.Do.pipe(
        Given('a mutation run that never wrote a report')(
          'verdict',
          () => Effect.sync(() => measure(undefined)),
        ),
        When('the gate is consulted')(
          'decision',
          (s) => Effect.sync(() => decideGate({ verdict: s.verdict, reportFile: REPORT_FILE })),
        ),
        Then('it refuses and names the report it could not read')((s) =>
          Effect.sync(() => {
            expect(s.decision.ok).toBe(false)
            expect(s.decision.message).toContain(REPORT_FILE)
          })
        ),
      ),
    )

    scenario(
      'Should_Fail_When_ATestFileDefendsNothing',
      Gherkin.Do.pipe(
        Given('a report where one property test file never lands a kill')(
          'verdict',
          () =>
            Effect.sync(() =>
              measure(reportOf([mutantOf('m1', 'Killed', ['t1'])], {
                'test/alpha.property.test.ts': ['t1'],
                'test/beta.property.test.ts': ['t2'],
              }))
            ),
        ),
        When('the gate is consulted')(
          'decision',
          (s) => Effect.sync(() => decideGate({ verdict: s.verdict, reportFile: REPORT_FILE })),
        ),
        Then('it refuses and names the offending file')((s) =>
          Effect.sync(() => {
            expect(s.decision.ok).toBe(false)
            expect(s.decision.message).toContain('test/beta.property.test.ts')
          })
        ),
      ),
    )

    scenario(
      'Should_Pass_When_EveryInScopeFileDefendsSomething',
      Gherkin.Do.pipe(
        Given('a report where every property test file lands a kill of its own')(
          'verdict',
          () =>
            Effect.sync(() =>
              measure(reportOf([mutantOf('m1', 'Killed', ['t1']), mutantOf('m2', 'Killed', ['t2'])], {
                'test/alpha.property.test.ts': ['t1'],
                'test/beta.property.test.ts': ['t2'],
              }))
            ),
        ),
        When('the gate is consulted')(
          'decision',
          (s) => Effect.sync(() => decideGate({ verdict: s.verdict, reportFile: REPORT_FILE })),
        ),
        Then('it passes and confirms the file measured clean')((s) =>
          Effect.sync(() => {
            expect(s.decision.ok).toBe(true)
            expect(s.decision.message).toContain('every killing test was recorded')
            expect(s.verdict?.byTestFile['test/alpha.property.test.ts']).toEqual({ soleKills: 1, totalKills: 1 })
          })
        ),
      ),
    )

    scenario(
      'Should_Pass_AndDeclareReducedPrecision_When_TheRunBailed',
      Gherkin.Do.pipe(
        Given('a clean report from a run that stopped at the first killing test')(
          'verdict',
          () =>
            Effect.sync(() =>
              measure(
                reportOf([mutantOf('m1', 'Killed', ['t1'])], { 'test/alpha.property.test.ts': ['t1'] }, {
                  disableBail: false,
                }),
              )
            ),
        ),
        When('the gate is consulted')(
          'decision',
          (s) => Effect.sync(() => decideGate({ verdict: s.verdict, reportFile: REPORT_FILE })),
        ),
        Then('it passes but says the answer only proves files that killed nothing')((s) =>
          Effect.sync(() => {
            expect(s.decision.ok).toBe(true)
            expect(s.decision.message).toContain('bailed at the first killing test')
          })
        ),
      ),
    )

    scenario(
      'Should_RejectReport_When_TheFileOnDiskIsNotAMutationReport',
      Gherkin.Do.pipe(
        Given('documents that are JSON but not mutation reports')(
          'candidates',
          () =>
            Effect.sync(() => [
              parseMutationReport('a string'),
              parseMutationReport({ testFiles: {} }),
              parseMutationReport({ files: { 'a.ts': { source: 'x' } } }),
              parseMutationReport({ files: { 'a.ts': { mutants: ['not an object'] } } }),
              parseMutationReport({ files: {}, testFiles: { 'a.test.ts': { tests: [{ id: 7 }] } } }),
            ]),
        ),
        When('each is parsed as a mutation report')('parsed', (s) => Effect.sync(() => s.candidates)),
        Then('every one is rejected rather than half-trusted')((s) =>
          Effect.sync(() => {
            expect(s.parsed).toEqual([undefined, undefined, undefined, undefined, undefined])
          })
        ),
      ),
    )

    scenario(
      'Should_BlameTheRun_When_NoKillWasAttributedToAnyTest',
      Gherkin.Do.pipe(
        Given('a report whose only kill recorded no killing test')(
          'verdict',
          () =>
            Effect.sync(() =>
              measure(reportOf([mutantOf('m1', 'Timeout')], { 'test/alpha.property.test.ts': ['t1'] }))
            ),
        ),
        When('the gate is consulted')(
          'decision',
          (s) => Effect.sync(() => decideGate({ verdict: s.verdict, reportFile: REPORT_FILE })),
        ),
        Then('it refuses but blames the run instead of accusing the test file')((s) =>
          Effect.sync(() => {
            expect(s.decision.ok).toBe(false)
            expect(s.decision.message).toContain('attributes no kill')
            expect(s.decision.message).not.toContain('alpha.property.test.ts')
          })
        ),
      ),
    )

    scenario(
      'Should_Fail_When_TheReportIsOlderThanCodeItDescribes',
      Gherkin.Do.pipe(
        Given('a clean verdict and a source file modified after the run')(
          'decision',
          () =>
            Effect.sync(() =>
              decideGate({
                verdict: measure(
                  reportOf([mutantOf('m1', 'Killed', ['t1'])], { 'test/alpha.property.test.ts': ['t1'] }),
                ),
                reportFile: REPORT_FILE,
                staleFiles: ['src/subject.ts'],
              })
            ),
        ),
        When('the gate is consulted')('checked', (s) => Effect.sync(() => s.decision)),
        Then('it refuses rather than certifying a verdict about code that has since changed')((s) =>
          Effect.sync(() => {
            expect(s.checked.ok).toBe(false)
            expect(s.checked.message).toContain('older than')
            expect(s.checked.message).toContain('src/subject.ts')
          })
        ),
      ),
    )

    scenario(
      'Should_Fail_When_TheReportBelongsToAnotherPackage',
      Gherkin.Do.pipe(
        Given('a clean verdict from a report written for a different project root')(
          'decision',
          () =>
            Effect.sync(() =>
              decideGate({
                verdict: measure(
                  reportOf([mutantOf('m1', 'Killed', ['t1'])], { 'test/alpha.property.test.ts': ['t1'] }),
                ),
                reportFile: REPORT_FILE,
                foreignRoot: '/elsewhere/other-package',
              })
            ),
        ),
        When('the gate is consulted')('checked', (s) => Effect.sync(() => s.decision)),
        Then('it refuses and names the tree the report actually describes')((s) =>
          Effect.sync(() => {
            expect(s.checked.ok).toBe(false)
            expect(s.checked.message).toContain('/elsewhere/other-package')
          })
        ),
      ),
    )

    scenario(
      'Should_SayNothingToMeasure_When_ThePackageHasNoInScopeTest',
      Gherkin.Do.pipe(
        Given('a healthy run in a package carrying no property test at all')(
          'verdict',
          () =>
            Effect.sync(() =>
              measure(
                reportOf([mutantOf('m1', 'Killed', ['t1'])], { 'test/alpha.integration.test.ts': ['t1'] }),
              )
            ),
        ),
        When('the gate is consulted with no suffix argument')(
          'decision',
          (s) => Effect.sync(() => decideGate({ verdict: s.verdict, reportFile: REPORT_FILE })),
        ),
        Then('it passes but says plainly that it measured nothing')((s) =>
          Effect.sync(() => {
            expect(s.decision.ok).toBe(true)
            expect(s.decision.message).toContain('nothing to measure')
            expect(s.decision.message).not.toContain('kills a mutant nothing else kills')
          })
        ),
      ),
    )

    scenario(
      'Should_Fail_When_TheRequestedSuffixMatchesNothing',
      Gherkin.Do.pipe(
        Given('a healthy run and a suffix the caller asked for explicitly')(
          'verdict',
          () =>
            Effect.sync(() =>
              measure(
                reportOf([mutantOf('m1', 'Killed', ['t1'])], { 'test/alpha.integration.test.ts': ['t1'] }),
              )
            ),
        ),
        When('the gate is consulted for that requested scope')(
          'decision',
          (s) => Effect.sync(() => decideGate({ verdict: s.verdict, reportFile: REPORT_FILE, scopeRequested: true })),
        ),
        Then('it refuses rather than passing on a filter that matched nothing')((s) =>
          Effect.sync(() => {
            expect(s.decision.ok).toBe(false)
            expect(s.decision.message).toContain('matches no test file')
          })
        ),
      ),
    )

    scenario(
      'Should_ReportOnlyNewerFiles_When_ComparingAgainstTheRun',
      Gherkin.Do.pipe(
        Given('files written before, at, and after the report')(
          'stale',
          () =>
            Effect.sync(() =>
              filesNewerThanReport(1_000, [
                { path: 'src/late.ts', modifiedAt: 1_001 },
                { path: 'src/same.ts', modifiedAt: 1_000 },
                { path: 'src/early.ts', modifiedAt: 999 },
                { path: 'src/also-late.ts', modifiedAt: 2_000 },
              ])
            ),
        ),
        When('staleness is computed')('checked', (s) => Effect.sync(() => s.stale)),
        Then('only the files newer than the run are named, sorted')((s) =>
          Effect.sync(() => {
            expect(s.checked).toEqual(['src/also-late.ts', 'src/late.ts'])
          })
        ),
      ),
    )

    scenario(
      'Should_Fail_When_TheReportCreditsATestFileThatIsGone',
      Gherkin.Do.pipe(
        Given('a clean verdict whose credited test file has since been deleted')(
          'decision',
          () =>
            Effect.sync(() =>
              decideGate({
                verdict: measure(
                  reportOf([mutantOf('m1', 'Killed', ['t1'])], { 'test/alpha.property.test.ts': ['t1'] }),
                ),
                reportFile: REPORT_FILE,
                vanishedFiles: ['test/alpha.property.test.ts'],
              })
            ),
        ),
        When('the gate is consulted')('checked', (s) => Effect.sync(() => s.decision)),
        Then('it refuses instead of crediting a file that is no longer there')((s) =>
          Effect.sync(() => {
            expect(s.checked.ok).toBe(false)
            expect(s.checked.message).toContain('no longer exist')
            expect(s.checked.message).toContain('test/alpha.property.test.ts')
          })
        ),
      ),
    )

    scenario(
      'Should_NameOnlyAbsentFiles_When_ComparingTheReportToDisk',
      Gherkin.Do.pipe(
        Given('a report naming two files of which one survives on disk')(
          'missing',
          () =>
            Effect.sync(() =>
              filesMissingFromDisk(
                ['test/gone.property.test.ts', 'test/here.property.test.ts'],
                ['test/here.property.test.ts', 'test/undeclared.property.test.ts'],
              )
            ),
        ),
        When('the comparison is read')('checked', (s) => Effect.sync(() => s.missing)),
        Then('only the absent file is named, and a file the report never mentioned is not')((s) =>
          Effect.sync(() => {
            expect(s.checked).toEqual(['test/gone.property.test.ts'])
          })
        ),
      ),
    )

    scenario(
      'Should_Reject_When_TheReportIsNotARecord',
      Gherkin.Do.pipe(
        Given('documents that are not record objects at all')(
          'rejected',
          () =>
            Effect.sync(() => [
              parseMutationReport('a string'),
              parseMutationReport(null),
              parseMutationReport([]),
              parseMutationReport(42),
              parseMutationReport(true),
            ]),
        ),
        When('each is parsed as a mutation report')('views', (s) => Effect.sync(() => s.rejected)),
        Then('every one is rejected rather than half-trusted')((s) =>
          Effect.sync(() => {
            expect(s.views).toEqual([undefined, undefined, undefined, undefined, undefined])
          })
        ),
      ),
    )

    scenario(
      'Should_Reject_When_ASourceFileListsAMixedMutantArray',
      Gherkin.Do.pipe(
        Given('a files entry whose mutants array mixes a record and a non-record')(
          'parsed',
          () => Effect.sync(() => parseMutationReport({ files: { 'a.ts': { mutants: [1, {}] } } })),
        ),
        When('the report is parsed')('view', (s) => Effect.sync(() => s.parsed)),
        Then('the mixed list is rejected rather than half-trusted')((s) =>
          Effect.sync(() => {
            expect(s.view).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should_Reject_When_ATestFileListsAMixedTestArray',
      Gherkin.Do.pipe(
        Given('a testFiles entry whose tests array mixes a non-string id and a string id')(
          'parsed',
          () =>
            Effect.sync(() =>
              parseMutationReport({
                files: {},
                testFiles: { 'a.test.ts': { tests: [{ id: 1 }, { id: 'ok' }] } },
              })
            ),
        ),
        When('the report is parsed')('view', (s) => Effect.sync(() => s.parsed)),
        Then('the mixed list is rejected rather than half-trusted')((s) =>
          Effect.sync(() => {
            expect(s.view).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should_Reject_When_AFilesMapMixesValidAndInvalidEntries',
      Gherkin.Do.pipe(
        Given('a files map with one valid source file and one entry that is not a source file')(
          'parsed',
          () => Effect.sync(() => parseMutationReport({ files: { 'a.ts': { mutants: [] }, 'b.ts': 'nope' } })),
        ),
        When('the report is parsed')('view', (s) => Effect.sync(() => s.parsed)),
        Then('the mixed map is rejected rather than half-trusted')((s) =>
          Effect.sync(() => {
            expect(s.view).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should_Reject_When_ATestFilesMapMixesValidAndInvalidEntries',
      Gherkin.Do.pipe(
        Given('a testFiles map with one valid test file and one entry that is not a test file')(
          'parsed',
          () =>
            Effect.sync(() =>
              parseMutationReport({
                files: {},
                testFiles: { 'a.test.ts': { tests: [] }, 'b.test.ts': 'nope' },
              })
            ),
        ),
        When('the report is parsed')('view', (s) => Effect.sync(() => s.parsed)),
        Then('the mixed map is rejected rather than half-trusted')((s) =>
          Effect.sync(() => {
            expect(s.view).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should_Reject_When_TheRunConfigIsNotARecord',
      Gherkin.Do.pipe(
        Given('a report whose config is a plain string')(
          'parsed',
          () => Effect.sync(() => parseMutationReport({ files: {}, config: 'nope' })),
        ),
        When('the report is parsed')('view', (s) => Effect.sync(() => s.parsed)),
        Then('the report is rejected rather than half-trusted')((s) =>
          Effect.sync(() => {
            expect(s.view).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should_Parse_When_TheReportOmitsConfig',
      Gherkin.Do.pipe(
        Given('a report that carries no config key at all')(
          'view',
          () => Effect.sync(() => parseMutationReport({ files: {}, testFiles: {} })),
        ),
        When('the report is parsed')('parsed', (s) => Effect.sync(() => s.view)),
        Then('it is accepted with no config attached')((s) =>
          Effect.sync(() => {
            expect(s.parsed).toEqual({ files: {}, testFiles: {} })
          })
        ),
      ),
    )

    scenario(
      'Should_CarryTheProjectRoot_When_TheReportNamesOne',
      Gherkin.Do.pipe(
        Given('a report that names a project root')(
          'view',
          () => Effect.sync(() => parseMutationReport({ files: {}, testFiles: {}, projectRoot: '/some/root' })),
        ),
        When('the report is parsed')('parsed', (s) => Effect.sync(() => s.view)),
        Then('the parsed view keeps that exact root')((s) =>
          Effect.sync(() => {
            expect(s.parsed?.projectRoot).toBe('/some/root')
          })
        ),
      ),
    )

    scenario(
      'Should_Reject_When_TheProjectRootIsNotAString',
      Gherkin.Do.pipe(
        Given('a report whose project root is a number')(
          'parsed',
          () => Effect.sync(() => parseMutationReport({ files: {}, projectRoot: 42 })),
        ),
        When('the report is parsed')('view', (s) => Effect.sync(() => s.parsed)),
        Then('the report is rejected rather than half-trusted')((s) =>
          Effect.sync(() => {
            expect(s.view).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should_CarryDisableBail_When_TheConfigSetsItTrue',
      Gherkin.Do.pipe(
        Given('a report whose config disables bail')(
          'view',
          () => Effect.sync(() => parseMutationReport({ files: {}, config: { disableBail: true } })),
        ),
        When('the report is parsed')('parsed', (s) => Effect.sync(() => s.view)),
        Then('the parsed view keeps disable bail set')((s) =>
          Effect.sync(() => {
            expect(s.parsed?.config?.disableBail).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Should_CarryDisableBail_When_TheConfigSetsItFalse',
      Gherkin.Do.pipe(
        Given('a report whose config leaves bail enabled')(
          'view',
          () => Effect.sync(() => parseMutationReport({ files: {}, config: { disableBail: false } })),
        ),
        When('the report is parsed')('parsed', (s) => Effect.sync(() => s.view)),
        Then('the parsed view keeps bail enabled')((s) =>
          Effect.sync(() => {
            expect(s.parsed?.config?.disableBail).toBe(false)
          })
        ),
      ),
    )

    scenario(
      'Should_Reject_When_DisableBailIsNotABoolean',
      Gherkin.Do.pipe(
        Given('a report whose config disables bail with a non-boolean')(
          'parsed',
          () => Effect.sync(() => parseMutationReport({ files: {}, config: { disableBail: 'yes' } })),
        ),
        When('the report is parsed')('view', (s) => Effect.sync(() => s.parsed)),
        Then('the report is rejected rather than half-trusted')((s) =>
          Effect.sync(() => {
            expect(s.view).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should_SortMissingFiles_When_ComparingTheReportToDisk',
      Gherkin.Do.pipe(
        Given('a report naming two missing files in reverse alphabetical order')(
          'missing',
          () =>
            Effect.sync(() =>
              filesMissingFromDisk(
                ['test/zed.property.test.ts', 'test/alpha.property.test.ts'],
                ['test/here.property.test.ts'],
              )
            ),
        ),
        When('the comparison is read')('checked', (s) => Effect.sync(() => s.missing)),
        Then('the absent files are named in ascending order')((s) =>
          Effect.sync(() => {
            expect(s.checked).toEqual(['test/alpha.property.test.ts', 'test/zed.property.test.ts'])
          })
        ),
      ),
    )

    scenario(
      'Should_ListEachStaleFileOnItsOwnLine_When_ManyAreStale',
      Gherkin.Do.pipe(
        Given('a clean verdict and two source files modified after the run')(
          'decision',
          () =>
            Effect.sync(() =>
              decideGate({
                verdict: measure(
                  reportOf([mutantOf('m1', 'Killed', ['t1'])], {
                    'test/alpha.property.test.ts': ['t1'],
                  }),
                ),
                reportFile: REPORT_FILE,
                staleFiles: ['src/zed.ts', 'src/alpha.ts'],
              })
            ),
        ),
        When('the gate is consulted')('checked', (s) => Effect.sync(() => s.decision)),
        Then('it refuses and lists every stale file on its own line')((s) =>
          Effect.sync(() => {
            expect(s.checked.ok).toBe(false)
            expect(s.checked.message).toContain('  - src/zed.ts\n  - src/alpha.ts')
          })
        ),
      ),
    )

    scenario(
      'Should_ListEachVanishedFileOnItsOwnLine_When_ManyAreGone',
      Gherkin.Do.pipe(
        Given('a clean verdict and two credited test files that no longer exist')(
          'decision',
          () =>
            Effect.sync(() =>
              decideGate({
                verdict: measure(
                  reportOf([mutantOf('m1', 'Killed', ['t1'])], {
                    'test/alpha.property.test.ts': ['t1'],
                  }),
                ),
                reportFile: REPORT_FILE,
                vanishedFiles: ['test/gone-zeta.property.test.ts', 'test/gone-alpha.property.test.ts'],
              })
            ),
        ),
        When('the gate is consulted')('checked', (s) => Effect.sync(() => s.decision)),
        Then('it refuses and lists every vanished file on its own line')((s) =>
          Effect.sync(() => {
            expect(s.checked.ok).toBe(false)
            expect(s.checked.message).toContain(
              '  - test/gone-zeta.property.test.ts\n  - test/gone-alpha.property.test.ts',
            )
          })
        ),
      ),
    )

    scenario(
      'Should_ListEachToothlessFileOnItsOwnLine_When_ManyDefendNothing',
      Gherkin.Do.pipe(
        Given('a report where two in-scope test files never land a kill')(
          'verdict',
          () =>
            Effect.sync(() =>
              measure(
                reportOf(
                  [mutantOf('m1', 'Killed', ['t1']), mutantOf('m2', 'Killed', ['t2'])],
                  {
                    'test/alpha.property.test.ts': ['t1'],
                    'test/beta.property.test.ts': ['t2'],
                    'test/gamma.property.test.ts': ['t3'],
                    'test/delta.property.test.ts': ['t4'],
                  },
                ),
              )
            ),
        ),
        When('the gate is consulted')(
          'decision',
          (s) => Effect.sync(() => decideGate({ verdict: s.verdict, reportFile: REPORT_FILE })),
        ),
        Then('it refuses and lists every toothless file on its own line')((s) =>
          Effect.sync(() => {
            expect(s.decision.ok).toBe(false)
            expect(s.decision.message).toContain(
              '  - test/delta.property.test.ts\n  - test/gamma.property.test.ts',
            )
          })
        ),
      ),
    )
  })
