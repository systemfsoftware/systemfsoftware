import type * as schema from '@systemfsoftware/stryker-js'
import * as Match from 'effect/Match'

export const defaultRequireTestContributionSuffixes = [
  '.workflow.property.test.ts',
  '.policy.property.test.ts',
  '.kernel.property.test.ts',
] as const

export interface TestFileContribution {
  readonly soleKills: number
  readonly totalKills: number
  /**
   * How many non-`Ignored` mutants this test file covers. Zero means the report
   * offered the file nothing it could kill, so it is unjudged (unauditable)
   * rather than toothless — the deletion accusation requires the file to have
   * been given a live mutant to defend.
   */
  readonly killableCovered: number
  /**
   * Whether this file covers a killing mutant that no test file was credited with.
   *
   * A `Timeout` counts as a kill but arrives with `killedBy: []` — the runner cannot say
   * which test hung, so the kill is real and attributable to nobody. Deleting a file that
   * covers one could resurrect it, which is precisely the claim this check makes, so such
   * a file is unmeasurable rather than toothless.
   */
  readonly coversUnattributedKill: boolean
}

export interface TestContributionInput {
  readonly suffixes: readonly string[]
  /**
   * Whether the run recorded every killing test rather than stopping at the first.
   *
   * Under bail Stryker stops a mutant at its first killer, so a second defender can go
   * unrecorded and sole-kill counts are not trustworthy. The gate then refuses to reach a
   * verdict at all rather than falling back to a weaker accusation.
   */
  readonly everyKillerRecorded: boolean
}

export interface TestContributionVerdict {
  readonly failed: boolean
  readonly message: string
}

type ReportView = Pick<schema.MutationTestResult, 'files' | 'testFiles'>

type TestFileById = ReadonlyMap<string, string>

type ContributionEntry = readonly [string, TestFileContribution]

const KILLING_STATUSES: Readonly<Record<string, true>> = { Killed: true, Timeout: true }

const PRECISION = 'every killing test was recorded'

const testFilesOf = (report: ReportView): Readonly<Record<string, schema.TestFile>> => report.testFiles ?? {}

const isDefined = <T>(value: T | undefined): value is T => value !== undefined

const testFileById = (testFiles: Readonly<Record<string, schema.TestFile>>): TestFileById =>
  new Map(
    Object.entries(testFiles).flatMap(([fileName, testFile]) =>
      testFile.tests.map((test): readonly [string, string] => [test.id, fileName])
    ),
  )

const idsOf = (testIds: readonly string[] | undefined): readonly string[] => testIds ?? []

const realFiles = (testIds: readonly string[], fileById: TestFileById): ReadonlySet<string> =>
  new Set(testIds.map((testId) => fileById.get(testId)).filter(isDefined))

const killersOf = (killedBy: readonly string[], fileById: TestFileById): ReadonlySet<string> =>
  new Set(killedBy.map((testId) => fileById.get(testId) ?? testId))

const isKillingMutant = (mutant: schema.MutantResult): boolean => KILLING_STATUSES[mutant.status] === true

const isKillableMutant = (mutant: schema.MutantResult): boolean => mutant.status !== 'Ignored'

const realKillersOf = (mutant: schema.MutantResult, fileById: TestFileById): ReadonlySet<string> =>
  realFiles(idsOf(mutant.killedBy), fileById)

const realCoverersOf = (mutant: schema.MutantResult, fileById: TestFileById): ReadonlySet<string> =>
  realFiles(idsOf(mutant.coveredBy), fileById)

interface Kill {
  readonly mutant: schema.MutantResult
  readonly killers: ReadonlySet<string>
  readonly claimedAlone: boolean
}

const killOf = (mutant: schema.MutantResult, fileById: TestFileById): Kill => ({
  mutant,
  killers: realKillersOf(mutant, fileById),
  claimedAlone: killersOf(idsOf(mutant.killedBy), fileById).size === 1,
})

const mutantsOf = (report: ReportView): readonly schema.MutantResult[] =>
  Object.values(report.files).flatMap((file) => file.mutants)

const killsOf = (mutants: readonly schema.MutantResult[], fileById: TestFileById): readonly Kill[] =>
  mutants.filter(isKillingMutant).map((mutant) => killOf(mutant, fileById))

const isUnattributedKill = (kill: Kill): boolean => kill.killers.size === 0

const countOf = (counts: ReadonlyMap<string, number>, fileName: string): number => counts.get(fileName) ?? 0

const incrementCount = (counts: Map<string, number>, fileName: string): Map<string, number> => {
  counts.set(fileName, countOf(counts, fileName) + 1)
  return counts
}

const countBy = (fileNames: Iterable<string>): ReadonlyMap<string, number> =>
  [...fileNames].reduce(incrementCount, new Map<string, number>())

interface ContributionTally {
  readonly soleKills: ReadonlyMap<string, number>
  readonly totalKills: ReadonlyMap<string, number>
  readonly killableCovered: ReadonlyMap<string, number>
  readonly unattributed: ReadonlySet<string>
}

