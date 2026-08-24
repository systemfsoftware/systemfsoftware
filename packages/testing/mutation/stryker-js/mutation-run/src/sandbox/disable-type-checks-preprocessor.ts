import path from 'node:path'

import type { disableTypeChecks } from '@systemfsoftware/stryker-js-instrumenter'
import { type StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { type Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import * as Effect from 'effect/Effect'

import { StrykerError } from '../stryker-error.schema.js'

import { createFileMatcher } from '../config/index.js'
import { isWarningEnabled } from '../config/is-warning-enabled.js'
import { optionsPath } from '../config/options-path.js'

import { toInstrumenterFile } from '../project/project-file.js'
import { withContent } from '../project/project-file.js'
import type { ProjectFile } from '../project/project-file.js'
import type { Project } from '../project/project.js'

import { type FilePreprocessor } from './file-preprocessor.js'

export const makeDisableTypeChecksPreprocessor =
  (log: Logger, options: StrykerOptions, impl: typeof disableTypeChecks): FilePreprocessor => (project) => {
    const matches = createFileMatcher(options.disableTypeChecks)
    return Effect.gen(function*() {
      const updates = yield* Effect.forEach([...project.files.entries()], ([name, file]) => {
        if (!matches(path.resolve(name))) {
          return Effect.succeed<ProjectFile | undefined>(undefined)
        }
        return Effect.gen(function*() {
          const instrumenterFile = yield* toInstrumenterFile(file)
          const content = yield* Effect.tryPromise({
            try: () =>
              impl(instrumenterFile, {
                plugins: options.mutator.plugins ? [...options.mutator.plugins] : null,
              }).then((r) => r.content),
            catch: (cause) => new StrykerError({ message: 'disableTypeChecks failed', cause }),
          }).pipe(
            Effect.catch((error) =>
              Effect.gen(function*() {
                if (isWarningEnabled('preprocessorErrors', options.warnings)) {
                  yield* Effect.sync(() =>
                    log.warn(
                      `Unable to disable type checking for file "${name}". Shouldn't type checking be disabled for this file? Consider configuring a more restrictive "${
                        optionsPath('disableTypeChecks')
                      }" settings (or turn it completely off with \`false\`)`,
                      error,
                    )
                  )
                }
                return undefined
              })
            ),
          )
          if (content !== undefined) {
            return withContent(file, content)
          }
          return undefined
        })
        // Per-file work touches only that file, so the final project state does
        // not depend on order. Sequential is `Effect.forEach`'s default and would
        // serialise every match; the pre-Effect implementation ran these together.
      }, { concurrency: 'unbounded' })
      for (const updated of updates) {
        if (updated !== undefined) {
          const key = updated.name
          const filesCandidate: unknown = project.files
          if (filesCandidate instanceof Map) {
            filesCandidate.set(key, updated)
          }
          const mutateCandidate: unknown = project.filesToMutate
          if (mutateCandidate instanceof Map && mutateCandidate.has(key)) {
            mutateCandidate.set(key, updated)
          }
        }
      }
    })
  }
