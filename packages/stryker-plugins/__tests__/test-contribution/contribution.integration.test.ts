import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { DEFAULT_SUFFIXES, verdictOf } from '../../src/test-contribution/index.js'

import { mutantOf, reportOf } from '../helpers/mutation-report.fixtures.js'

const Feature = makeFeature({ it, layer })

const PROPERTY_SUFFIXES = ['.property.test.ts']
const PROPERTY_AND_SPEC_SUFFIXES = ['.property.test.ts', '.spec.ts']

Feature('Measuring what a test file would take with it if deleted')
  .body(({ scenario }) => {
    scenario(
      'Should_CreditSoleKill_When_OneTestFileIsTheOnlyKiller',
      Gherkin.Do.pipe(
        Given('a mutant killed only by tests in one property test file')(
          'report',
          () =>
            Effect.sync(() =>
              reportOf([mutantOf('m1', 'Killed', ['t1', 't2'])], {
                'test/alpha.property.test.ts': ['t1', 't2'],
                'test/beta.property.test.ts': ['t3'],
              })
            ),
        ),
        When('contribution is measured')(
          'verdict',
          (s) => Effect.sync(() => verdictOf(s.report, PROPERTY_SUFFIXES)),
        ),
        Then('that file is credited with a sole kill and the other is toothless')((s) =>
          Effect.sync(() => {
            expect(s.verdict.byTestFile['test/alpha.property.test.ts']).toEqual({ soleKills: 1, totalKills: 1 })
            expect(s.verdict.toothless).toEqual(['test/beta.property.test.ts'])
          })
        ),
      ),
    )

    scenario(
      'Should_CreditNoSoleKill_When_TwoTestFilesKillTheSameMutant',
      Gherkin.Do.pipe(
        Given('a mutant killed by tests spread across two files')(
          'report',
          () =>
            Effect.sync(() =>
              reportOf([mutantOf('m1', 'Killed', ['t1', 't3'])], {
                'test/alpha.property.test.ts': ['t1'],
                'test/beta.property.test.ts': ['t3'],
              })
            ),
        ),
        When('contribution is measured')(
          'verdict',
          (s) => Effect.sync(() => verdictOf(s.report, PROPERTY_SUFFIXES)),
        ),
        Then('neither file can claim the kill alone')((s) =>
          Effect.sync(() => {
            expect(s.verdict.byTestFile['test/alpha.property.test.ts']).toEqual({ soleKills: 0, totalKills: 1 })
            expect(s.verdict.byTestFile['test/beta.property.test.ts']).toEqual({ soleKills: 0, totalKills: 1 })
            expect(s.verdict.toothless).toEqual([
              'test/alpha.property.test.ts',
              'test/beta.property.test.ts',
            ])
          })
        ),
      ),
    )

    scenario(
      'Should_CountUnattributable_When_NoRecordedTestKilledTheMutant',
      Gherkin.Do.pipe(
        Given('a timeout with no killer and a kill naming a test the report does not list')(
          'report',
          () =>
            Effect.sync(() =>
              reportOf([mutantOf('m1', 'Timeout'), mutantOf('m2', 'Killed', ['ghost'])], {
                'test/alpha.property.test.ts': ['t1'],
              })
            ),
        ),
        When('contribution is measured')(
          'verdict',
          (s) => Effect.sync(() => verdictOf(s.report, PROPERTY_SUFFIXES)),
        ),
        Then('both kills are reported as unattributable rather than credited')((s) =>
          Effect.sync(() => {
            expect(s.verdict.unattributableKills).toBe(2)
            expect(s.verdict.byTestFile['test/alpha.property.test.ts']).toEqual({ soleKills: 0, totalKills: 0 })
          })
        ),
      ),
    )

    scenario(
      'Should_CreditTimeout_When_ItRecordsAKillingTest',
      Gherkin.Do.pipe(
        Given('a mutant that timed out under one test file')(
          'report',
          () =>
            Effect.sync(() => reportOf([mutantOf('m1', 'Timeout', ['t1'])], { 'test/alpha.property.test.ts': ['t1'] })),
        ),
        When('contribution is measured')(
          'verdict',
          (s) => Effect.sync(() => verdictOf(s.report, PROPERTY_SUFFIXES)),
        ),
        Then('the timeout counts as a kill for that file')((s) =>
          Effect.sync(() => {
            expect(s.verdict.byTestFile['test/alpha.property.test.ts']).toEqual({ soleKills: 1, totalKills: 1 })
            expect(s.verdict.toothless).toEqual([])
          })
        ),
      ),
    )

    scenario(
      'Should_IgnoreSurvivor_When_MutantWasNotKilled',
      Gherkin.Do.pipe(
        Given('a survived mutant that still records covering tests')(
          'report',
          () =>
            Effect.sync(() =>
              reportOf([mutantOf('m1', 'Survived', ['t1'])], { 'test/alpha.property.test.ts': ['t1'] })
            ),
        ),
        When('contribution is measured')(
          'verdict',
          (s) => Effect.sync(() => verdictOf(s.report, PROPERTY_SUFFIXES)),
        ),
        Then('the file earns nothing from a mutant it failed to kill')((s) =>
          Effect.sync(() => {
            expect(s.verdict.byTestFile['test/alpha.property.test.ts']).toEqual({ soleKills: 0, totalKills: 0 })
            expect(s.verdict.toothless).toEqual(['test/alpha.property.test.ts'])
          })
        ),
      ),
    )

    scenario(
      'Should_SpareOutOfScopeFile_When_ItSolelyKillsNothing',
      Gherkin.Do.pipe(
        Given('an integration test file that solely kills nothing')(
          'report',
          () =>
            Effect.sync(() =>
              reportOf([mutantOf('m1', 'Killed', ['t1'])], {
                'test/alpha.property.test.ts': ['t1'],
                'test/beta.integration.test.ts': ['t2'],
              })
            ),
        ),
        When('contribution is measured for property tests only')(
          'verdict',
          (s) => Effect.sync(() => verdictOf(s.report, PROPERTY_SUFFIXES)),
        ),
        Then('only the in-scope suffix is held to the standard')((s) =>
          Effect.sync(() => {
            expect(s.verdict.byTestFile['test/beta.integration.test.ts']).toEqual({ soleKills: 0, totalKills: 0 })
            expect(s.verdict.toothless).toEqual([])
          })
        ),
      ),
    )

    scenario(
      'Should_AccuseOnlyProvenIdlers_When_TheRunBailedAtTheFirstKill',
      Gherkin.Do.pipe(
        Given('a bailed run that recorded one killer per mutant, naming only the first file')(
          'report',
          () =>
            Effect.sync(() =>
              reportOf([mutantOf('m1', 'Killed', ['t1'])], {
                'test/alpha.property.test.ts': ['t1'],
                'test/beta.property.test.ts': ['t2'],
              }, { disableBail: false })
            ),
        ),
        When('contribution is measured for that run')(
          'verdict',
          (s) => Effect.sync(() => verdictOf(s.report, PROPERTY_SUFFIXES)),
        ),
        Then('the file that might be a redundant killer is spared and only the idle file is accused')((s) =>
          Effect.sync(() => {
            expect(s.verdict.disableBail).toBe(false)
            expect(s.verdict.toothless).toEqual(['test/beta.property.test.ts'])
          })
        ),
      ),
    )

    scenario(
      'Should_AccuseFileOnDisk_When_TheReportNeverMentionsIt',
      Gherkin.Do.pipe(
        Given('a property test file on disk that the run never recorded at all')(
          'report',
          () =>
            Effect.sync(() => reportOf([mutantOf('m1', 'Killed', ['t1'])], { 'test/alpha.property.test.ts': ['t1'] })),
        ),
        When('contribution is measured with that file discovered on disk')(
          'verdict',
          (s) =>
            Effect.sync(() =>
              verdictOf(s.report, PROPERTY_SUFFIXES, [
                'test/alpha.property.test.ts',
                'test/ghost.property.test.ts',
              ])
            ),
        ),
        Then('the unrecorded file is accused rather than silently passing')((s) =>
          Effect.sync(() => {
            expect(s.verdict.toothless).toEqual(['test/ghost.property.test.ts'])
            expect(s.verdict.byTestFile['test/ghost.property.test.ts']).toEqual({ soleKills: 0, totalKills: 0 })
          })
        ),
      ),
    )
    scenario(
      'Should_WithholdSoleCredit_When_AKillerCannotBePlacedInAFile',
      Gherkin.Do.pipe(
        Given('a mutant killed by one known test and one the report never declares')(
          'report',
          () =>
            Effect.sync(() =>
              reportOf([mutantOf('m1', 'Killed', ['t1', 'ghost'])], {
                'test/alpha.property.test.ts': ['t1'],
              })
            ),
        ),
        When('contribution is measured')(
          'verdict',
          (s) => Effect.sync(() => verdictOf(s.report, PROPERTY_SUFFIXES)),
        ),
        Then('the placeable file is not cleared on a kill it may not own alone')((s) =>
          Effect.sync(() => {
            expect(s.verdict.byTestFile['test/alpha.property.test.ts']).toEqual({ soleKills: 0, totalKills: 1 })
            expect(s.verdict.toothless).toEqual(['test/alpha.property.test.ts'])
          })
        ),
      ),
    )

    scenario(
      'Should_CountEveryAttributedKill_When_AllKillersAreDeclaredTestFiles',
      Gherkin.Do.pipe(
        Given('three mutants each killed by a test declared in a property test file')(
          'report',
          () =>
            Effect.sync(() =>
              reportOf(
                [
                  mutantOf('m1', 'Killed', ['t1']),
                  mutantOf('m2', 'Killed', ['t1']),
                  mutantOf('m3', 'Killed', ['t2']),
                ],
                { 'test/alpha.property.test.ts': ['t1', 't2'] },
              )
            ),
        ),
        When('contribution is measured')(
          'verdict',
          (s) => Effect.sync(() => verdictOf(s.report, PROPERTY_SUFFIXES)),
        ),
        Then('every kill is attributed to the file and none is unattributable')((s) =>
          Effect.sync(() => {
            expect(s.verdict.attributedKills).toBe(3)
            expect(s.verdict.unattributableKills).toBe(0)
            expect(s.verdict.byTestFile['test/alpha.property.test.ts']).toEqual({ soleKills: 3, totalKills: 3 })
          })
        ),
      ),
    )

    scenario(
      'Should_CountOnlyInScopeFiles_When_OneTestFileFallsOutsideTheSuffixes',
      Gherkin.Do.pipe(
        Given('two property test files and one integration test file in the report')(
          'report',
          () =>
            Effect.sync(() =>
              reportOf([mutantOf('m1', 'Killed', ['t1'])], {
                'test/alpha.property.test.ts': ['t1'],
                'test/beta.property.test.ts': ['t2'],
                'test/gamma.integration.test.ts': ['t3'],
              })
            ),
        ),
        When('contribution is measured for property tests only')(
          'verdict',
          (s) => Effect.sync(() => verdictOf(s.report, PROPERTY_SUFFIXES)),
        ),
        Then('the in-scope count reflects only the two property test files')((s) =>
          Effect.sync(() => {
            expect(s.verdict.inScopeCount).toBe(2)
          })
        ),
      ),
    )

    scenario(
      'Should_TreatFileAsInScope_When_ItMatchesAnyConfiguredSuffix',
      Gherkin.Do.pipe(
        Given('a spec file that kills nothing and a property test file that kills a mutant')(
          'report',
          () =>
            Effect.sync(() =>
              reportOf([mutantOf('m1', 'Killed', ['t1'])], {
                'test/alpha.property.test.ts': ['t1'],
                'test/beta.spec.ts': ['t2'],
              })
            ),
        ),
        When('contribution is measured for property and spec suffixes')(
          'verdict',
          (s) => Effect.sync(() => verdictOf(s.report, PROPERTY_AND_SPEC_SUFFIXES)),
        ),
        Then('the file matching only the second suffix is still held in scope')((s) =>
          Effect.sync(() => {
            expect(s.verdict.inScopeCount).toBe(2)
            expect(s.verdict.toothless).toEqual(['test/beta.spec.ts'])
          })
        ),
      ),
    )

    scenario(
      'Should_ReturnToothlessSorted_When_ToothlessFilesAreRecordedInReverseAlphabeticalOrder',
      Gherkin.Do.pipe(
        Given('two idle property test files recorded with the alphabetically later one first')(
          'report',
          () =>
            Effect.sync(() =>
              reportOf([mutantOf('m1', 'Killed', ['ghost'])], {
                'test/zeta.property.test.ts': ['t1'],
                'test/alpha.property.test.ts': ['t2'],
              })
            ),
        ),
        When('contribution is measured')(
          'verdict',
          (s) => Effect.sync(() => verdictOf(s.report, PROPERTY_SUFFIXES)),
        ),
        Then('the toothless list is returned in ascending alphabetical order')((s) =>
          Effect.sync(() => {
            expect(s.verdict.toothless).toEqual([
              'test/alpha.property.test.ts',
              'test/zeta.property.test.ts',
            ])
          })
        ),
      ),
    )

    scenario(
      'Should_AddNoPhantomTestFile_When_NoDiscoveredFilesArePassed',
      Gherkin.Do.pipe(
        Given('a report with a single property test file')(
          'report',
          () =>
            Effect.sync(() =>
              reportOf([mutantOf('m1', 'Killed', ['t1'])], {
                'test/alpha.property.test.ts': ['t1'],
              })
            ),
        ),
        When('contribution is measured without discovered files')(
          'verdict',
          (s) => Effect.sync(() => verdictOf(s.report, PROPERTY_SUFFIXES)),
        ),
        Then('the verdict names exactly the files the report recorded')((s) =>
          Effect.sync(() => {
            expect(Object.keys(s.verdict.byTestFile).sort()).toEqual(['test/alpha.property.test.ts'])
          })
        ),
      ),
    )

    scenario(
      'Should_ScopeToPropertyTestsOnly_When_TheDefaultSuffixesAreUsed',
      Gherkin.Do.pipe(
        Given('a run whose kills are split between a property test and an ordinary test')(
          'report',
          () =>
            Effect.sync(() =>
              reportOf([mutantOf('m1', 'Killed', ['t1']), mutantOf('m2', 'Killed', ['t2'])], {
                'test/alpha.property.test.ts': ['t1'],
                'test/beta.test.ts': ['t2'],
              })
            ),
        ),
        When('contribution is measured with the shipped defaults')(
          'verdict',
          (s) => Effect.sync(() => verdictOf(s.report, DEFAULT_SUFFIXES)),
        ),
        Then('only the property test is judged, and the ordinary test is left alone')((s) =>
          Effect.sync(() => {
            expect(s.verdict.inScopeCount).toBe(1)
            expect(s.verdict.byTestFile['test/beta.test.ts']).toEqual({ soleKills: 1, totalKills: 1 })
          })
        ),
      ),
    )
  })
