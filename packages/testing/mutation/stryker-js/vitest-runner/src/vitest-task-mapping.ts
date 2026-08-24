import path from 'path'

import { MutantCoverage, normalizeFileName } from '@systemfsoftware/stryker-js-plugin-api/core'
import { BaseTestResult, TestResult, TestStatus } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import { type RunMode, type RunnerTestSuite, type TaskState } from 'vitest'
import { RunnerTestCase } from 'vitest/node'
import { collectTestName, toRawTestId } from './test-identity.js'

function convertTaskStateToTestStatus(
  taskState: TaskState | undefined,
  testMode: RunMode,
): TestStatus {
  if (testMode === 'skip') {
    return TestStatus.Skipped
  }
  switch (taskState) {
    case 'pass':
      return TestStatus.Success
    case 'fail':
      return TestStatus.Failed
    case 'skip':
    case 'todo':
      return TestStatus.Skipped
    // States only observable while a run is in flight. Results are read after
    // the run finished, so a leftover in-flight state is a failure.
    case undefined:
    case 'queued':
    case 'run':
    case 'only':
      return TestStatus.Failed
  }
}

export function convertTestToTestResult(test: RunnerTestCase, projectRoot: string): TestResult {
  const status = convertTaskStateToTestStatus(test.result?.state, test.mode)
  const baseTestResult: BaseTestResult = {
    id: normalizeTestId(toRawTestId(test), projectRoot),
    name: collectTestName(test),
    timeSpentMs: test.result?.duration ?? 0,
    fileName: test.file?.filepath && path.resolve(test.file.filepath),
  }
  if (status === TestStatus.Failed) {
    return {
      ...baseTestResult,
      status,
      failureMessage: test.result?.errors?.[0]?.message ?? 'StrykerJS: Unknown test failure',
    }
  } else if (status === TestStatus.Skipped) {
    const suiteError = findSuiteError(test.suite)
    if (suiteError) {
      return {
        ...baseTestResult,
        status: TestStatus.Failed,
        failureMessage: suiteError,
      }
    }
  }

  return {
    ...baseTestResult,
    status,
  }
}

function findSuiteError(
  suite: RunnerTestSuite | undefined,
): string | undefined {
  if (!suite) {
    return undefined
  }

  if (suite.result?.state === 'fail') {
    return (
      suite.result?.errors?.[0]?.message ?? 'StrykerJS: Suite execution failed'
    )
  }

  return findSuiteError(suite.suite)
}

export function fromTestId(id: string): { file: string; test: string } {
  const [file, ...name] = id.split('#')
  return { file, test: name.join('#') }
}

export function normalizeTestId(id: string, projectRoot: string): string {
  const { file, test } = fromTestId(id)
  return `${normalizeFileName(path.relative(projectRoot, file))}#${test}`
}

export function normalizeCoverage(rawCoverage: MutantCoverage, projectRoot: string): MutantCoverage {
  return {
    perTest: Object.fromEntries(
      Object.entries(rawCoverage.perTest).map(
        ([rawTestId, coverageData]) => [normalizeTestId(rawTestId, projectRoot), coverageData] as const,
      ),
    ),
    static: rawCoverage.static,
  }
}

export function collectTestsFromSuite(
  suite: RunnerTestSuite,
): RunnerTestCase[] {
  return suite.tasks.flatMap((task) => {
    if (task.type === 'suite') {
      return collectTestsFromSuite(task)
    } else if (task.type === 'test') {
      return task
    } else {
      return []
    }
  })
}

export function isErrorCodeError(
  error: unknown,
): error is Error & { code: string } {
  return (
    error instanceof Error && 'code' in error && typeof error.code === 'string'
  )
}

/** @see https://github.com/vitest-dev/vitest/blob/main/packages/vitest/src/node/errors.ts */
export const VITEST_ERROR_CODES = Object.freeze({
  FILES_NOT_FOUND: 'VITEST_FILES_NOT_FOUND',
})
