import { FileSystem } from '@effect/platform/FileSystem'
import { Context, Effect, Either, Schema as S, type Scope } from 'effect'
import { analyzeSettings, parseSettings } from '../hook-settings.acl.js'
import type { DisableSource, HookCoverageRow } from '../hook-settings.acl.js'
import { HookCoverageRowSchema, HookCoverageSchema } from '../hook-settings.acl.js'
import { MANAGED_SETTINGS_PATH } from './settings-paths.kernel.js'

export class CollectSettingsGapsExecutorDeps extends Context.Tag('CollectSettingsGapsExecutorDeps')<
  CollectSettingsGapsExecutorDeps,
  Scope.Scope
>() {}

const dedupeByEvent = (rows: readonly HookCoverageRow[]): readonly HookCoverageRow[] =>
  rows.filter((row, index) => rows.findIndex((other) => other.event === row.event) === index)

export const collectSettingsGapsWithPaths = Effect.fn('collectSettingsGapsWithPaths')(function*(
  paths: readonly string[],
) {
  const fs = yield* FileSystem
  const unrecognized: HookCoverageRow[] = []
  const notCarried: HookCoverageRow[] = []
  const matcherNotEvaluable: HookCoverageRow[] = []
  const matcherOutOfReach: HookCoverageRow[] = []
  const shadowed: HookCoverageRow[] = []
  const sources: DisableSource[] = []
  const hookTypes: string[] = []
  const malformed: string[] = []
  for (const path of paths) {
    const content = yield* fs.readFileString(path).pipe(Effect.orElseSucceed(() => ''))
    if (content === '') continue
    const parsed = S.decodeUnknownEither(S.parseJson(S.Record({ key: S.String, value: S.Unknown })))(content)
    if (Either.isLeft(parsed)) {
      malformed.push(path)
      continue
    }
    const coverage = analyzeSettings({ _tag: 'Coverage', json: parsed.right }, HookCoverageSchema)
    unrecognized.push(...coverage.unrecognized)
    notCarried.push(...coverage.notCarried)
    matcherNotEvaluable.push(...coverage.matcherNotEvaluable)
    matcherOutOfReach.push(...coverage.matcherOutOfReach)
    shadowed.push(...coverage.shadowed)
    hookTypes.push(
      ...analyzeSettings({ _tag: 'UnsupportedHookTypes', json: parsed.right }, S.Array(S.String)),
    )
    // The loader skips a file it cannot decode, contributing no hooks at all.
    // Name it rather than starting the session unguarded with no sign of it.
    const settings = parseSettings(parsed.right)
    if (Either.isLeft(settings)) malformed.push(path)
    else sources.push({ settings: settings.right, managed: path === MANAGED_SETTINGS_PATH, label: path })
  }
  return {
    coverage: {
      unrecognized: dedupeByEvent(unrecognized),
      notCarried: dedupeByEvent(notCarried),
      matcherNotEvaluable: dedupeByEvent(matcherNotEvaluable),
      matcherOutOfReach: dedupeByEvent(matcherOutOfReach),
      shadowed: dedupeByEvent(shadowed),
      disabled: dedupeByEvent(
        analyzeSettings({ _tag: 'DisabledCoverage', sources }, S.Array(HookCoverageRowSchema)),
      ),
    },
    unsupportedHookTypes: Array.from(new Set(hookTypes)),
    malformedFiles: Array.from(new Set(malformed)),
  }
})
