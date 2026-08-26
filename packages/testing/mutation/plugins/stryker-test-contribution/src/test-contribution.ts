import { schema } from '@systemfsoftware/stryker-js/Mutant'

export const defaultRequireTestContributionSuffixes = [
  '.workflow.property.test.ts',
  '.policy.property.test.ts',
  '.kernel.property.test.ts',
] as const

export interface TestFileContribution {
  readonly soleKills: number
  readonly totalKills: number
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

type ReportView = Pick<schema.MutationTestResult, 'files' | 'testFiles'>

const KILLING_STATUSES: ReadonlySet<string> = new Set(['Killed', 'Timeout'])

const testFileById = (
  testFiles: Readonly<Record<string, schema.TestFile>>,
): ReadonlyMap<string, string> => {
  const byId = new Map<string, string>()
  for (const [fileName, testFile] of Object.entries(testFiles)) {
    for (const test of testFile.tests) {
      byId.set(test.id, fileName)
    }
  }
  return byId
}

// A killer we cannot place in a file stands for itself, so it still counts as a distinct
// killer: the one file we did place never claims the mutant alone, and the unplaced key is
// not a test file, so no real file is credited for it.
const killersOf = (
  killedBy: readonly string[],
  fileById: ReadonlyMap<string, string>,
): ReadonlySet<string> => new Set(killedBy.map((testId) => fileById.get(testId) ?? testId))

export const contributionByTestFile = (
  report: ReportView,
): ReadonlyMap<string, TestFileContribution> => {
  const testFiles = report.testFiles ?? {}
  const fileById = testFileById(testFiles)
  const soleKills = new Map<string, number>()
  const totalKills = new Map<string, number>()
  const unattributed = new Set<string>()

  for (const file of Object.values(report.files)) {
    for (const mutant of file.mutants) {
      if (!KILLING_STATUSES.has(mutant.status)) continue
      const killers = killersOf(mutant.killedBy ?? [], fileById)
      // A kill nobody is credited with is still a kill. Whoever covered it may be the one
      // causing it, so they cannot be told that deleting them changes nothing.
      if (killers.size === 0) {
        const covered = mutant.coveredBy
        // `killersOf` places every id, falling back to the id itself, so an id that names no
        // test file lands in the set inert — no real file is ever spared on its account.
        if (covered !== undefined) { for (const fileName of killersOf(covered, fileById)) unattributed.add(fileName) }
        continue
      }
      const soleKill = killers.size === 1
      for (const fileName of killers) {
        totalKills.set(fileName, (totalKills.get(fileName) ?? 0) + 1)
        if (soleKill) soleKills.set(fileName, (soleKills.get(fileName) ?? 0) + 1)
      }
    }
  }

  const byTestFile = new Map<string, TestFileContribution>()
  for (const fileName of Object.keys(testFiles)) {
    byTestFile.set(fileName, {
      soleKills: soleKills.get(fileName) ?? 0,
      totalKills: totalKills.get(fileName) ?? 0,
      coversUnattributedKill: unattributed.has(fileName),
    })
  }
  return byTestFile
}

export const toothlessTestFiles = (
  contribution: ReadonlyMap<string, TestFileContribution>,
  { suffixes, everyKillerRecorded }: TestContributionInput,
): readonly string[] => {
  const toothless: string[] = []
  for (const [fileName, { soleKills, totalKills, coversUnattributedKill }] of contribution) {
    const defends = everyKillerRecorded ? soleKills > 0 : totalKills > 0
    const inScope = suffixes.some((suffix) => fileName.endsWith(suffix))
    // Covering a kill credited to nobody makes this file unmeasurable, not toothless: the
    // accusation is that deleting it changes nothing, and that cannot be shown here.
    if (!defends && inScope && !coversUnattributedKill) toothless.push(fileName)
  }
  return toothless.sort()
}

export interface TestContributionVerdict {
  readonly failed: boolean
  readonly message: string
}

// Past the bail guard, which returns before any verdict when killers went unrecorded.
const PRECISION = 'every killing test was recorded'

export const judgeTestContribution = (
  report: ReportView,
  everyKillerRecorded: boolean,
  suffixes: readonly string[] = defaultRequireTestContributionSuffixes,
): TestContributionVerdict => {
  const matches = suffixes.join(', ')
  const contribution = contributionByTestFile(report)
  const inScope = [...contribution.keys()].filter((fileName) => suffixes.some((suffix) => fileName.endsWith(suffix)))
  if (inScope.length === 0) {
    return { failed: false, message: `No test file matching ${matches} ran, so none was judged.` }
  }
  if (!everyKillerRecorded) {
    // Bail stops each mutant at its first killing test, so a second defender can go
    // unrecorded and the gate's claim — that deleting a file changes nothing — cannot be
    // made on this evidence. Refuse to judge rather than accuse, naming `disableBail: true`.
    return {
      failed: true,
      message:
        `This run used Stryker's bail mode, which stops each mutant at its first killing test. A test file's contribution therefore cannot be measured on this evidence. Set \`disableBail: true\` to record every killing test, or remove the test-contribution plugin from \`plugins\` to turn the check off for this run.`,
    }
  }
  // Zero attribution is the run failing to say who killed what, not every test failing to
  // defend: with no killer recorded anywhere, every file scores zero and the check would
  // accuse all of them. Blame the run, which is the thing that can actually be fixed.
  const creditedAnyKill = [...contribution.values()].some(({ totalKills }) => totalKills > 0)
  if (!creditedAnyKill) {
    return {
      failed: true,
      message:
        `This run credited no kill to any test file, so no test file's contribution to it can be measured. Until that is fixed the ${inScope.length} file(s) matching ${matches} are unjudged, not cleared.`,
    }
  }

  const toothless = toothlessTestFiles(contribution, { suffixes, everyKillerRecorded })

  if (toothless.length === 0) {
    return {
      failed: false,
      message: `Every test file matching ${matches} kills a mutant nothing else kills (${PRECISION}).`,
    }
  }
  const listed = toothless.map((fileName) => `  - ${fileName}`).join('\n')
  return {
    failed: true,
    message:
      `Deleting these ${toothless.length} test file(s) would leave every mutant just as dead (${PRECISION}):\n${listed}`,
  }
}
