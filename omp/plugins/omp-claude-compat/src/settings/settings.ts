import { Cell, Wire } from '@systemfsoftware/effect-cell-types'
import { Context, Effect, Exit, Layer, Match, Option, Result, Schema as S } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import { homedir } from 'node:os'
import {
  ALL_CLAUDE_CODE_EVENTS,
  BRIDGED_EVENTS,
  DISABLED_ALL_REASON,
  MATCHER_REACH,
  NON_EVALUABLE_MATCHERS,
  TOOL_EVENTS,
  UNBRIDGED_REASONS,
  UNRECOGNIZED_KEY_REASON,
  WRAPPED_SHADOW_REASON,
} from './events.js'
import type { BridgedEvent } from './events.js'
import { SettingsJSON } from './settings.schema.js'
import type { DisableSource, HookCoverage, HookCoverageRow, HookSettings, SettingsSource } from './settings.schema.js'
import {
  type DecodedSource,
  EmptySources,
  type MergeCommand,
  mergeEffectiveSettings,
  MergeSettingsCommand,
  NonEmptySources,
  type SettingsSnapshot,
} from './settings.workflow.js'

export const packMergeCommand = (sources: readonly DecodedSource[]): MergeCommand => {
  const first = sources[0]
  const pack = first === undefined ? new EmptySources() : new NonEmptySources({ sources: [first, ...sources.slice(1)] })
  return new MergeSettingsCommand({ pack })
}

export const snapshotSettings = (snapshot: SettingsSnapshot): HookSettings | null =>
  Match.value(snapshot).pipe(
    Match.tag('EmptySnapshot', () => null),
    Match.tag('LoadedSnapshot', (loaded) => loaded.settings),
    Match.exhaustive,
  )

export const MANAGED_SETTINGS_PATH = '/etc/claude-code/managed-settings.json'

export const settingsPaths = (homeDir: string, cwd: string): readonly string[] => [
  `${homeDir}/.claude/settings.json`,
  `${cwd}/.claude/settings.json`,
  `${cwd}/.claude/settings.local.json`,
  MANAGED_SETTINGS_PATH,
]

export interface PluginRoot {
  readonly id: string
  readonly path: string
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  return Object.fromEntries(Object.entries(value))
}

const userOmpPluginDirs = (homeDir: string): readonly string[] => {
  const conventional = `${homeDir}/.omp/plugins`
  if (homeDir !== homedir()) return [conventional]
  const xdg = process.env['XDG_DATA_HOME']
  if (xdg === undefined || xdg.length === 0) return [conventional]
  const xdgDir = `${xdg}/omp/plugins`
  return xdgDir === conventional ? [conventional] : [conventional, xdgDir]
}

const ancestorDirs = (cwd: string, homeDir: string): readonly string[] =>
  cwd === homeDir || cwd === '/'
    ? []
    : [cwd, ...ancestorDirs(cwd.includes('/') ? cwd.slice(0, cwd.lastIndexOf('/')) || '/' : '/', homeDir)]

const parseRegistryJson = (content: string): unknown => {
  try {
    return JSON.parse(content) as unknown
  } catch {
    return null
  }
}

const entryRoot = (pluginId: string, raw: unknown, cwd: string): PluginRoot | null => {
  if (pluginId.lastIndexOf('@') === -1) return null
  const entry = asRecord(raw)
  if (entry === null) return null
  if (typeof entry['installPath'] !== 'string' || entry['installPath'].length === 0) return null
  if (entry['enabled'] === false) return null
  if (entry['scope'] === 'local') {
    if (typeof entry['projectPath'] !== 'string') return null
    if (entry['projectPath'] !== cwd) return null
  }
  return { id: pluginId, path: entry['installPath'] }
}

export const enabledRootsFromRegistry = (content: string, cwd: string): readonly PluginRoot[] => {
  const plugins = asRecord(asRecord(parseRegistryJson(content))?.['plugins'])
  if (plugins === null) return []
  return Object.entries(plugins).flatMap(([pluginId, rawEntries]) =>
    Array.isArray(rawEntries)
      ? rawEntries.flatMap((raw) => {
        const root = entryRoot(pluginId, raw, cwd)
        return root === null ? [] : [root]
      })
      : []
  )
}

