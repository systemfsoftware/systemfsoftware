import { declarePlugin, RunConfiguration } from '@systemfsoftware/stryker-js/Plugin'
import { Reporter } from '@systemfsoftware/stryker-js/Reporter'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'

import { makeHtmlReporter } from './Reporter.js'

/** @public */
export { makeHtmlReporter } from './Reporter.js'

/** @public */
export const strykerPlugins = [
  declarePlugin(
    'Reporter',
    'html',
    Layer.effect(
      Reporter,
      Effect.gen(function*() {
        const options = yield* RunConfiguration
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        return makeHtmlReporter({ options, fs, path })
      }),
    ),
  ),
]
