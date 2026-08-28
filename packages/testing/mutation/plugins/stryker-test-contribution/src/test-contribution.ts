import { schema } from '@systemfsoftware/stryker-js/Mutant'

/** @public */
export const defaultRequireTestContributionSuffixes = [
  '.workflow.property.test.ts',
  '.policy.property.test.ts',
  '.kernel.property.test.ts',
] as const

/** @public */
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

/** @public */
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

// A killer we cannot place in a file still counts as a distinct killer for the sole-credit
// test (a `[real, ghost]` pair never lets the real file claim the mutant alone), and the
// unplaced key is not a test file, so it never credits or exempts a real file.
const killersOf = (
  killedBy: readonly string[],
  fileById: ReadonlyMap<string, string>,
): ReadonlySet<string> => new Set(killedBy.map((testId) => fileById.get(testId) ?? testId))

/** The real test files an id list maps to; ids naming no file are dropped as inert. */
const realFiles = (
  testIds: readonly string[],
  fileById: ReadonlyMap<string, string>,
): ReadonlySet<string> => {
  const files = new Set<string>()
  for (const testId of testIds) {
    const fileName = fileById.get(testId)
    if (fileName !== undefined) files.add(fileName)
  }
  return files
}

/** @public */
export const contributionByTestFile = (
  report: ReportView,
): ReadonlyMap<string, TestFileContribution> => {
  const testFiles = report.testFiles ?? {}
  const fileById = testFileById(testFiles)
  const soleKills = new Map<string, number>()
  const totalKills = new Map<string, number>()
  const killableCovered = new Map<string, number>()
  const unattributed = new Set<string>()

  for (const file of Object.values(report.files)) {
    for (const mutant of file.mutants) {
      if (mutant.status !== 'Ignored') {
        for (const fileName of realFiles(mutant.coveredBy ?? [], fileById)) {
          killableCovered.set(fileName, (killableCovered.get(fileName) ?? 0) + 1)
        }
      }
      if (!KILLING_STATUSES.has(mutant.status)) continue
      const killers = killersOf(mutant.killedBy ?? [], fileById)
      const realKillers = realFiles(mutant.killedBy ?? [], fileById)
      // A kill no real file is credited with is still a kill, and an id naming no file is
      // not a test file at all. The coverers may be what causes it, so they cannot be told
      // deleting them changes nothing. An all-unmapped `killedBy` lands here exactly as an
      // empty one does; the inert ids are dropped and never spare anyone.
      if (realKillers.size === 0) {
        const covered = mutant.coveredBy
        if (covered !== undefined) {
          for (const fileName of realFiles(covered, fileById)) unattributed.add(fileName)
        }
        continue
      }
      const soleKill = killers.size === 1
      for (const fileName of realKillers) {
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
      killableCovered: killableCovered.get(fileName) ?? 0,
      coversUnattributedKill: unattributed.has(fileName),
    })
  }
  return byTestFile
}

/** @public */
export const toothlessTestFiles = (
  contribution: ReadonlyMap<string, TestFileContribution>,
  { suffixes, everyKillerRecorded }: TestContributionInput,
): readonly string[] => {
  const toothless: string[] = []
  for (const [fileName, { soleKills, totalKills, coversUnattributedKill, killableCovered }] of contribution) {
    const defends = everyKillerRecorded ? soleKills > 0 : totalKills > 0
    // Covering a kill credited to nobody makes this file unmeasurable, not toothless: the
    // accusation is that deleting it changes nothing, and that cannot be shown here. A file
    // the report gave no killable, covered mutant is unjudged for the same reason — it had
    // nothing it could kill, so the report cannot say deleting it changes nothing.
    if (!defends && isInScope(fileName, suffixes) && !coversUnattributedKill && killableCovered > 0) {
      toothless.push(fileName)
    }
  }
  return toothless.sort()
}

/** @public */
export interface TestContributionVerdict {
  readonly failed: boolean
  readonly message: string
}

// Past the bail guard, which returns before any verdict when killers went unrecorded.
const PRECISION = 'every killing test was recorded'