export const shadowById = (layers: readonly (readonly PluginRoot[])[]): readonly PluginRoot[] =>
  Object.values(
    Object.fromEntries(layers.flatMap((layer) => layer.map((root) => [root.id, root] as const))),
  )

const lockEnabled = (lockJson: unknown, name: string): boolean => {
  const state = asRecord(asRecord(asRecord(lockJson)?.['plugins'])?.[name])
  return state === null || state['enabled'] !== false
}

const readText = (path: string) =>
  Effect.flatMap(FileSystem, (fs) => fs.readFileString(path).pipe(Effect.orElseSucceed(() => '')))

const readJson = (path: string) =>
  Effect.map(readText(path), (content) => (content === '' ? null : parseRegistryJson(content)))

const fileExists = (path: string) =>
  Effect.flatMap(FileSystem, (fs) => fs.exists(path).pipe(Effect.orElseSucceed(() => false)))

const walkToProjectRegistry = (cwd: string, homeDir: string) =>
  Effect.map(
    Effect.forEach(
      ancestorDirs(cwd, homeDir),
      (dir) =>
        Effect.map(
          fileExists(`${dir}/.omp`),
          (present) => (present ? `${dir}/.omp/plugins/installed_plugins.json` : null),
        ),
      { concurrency: 'unbounded' },
    ),
    (hits) => hits.find((hit) => hit !== null) ?? null,
  )

const npmCandidateNames = (pkg: unknown, lock: unknown): readonly string[] => {
  const deps = asRecord(asRecord(pkg)?.['dependencies'])
  const lockPlugins = asRecord(asRecord(lock)?.['plugins'])
  return [...new Set([...Object.keys(deps ?? {}), ...Object.keys(lockPlugins ?? {})])].filter((name) =>
    lockEnabled(lock, name)
  )
}

const npmPluginRoots = (pluginsDir: string) =>
  Effect.flatMap(
    Effect.all(
      {
        pkg: readJson(`${pluginsDir}/package.json`),
        lock: readJson(`${pluginsDir}/omp-plugins.lock.json`),
      },
      { concurrency: 'unbounded' },
    ),
    ({ pkg, lock }) =>
      Effect.map(
        Effect.forEach(
          npmCandidateNames(pkg, lock),
          (name) => {
            const p = `${pluginsDir}/node_modules/${name}`
            return Effect.map(
              fileExists(`${p}/.claude-plugin/plugin.json`),
              (ok) => (ok ? { id: `npm:${name}`, path: p } : null),
            )
          },
          { concurrency: 'unbounded' },
        ),
        (rows) => rows.filter((row): row is PluginRoot => row !== null),
      ),
  )

const readRegistry = (path: string, cwd: string) =>
  Effect.map(readText(path), (text) => enabledRootsFromRegistry(text, cwd))

const loadOmpDir = (dir: string, cwd: string) =>
  Effect.all(
    {
      registry: readRegistry(`${dir}/installed_plugins.json`, cwd),
      npm: npmPluginRoots(dir),
    },
    { concurrency: 'unbounded' },
  )

export const listEnabledClaudePluginRoots = Effect.fn('listEnabledClaudePluginRoots')(function*(
  homeDir: string,
  cwd: string,
) {
  const ompDirs = userOmpPluginDirs(homeDir)
  const [claudeReg, ompLayers, projectRegPath] = yield* Effect.all(
    [
      readRegistry(`${homeDir}/.claude/plugins/installed_plugins.json`, cwd),
      Effect.forEach(ompDirs, (dir) => loadOmpDir(dir, cwd), { concurrency: 'unbounded' }),
      walkToProjectRegistry(cwd, homeDir),
    ],
    { concurrency: 'unbounded' },
  )
  const projectReg = projectRegPath === null ? ([] as const) : yield* readRegistry(projectRegPath, cwd)
  const projectPluginsDir = projectRegPath === null
    ? null
    : projectRegPath.slice(0, projectRegPath.lastIndexOf('/installed_plugins.json'))
  const npmProject = projectPluginsDir === null ? ([] as const) : yield* npmPluginRoots(projectPluginsDir)
  const marketplace = shadowById([claudeReg, ...ompLayers.map((layer) => layer.registry), projectReg])
  return Object.values(
    Object.fromEntries(
      [...marketplace, ...shadowById([...ompLayers.map((layer) => layer.npm), npmProject])].map(
        (root) => [root.path, root] as const,
      ),
    ),
  )
})

