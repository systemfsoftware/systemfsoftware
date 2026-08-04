import type { schema } from '@stryker-mutator/api/core'

const LOCATION = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }

const EVERY_KILLER_RECORDED = true

export const mutantOf = (
  id: string,
  status: schema.MutantResult['status'],
  killedBy?: ReadonlyArray<string>,
): schema.MutantResult => ({
  id,
  location: LOCATION,
  mutatorName: 'BooleanLiteral',
  status,
  ...(killedBy === undefined ? {} : { killedBy: [...killedBy] }),
})

export interface RunShape {
  readonly disableBail?: boolean
  readonly projectRoot?: string
}

export type ReportFixture =
  & Pick<schema.MutationTestResult, 'files' | 'testFiles'>
  & {
    readonly config: { readonly disableBail: boolean }
    readonly projectRoot?: string
  }

export const reportOf = (
  mutants: ReadonlyArray<schema.MutantResult>,
  testFiles: Readonly<Record<string, ReadonlyArray<string>>>,
  run: RunShape = {},
): ReportFixture => ({
  files: {
    'src/subject.ts': {
      language: 'typescript',
      source: 'export const answer = 42',
      mutants: [...mutants],
    },
  },
  testFiles: Object.fromEntries(
    Object.entries(testFiles).map(([fileName, testIds]) => [
      fileName,
      { tests: testIds.map((id) => ({ id, name: `test ${id}` })) },
    ]),
  ),
  config: { disableBail: run.disableBail ?? EVERY_KILLER_RECORDED },
  ...(run.projectRoot === undefined ? {} : { projectRoot: run.projectRoot }),
})
