import type { PlatformError } from '@effect/platform/Error'
import { FileSystem } from '@effect/platform/FileSystem'
import { Path } from '@effect/platform/Path'
import { Context, Effect, Layer, MutableHashMap, Option, Ref, Schema } from 'effect'
import { TomlConfigFromText } from './toml-loader.acl.js'
import { TomlConfig } from './toml-loader.schema.js'

const CONFIG_FILE = 'systemfsoftware.toml'

const EMPTY_CONFIG: TomlConfig = Schema.decodeSync(TomlConfig)({})

export class TomlLoader extends Context.Tag('TomlLoader')<
  TomlLoader,
  {
    readonly load: (cwd: string) => Effect.Effect<TomlConfig, PlatformError, never>
  }
>() {}

export const TomlLoaderLive: Layer.Layer<TomlLoader, never, FileSystem | Path> = Layer.effect(
  TomlLoader,
  Effect.gen(function*() {
    const cache = yield* Ref.make(MutableHashMap.empty<string, TomlConfig>())
    const fs = yield* FileSystem
    const path = yield* Path

    return TomlLoader.of({
      load: Effect.fn('TomlLoader.load')(function*(cwd: string) {
        const cached = yield* Ref.get(cache)
        const existing = MutableHashMap.get(cached, cwd)
        if (Option.isSome(existing)) return existing.value

        const configPath = path.join(cwd, CONFIG_FILE)
        const exists = yield* fs.exists(configPath)
        if (!exists) {
          yield* Ref.update(cache, (m) => (MutableHashMap.set(m, cwd, EMPTY_CONFIG), m))
          return EMPTY_CONFIG
        }

        const result = yield* fs.readFileString(configPath).pipe(
          Effect.flatMap(Schema.decodeUnknown(TomlConfigFromText)),
          Effect.tapError((error) =>
            Effect.logWarning(
              `[toml-loader] malformed ${CONFIG_FILE} at ${configPath} — failing open (no config)`,
              error,
            )
          ),
          Effect.catchAll(() => Effect.succeed(EMPTY_CONFIG)),
        )

        yield* Ref.update(cache, (m) => (MutableHashMap.set(m, cwd, result), m))
        return result
      }),
    })
  }),
)