const decodePluginSettings = (content: string, pluginRoot: string): SettingsSource | null => {
  if (content === '') return null
  const jsonOrError = S.decodeUnknownExit(S.fromJsonString(S.Record(S.String, S.Unknown)))(content)
  if (Exit.isFailure(jsonOrError)) return null
  const parsed = parseSettings(jsonOrError.value)
  return Exit.isFailure(parsed) ? null : { settings: parsed.value, managed: false, pluginRoot }
}

const loadOnePlugin = (root: PluginRoot) =>
  Effect.gen(function*() {
    const hasManifest = yield* fileExists(`${root.path}/.claude-plugin/plugin.json`)
    if (!hasManifest) return { hookFile: null as string | null, source: null as SettingsSource | null }
    const hookFile = `${root.path}/hooks/hooks.json`
    const content = yield* readText(hookFile)
    return { hookFile, source: decodePluginSettings(content, root.path) }
  })

export const loadPluginHookSources = Effect.fn('loadPluginHookSources')(function*(
  homeDir: string,
  cwd: string,
) {
  const loaded = yield* Effect.forEach(yield* listEnabledClaudePluginRoots(homeDir, cwd), loadOnePlugin, {
    concurrency: 'unbounded',
  })
  return {
    sources: loaded.flatMap((row) => (row.source === null ? [] : [row.source])),
    hookFiles: loaded.flatMap((row) => (row.hookFile === null ? [] : [row.hookFile])),
  } as const
})

export const parseSettings = S.decodeUnknownExit(SettingsJSON)

const ALL_HOOK_EVENTS: readonly BridgedEvent[] = BRIDGED_EVENTS

const asRecordOpt = S.decodeUnknownOption(S.Record(S.String, S.Unknown))

interface HookRow {
  readonly matcher?: string | undefined
  readonly hooks: readonly { readonly type?: string | undefined }[]
}

const NO_ROWS: readonly HookRow[] = []

const asHookRows = S.decodeUnknownOption(
  S.Array(
    S.Struct({
      matcher: S.optional(S.String),
      hooks: S.Array(S.Struct({ type: S.optional(S.String) })).pipe(
        S.withDecodingDefaultTypeKey(Effect.succeed([])),
      ),
    }),
  ),
)

function settingsNamespace(
  json: unknown,
): Option.Option<{ namespace: Record<string, unknown>; outer: Record<string, unknown>; isWrapped: boolean }> {
  return Option.map(asRecordOpt(json), (record) =>
    Option.match(asRecordOpt(record['hooks']), {
      onNone: () => ({ namespace: record, outer: record, isWrapped: false }),
      onSome: (namespace) => ({ namespace, outer: record, isWrapped: true }),
    }))
}

const displayable = (value: string): string => value.replaceAll(/[\p{Cc}\p{Cf}]/gu, '\uFFFD')

const EMPTY_COVERAGE: HookCoverage = {
  unrecognized: [],
  notCarried: [],
  matcherNotEvaluable: [],
  matcherOutOfReach: [],
  shadowed: [],
  disabled: [],
}

const CATALOG_EVENTS: readonly string[] = ALL_CLAUDE_CODE_EVENTS
const UNBRIDGED_LOOKUP: Readonly<Record<string, string>> = UNBRIDGED_REASONS
const NON_EVALUABLE_LOOKUP: Readonly<Record<string, string>> = NON_EVALUABLE_MATCHERS
const IF_EVALUATING_EVENTS: readonly string[] = TOOL_EVENTS
const REACH_LOOKUP: Readonly<Record<string, Readonly<Record<string, string>>>> = MATCHER_REACH

const declaredMatchers = (value: unknown): readonly string[] =>
  Option.getOrElse(asHookRows(value), () => NO_ROWS).flatMap((row) => row.matcher === undefined ? [] : [row.matcher])

const declaresMatcher = (value: unknown): boolean => declaredMatchers(value).length > 0

