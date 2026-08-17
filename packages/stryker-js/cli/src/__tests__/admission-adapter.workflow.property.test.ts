import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import { defaultOptions } from '@systemfsoftware/stryker-js-mutation-run/config/config-resolution'
import type { StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import * as Result from 'effect/Result'
import { FastCheck as fc } from 'effect/testing'
import { admissionAdapter } from '../admission-adapter.workflow.js'
import type { AdmitSurvivorsRunInput } from '../survivors.kernel.js'

const hashContent = (content: string): string => content
const resolveAbsolutePath = (path: string): string => path

// `defaultOptions` is deep-frozen (`Immutable<StrykerOptions>`); the adapter only
// threads it through, so the readonly wrapper is widened to the mutable type it is.
const resolvedOptions: StrykerOptions = defaultOptions as StrykerOptions

describe('admissionAdapter', () => {
  it.prop('∀p_AdmissionAdapter_≡NoReport', [fc.string()], ([priorReportPath]) => {
    const input: AdmitSurvivorsRunInput = {
      priorReport: undefined,
      currentConfig: {},
      frameworkVersion: 'test',
      sourceContentHashes: {},
      hashContent,
      resolveAbsolutePath,
    }
    const result = admissionAdapter({ resolvedOptions, priorReportPath, input })
    return Result.match(result, {
      onFailure: (rejection) => rejection.reason === 'no-report',
      onSuccess: () => false,
    })
  })
})
