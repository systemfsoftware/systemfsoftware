import { declareClassPlugin, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'

import { ClearTextReporter } from './clear-text-reporter.js'
import { HtmlReporter } from './html-reporter.js'
import { JsonReporter } from './json-reporter.js'
import { ProgressBarReporter } from './progress-reporter.js'
import { ProgressStreamReporter } from './progress-stream-reporter.js'

export { ClearTextReporter }
export { HtmlReporter }
export { JsonReporter }
export { ProgressBarReporter }
export { ProgressStreamReporter }

export const strykerPlugins = [
  declareClassPlugin(PluginKind.Reporter, 'clear-text', ClearTextReporter),
  declareClassPlugin(PluginKind.Reporter, 'progress', ProgressBarReporter),
  declareClassPlugin(PluginKind.Reporter, 'html', HtmlReporter),
  declareClassPlugin(PluginKind.Reporter, 'json', JsonReporter),
  declareClassPlugin(PluginKind.Reporter, 'progress-stream', ProgressStreamReporter),
]