export function hookCoverage(json: unknown): HookCoverage {
  return Option.match(settingsNamespace(json), {
    onNone: () => EMPTY_COVERAGE,
    onSome: ({ isWrapped, namespace, outer }) => {
      const unrecognized: HookCoverageRow[] = []
      const notCarried: HookCoverageRow[] = []
      const matcherNotEvaluable: HookCoverageRow[] = []
      const matcherOutOfReach: HookCoverageRow[] = []
      const shadowed: HookCoverageRow[] = []
      for (const event of Object.keys(namespace)) {
        if (!isWrapped && event === 'disableAllHooks') continue
        const unbridged = UNBRIDGED_LOOKUP[event]
        if (unbridged !== undefined) {
          notCarried.push({ event: displayable(event), reason: unbridged })
          continue
        }
        if (!CATALOG_EVENTS.includes(event)) {
          unrecognized.push({ event: displayable(event), reason: UNRECOGNIZED_KEY_REASON })
          continue
        }
        const unreadable = NON_EVALUABLE_LOOKUP[event]
        if (unreadable !== undefined && declaresMatcher(namespace[event])) {
          matcherNotEvaluable.push({ event: displayable(event), reason: unreadable })
        }
        const reach = REACH_LOOKUP[event]
        if (reach === undefined) continue
        matcherOutOfReach.push(
          ...declaredMatchers(namespace[event]).flatMap((matcher): readonly HookCoverageRow[] => {
            const reason = reach[matcher]
            if (reason === undefined) return []
            return [{ event: `${displayable(event)} (matcher "${displayable(matcher)}")`, reason }]
          }),
        )
      }
      if (isWrapped) {
        for (const event of Object.keys(outer)) {
          if (!CATALOG_EVENTS.includes(event)) continue
          shadowed.push({ event: displayable(event), reason: WRAPPED_SHADOW_REASON })
        }
      }
      return { unrecognized, notCarried, matcherNotEvaluable, matcherOutOfReach, shadowed, disabled: [] }
    },
  })
}

export function disabledCoverage(sources: readonly DisableSource[]): readonly HookCoverageRow[] {
  const disabler = sources.find((s) => !s.managed && s.settings.disableAllHooks === true)
  if (disabler === undefined) return []
  const reason = `${DISABLED_ALL_REASON} ${displayable(disabler.label)}`
  return sources
    .filter((source) => !source.managed)
    .flatMap((source) =>
      ALL_HOOK_EVENTS.filter((event) => source.settings.hooks[event].length > 0).map((event) => ({
        event,
        reason,
      }))
    )
}

export function unsupportedHookTypes(json: unknown): readonly string[] {
  return Option.match(settingsNamespace(json), {
    onNone: () => [],
    onSome: ({ namespace }) => {
      const found = new Set<string>()
      for (const event of ALL_HOOK_EVENTS) {
        const rows = Option.getOrElse(asHookRows(namespace[event]), () => NO_ROWS)
        for (const row of rows) {
          for (const hook of row.hooks) {
            if (hook.type !== undefined && hook.type !== 'command') found.add(displayable(hook.type))
          }
        }
      }
      return Array.from(found)
    },
  })
}

export function matcherUnreadable(event: string): boolean {
  return NON_EVALUABLE_LOOKUP[event] !== undefined
}

export function ifEvaluatingEvent(event: string): boolean {
  return IF_EVALUATING_EVENTS.includes(event)
}

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

export class ClaudeSettingsSources extends Context.Service<
  ClaudeSettingsSources,
  {
    readonly describe: (
      cwd: string,
      homeDir: string,
    ) => Effect.Effect<
      {
        readonly paths: readonly string[]
        readonly hookFiles: readonly string[]
        readonly pluginSources: readonly SettingsSource[]
      },
      never,
      FileSystem
    >
  }
>()('@systemfsoftware/omp-claude-compat/settings/ClaudeSettingsSources') {}

export const ClaudeCodeSettingsLive = Layer.effect(
  ClaudeSettingsSources,
  Effect.succeed(
    ClaudeSettingsSources.of({
      describe: (cwd, homeDir) =>
        Effect.gen(function*() {
          const plugin = yield* loadPluginHookSources(homeDir, cwd)
          return {
            paths: settingsPaths(homeDir, cwd),
            hookFiles: plugin.hookFiles,
            pluginSources: plugin.sources,
          }
        }),
    }),
  ),
)