const tallyOf = (mutants: readonly schema.MutantResult[], fileById: TestFileById): ContributionTally => {
  const kills = killsOf(mutants, fileById)
  return {
    soleKills: countBy(kills.filter((kill) => kill.claimedAlone).flatMap((kill) => [...kill.killers])),
    totalKills: countBy(kills.flatMap((kill) => [...kill.killers])),
    killableCovered: countBy(
      mutants.filter(isKillableMutant).flatMap((mutant) => [...realCoverersOf(mutant, fileById)]),
    ),
    unattributed: new Set(
      kills.filter(isUnattributedKill).flatMap((kill) => [...realCoverersOf(kill.mutant, fileById)]),
    ),
  }
}

const fileContributionOf = (fileName: string, tally: ContributionTally): TestFileContribution => ({
  soleKills: countOf(tally.soleKills, fileName),
  totalKills: countOf(tally.totalKills, fileName),
  killableCovered: countOf(tally.killableCovered, fileName),
  coversUnattributedKill: tally.unattributed.has(fileName),
})

const contributionTableOf = (
  mutants: readonly schema.MutantResult[],
  testFiles: Readonly<Record<string, schema.TestFile>>,
  fileById: TestFileById,
): ReadonlyMap<string, TestFileContribution> => {
  const tally = tallyOf(mutants, fileById)
  return new Map(
    Object.keys(testFiles).map((fileName): ContributionEntry => [fileName, fileContributionOf(fileName, tally)]),
  )
}

export const contributionByTestFile = (report: ReportView): ReadonlyMap<string, TestFileContribution> => {
  const testFiles = testFilesOf(report)
  return contributionTableOf(mutantsOf(report), testFiles, testFileById(testFiles))
}

const isInScope = (fileName: string, suffixes: readonly string[]): boolean =>
  suffixes.some((suffix) => fileName.endsWith(suffix))

const defends = (entry: TestFileContribution, everyKillerRecorded: boolean): boolean =>
  Match.value(everyKillerRecorded).pipe(
    Match.when(true, () => entry.soleKills > 0),
    Match.when(false, () => entry.totalKills > 0),
    Match.exhaustive,
  )

export const toothlessTestFiles = (
  contribution: ReadonlyMap<string, TestFileContribution>,
  { suffixes, everyKillerRecorded }: TestContributionInput,
): readonly string[] =>
  [...contribution]
    .filter(([fileName]) => isInScope(fileName, suffixes))
    .filter(([, entry]) => !defends(entry, everyKillerRecorded))
    .filter(([, entry]) => entry.killableCovered > 0)
    .filter(([, entry]) => !entry.coversUnattributedKill)
    .map(([fileName]) => fileName)
    .sort()

const jointSubsumption = (report: ReportView, accused: readonly string[], fileById: TestFileById): boolean => {
  const accusedSet = new Set(accused)
  return killsOf(mutantsOf(report), fileById).every((kill) => isKilledOutside(kill, accusedSet))
}

const isKilledOutside = (kill: Kill, accusedSet: ReadonlySet<string>): boolean =>
  isUnattributedKill(kill) || hasKillerOutside(kill.killers, accusedSet)

const hasKillerOutside = (killers: ReadonlySet<string>, accusedSet: ReadonlySet<string>): boolean =>
  [...killers].some((fileName) => !accusedSet.has(fileName))

interface Judgement {
  readonly report: ReportView
  readonly fileById: TestFileById
  readonly matches: string
  readonly contribution: ReadonlyMap<string, TestFileContribution>
  readonly inScope: readonly ContributionEntry[]
  readonly everyKillerRecorded: boolean
  readonly toothless: readonly string[]
}

type JudgingRule = (judgement: Judgement) => TestContributionVerdict | undefined

const isVerdict = (verdict: TestContributionVerdict | undefined): verdict is TestContributionVerdict =>
  verdict !== undefined

const inScopeEntriesOf = (
  contribution: ReadonlyMap<string, TestFileContribution>,
  suffixes: readonly string[],
): readonly ContributionEntry[] => [...contribution].filter(([fileName]) => isInScope(fileName, suffixes))

const creditedAnyKill = (contribution: ReadonlyMap<string, TestFileContribution>): boolean =>
  [...contribution.values()].some(({ totalKills }) => totalKills > 0)

const ruleUnless = (
  holds: boolean,
  verdict: () => TestContributionVerdict,
): TestContributionVerdict | undefined =>
  Match.value(holds).pipe(
    Match.when(true, () => undefined),
    Match.when(false, verdict),
    Match.exhaustive,
  )

const ruleNoInScopeFile = (judgement: Judgement): TestContributionVerdict | undefined =>
  ruleUnless(judgement.inScope.length > 0, () => ({
    failed: false,
    message: `No test file matching ${judgement.matches} ran, so none was judged.`,
  }))

const ruleBailHidesKillers = (judgement: Judgement): TestContributionVerdict | undefined =>
  ruleUnless(judgement.everyKillerRecorded, () => ({
    failed: true,
    message:
      `This run used Stryker's bail mode, which stops each mutant at its first killing test. A test file's contribution therefore cannot be measured on this evidence. Set \`disableBail: true\` to record every killing test, or remove the test-contribution plugin from \`plugins\` to turn the check off for this run.`,
  }))

