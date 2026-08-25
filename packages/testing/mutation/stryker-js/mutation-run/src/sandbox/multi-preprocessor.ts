import * as Effect from 'effect/Effect'

import { type FilePreprocessor } from './file-preprocessor.js'

export const combinePreprocessors = (preprocessors: readonly FilePreprocessor[]): FilePreprocessor => (project) =>
  Effect.forEach(preprocessors, (pre) => pre(project), { discard: true })