/** Past the bail guard, a file defends itself only by a sole kill. */
const defendsUniquely = (
  contribution: ReadonlyMap<string, TestFileContribution>,
  fileName: string,
): boolean => (contribution.get(fileName)?.soleKills ?? 0) > 0

/** Whether a file is a gate target — its name carries one of the required suffixes. */
const isInScope = (fileName: string, suffixes: readonly string[]): boolean =>
  suffixes.some((suffix) => fileName.endsWith(suffix))

/**
 * Joint subsumption over an accused set: every mutant some accused file kills
 * retains at least one killer outside the accused set. Only then does deleting
 * the whole set leave every mutant just as dead.
 */
const jointSubsumption = (
  report: ReportView,
  accused: readonly string[],
  fileById: ReadonlyMap<string, string>,
): boolean => {
  const accusedSet = new Set(accused)
  for (const file of Object.values(report.files)) {
    for (const mutant of file.mutants) {
      if (!KILLING_STATUSES.has(mutant.status)) continue
      const killers = realFiles(mutant.killedBy ?? [], fileById)
      if (killers.size === 0) continue // unattributed kill — cannot testify against the accused
      let killsAccused = false
      let killsOutside = false
      for (const fileName of killers) {
        if (accusedSet.has(fileName)) killsAccused = true
        else killsOutside = true
      }
      if (killsAccused && !killsOutside) return false
    }
  }
  return true
}

/** @public */
export const judgeTestContribution = (
  report: ReportView,
  everyKillerRecorded: boolean,
  suffixes: readonly string[] = defaultRequireTestContributionSuffixes,
): TestContributionVerdict => {
  const matches = suffixes.join(', ')
  const contribution = contributionByTestFile(report)
  const inScope = [...contribution.keys()].filter((fileName) => isInScope(fileName, suffixes))
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
    const everyDefends = inScope.every((fileName) => defendsUniquely(contribution, fileName))
    if (everyDefends) {
      return {
        failed: false,
        message: `Every test file matching ${matches} kills a mutant nothing else kills (${PRECISION}).`,
      }
    }
    // Some in-scope file was exempted (covers an unattributed kill) or unjudged (the report
    // offered it no killable, covered mutant). The unique-kill sentence would be false for
    // it, so state the honest judged/exempt/unjudged counts instead — never the blanket claim.
    // A non-defending file where toothless is empty is exempt or unjudged — exactly one
    // class, so classify it in a single pass rather than a chain of filters.
    const judged: string[] = []
    const exempt: string[] = []
    const unjudged: string[] = []
    for (const fileName of inScope) {
      if (defendsUniquely(contribution, fileName)) {
        judged.push(fileName)
      } else {
        const c = contribution.get(fileName)
        if (c?.coversUnattributedKill === true) exempt.push(fileName)
        else unjudged.push(fileName)
      }
    }
    const parts: string[] = []
    if (judged.length > 0) parts.push(`${judged.length} judged (kill a mutant nothing else kills)`)
    if (exempt.length > 0) parts.push(`${exempt.length} exempted (cover a kill attributed to no test file)`)
    if (unjudged.length > 0) parts.push(`${unjudged.length} unjudged (offered no killable, covered mutant)`)
    return { failed: false, message: `Every file matching ${matches} was reviewed: ${parts.join('; ')}.` }
  }

  const testFiles = report.testFiles ?? {}
  const fileById = testFileById(testFiles)
  const listed = toothless.map((fileName) => `  - ${fileName}`).join('\n')
  if (!jointSubsumption(report, toothless, fileById)) {
    return {
      failed: true,
      message:
        `Deleting these ${toothless.length} test file(s) together would not leave every mutant just as dead: some mutant only they kill would be resurrected (${PRECISION}). Each is individually redundant, but the joint claim is not made on this evidence:\n${listed}`,
    }
  }
  return {
    failed: true,
    message:
      `Deleting these ${toothless.length} test file(s) would leave every mutant just as dead (${PRECISION}):\n${listed}`,
  }
}
