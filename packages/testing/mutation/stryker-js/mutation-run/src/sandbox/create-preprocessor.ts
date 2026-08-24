import { disableTypeChecks } from '@systemfsoftware/stryker-js-instrumenter'

import type { StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'

import { makeDisableTypeChecksPreprocessor } from './disable-type-checks-preprocessor.js'
import { type FilePreprocessor } from './file-preprocessor.js'
import { combinePreprocessors } from './multi-preprocessor.js'
import { makeTSConfigPreprocessor } from './ts-config-preprocessor.js'

export const createPreprocessor = (
  options: StrykerOptions,
  logger: Logger,
  basePath: string,
): FilePreprocessor =>
  combinePreprocessors([
    makeDisableTypeChecksPreprocessor(logger, options, disableTypeChecks),
    makeTSConfigPreprocessor(logger, options, basePath),
  ])
