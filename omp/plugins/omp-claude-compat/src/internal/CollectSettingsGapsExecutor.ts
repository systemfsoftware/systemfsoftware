import { Context, Effect, Exit, Schema as S, type Scope } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import { disabledCoverage, hookCoverage, parseSettings, unsupportedHookTypes } from '../HookSettings.js'
import type { DisableSource, HookCoverageRow } from '../HookSettings.schema.js'
import { loadPluginHookSources } from './PluginHookSources.js'
import { MANAGED_SETTINGS_PATH } from './SettingsPaths.js'

/** @internal */
export class CollectSettingsGapsExecutorDeps extends Context.Service<CollectSettingsGapsExecutorDeps, Scope.Scope>()(
  'CollectSettingsGapsExecutorDeps',
) {}

const dedupeByEvent = (rows: readonly HookCoverageRow[]): readonly HookCoverageRow[] =>
  rows.filter((row, index) => rows.findIndex((other) => other.event === row.event) === index)

interface PathScan {
  readonly unrecognized: readonly HookCoverageRow[]
  readonly notCarried: readonly HookCoverageRow[]
  readonly matcherNotEvaluable: readonly HookCoverageRow[]
  readonly matcherOutOfReach: readonly HookCoverageRow[]
  readonly shadowed: readonly HookCoverageRow[]
  readonly sources: readonly DisableSource[]
  readonly hookTypes: readonly string[]
  readonly malformed: readonly string[]
}

const emptyScan: PathScan = {
  unrecognized: [],
  notCarried: [],
  matcherNotEvaluable: [],
  matcherOutOfReach: [],
  shadowed: [],
  sources: [],
  hookTypes: [],
  malformed: [],
}

const scanContent = (path: string, content: string): PathScan => {
  if (content === '') return emptyScan
  const parsed = S.decodeUnknownExit(S.fromJsonString(S.Record(S.String, S.Unknown)))(content)
  if (Exit.isFailure(parsed)) return { ...emptyScan, malformed: [path] }
  const coverage = hookCoverage(parsed.value)
  const settings = parseSettings(parsed.value)
  return {
    unrecognized: coverage.unrecognized,
    notCarried: coverage.notCarried,
    matcherNotEvaluable: coverage.matcherNotEvaluable,
    matcherOutOfReach: coverage.matcherOutOfReach,
    shadowed: coverage.shadowed,
    hookTypes: unsupportedHookTypes(parsed.value),
    malformed: Exit.isFailure(settings) ? [path] : [],
    sources: Exit.isFailure(settings)
      ? []
      : [{ settings: settings.value, managed: path === MANAGED_SETTINGS_PATH, label: path }],
  }
}

const mergeScans = (scans: readonly PathScan[]): PathScan => ({
  unrecognized: scans.flatMap((scan) => scan.unrecognized),
  notCarried: scans.flatMap((scan) => scan.notCarried),
  matcherNotEvaluable: scans.flatMap((scan) => scan.matcherNotEvaluable),
  matcherOutOfReach: scans.flatMap((scan) => scan.matcherOutOfReach),
  shadowed: scans.flatMap((scan) => scan.shadowed),
  sources: scans.flatMap((scan) => scan.sources),
  hookTypes: scans.flatMap((scan) => scan.hookTypes),
  malformed: scans.flatMap((scan) => scan.malformed),
})

/** @internal */
export const collectSettingsGapsWithPaths = Effect.fn('collectSettingsGapsWithPaths')(function*(
  paths: readonly string[],
  homeDir: string,
  cwd: string,
) {
  const plugin = yield* loadPluginHookSources(homeDir, cwd)
  const scans = yield* Effect.forEach(
    [...paths, ...plugin.hookFiles],
    (path) =>
      Effect.map(
        Effect.flatMap(FileSystem, (fs) => fs.readFileString(path).pipe(Effect.orElseSucceed(() => ''))),
        (content) => scanContent(path, content),
      ),
    { concurrency: 'unbounded' },
  )
  const merged = mergeScans(scans)
  return {
    coverage: {
      unrecognized: dedupeByEvent(merged.unrecognized),
      notCarried: dedupeByEvent(merged.notCarried),
      matcherNotEvaluable: dedupeByEvent(merged.matcherNotEvaluable),
      matcherOutOfReach: dedupeByEvent(merged.matcherOutOfReach),
      shadowed: dedupeByEvent(merged.shadowed),
      disabled: dedupeByEvent(disabledCoverage(merged.sources)),
    },
    unsupportedHookTypes: Array.from(new Set(merged.hookTypes)),
    malformedFiles: Array.from(new Set(merged.malformed)),
  }
})
