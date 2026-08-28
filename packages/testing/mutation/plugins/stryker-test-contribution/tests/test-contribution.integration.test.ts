import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { schema } from '@systemfsoftware/stryker-js/Mutant'
import { Effect } from 'effect'
import { expect } from 'vitest'

import {
  contributionByTestFile,
  defaultRequireTestContributionSuffixes,
  judgeTestContribution,
  toothlessTestFiles,
} from '@systemfsoftware/stryker-test-contribution'

const Feature = makeFeature({ it, layer })

const LOCATION = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }

const mutantOf = (
  id: string,
  status: schema.MutantStatus,
  killedBy?: string[],
  coveredBy?: string[],
): schema.MutantResult => ({
  id,
  status,
  mutatorName: 'BooleanLiteral',
  location: LOCATION,
  ...(killedBy === undefined ? {} : { killedBy }),
  ...(coveredBy === undefined ? {} : { coveredBy }),
})

const reportOf = (
  mutants: schema.MutantResult[],
  testFiles: Record<string, string[]>,
): Pick<schema.MutationTestResult, 'files' | 'testFiles'> => ({
  files: {
    'src/subject.ts': { language: 'typescript', source: 'export const a = 1\n', mutants },
  },
  testFiles: Object.fromEntries(
    Object.entries(testFiles).map(([fileName, testIds]) => [
      fileName,
      { tests: testIds.map((id) => ({ id, name: `test ${id}` })) },
    ]),
  ),
})

const PROPERTY = ['.property.test.ts']
const EXACT = { suffixes: PROPERTY, everyKillerRecorded: true }
const BAILED = { suffixes: PROPERTY, everyKillerRecorded: false }

const defaultSuffixes: readonly string[] = defaultRequireTestContributionSuffixes
// The canonical "earns vs idle" report: one file claims a sole kill, the other kills nothing another
// does not also kill. Used by every scenario that distinguishes auditable from redundant files.
const earnsAndIdleReport = (): Pick<schema.MutationTestResult, 'files' | 'testFiles'> =>
  reportOf(
    [
      mutantOf('m1', 'Killed', ['t1', 't2'], ['t1', 't2']),
      mutantOf('m2', 'Killed', ['t1'], ['t1']),
    ],
    { 'earns.property.test.ts': ['t1'], 'idle.property.test.ts': ['t2'] },
  )

