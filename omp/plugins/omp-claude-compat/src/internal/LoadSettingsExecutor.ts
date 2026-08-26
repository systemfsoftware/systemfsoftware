import { Context, Effect, Exit, Schema as S, type Scope } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import { mergeSettings, parseSettings } from '../HookSettings.js'
import { loadPluginHookSources } from './PluginHookSources.js'
import { MANAGED_SETTINGS_PATH } from './SettingsPaths.js'

/** @internal */
export class LoadSettingsExecutorDeps extends Context.Service<LoadSettingsExecutorDeps, Scope.Scope>()(
  'LoadSettingsExecutorDeps',
) {}

const loadSettingsFile = Effect.fn('loadSettingsFile')(function*(path: string) {
  const fs = yield* FileSystem
  const content = yield* fs.readFileString(path).pipe(Effect.orElseSucceed(() => ''))
  if (content === '') return null
  const jsonOrError = S.decodeUnknownExit(S.fromJsonString(S.Record(S.String, S.Unknown)))(content)
  if (Exit.isFailure(jsonOrError)) return null
  const json = jsonOrError.value
  const exit = parseSettings(json)
  return Exit.isFailure(exit) ? null : exit.value
})

/** @internal */
export const loadSettingsWithPaths = Effect.fn('loadSettingsWithPaths')(function*(
  paths: readonly string[],
  homeDir: string,
  cwd: string,
  managedPath: string = MANAGED_SETTINGS_PATH,
) {
  const [loaded, plugin] = yield* Effect.all([
    Effect.forEach(
      paths,
      (p) => Effect.map(loadSettingsFile(p), (s) => s === null ? null : { settings: s, managed: p === managedPath }),
      { concurrency: 'unbounded' },
    ),
    loadPluginHookSources(homeDir, cwd),
  ], { concurrency: 'unbounded' })
  const sources = [...loaded.filter((s) => s !== null), ...plugin.sources]
  return sources.length === 0 ? null : mergeSettings(sources)
})