const ruleNoKillCredited = (judgement: Judgement): TestContributionVerdict | undefined =>
  ruleUnless(creditedAnyKill(judgement.contribution), () => ({
    failed: true,
    message:
      `This run credited no kill to any test file, so no test file's contribution to it can be measured. Until that is fixed the ${judgement.inScope.length} file(s) matching ${judgement.matches} are unjudged, not cleared.`,
  }))

const ruleNoToothlessFile = (judgement: Judgement): TestContributionVerdict | undefined =>
  ruleUnless(judgement.toothless.length > 0, () => reviewedVerdict(judgement))

const reviewedVerdict = (judgement: Judgement): TestContributionVerdict =>
  Match.value(judgement.inScope.every(([, entry]) => entry.soleKills > 0)).pipe(
    Match.when(true, () => ({
      failed: false,
      message: `Every test file matching ${judgement.matches} kills a mutant nothing else kills (${PRECISION}).`,
    })),
    Match.when(false, () => ({
      failed: false,
      message: `Every file matching ${judgement.matches} was reviewed: ${reviewedCounts(judgement).join('; ')}.`,
    })),
    Match.exhaustive,
  )

const reviewedCounts = (judgement: Judgement): readonly string[] => [
  ...countedPart(judgedFiles(judgement).length, 'judged (kill a mutant nothing else kills)'),
  ...countedPart(exemptFiles(judgement).length, 'exempted (cover a kill attributed to no test file)'),
  ...countedPart(unjudgedFiles(judgement).length, 'unjudged (offered no killable, covered mutant)'),
]

const countedPart = (count: number, label: string): readonly string[] =>
  Match.value(count > 0).pipe(
    Match.when(true, (): readonly string[] => [`${count} ${label}`]),
    Match.when(false, (): readonly string[] => []),
    Match.exhaustive,
  )

const judgedFiles = (judgement: Judgement): readonly ContributionEntry[] =>
  judgement.inScope.filter(([, entry]) => entry.soleKills > 0)

const exemptFiles = (judgement: Judgement): readonly ContributionEntry[] =>
  judgement.inScope.filter(([, entry]) => isExempt(entry))

const unjudgedFiles = (judgement: Judgement): readonly ContributionEntry[] =>
  judgement.inScope.filter(([, entry]) => isUnjudged(entry))

const isExempt = (entry: TestFileContribution): boolean => entry.soleKills === 0 && entry.coversUnattributedKill

const isUnjudged = (entry: TestFileContribution): boolean => entry.soleKills === 0 && !entry.coversUnattributedKill

const accusedVerdict = (judgement: Judgement): TestContributionVerdict =>
  Match.value(jointSubsumption(judgement.report, judgement.toothless, judgement.fileById)).pipe(
    Match.when(true, () => jointlyDeletableVerdict(judgement)),
    Match.when(false, () => notJointlyDeletableVerdict(judgement)),
    Match.exhaustive,
  )

const jointlyDeletableVerdict = (judgement: Judgement): TestContributionVerdict => ({
  failed: true,
  message:
    `Deleting these ${judgement.toothless.length} test file(s) would leave every mutant just as dead (${PRECISION}):\n${
      bulletedFiles(judgement.toothless)
    }`,
})

const notJointlyDeletableVerdict = (judgement: Judgement): TestContributionVerdict => ({
  failed: true,
  message:
    `Deleting these ${judgement.toothless.length} test file(s) together would not leave every mutant just as dead: some mutant only they kill would be resurrected (${PRECISION}). Each is individually redundant, but the joint claim is not made on this evidence:\n${
      bulletedFiles(judgement.toothless)
    }`,
})

const bulletedFiles = (fileNames: readonly string[]): string =>
  fileNames.map((fileName) => `  - ${fileName}`).join('\n')

const JUDGING_RULES: readonly JudgingRule[] = [
  ruleNoInScopeFile,
  ruleBailHidesKillers,
  ruleNoKillCredited,
  ruleNoToothlessFile,
]

const verdictOf = (judgement: Judgement): TestContributionVerdict =>
  JUDGING_RULES.map((rule) => rule(judgement)).find(isVerdict) ?? accusedVerdict(judgement)

const judgementOf = (report: ReportView, everyKillerRecorded: boolean, suffixes: readonly string[]): Judgement => {
  const testFiles = testFilesOf(report)
  const fileById = testFileById(testFiles)
  const contribution = contributionTableOf(mutantsOf(report), testFiles, fileById)
  return {
    report,
    fileById,
    matches: suffixes.join(', '),
    contribution,
    inScope: inScopeEntriesOf(contribution, suffixes),
    everyKillerRecorded,
    toothless: toothlessTestFiles(contribution, { suffixes, everyKillerRecorded }),
  }
}

export const judgeTestContribution = (
  report: ReportView,
  everyKillerRecorded: boolean,
  suffixes: readonly string[] = defaultRequireTestContributionSuffixes,
): TestContributionVerdict => verdictOf(judgementOf(report, everyKillerRecorded, suffixes))
