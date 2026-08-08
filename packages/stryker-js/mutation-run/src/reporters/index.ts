import { declareClassPlugin, PluginKind } from '@stryker-mutator/api/plugin'

import { ClearTextReporter } from './clear-text-reporter.js'
import { HtmlReporter } from './html-reporter.js'
import { JsonReporter } from './json-reporter.js'
import { ProgressBarReporter } from './progress-reporter.js'
import { ProgressStreamReporter } from './progress-stream-reporter.js'

export { BroadcastReporter } from './broadcast-reporter.js'
export type { StrictReporter } from './strict-reporter.js'

export const strykerPlugins = [
  declareClassPlugin(PluginKind.Reporter, 'clear-text', ClearTextReporter),
  declareClassPlugin(PluginKind.Reporter, 'progress', ProgressBarReporter),
  declareClassPlugin(PluginKind.Reporter, 'html', HtmlReporter),
  declareClassPlugin(PluginKind.Reporter, 'json', JsonReporter),
  declareClassPlugin(PluginKind.Reporter, 'progress-stream', ProgressStreamReporter),
]

/**
 * The URL Stryker's plugin loader imports the reporter registry by, and it must
 * name the *published subpath*, never a module's own `import.meta.url`.
 *
 * tsdown inlines every source module into shared chunks and mangles the export
 * names inside them — `strykerPlugins` becomes a single letter. So the URL of
 * any module that carries this code names a chunk with no `strykerPlugins`
 * export, the loader finds no reporters, and a run emits a verdict with no
 * runId. Only the generated entry wrapper for a declared subpath re-exports the
 * real names, which is what this resolves to.
 *
 * Resolving a bare specifier does not touch the filesystem — it returns a URL
 * whether or not `dist/` exists — so this stays a pure string at module scope
 * and a source tree with no build can still import this barrel.
 */
export const reporterPluginsFileUrl = import.meta.resolve(
  '@systemfsoftware/stryker-js-mutation-run/reporters/stryker-plugins',
)