Feature('Judging test contribution under the test-contribution gate')
  .body(({ scenario }) => {
    scenario(
      'Should_CreditASoleKill_When_OnlyOneFileKilledTheMutant',
      Gherkin.Do.pipe(
        Given('a mutant killed by one file and another file covering nothing')('report', () =>
          Effect.succeed(
            reportOf([mutantOf('m1', 'Killed', ['t1'])], {
              'a.property.test.ts': ['t1'],
              'b.property.test.ts': ['t2'],
            }),
          )),
        When('contribution is computed per file')(
          'contribution',
          (s) => Effect.sync(() => Object.fromEntries(contributionByTestFile(s.report))),
        ),
        Then('the sole killer earns the sole kill and the other file earns nothing')((s) => {
          expect(s.contribution).toEqual({
            'a.property.test.ts': { soleKills: 1, totalKills: 1, killableCovered: 0, coversUnattributedKill: false },
            'b.property.test.ts': { soleKills: 0, totalKills: 0, killableCovered: 0, coversUnattributedKill: false },
          })
        }),
      ),
    )

    scenario(
      'Should_CreditASharedKillToBothFiles_When_TwoFilesKilledTogether',
      Gherkin.Do.pipe(
        Given('a report killed jointly by two files')('report', () =>
          Effect.succeed(
            reportOf([mutantOf('m1', 'Killed', ['t1', 't2'])], {
              'a.property.test.ts': ['t1'],
              'b.property.test.ts': ['t2'],
            }),
          )),
        When('contribution is computed per file')(
          'contribution',
          (s) => Effect.sync(() => Object.fromEntries(contributionByTestFile(s.report))),
        ),
        Then('both files count the kill but neither claims it alone')((s) => {
          expect(s.contribution).toEqual({
            'a.property.test.ts': { soleKills: 0, totalKills: 1, killableCovered: 0, coversUnattributedKill: false },
            'b.property.test.ts': { soleKills: 0, totalKills: 1, killableCovered: 0, coversUnattributedKill: false },
          })
        }),
      ),
    )

    scenario(
      'Should_DenySoleCredit_When_ACoKillerCannotBePlacedInAnyFile',
      Gherkin.Do.pipe(
        Given('a kill whose co-killer is not in any test file')('report', () =>
          Effect.succeed(
            reportOf([mutantOf('m1', 'Killed', ['t1', 'ghost'])], { 'a.property.test.ts': ['t1'] }),
          )),
        When('contribution is computed per file')(
          'contribution',
          (s) => Effect.sync(() => Object.fromEntries(contributionByTestFile(s.report))),
        ),
        Then('the placed file gets the kill but no sole credit')((s) => {
          expect(s.contribution).toEqual({
            'a.property.test.ts': { soleKills: 0, totalKills: 1, killableCovered: 0, coversUnattributedKill: false },
          })
        }),
      ),
    )

    scenario(
      'Should_CountATimeoutAsAKill_When_ItRecordedAKillingTest',
      Gherkin.Do.pipe(
        Given('a timeout mutant with a recorded killing test')(
          'report',
          () => Effect.succeed(reportOf([mutantOf('m1', 'Timeout', ['t1'])], { 'a.property.test.ts': ['t1'] })),
        ),
        When('contribution is computed per file')(
          'contribution',
          (s) => Effect.sync(() => Object.fromEntries(contributionByTestFile(s.report))),
        ),
        Then('the timeout counts as a sole kill')((s) => {
          expect(s.contribution).toEqual({
            'a.property.test.ts': { soleKills: 1, totalKills: 1, killableCovered: 0, coversUnattributedKill: false },
          })
        }),
      ),
    )

    scenario(
      'Should_CreditNobody_When_TheMutantSurvived',
      Gherkin.Do.pipe(
        Given('a report with a surviving mutant')('report', () =>
          Effect.succeed(
            reportOf([mutantOf('m1', 'Survived', ['t1'])], { 'a.property.test.ts': ['t1'] }),
          )),
        When('contribution is computed per file')(
          'contribution',
          (s) => Effect.sync(() => Object.fromEntries(contributionByTestFile(s.report))),
        ),
        Then('no file earns a kill')((s) => {
          expect(s.contribution).toEqual({
            'a.property.test.ts': { soleKills: 0, totalKills: 0, killableCovered: 0, coversUnattributedKill: false },
          })
        }),
      ),
    )

    scenario(
      'Should_CreditNobodyForAKillThatRecordedNoKillingTest_When_TheReportOmitsKilledBy',
      Gherkin.Do.pipe(
        Given('a killed mutant with no recorded killing test')(
          'report',
          () => Effect.succeed(reportOf([mutantOf('m1', 'Killed')], { 'a.property.test.ts': ['t1'] })),
        ),
        When('contribution is computed per file')(
          'contribution',
          (s) => Effect.sync(() => Object.fromEntries(contributionByTestFile(s.report))),
        ),
        Then('no file is credited for it')((s) => {
          expect(s.contribution).toEqual({
            'a.property.test.ts': { soleKills: 0, totalKills: 0, killableCovered: 0, coversUnattributedKill: false },
          })
        }),
      ),
    )

    scenario(
      'Should_AccuseAFile_When_EveryKillItMakesAnotherFileAlsoMakes',
      Gherkin.Do.pipe(
        Given(
          'a report where one file kills nothing another file does not also kill',
        )('report', () =>
          Effect.succeed(
            earnsAndIdleReport(),
          )),
        When('toothless files are computed with every killer recorded')(
          'accused',
          (s) => Effect.sync(() => toothlessTestFiles(contributionByTestFile(s.report), EXACT)),
        ),
        Then('the redundant file is accused')((s) => {
          expect(s.accused).toEqual(['idle.property.test.ts'])
        }),
      ),
    )

    scenario(
      'Should_SpareARedundantFile_When_TheRunBailed',
      Gherkin.Do.pipe(
        Given(
          'a report where a file kills nothing alone, with everyKillerRecorded false',
        )('report', () =>
          Effect.succeed(
            earnsAndIdleReport(),
          )),
        When('toothless files are computed under bail')(
          'accused',
          (s) => Effect.sync(() => toothlessTestFiles(contributionByTestFile(s.report), BAILED)),
        ),
        Then('the redundant file is spared because a second killer may be unrecorded')((s) => {
          expect(s.accused).toEqual([])
        }),
      ),
    )

    scenario(
      'Should_AccuseAFileThatKilledNothing_When_TheRunBailed',
      Gherkin.Do.pipe(
        Given(
          'a report with a file that killed nothing at all',
        )('report', () =>
          Effect.succeed(
            reportOf([mutantOf('m1', 'Killed', ['t1'], ['t1', 't2'])], {
              'earns.property.test.ts': ['t1'],
              'idle.property.test.ts': ['t2'],
            }),
          )),
        When('toothless files are computed under a bail')(
          'accused',
          (s) => Effect.sync(() => toothlessTestFiles(contributionByTestFile(s.report), BAILED)),
        ),
        Then('the kill-nothing file is still accused')((s) => {
          expect(s.accused).toEqual(['idle.property.test.ts'])
        }),
      ),
    )

    scenario(
      'Should_SpareAFileCoveringAnUnattributedKill_When_DeletingItMayResurrectTheKill',
      Gherkin.Do.pipe(
        Given(
          'a file covering a timeout whose killing test was never named',
        )('report', () =>
          Effect.succeed(
            reportOf([mutantOf('m1', 'Killed', ['t1'], ['t1']), mutantOf('m2', 'Timeout', [], ['t2'])], {
              'earns.property.test.ts': ['t1'],
              'hangs.property.test.ts': ['t2'],
            }),
          )),
        When('toothless files are computed with every killer recorded')(
          'accused',
          (s) => Effect.sync(() => toothlessTestFiles(contributionByTestFile(s.report), EXACT)),
        ),
        Then('the coverer of the unattributed kill is spared')((s) => {
          expect(s.accused).toEqual([])
        }),
      ),
    )

    scenario(
      'Should_StillAccuseAFileThatCoversNothing_When_ASiblingCoversTheUnattributedKill',
      Gherkin.Do.pipe(
        Given(
          'a report with one coverer of an unattributed kill and one idle file',
        )('report', () =>
          Effect.succeed(
            reportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1', 't3']), mutantOf('m2', 'Timeout', [], ['t2'])],
              {
                'earns.property.test.ts': ['t1'],
                'hangs.property.test.ts': ['t2'],
                'idle.property.test.ts': ['t3'],
              },
            ),
          )),
        When('toothless files are computed with every killer recorded')(
          'accused',
          (s) => Effect.sync(() => toothlessTestFiles(contributionByTestFile(s.report), EXACT)),
        ),
        Then('the file that covers nothing is accused')((s) => {
          expect(s.accused).toEqual(['idle.property.test.ts'])
        }),
      ),
    )

    scenario(
      'Should_TreatAbsentKilledByLikeAnEmptyKilledBy_When_CoveringTheKill',
      Gherkin.Do.pipe(
        Given(
          'a timeout mutant whose killedBy is absent rather than an empty array',
        )('report', () =>
          Effect.succeed(
            reportOf([mutantOf('m1', 'Killed', ['t1'], ['t1']), mutantOf('m2', 'Timeout', undefined, ['t2'])], {
              'earns.property.test.ts': ['t1'],
              'hangs.property.test.ts': ['t2'],
            }),
          )),
        When('toothless files are computed with every killer recorded')(
          'accused',
          (s) => Effect.sync(() => toothlessTestFiles(contributionByTestFile(s.report), EXACT)),
        ),
        Then('the coverer is spared the same way as with an explicit empty list')((s) => {
          expect(s.accused).toEqual([])
        }),
      ),
    )

    scenario(
      'Should_NeverAccuseAFileOutsideTheConfiguredSuffixes',
      Gherkin.Do.pipe(
        Given('an idle file that does not match the configured suffixes')('report', () =>
          Effect.succeed(
            reportOf([mutantOf('m1', 'Killed', ['t1'], ['t1', 't2'])], {
              'earns.property.test.ts': ['t1'],
              'idle.integration.test.ts': ['t2'],
            }),
          )),
        When('toothless files are computed with every killer recorded')(
          'accused',
          (s) => Effect.sync(() => toothlessTestFiles(contributionByTestFile(s.report), EXACT)),
        ),
        Then('the out-of-suffix file is never accused')((s) => {
          expect(s.accused).toEqual([])
        }),
      ),
    )

    scenario(
      'Should_ReturnTheAccusedFilesSorted',
      Gherkin.Do.pipe(
        Given('a report with several accused files out of order')('report', () =>
          Effect.succeed(
            reportOf([mutantOf('m1', 'Killed', ['t1'], ['t1', 't2', 't3'])], {
              'earns.property.test.ts': ['t1'],
              'zebra.property.test.ts': ['t2'],
              'alpha.property.test.ts': ['t3'],
            }),
          )),
        When('toothless files are computed with every configured suffix')(
          'accused',
          (s) => Effect.sync(() => toothlessTestFiles(contributionByTestFile(s.report), EXACT)),
        ),
        Then('they are sorted alphabetically')((s) => {
          expect(s.accused).toEqual(['alpha.property.test.ts', 'zebra.property.test.ts'])
        }),
      ),
    )

    scenario(
      'Should_FailTheRunAndNameTheFile_When_AFileEarnsNothing',
      Gherkin.Do.pipe(
        Given('a report with an earns-nothing file')('report', () =>
          Effect.succeed(
            earnsAndIdleReport(),
          )),
        When('the run is judged with exact killer recording')(
          'verdict',
          (s) => Effect.sync(() => judgeTestContribution(s.report, true, PROPERTY)),
        ),
        Then('the run fails, names the idle file, and carries no bail text')((s) => {
          expect(s.verdict?.failed).toBe(true)
          expect(s.verdict?.message).toContain('idle.property.test.ts')
          expect(s.verdict?.message).toContain('just as dead')
          expect(s.verdict?.message).not.toContain('disableBail: true')
        }),
      ),
    )

    scenario(
      'Should_PassTheRun_When_EveryInScopeFileEarnsItsPlace',
      Gherkin.Do.pipe(
        Given('a report where every in-scope file kills a distinct mutant')('report', () =>
          Effect.succeed(
            reportOf(
              [
                mutantOf('m1', 'Killed', ['t1'], ['t1']),
                mutantOf('m2', 'Killed', ['t2'], ['t2']),
              ],
              {
                'earns.property.test.ts': ['t1'],
                'also.property.test.ts': ['t2'],
              },
            ),
          )),
        When('the verdict is judged normally')(
          'verdict',
          (s) => Effect.sync(() => judgeTestContribution(s.report, true, PROPERTY)),
        ),
        Then('the run passes')((s) => {
          expect(s.verdict?.failed).toBe(false)
          expect(s.verdict?.message).toContain('kills a mutant nothing else kills')
        }),
      ),
    )

    scenario(
      'Should_FailWithAConfigurationError_When_BailIsOnAndAnInScopeFileRan',
      Gherkin.Do.pipe(
        Given('a report with an earns-nothing file under bail')('report', () =>
          Effect.succeed(
            earnsAndIdleReport(),
          )),
        When('the verdict is judged with everyKillerRecorded false')(
          'verdict',
          (s) => Effect.sync(() => judgeTestContribution(s.report, false, PROPERTY)),
        ),
        Then('the run fails citing the bail configuration')((s) => {
          expect(s.verdict?.failed).toBe(true)
          expect(s.verdict?.message).toContain('bail')
          expect(s.verdict?.message).toContain('disableBail: true')
        }),
      ),
    )

    scenario(
      'Should_StaySilent_When_BailIsOnAndNoFileMatchesTheConfiguredSuffixes',
      Gherkin.Do.pipe(
        Given('a report whose files carry no configured suffix')('report', () =>
          Effect.succeed(
            reportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1'])],
              { 'plain.test.ts': ['t1'] },
            ),
          )),
        When('the verdict is judged under bail')(
          'verdict',
          (s) => Effect.sync(() => judgeTestContribution(s.report, false, PROPERTY)),
        ),
        Then('the run stays silent')((s) => {
          expect(s.verdict?.failed).toBe(false)
          expect(s.verdict?.message).toContain('so none was judged')
          expect(s.verdict?.message).not.toContain('disableBail: true')
        }),
      ),
    )

    scenario(
      'Should_NotSingleOutAZeroKillingFile_WhenBailIsOn',
      Gherkin.Do.pipe(
        Given('a report with only zero-kill workflow files and bail on')('report', () =>
          Effect.succeed(
            reportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1']), mutantOf('m2', 'Killed', ['t1'], ['t1'])],
              {
                'sole.workflow.property.test.ts': ['t1'],
                'idle.workflow.property.test.ts': ['t2'],
              },
            ),
          )),
        When('the verdict is judged with the workflow suffix')(
          'verdict',
          (s) => Effect.sync(() => judgeTestContribution(s.report, false, ['.workflow.property.test.ts'])),
        ),
        Then('the configuration error names the flag, not the files')((s) => {
          expect(s.verdict?.message).not.toContain('sole.workflow.property.test.ts')
          expect(s.verdict?.message).not.toContain('idle.workflow.property.test.ts')
          expect(s.verdict?.message).toContain('disableBail: true')
        }),
      ),
    )

    scenario(
      'Should_BlameTheRun_When_NoKillWasCreditedToAnyTestFile',
      Gherkin.Do.pipe(
        Given('a report with killed mutants but no credited killer')('report', () =>
          Effect.succeed(
            reportOf(
              [mutantOf('m1', 'Killed'), mutantOf('m2', 'Timeout')],
              { 'unjudged.property.test.ts': ['t1'] },
            ),
          )),
        When('the verdict is judged with every killer recorded')(
          'verdict',
          (s) => Effect.sync(() => judgeTestContribution(s.report, true, PROPERTY)),
        ),
        Then('the run is blamed and the files are not')((s) => {
          expect(s.verdict?.failed).toBe(true)
          expect(s.verdict?.message).toContain('credited no kill to any test file')
          expect(s.verdict?.message).not.toContain('unjudged.property.test.ts')
        }),
      ),
    )

    scenario(
      'Should_PassWithoutJudging_WhenNoFileMatchesTheSuffixes',
      Gherkin.Do.pipe(
        Given('a report with no in-scope test files')('report', () =>
          Effect.succeed(
            reportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1'])],
              { 'plain.test.ts': ['t1'] },
            ),
          )),
        When('the verdict is judged with every killer recorded')(
          'verdict',
          (s) => Effect.sync(() => judgeTestContribution(s.report, true, PROPERTY)),
        ),
        Then('the run passes and nothing was judged')((s) => {
          expect(s.verdict?.failed).toBe(false)
          expect(s.verdict?.message).toContain('so none was judged')
        }),
      ),
    )

    scenario(
      'Should_CountEveryMutantAFileKills_NotMerelyThatItKilledOne',
      Gherkin.Do.pipe(
        Given('a report with two mutants both killed by the same file')('report', () =>
          Effect.succeed(
            reportOf(
              [mutantOf('m1', 'Killed', ['t1']), mutantOf('m2', 'Killed', ['t1'])],
              { 'busy.property.test.ts': ['t1'] },
            ),
          )),
        When('contribution is computed per file')(
          'contribution',
          (s) => Effect.sync(() => Object.fromEntries(contributionByTestFile(s.report))),
        ),
        Then('both kills are counted for the file')((s) => {
          expect(s.contribution).toEqual({
            'busy.property.test.ts': { soleKills: 2, totalKills: 2, killableCovered: 0, coversUnattributedKill: false },
          })
        }),
      ),
    )

    scenario(
      'Should_JudgeAFileInScope_When_ItMatchesAnyConfiguredSuffix',
      Gherkin.Do.pipe(
        Given('a report with one file matching only one of several suffixes')('report', () =>
          Effect.succeed(
            reportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1', 't2'])],
              {
                'earns.property.test.ts': ['t1'],
                'idle.law.test.ts': ['t2'],
              },
            ),
          )),
        When('the verdict is judged against both suffixes')(
          'verdict',
          (s) => Effect.sync(() => judgeTestContribution(s.report, true, ['.property.test.ts', '.law.test.ts'])),
        ),
        Then('the matching file is judged in scope')((s) => {
          expect(s.verdict?.failed).toBe(true)
          expect(s.verdict?.message).toContain('idle.law.test.ts')
        }),
      ),
    )

    scenario(
      'Should_NameEveryConfiguredSuffix_WhenNothingMatched',
      Gherkin.Do.pipe(
        Given('a report with no file matching any configured suffix')('report', () =>
          Effect.succeed(
            reportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1'])],
              { 'plain.test.ts': ['t1'] },
            ),
          )),
        When('the verdict is judged against both suffixes')(
          'verdict',
          (s) => Effect.sync(() => judgeTestContribution(s.report, true, ['.property.test.ts', '.law.test.ts'])),
        ),
        Then('the message names both suffixes')((s) => {
          expect(s.verdict?.message).toContain('.property.test.ts, .law.test.ts')
        }),
      ),
    )

    scenario(
      'Should_SayTheAnswerIsExact_WhenEveryKillerWasRecorded',
      Gherkin.Do.pipe(
        Given('a report where every killer was recorded')('report', () =>
          Effect.succeed(
            earnsAndIdleReport(),
          )),
        When('the verdict is judged with every killer recorded')(
          'verdict',
          (s) => Effect.sync(() => judgeTestContribution(s.report, true, PROPERTY)),
        ),
        Then('the message claims exact killer recording')((s) => {
          expect(s.verdict?.message).toContain('every killing test was recorded')
        }),
      ),
    )

    scenario(
      'Should_ListEachAccusedFileOnItsOwnBulletedLine',
      Gherkin.Do.pipe(
        Given('a report with two idle files')('report', () =>
          Effect.succeed(
            reportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1', 't2', 't3'])],
              {
                'earns.property.test.ts': ['t1'],
                'beta.property.test.ts': ['t2'],
                'alpha.property.test.ts': ['t3'],
              },
            ),
          )),
        When('the verdict is judged with every killer recorded')(
          'verdict',
          (s) => Effect.sync(() => judgeTestContribution(s.report, true, PROPERTY)),
        ),
        Then('each accused file is listed on its own bullet line')((s) => {
          expect(s.verdict?.message).toContain(
            '  - alpha.property.test.ts\n  - beta.property.test.ts',
          )
        }),
      ),
    )

    scenario(
      'Should_ProduceNoContributionVerdict_WhenOnlySchemaPropertyTestsRun',
      Gherkin.Do.pipe(
        Given('a report whose only tests are schema property tests')('report', () =>
          Effect.succeed(
            reportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1', 't2'])],
              {
                'earns.schema.property.test.ts': ['t1'],
                'idle.schema.property.test.ts': ['t2'],
              },
            ),
          )),
        When('the verdict is judged with the schema default suffixes')(
          'verdict',
          (s) => Effect.sync(() => judgeTestContribution(s.report, true, defaultSuffixes)),
        ),
        Then('there is no judgement')((s) => {
          expect(s.verdict?.message).toContain('so none was judged')
        }),
      ),
    )

    scenario(
      'Should_StillProduceAVerdictForTheDefault_WhenAWorkflowPropertyTestIsPresent',
      Gherkin.Do.pipe(
        Given('a report with a workflow property test among schema ones')('report', () =>
          Effect.succeed(
            reportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1', 't2'])],
              {
                'earns.workflow.property.test.ts': ['t1'],
                'idle.workflow.property.test.ts': ['t2'],
              },
            ),
          )),
        When('the verdict is judged with the schema default suffixes')(
          'verdict',
          (s) => Effect.sync(() => judgeTestContribution(s.report, true, defaultSuffixes)),
        ),
        Then('the gate applies and the run fails')((s) => {
          expect(s.verdict?.failed).toBe(true)
        }),
      ),
    )

    scenario(
      'Should_JudgeAgainstACustomSuffixList_When_OneIsSupplied',
      Gherkin.Do.pipe(
        Given('a report with only schema property tests and a custom suffix list')('report', () =>
          Effect.succeed(
            reportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1', 't2'])],
              {
                'earns.schema.property.test.ts': ['t1'],
                'idle.schema.property.test.ts': ['t2'],
              },
            ),
          )),
        When('the verdict is judged with the schema suffix list')(
          'verdict',
          (s) => Effect.sync(() => judgeTestContribution(s.report, true, ['.schema.property.test.ts'])),
        ),
        Then('the custom suffix list applies and fails the run')((s) => {
          expect(s.verdict?.failed).toBe(true)
        }),
      ),
    )

    scenario(
      'Should_NotCreditPhantomKillAndShouldExemptItsCoverer_When_KillerIdMapsToNoTestFile',
      Gherkin.Do.pipe(
        Given('a kill whose only killer id names no test file and a real file covers it')(
          'report',
          () =>
            Effect.succeed(
              reportOf([mutantOf('m1', 'Killed', ['ghost'], ['t1'])], {
                'a.property.test.ts': ['t1'],
                'b.property.test.ts': ['t2'],
              }),
            ),
        ),
        When('contribution is computed per file')(
          'contribution',
          (s) => Effect.sync(() => Object.fromEntries(contributionByTestFile(s.report))),
        ),
        Then('no real file is credited and the coverer is marked as covering an unattributed kill')((s) => {
          expect(s.contribution).toEqual({
            'a.property.test.ts': { soleKills: 0, totalKills: 0, killableCovered: 1, coversUnattributedKill: true },
            'b.property.test.ts': { soleKills: 0, totalKills: 0, killableCovered: 0, coversUnattributedKill: false },
          })
          expect(Object.keys(s.contribution)).not.toContain('ghost')
        }),
      ),
    )

    scenario(
      'Should_PassWithHonestCountsAndNotClaimUniqueKill_When_AFileOnlySurvivesByExemption',
      Gherkin.Do.pipe(
        Given('a report where one file defends and another only survives by covering an unattributed kill')(
          'report',
          () =>
            Effect.succeed(
              reportOf(
                [
                  mutantOf('m1', 'Killed', ['t1'], ['t1']),
                  mutantOf('m2', 'Killed', ['ghost'], ['t2']),
                ],
                {
                  'earns.property.test.ts': ['t1'],
                  'exempt.property.test.ts': ['t2'],
                },
              ),
            ),
        ),
        When('the run is judged with exact killer recording')(
          'verdict',
          (s) => Effect.sync(() => judgeTestContribution(s.report, true, PROPERTY)),
        ),
        Then('the run passes with judged and exempt counts and never claims every file kills uniquely')((s) => {
          expect(s.verdict?.failed).toBe(false)
          expect(s.verdict?.message).toContain('1 judged')
          expect(s.verdict?.message).toContain('1 exempted')
          expect(s.verdict?.message).not.toContain('kills a mutant nothing else kills')
        }),
      ),
    )

    scenario(
      'Should_FailWithoutClaimingJustAsDead_When_TwoFilesKillExactlyTheSameMutants',
      Gherkin.Do.pipe(
        Given('a report where two files kill exactly the same mutants')('report', () =>
          Effect.succeed(
            reportOf(
              [
                mutantOf('m1', 'Killed', ['t1', 't2'], ['t1', 't2']),
                mutantOf('m2', 'Killed', ['t1', 't2'], ['t1', 't2']),
              ],
              {
                'a.property.test.ts': ['t1'],
                'b.property.test.ts': ['t2'],
              },
            ),
          )),
        When('the run is judged with exact killer recording')(
          'verdict',
          (s) => Effect.sync(() => judgeTestContribution(s.report, true, PROPERTY)),
        ),
        Then('the run fails but does not claim deleting them leaves every mutant just as dead')((s) => {
          expect(s.verdict?.failed).toBe(true)
          expect(s.verdict?.message).not.toContain('would leave every mutant just as dead')
          expect(s.verdict?.message).toContain('would not leave every mutant just as dead')
          expect(s.verdict?.message).toContain('a.property.test.ts')
          expect(s.verdict?.message).toContain('b.property.test.ts')
        }),
      ),
    )

    scenario(
      'Should_ClaimJustAsDead_When_JointSubsumptionHoldsAcrossAccusedFiles',
      Gherkin.Do.pipe(
        Given('a report where every mutant the accused files kill retains an outside killer')(
          'report',
          () =>
            Effect.succeed(
              reportOf(
                [
                  mutantOf('m1', 'Killed', ['t1', 't3'], ['t1', 't3']),
                  mutantOf('m2', 'Killed', ['t2', 't3'], ['t2', 't3']),
                  mutantOf('m3', 'Killed', ['t3'], ['t3']),
                ],
                {
                  'a.property.test.ts': ['t1'],
                  'b.property.test.ts': ['t2'],
                  'c.property.test.ts': ['t3'],
                },
              ),
            ),
        ),
        When('the run is judged with exact killer recording')(
          'verdict',
          (s) => Effect.sync(() => judgeTestContribution(s.report, true, PROPERTY)),
        ),
        Then('the run fails claiming the whole accused set is jointly deletable')((s) => {
          expect(s.verdict?.failed).toBe(true)
          expect(s.verdict?.message).toContain('would leave every mutant just as dead')
          expect(s.verdict?.message).toContain('a.property.test.ts')
          expect(s.verdict?.message).toContain('b.property.test.ts')
          expect(s.verdict?.message).not.toContain('c.property.test.ts')
        }),
      ),
    )

    scenario(
      'Should_TreatZeroKillFileAsUnjudged_When_ItCoveredNoKillableMutant_AndAsToothless_When_ItDid',
      Gherkin.Do.pipe(
        Given('a report with one auditable idle file and one unauditable idle file')('report', () =>
          Effect.succeed(
            reportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1', 't2'])],
              {
                'earns.property.test.ts': ['t1'],
                'auditable.property.test.ts': ['t2'],
                'unauditable.property.test.ts': ['t3'],
              },
            ),
          )),
        When('toothless files are computed with every killer recorded and contribution is kept')(
          'result',
          (s) =>
            Effect.sync(() => {
              const contribution = contributionByTestFile(s.report)
              return {
                accused: toothlessTestFiles(contribution, EXACT),
                contribution: Object.fromEntries(contribution),
              }
            }),
        ),
        Then('only the auditable file is accused and the unauditable file is spared')((s) => {
          expect(s.result.accused).toEqual(['auditable.property.test.ts'])
          expect(s.result.contribution['auditable.property.test.ts']?.killableCovered).toBe(1)
          expect(s.result.contribution['unauditable.property.test.ts']?.killableCovered).toBe(0)
        }),
      ),
    )

    scenario(
      'Should_SayUnjudgedInTheJudge_When_AnInScopeFileCoveredNoKillableMutant',
      Gherkin.Do.pipe(
        Given('a report with one defending file and one file the report gave no killable mutant')(
          'report',
          () =>
            Effect.succeed(
              reportOf(
                [mutantOf('m1', 'Killed', ['t1'], ['t1'])],
                {
                  'earns.property.test.ts': ['t1'],
                  'unauditable.property.test.ts': ['t3'],
                },
              ),
            ),
        ),
        When('the run is judged with exact killer recording')(
          'verdict',
          (s) => Effect.sync(() => judgeTestContribution(s.report, true, PROPERTY)),
        ),
        Then('the run passes reporting the bare file unjudged, never the unique-kill sentence')((s) => {
          expect(s.verdict?.failed).toBe(false)
          expect(s.verdict?.message).toContain('1 judged')
          expect(s.verdict?.message).toContain('1 unjudged')
          expect(s.verdict?.message).not.toContain('kills a mutant nothing else kills')
        }),
      ),
    )

    scenario(
      'Should_NotCountAnIgnoredMutantAsKillable_When_JudgingWhichFilesWereOfferedOne',
      Gherkin.Do.pipe(
        Given('a report whose only in-scope idle file covers only an Ignored mutant')('report', () =>
          Effect.succeed(
            reportOf(
              [mutantOf('m1', 'Killed', ['t1'], ['t1']), mutantOf('m2', 'Ignored', [], ['t2'])],
              {
                'earns.property.test.ts': ['t1'],
                'ignored-cover.property.test.ts': ['t2'],
              },
            ),
          )),
        When('toothless files are computed with every killer recorded and contribution is kept')(
          'result',
          (s) =>
            Effect.sync(() => {
              const contribution = contributionByTestFile(s.report)
              return {
                accused: toothlessTestFiles(contribution, EXACT),
                contribution: Object.fromEntries(contribution),
              }
            }),
        ),
        Then('the Ignored-only file is not accused and not counted as coverable')((s) => {
          expect(s.result.accused).toEqual([])
          expect(s.result.contribution['ignored-cover.property.test.ts']?.killableCovered).toBe(0)
        }),
      ),
    )
  })
