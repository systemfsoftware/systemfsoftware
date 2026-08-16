import { parse } from '@std/toml'
import { Context, Effect, Layer, MutableHashMap, Option, Ref, Schema, SchemaIssue } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as PathModule from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import os from 'node:os'
import { TomlConfig } from './toml-loader.schema.js'

const PROJECT_CONFIG_FILE = 'systemfsoftware.toml'
const LOCAL_CONFIG_FILE = 'systemfsoftware.local.toml'
const USER_CONFIG_DIR = '.config/systemfsoftware'

const EMPTY_CONFIG: TomlConfig = Schema.decodeSync(TomlConfig)({})

/**
 * Port: the layered TOML config provider. The adapter implements it and the
 * composition root wires `TomlLoaderLive`.
 */
export class TomlLoader extends Context.Service<
  TomlLoader,
  {
    readonly load: (cwd: string) => Effect.Effect<TomlConfig, PlatformError, never>
  }
>()('@systemfsoftware/omp-utils/toml-loader.adapter/TomlLoader') {}

/**
 * Private per-key merge for the layered config.
 *
 * Precedence (gitconfig model): a later layer replaces a key's whole value;
 * arrays are NEVER concatenated. Folded left-to-right so `user → project →
 * local` gives `local` the final word. The reusable generic form lives in
 * `toml-loader-merge.kernel.ts`; the adapter owns this copy because the
 * adapter cell may not import the kernel cell.
 */
const mergeLayers = <V>(
  layers: readonly Readonly<Record<string, readonly V[]>>[],
): Record<string, readonly V[]> => {
  const out: Record<string, readonly V[]> = {}
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      out[key] = value
    }
  }
  return out
}

/**
 * TOML text → `TomlConfig`. The foreign parse is owned here — the adapter
 * wraps the TOML config-file system. The reusable public crossing lives in
 * `toml-loader.acl.ts`; the adapter cell may not import the ACL cell.
 */
const parseTomlText = (text: string) =>
  Effect.try({
    try: () => parse(text),
    catch: (e) =>
      new SchemaIssue.InvalidValue({
        message: e instanceof Error ? `TOML parse error: ${e.message}` : 'TOML parse error',
      }),
  }).pipe(Effect.flatMap((parsed) => Schema.decodeUnknownEffect(TomlConfig)(parsed)))

const readLayer = (
  fs: FileSystem.FileSystem,
  pathService: PathModule.Path,
  filePath: string,
): Effect.Effect<TomlConfig, PlatformError, never> =>
  fs.exists(filePath).pipe(
    Effect.flatMap((exists) =>
      exists
        ? fs.readFileString(filePath).pipe(
          Effect.flatMap(parseTomlText),
          Effect.orElseSucceed(() => EMPTY_CONFIG),
        )
        : Effect.succeed(EMPTY_CONFIG)
    ),
  )

const userHomeAnchor = (): string => {
  const override = process.env['OMP_USER_CONFIG_HOME']
  return typeof override === 'string' && override.length > 0 ? override : os.homedir()
}

/**
 * Build the loader for an explicit home. `TomlLoaderLive` resolves the anchor
 * when the layer is built, so tests can point it at an isolated directory via
 * `OMP_USER_CONFIG_HOME` before building.
 */
const makeTomlLoader = (home: string) =>
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

        const merged = yield* Schema.decodeEffect(TomlConfig)(
          mergeLayers([userLayer, projectLayer, localLayer]),
        ).pipe(Effect.orDie)

        yield* Ref.update(cache, (m) => (MutableHashMap.set(m, cwd, merged), m))
        return merged
      }),
    })
  })

/**
 * Live `TomlLoader` layer anchored at `OMP_USER_CONFIG_HOME` when set, else
 * `os.homedir()`, resolved at layer-build time.
 */
export const TomlLoaderLive: Layer.Layer<TomlLoader, never, FileSystem.FileSystem | PathModule.Path> = Layer.effect(
  TomlLoader,
  Effect.flatMap(Effect.sync(userHomeAnchor), makeTomlLoader),
)
