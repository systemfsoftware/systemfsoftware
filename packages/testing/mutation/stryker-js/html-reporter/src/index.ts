import { declarePlugin, RunConfiguration } from '@systemfsoftware/stryker-js/Plugin'
import { Reporter } from '@systemfsoftware/stryker-js/Reporter'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import { makeHtmlReporter } from './Reporter.js'

export { makeHtmlReporter } from './Reporter.js'

export const strykerPlugins = [
  declarePlugin(
    'Reporter',
    'html',
    Layer.effect(
      Reporter,
      Effect.gen(function*() {
        const options = yield* RunConfiguration
        return makeHtmlReporter({ options })
      }),
    ),
  ),
]
