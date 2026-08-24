import { declarePlugin, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { Reporter } from '@systemfsoftware/stryker-js-plugin-api/report'
import * as Layer from 'effect/Layer'

import { makeClearTextReporter } from './clear-text-reporter.js'
import { makeHtmlReporter } from './html-reporter.js'
import { makeJsonReporter } from './json-reporter.js'
import { makeProgressBarReporter } from './progress-reporter.js'
import { makeProgressStreamReporter } from './progress-stream-reporter.js'

export { makeClearTextReporter } from './clear-text-reporter.js'
export { drawClearTextScoreTable } from './clear-text-score-table.js'
export type { Column } from './clear-text-score-table.js'
export { makeHtmlReporter } from './html-reporter.js'
export { makeJsonReporter } from './json-reporter.js'
export { isComplete, makeProgressBarState, renderProgressBar, tickProgressBar } from './progress-bar.js'
export type { ProgressBarState } from './progress-bar.js'
export {
  emptyTally,
  getElapsedTime,
  getEtc,
  handleDryRunCompleted,
  handleMutantTested,
  handleMutationTestingPlanReady,
  makeEmptyTimer,
} from './progress-keeper.js'
export type { ProgressTally } from './progress-keeper.js'
export { makeProgressBarReporter } from './progress-reporter.js'
export { filterActionable, makeProgressStreamReporter, toRunEvent } from './progress-stream-reporter.js'
export type { RunEventSink } from './progress-stream-reporter.js'

export const strykerPlugins = [
  declarePlugin(PluginKind.Reporter, 'clear-text', Layer.succeed(Reporter, makeClearTextReporter({}))),
  declarePlugin(PluginKind.Reporter, 'progress', Layer.effect(Reporter, makeProgressBarReporter())),
  declarePlugin(PluginKind.Reporter, 'html', Layer.succeed(Reporter, makeHtmlReporter({}))),
  declarePlugin(PluginKind.Reporter, 'json', Layer.succeed(Reporter, makeJsonReporter({}))),
  declarePlugin(PluginKind.Reporter, 'progress-stream', Layer.effect(Reporter, makeProgressStreamReporter())),
]
