import path from 'node:path'

import { type CheckResult, CheckStatus, type PassedCheckResult } from '@systemfsoftware/stryker-js-plugin-api/check'
import type {
  Location,
  MutantResult,
  MutantStatus,
  MutantTestCoverage,
  schema,
} from '@systemfsoftware/stryker-js-plugin-api/core'
import { normalizeFileName } from '@systemfsoftware/stryker-js-plugin-api/core'
import { type MutantRunResult, MutantRunStatus } from '@systemfsoftware/stryker-js-plugin-api/test-runner'

import { toSchemaLocation } from './report-location.js'

export const checkStatusToMutantStatus = (
  status: Exclude<CheckStatus, CheckStatus.Passed>,
): MutantStatus => {
  switch (status) {
    case CheckStatus.CompileError: {
      return 'CompileError'
    }
    default: {
      return 'CompileError'
    }
  }
}

export const mapCheckResult = (
  mutant: MutantTestCoverage,
  result: Exclude<CheckResult, PassedCheckResult>,
): MutantResult => ({
  ...mutant,
  status: checkStatusToMutantStatus(result.status),
  statusReason: result.reason,
  location: toSchemaLocation(mutant.location),
})

export const mapRunResult = (mutant: MutantTestCoverage, result: MutantRunResult): MutantResult => {
  const location = toSchemaLocation(mutant.location)
  switch (result.status) {
    case MutantRunStatus.Error: {
      return {
        ...mutant,
        status: 'RuntimeError',
        statusReason: result.errorMessage,
        location,
      }
    }
    case MutantRunStatus.Killed: {
      return {
        ...mutant,
        status: 'Killed',
        testsCompleted: result.nrOfTests,
        killedBy: result.killedBy,
        statusReason: result.failureMessage,
        location,
      }
    }
    case MutantRunStatus.Timeout: {
      return {
        ...mutant,
        status: 'Timeout',
        ...(result.reason === undefined ? {} : { statusReason: result.reason }),
        location,
      }
    }
    case MutantRunStatus.Survived: {
      return {
        ...mutant,
        status: 'Survived',
        testsCompleted: result.nrOfTests,
        location,
      }
    }
    default: {
      return {
        ...mutant,
        status: 'Survived',
        location,
      }
    }
  }
}

export const determineLanguage = (name: string): string => {
  const ext = path.extname(name).toLowerCase()
  switch (ext) {
    case '.ts':
    case '.tsx': {
      return 'typescript'
    }
    case '.html':
    case '.vue': {
      return 'html'
    }
    default: {
      return 'javascript'
    }
  }
}

export const normalizeReportFileName = (basePath: string, fileName: string | undefined): string => {
  if (fileName) {
    return normalizeFileName(path.relative(basePath, fileName))
  }
  return ''
}
