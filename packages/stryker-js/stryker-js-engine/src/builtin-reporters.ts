import type { ReporterFactory } from '@systemfsoftware/stryker-js/Reporter'
import type * as FileSystem from 'effect/FileSystem'
import type * as Path from 'effect/Path'

import {
  type JsonReporterDeps,
  makeClearTextReporter,
  makeJsonReporter,
  makeProgressBarReporter,
  makeProgressStreamReporter,
} from './Reporter.js'

export type { JsonReporterDeps }

export interface BuiltinReporterDeps {
  readonly fileSystem: FileSystem.FileSystem
  readonly path: Path.Path
}

export const makeBuiltinReporterFactories = (
  services: BuiltinReporterDeps,
): Record<string, ReporterFactory> => ({
  'json': makeJsonReporter(services),
  'clear-text': makeClearTextReporter,
  'progress': makeProgressBarReporter,
  'progress-stream': makeProgressStreamReporter,
})

export const strykerPlugins: readonly unknown[] = []
