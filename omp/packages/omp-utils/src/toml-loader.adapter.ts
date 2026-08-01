import type { PlatformError } from '@effect/platform/Error'
import * as FileSystem from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { Context, Effect, Layer, MutableHashMap, Option, Ref, Schema } from 'effect'
import os from 'node:os'
import { mergeByOverride } from './toml-loader-merge.kernel.js'
import { TomlConfigFromText } from './toml-loader.acl.js'
import { TomlConfig } from './toml-loader.schema.js'

const PROJECT_CONFIG_FILE = 'systemfsoftware.toml'
const LOCAL_CONFIG_FILE = 'systemfsoftware.local.toml'
const USER_CONFIG_DIR = '.omp'

const EMPTY_CONFIG: TomlConfig = Schema.decodeSync(TomlConfig)({})

const readLayer = (
  fs: FileSystem.FileSystem,
  pathService: PathModule.Path,
  filePath: string,
): Effect.Effect<TomlConfig, PlatformError, never> =>
  fs.exists(filePath).pipe(
    Effect.flatMap((exists) =>
      exists
        ? fs.readFileString(filePath).pipe(
          Effect.flatMap(Schema.decodeUnknown(TomlConfigFromText)),
          Effect.catchAll(() => Effect.succeed(EMPTY_CONFIG)),
        )
        : Effect.succeed(EMPTY_CONFIG)
    ),
  )

export class TomlLoader extends Context.Tag('TomlLoader')<
  TomlLoader,
  {
    readonly load: (cwd: string) => Effect.Effect<TomlConfig, PlatformError, never>
  }
>() {}

/**
 * Build a `TomlLoader` layer with an explicit user home. Tests pass an
 * isolated directory; production code goes through `TomlLoaderLive`,
 * which calls `os.homedir()` at module load.
 */
export const makeTomlLoaderLive = (
  home: string,
): Layer.Layer<TomlLoader, never, FileSystem.FileSystem | PathModule.Path> =>
  Layer.effect(
    TomlLoader,
    Effect.gen(function*() {
      const cache = yield* Ref.make(MutableHashMap.empty<string, TomlConfig>())
      const fs = yield* FileSystem.FileSystem
      const pathService = yield* PathModule.Path

      const userPath = pathService.join(home, USER_CONFIG_DIR, PROJECT_CONFIG_FILE)

      return TomlLoader.of({
        load: Effect.fn('TomlLoader.load')(function*(cwd: string) {
          const cached = yield* Ref.get(cache)
          const existing = MutableHashMap.get(cached, cwd)
          if (Option.isSome(existing)) return existing.value

          const projectPath = pathService.join(cwd, PROJECT_CONFIG_FILE)
          const localPath = pathService.join(cwd, LOCAL_CONFIG_FILE)

          const userLayer = yield* readLayer(fs, pathService, userPath)
          const projectLayer = yield* readLayer(fs, pathService, projectPath)
          const localLayer = yield* readLayer(fs, pathService, localPath)

          const merged = Schema.decodeSync(TomlConfig)(
            mergeByOverride([userLayer, projectLayer, localLayer]),
          )

          yield* Ref.update(cache, (m) => (MutableHashMap.set(m, cwd, merged), m))
          return merged
        }),
      })
    }),
  )

export const TomlLoaderLive: Layer.Layer<TomlLoader, never, FileSystem.FileSystem | PathModule.Path> =
  makeTomlLoaderLive(os.homedir())
