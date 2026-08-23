import { declarePlugin, PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { Reporter } from '@systemfsoftware/stryker-js-plugin-api/report'
import * as Layer from 'effect/Layer'

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
  declarePlugin(PluginKind.Reporter, 'clear-text', Layer.succeed(Reporter, new ClearTextReporter())),
  declarePlugin(PluginKind.Reporter, 'progress', Layer.succeed(Reporter, new ProgressBarReporter())),
  declarePlugin(PluginKind.Reporter, 'html', Layer.succeed(Reporter, new HtmlReporter())),
  declarePlugin(PluginKind.Reporter, 'json', Layer.succeed(Reporter, new JsonReporter())),
  declarePlugin(PluginKind.Reporter, 'progress-stream', Layer.succeed(Reporter, new ProgressStreamReporter())),
]
