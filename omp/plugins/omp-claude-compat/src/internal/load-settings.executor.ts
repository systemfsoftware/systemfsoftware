import { FileSystem } from '@effect/platform/FileSystem'
import { Context, Effect, Either, Schema as S, type Scope } from 'effect'
import { analyzeSettings, parseSettings, SettingsWrapped } from '../hook-settings.acl.js'
import type { SettingsSource } from '../hook-settings.acl.js'
import { MANAGED_SETTINGS_PATH } from './settings-paths.kernel.js'

export class LoadSettingsExecutorDeps extends Context.Tag('LoadSettingsExecutorDeps')<
  LoadSettingsExecutorDeps,
  Scope.Scope
>() {}

const loadSettingsFile = Effect.fn('loadSettingsFile')(function*(path: string) {
  const fs = yield* FileSystem
  const content = yield* fs.readFileString(path).pipe(Effect.orElseSucceed(() => ''))
  if (content === '') return null
  const jsonOrError = S.decodeUnknownEither(S.parseJson(S.Record({ key: S.String, value: S.Unknown })))(content)
  if (Either.isLeft(jsonOrError)) return null
  const json = jsonOrError.right
  const either = parseSettings(json)
  return Either.isLeft(either) ? null : either.right
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
  return analyzeSettings({ _tag: 'Merge', sources }, SettingsWrapped)
})
