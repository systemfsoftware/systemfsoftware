import { FileSystem } from '@effect/platform/FileSystem'
import { Path } from '@effect/platform/Path'
import { parse } from '@std/toml'
import { Effect, MutableHashMap, MutableHashSet, Option, Ref } from 'effect'

export interface TomlConfig {
  readonly [key: string]: readonly string[]
}

const CONFIG_FILE = 'systemfsoftware.toml'

const cache = Effect.runSync(Ref.make(MutableHashMap.empty<string, TomlConfig>()))
const warnedFiles = Effect.runSync(Ref.make(MutableHashSet.empty<string>()))

export const resetTomlCache: Effect.Effect<void> = Effect.gen(function*() {
  yield* Ref.update(cache, MutableHashMap.clear)
  yield* Ref.update(warnedFiles, MutableHashSet.clear)
})

export const loadToml = Effect.fn('loadToml')(function*(cwd: string) {
  const cached = yield* Ref.get(cache)
  const existing = MutableHashMap.get(cached, cwd)
  if (Option.isSome(existing)) return existing.value

  const path = yield* Path
  const configPath = path.join(cwd, CONFIG_FILE)
  const fs = yield* FileSystem

  const exists = yield* fs.exists(configPath)
  if (!exists) {
    yield* Ref.update(cache, (m) => (MutableHashMap.set(m, cwd, {} as TomlConfig), m))
    return {} as TomlConfig
  }

  const config: TomlConfig = yield* fs.readFileString(configPath).pipe(
    Effect.flatMap((raw) => Effect.try({ try: () => parse(raw), catch: (e) => e as Error })),
    Effect.map((parsed) => {
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return Object.fromEntries(
          Object.entries(parsed).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [],
          ]),
        )
      }
      return {} as TomlConfig
    }),
    Effect.tapError((error) => {
      return Ref.get(warnedFiles).pipe(
        Effect.flatMap((warned) => {
          if (MutableHashSet.has(warned, configPath)) return Effect.void
          MutableHashSet.add(warned, configPath)
          return Effect.logWarning(
            `[toml-loader] malformed ${CONFIG_FILE} at ${configPath} — failing open (no config)`,
          ).pipe(
            Effect.andThen(
              Effect.logWarning(error instanceof Error ? error.message : 'unknown parse error'),
            ),
          )
        }),
      )
    }),
    Effect.catchAll(() => Effect.succeed({} as TomlConfig)),
  )

  yield* Ref.update(cache, (m) => (MutableHashMap.set(m, cwd, config), m))
  return config
})
