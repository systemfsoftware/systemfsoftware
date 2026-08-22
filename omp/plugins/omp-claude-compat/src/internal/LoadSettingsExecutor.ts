import { Context, Effect, Exit, Schema as S, type Scope } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import { analyzeSettings, parseSettings } from '../HookSettings.js'
import { SettingsWrapped } from '../HookSettings.schema.js'
import type { SettingsSource } from '../HookSettings.schema.js'
import { settingsAnalysisTags } from './SettingsAnalysisTags.js'
import { MANAGED_SETTINGS_PATH } from './SettingsPaths.js'

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

export const loadSettingsWithPaths = Effect.fn('loadSettingsWithPaths')(function*(
  paths: readonly string[],
  managedPath: string = MANAGED_SETTINGS_PATH,
) {
  const sources: SettingsSource[] = []
  for (const p of paths) {
    const s = yield* loadSettingsFile(p)
    if (s !== null) sources.push({ settings: s, managed: p === managedPath })
  }
  if (sources.length === 0) return null
  return analyzeSettings({ ...settingsAnalysisTags.Merge, sources }, SettingsWrapped)
})
