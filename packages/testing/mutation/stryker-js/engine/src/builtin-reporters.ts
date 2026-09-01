import { declarePlugin, RunConfiguration } from '@systemfsoftware/stryker-js/Plugin'
import { Reporter } from '@systemfsoftware/stryker-js/Reporter'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'

import {
  makeClearTextReporter,
  makeJsonReporter,
  makeProgressBarReporter,
  makeProgressStreamReporter,
} from './Reporter.js'

export const strykerPlugins = [
  declarePlugin(
    'Reporter',
    'json',
    Layer.effect(
      Reporter,
      Effect.gen(function*() {
        const options = yield* RunConfiguration
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        return makeJsonReporter({ options, fs, path })
      }),
    ),
  ),
  declarePlugin(
    'Reporter',
    'clear-text',
    Layer.effect(
      Reporter,
      Effect.gen(function*() {
        const options = yield* RunConfiguration
        return makeClearTextReporter({ options })
      }),
    ),
  ),
  declarePlugin(
    'Reporter',
    'progress',
    Layer.effect(Reporter, makeProgressBarReporter()),
  ),
  declarePlugin(
    'Reporter',
    'progress-stream',
    Layer.effect(Reporter, makeProgressStreamReporter()),
  ),
]
