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

export interface MutationReportView {
  readonly files: Readonly<Record<string, SourceFileView>>
  readonly testFiles?: Readonly<Record<string, TestFileView>>
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

const killingFilesOf = (
  mutant: MutantView,
  fileById: ReadonlyMap<string, string>,
): ReadonlySet<string> => {
  const files = new Set<string>()
  for (const testId of mutant.killedBy ?? []) {
    const fileName = fileById.get(testId)
    if (fileName !== undefined) files.add(fileName)
  }
  return files
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
      const killers = killingFilesOf(mutant, fileById)
      if (killers.size === 0) {
        unattributableKills += 1
        continue
      }
      attributedKills += 1
      for (const fileName of killers) {
        totalKills.set(fileName, (totalKills.get(fileName) ?? 0) + 1)
        if (killers.size === 1) {
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
  disableBail: boolean,
  suffixes: ReadonlyArray<string>,
  discoveredTestFiles: ReadonlyArray<string> = [],
): TestContributionVerdict => {
  const contribution = withDiscovered(contributionByTestFile(report), discoveredTestFiles)
  const inScope = (fileName: string): boolean => suffixes.some((suffix) => fileName.endsWith(suffix))
  return {
    disableBail,
    attributedKills: contribution.attributedKills,
    unattributableKills: contribution.unattributableKills,
    toothless: toothlessTestFiles(contribution, inScope, disableBail),
    byTestFile: Object.fromEntries(contribution.byTestFile),
  }
}
