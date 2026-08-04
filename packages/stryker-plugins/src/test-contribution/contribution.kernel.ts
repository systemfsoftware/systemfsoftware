export interface MutantView {
  readonly status?: string
  readonly killedBy?: ReadonlyArray<string>
}

export interface SourceFileView {
  readonly mutants: ReadonlyArray<MutantView>
}

export interface TestDefinitionView {
  readonly id: string
}

export interface TestFileView {
  readonly tests: ReadonlyArray<TestDefinitionView>
}

export interface RunConfigView {
  readonly disableBail?: boolean
}

export interface MutationReportView {
  readonly files: Readonly<Record<string, SourceFileView>>
  readonly testFiles?: Readonly<Record<string, TestFileView>>
  readonly projectRoot?: string
  readonly config?: RunConfigView
}

export interface TestFileContribution {
  readonly soleKills: number
  readonly totalKills: number
}

export interface ContributionReport {
  readonly byTestFile: ReadonlyMap<string, TestFileContribution>
  readonly attributedKills: number
  readonly unattributableKills: number
}

export interface TestContributionVerdict {
  readonly disableBail: boolean
  readonly attributedKills: number
  readonly unattributableKills: number
  readonly inScopeCount: number
  readonly toothless: ReadonlyArray<string>
  readonly byTestFile: Readonly<Record<string, TestFileContribution>>
}

export const DEFAULT_SUFFIXES: ReadonlyArray<string> = ['.property.test.ts']

const KILLING_STATUSES: ReadonlySet<string> = new Set(['Killed', 'Timeout'])

const testFileById = (
  testFiles: Readonly<Record<string, TestFileView>>,
): ReadonlyMap<string, string> => {
  const byId = new Map<string, string>()
  for (const [fileName, testFile] of Object.entries(testFiles)) {
    for (const test of testFile.tests) {
      byId.set(test.id, fileName)
    }
  }
  return byId
}

interface Killers {
  readonly files: ReadonlySet<string>
  readonly hasUnknown: boolean
}

const killingFilesOf = (
  killedBy: ReadonlyArray<string>,
  fileById: ReadonlyMap<string, string>,
): Killers => {
  const files = new Set<string>()
  let hasUnknown = false
  for (const testId of killedBy) {
    const fileName = fileById.get(testId)
    if (fileName === undefined) hasUnknown = true
    else files.add(fileName)
  }
  return { files, hasUnknown }
}

export const contributionByTestFile = (report: MutationReportView): ContributionReport => {
  const testFiles = report.testFiles ?? {}
  const fileById = testFileById(testFiles)
  const soleKills = new Map<string, number>()
  const totalKills = new Map<string, number>()
  for (const fileName of Object.keys(testFiles)) {
    soleKills.set(fileName, 0)
    totalKills.set(fileName, 0)
  }

  let attributedKills = 0
  let unattributableKills = 0
  for (const file of Object.values(report.files)) {
    for (const mutant of file.mutants) {
      if (mutant.status === undefined || !KILLING_STATUSES.has(mutant.status)) continue
      const killedBy = mutant.killedBy
      if (killedBy === undefined) {
        unattributableKills += 1
        continue
      }
      const { files: killers, hasUnknown } = killingFilesOf(killedBy, fileById)
      if (killers.size === 0) {
        unattributableKills += 1
        continue
      }
      attributedKills += 1
      // A killer we cannot place in a file may well be a second killer, so the one file
      // we did place cannot claim the mutant alone - crediting a sole kill here would
      // clear a file that another test also defends.
      const soleKill = killers.size === 1 && !hasUnknown
      for (const fileName of killers) {
        totalKills.set(fileName, (totalKills.get(fileName) ?? 0) + 1)
        if (soleKill) {
          soleKills.set(fileName, (soleKills.get(fileName) ?? 0) + 1)
        }
      }
    }
  }

  const byTestFile = new Map<string, TestFileContribution>()
  for (const fileName of totalKills.keys()) {
    byTestFile.set(fileName, {
      soleKills: soleKills.get(fileName) ?? 0,
      totalKills: totalKills.get(fileName) ?? 0,
    })
  }
  return { byTestFile, attributedKills, unattributableKills }
}

export const toothlessTestFiles = (
  contribution: ContributionReport,
  isInScope: (fileName: string) => boolean,
  everyKillerRecorded: boolean,
): ReadonlyArray<string> => {
  const toothless: string[] = []
  for (const [fileName, { soleKills, totalKills }] of contribution.byTestFile) {
    const defends = everyKillerRecorded ? soleKills > 0 : totalKills > 0
    if (!defends && isInScope(fileName)) toothless.push(fileName)
  }
  return toothless.sort()
}

const withDiscovered = (
  contribution: ContributionReport,
  discoveredTestFiles: ReadonlyArray<string>,
): ContributionReport => {
  const byTestFile = new Map(contribution.byTestFile)
  for (const fileName of discoveredTestFiles) {
    if (!byTestFile.has(fileName)) byTestFile.set(fileName, { soleKills: 0, totalKills: 0 })
  }
  return { ...contribution, byTestFile }
}

export const verdictOf = (
  report: MutationReportView,
  suffixes: ReadonlyArray<string>,
  discoveredTestFiles: ReadonlyArray<string> = [],
): TestContributionVerdict => {
  // Precision belongs to the run that produced this report, not to the config file as it
  // stands today: reading the live config lets a later toggle relabel old data, and the
  // flag decides whether a file is judged on sole kills or on any kill at all.
  const disableBail = report.config?.disableBail === true
  const contribution = withDiscovered(contributionByTestFile(report), discoveredTestFiles)
  const inScope = (fileName: string): boolean => suffixes.some((suffix) => fileName.endsWith(suffix))
  let inScopeCount = 0
  for (const fileName of contribution.byTestFile.keys()) {
    if (inScope(fileName)) inScopeCount += 1
  }
  return {
    disableBail,
    attributedKills: contribution.attributedKills,
    unattributableKills: contribution.unattributableKills,
    inScopeCount,
    toothless: toothlessTestFiles(contribution, inScope, disableBail),
    byTestFile: Object.fromEntries(contribution.byTestFile),
  }
}
