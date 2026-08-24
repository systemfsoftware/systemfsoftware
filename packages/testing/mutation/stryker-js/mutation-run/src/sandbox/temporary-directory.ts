import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'

import type { StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'

/**
 * Scoped temporary directory. Created inside a `Scope`; its finalizer
 * decides from the run's `Exit` whether to keep it.
 *
 * The directory is kept when the run failed and `cleanTempDir` is not
 * `'always'`; otherwise it is removed. The `Exit` carries the outcome
 * so the decision does not require a separate mutable flag.
 *
 * No `node:fs` import — all file work goes through `FileSystem` and `Path`
 * from `effect`.
 */
export interface TemporaryDirectoryShape {
  readonly path: string
}

export class TemporaryDirectory extends Context.Service<TemporaryDirectory, TemporaryDirectoryShape>()(
  '@systemfsoftware/stryker-js-mutation-run/TemporaryDirectory',
) {}
/**
 * Layer that creates the temp directory under `options.tempDirName` and
 * registers a finalizer that reads the `Exit`. The prefix is `backup-`
 * when `inPlace` is enabled and `sandbox-` otherwise.
 */
export const TemporaryDirectoryLive = (
  options: StrykerOptions,
  log: Logger,
): Layer.Layer<TemporaryDirectory, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Layer.effect(
    TemporaryDirectory,
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const parent = path.resolve(options.tempDirName)
      yield* fs.makeDirectory(parent, { recursive: true })

      const tmp = yield* fs.makeTempDirectory({
        directory: parent,
        prefix: options.inPlace ? 'backup-' : 'sandbox-',
      })

      log.debug('Using temp directory "%s"', tmp)

      yield* Effect.addFinalizer((exit) =>
        Effect.gen(function*() {
          const shouldRemove = Exit.isSuccess(exit) || options.cleanTempDir === 'always'
          if (!shouldRemove) {
            log.debug('Not removing the temp dir because an error occurred')
            return
          }
          if (tmp) {
            log.debug('Deleting stryker temp directory %s', tmp)
            yield* fs.remove(tmp, { recursive: true }).pipe(
              Effect.catch(() => Effect.sync(() => log.info(`Failed to delete stryker temp directory ${tmp}`))),
            )
            const lingering = yield* fs.readDirectory(options.tempDirName).pipe(
              Effect.orElseSucceed(() => [] as readonly string[]),
            )
            if (lingering.length === 0) {
              yield* fs.remove(options.tempDirName).pipe(
                Effect.catch((e) =>
                  Effect.sync(() => log.debug(`Failed to clean temp ${path.basename(options.tempDirName)}`, e))
                ),
              )
            }
          }
        })
      )

      return { path: tmp }
    }),
  )
