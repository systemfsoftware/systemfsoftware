import { declarePlugin } from '@systemfsoftware/stryker-js/Plugin'
import type { ReporterFactory } from '@systemfsoftware/stryker-js/ReporterEvent'

import { makeHtmlReporter } from './Reporter.js'

export { makeHtmlReporter } from './Reporter.js'

export const htmlReporterFactory: ReporterFactory = makeHtmlReporter

export const strykerPlugins = [declarePlugin('Reporter', 'html', htmlReporterFactory)]