export interface SettingsGaps {
  readonly coverage: {
    readonly unrecognized: readonly { readonly event: string; readonly reason: string }[]
    readonly notCarried: readonly { readonly event: string; readonly reason: string }[]
    readonly matcherNotEvaluable: readonly { readonly event: string; readonly reason: string }[]
    readonly matcherOutOfReach: readonly { readonly event: string; readonly reason: string }[]
    readonly shadowed: readonly { readonly event: string; readonly reason: string }[]
    readonly disabled: readonly { readonly event: string; readonly reason: string }[]
  }
  readonly unsupportedHookTypes: readonly string[]
  readonly malformedFiles: readonly string[]
}

export class ClaudeSettings extends Context.Service<
  ClaudeSettings,
  {
    readonly load: (cwd: string, homeDir: string) => Effect.Effect<HookSettings | null, never, FileSystem>
    readonly gaps: (cwd: string, homeDir: string) => Effect.Effect<SettingsGaps, never, FileSystem>
  }
>()('@systemfsoftware/omp-claude-compat/settings/ClaudeSettings') {}

interface SettingsFileText {
  readonly path: string
  readonly content: string
}

interface LoadSettingsRaw {
  readonly texts: readonly SettingsFileText[]
  readonly pluginSources: readonly {
    readonly settings: HookSettings
    readonly managed: boolean
    readonly pluginRoot?: string
  }[]
}

const SettingsJsonWire = Wire.mint(SettingsJSON)

const decodeSources = (raw: LoadSettingsRaw): Result.Result<MergeCommand, never> => {
  const fromFiles = raw.texts.flatMap(({ path, content }) => {
    if (content === '') return []
    const jsonOrError = S.decodeUnknownExit(S.fromJsonString(S.Record(S.String, S.Unknown)))(content)
    if (Exit.isFailure(jsonOrError)) return []
    const decoded = S.decodeUnknownExit(SettingsJsonWire)(jsonOrError.value)
    if (Exit.isFailure(decoded)) return []
    return [
      {
        settings: decoded.value,
        managed: path === MANAGED_SETTINGS_PATH,
      },
    ]
  })
  return Result.succeed(packMergeCommand([...fromFiles, ...raw.pluginSources]))
}

const ClaudeSettingsLiveBase = Layer.effect(
  ClaudeSettings,
  Effect.gen(function*() {
    const sources = yield* ClaudeSettingsSources
    const capturedDescribe = sources.describe
    const loadCell = Cell.layer({
      read: ({ cwd, homeDir }: { readonly cwd: string; readonly homeDir: string }) =>
        Effect.gen(function*() {
          const { paths, pluginSources } = yield* capturedDescribe(cwd, homeDir)
          const fs = yield* FileSystem
          const texts = yield* Effect.forEach(
            paths,
            (path) =>
              Effect.map(
                fs.readFileString(path).pipe(Effect.orElseSucceed(() => '')),
                (content) => ({ path, content }),
              ),
            { concurrency: 'unbounded' },
          )
          return { texts, pluginSources }
        }),
      decode: decodeSources,
      decide: mergeEffectiveSettings,
      encode: (outcome) =>
        Result.match(outcome, {
          onFailure: () => null,
          onSuccess: snapshotSettings,
        }),
      write: (snapshot) => Effect.succeed(snapshot),
    })
    const collectGapsCaptured = (cwd: string, homeDir: string) =>
      Effect.gen(function*() {
        const { paths, hookFiles } = yield* capturedDescribe(cwd, homeDir)
        return yield* collectSettingsGapsWithPaths([...paths, ...hookFiles], homeDir, cwd)
      })
    return ClaudeSettings.of({
      load: (cwd, homeDir) => Cell.run(loadCell, { cwd, homeDir }),
      gaps: (cwd, homeDir) => collectGapsCaptured(cwd, homeDir),
    })
  }),
)

export const ClaudeSettingsLive = ClaudeSettingsLiveBase.pipe(Layer.provide(ClaudeCodeSettingsLive))

export const ClaudeSettingsLiveUnbaked = ClaudeSettingsLiveBase
