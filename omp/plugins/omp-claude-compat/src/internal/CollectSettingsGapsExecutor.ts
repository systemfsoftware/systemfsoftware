import { Context, Effect, Exit, Schema as S, type Scope } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import { analyzeSettings, parseSettings } from '../HookSettings.js'
import type { DisableSource, HookCoverageRow } from '../HookSettings.schema.js'
import { HookCoverageRowSchema, HookCoverageSchema } from '../HookSettings.schema.js'
import { MANAGED_SETTINGS_PATH } from './SettingsPaths.js'

export class CollectSettingsGapsExecutorDeps extends Context.Service<CollectSettingsGapsExecutorDeps, Scope.Scope>()(
  'CollectSettingsGapsExecutorDeps',
) {}

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
    const parsed = S.decodeUnknownExit(S.fromJsonString(S.Record(S.String, S.Unknown)))(content)
    if (Exit.isFailure(parsed)) {
      malformed.push(path)
      continue
    }
    const coverage = analyzeSettings({ _tag: 'Coverage', json: parsed.value }, HookCoverageSchema)
    unrecognized.push(...coverage.unrecognized)
    notCarried.push(...coverage.notCarried)
    matcherNotEvaluable.push(...coverage.matcherNotEvaluable)
    matcherOutOfReach.push(...coverage.matcherOutOfReach)
    shadowed.push(...coverage.shadowed)
    hookTypes.push(
      ...analyzeSettings({ _tag: 'UnsupportedHookTypes', json: parsed.value }, S.Array(S.String)),
    )
    // The loader skips a file it cannot decode, contributing no hooks at all.
    // Name it rather than starting the session unguarded with no sign of it.
    const settings = parseSettings(parsed.value)
    if (Exit.isFailure(settings)) malformed.push(path)
    else sources.push({ settings: settings.value, managed: path === MANAGED_SETTINGS_PATH, label: path })
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
