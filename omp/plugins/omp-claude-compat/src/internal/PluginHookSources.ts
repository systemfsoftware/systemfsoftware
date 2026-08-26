import { Effect, Exit, Schema as S } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import { homedir } from 'node:os'
import { parseSettings } from '../HookSettings.js'
import type { SettingsSource } from '../HookSettings.schema.js'

/** @internal */
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

/** @internal */
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

/** @internal */
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
  Effect.map(readText(path), (content) => content === '' ? null : parseRegistryJson(content))

const fileExists = (path: string) =>
  Effect.flatMap(FileSystem, (fs) => fs.exists(path).pipe(Effect.orElseSucceed(() => false)))

const walkToProjectRegistry = (cwd: string, homeDir: string) =>
  Effect.map(
    Effect.forEach(
      ancestorDirs(cwd, homeDir),
      (dir) =>
        Effect.map(
          fileExists(`${dir}/.omp`),
          (present) => present ? `${dir}/.omp/plugins/installed_plugins.json` : null,
        ),
      { concurrency: 'unbounded' },
    ),
    (hits) => hits.find((hit) => hit !== null) ?? null,
  )

const npmCandidateNames = (pkg: unknown, lock: unknown): readonly string[] => {
  const deps = asRecord(asRecord(pkg)?.['dependencies'])
  const lockPlugins = asRecord(asRecord(lock)?.['plugins'])
  return [
    ...new Set([
      ...Object.keys(deps ?? {}),
      ...Object.keys(lockPlugins ?? {}),
    ]),
  ].filter((name) => lockEnabled(lock, name))
}

const npmPluginRoots = (pluginsDir: string) =>
  Effect.flatMap(
    Effect.all({
      pkg: readJson(`${pluginsDir}/package.json`),
      lock: readJson(`${pluginsDir}/omp-plugins.lock.json`),
    }, { concurrency: 'unbounded' }),
    ({ pkg, lock }) =>
      Effect.map(
        Effect.forEach(
          npmCandidateNames(pkg, lock),
          (name) => {
            const path = `${pluginsDir}/node_modules/${name}`
            return Effect.map(
              fileExists(`${path}/.claude-plugin/plugin.json`),
              (ok) => ok ? { id: `npm:${name}`, path } : null,
            )
          },
          { concurrency: 'unbounded' },
        ),
        (rows) => rows.filter((row) => row !== null),
      ),
  )

const readRegistry = (path: string, cwd: string) =>
  Effect.map(readText(path), (text) => enabledRootsFromRegistry(text, cwd))

const loadOmpDir = (dir: string, cwd: string) =>
  Effect.all({
    registry: readRegistry(`${dir}/installed_plugins.json`, cwd),
    npm: npmPluginRoots(dir),
  }, { concurrency: 'unbounded' })

/** @internal */
export const listEnabledClaudePluginRoots = Effect.fn('listEnabledClaudePluginRoots')(function*(
  homeDir: string,
  cwd: string,
) {
  const ompDirs = userOmpPluginDirs(homeDir)
  const [claudeReg, ompLayers, projectRegPath] = yield* Effect.all([
    readRegistry(`${homeDir}/.claude/plugins/installed_plugins.json`, cwd),
    Effect.forEach(ompDirs, (dir) => loadOmpDir(dir, cwd), { concurrency: 'unbounded' }),
    walkToProjectRegistry(cwd, homeDir),
  ], { concurrency: 'unbounded' })
  const projectReg = yield* projectRegPath === null
    ? Effect.succeed([] as const)
    : readRegistry(projectRegPath, cwd)
  const projectPluginsDir = projectRegPath === null
    ? null
    : projectRegPath.slice(0, projectRegPath.lastIndexOf('/installed_plugins.json'))
  const npmProject = yield* projectPluginsDir === null
    ? Effect.succeed([] as const)
    : npmPluginRoots(projectPluginsDir)
  const marketplace = shadowById([
    claudeReg,
    ...ompLayers.map((layer) => layer.registry),
    projectReg,
  ])
  return Object.values(
    Object.fromEntries([
      ...marketplace,
      ...shadowById([...ompLayers.map((layer) => layer.npm), npmProject]),
    ].map((root) => [root.path, root])),
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
    if (!hasManifest) return { hookFile: null, source: null }
    const hookFile = `${root.path}/hooks/hooks.json`
    const content = yield* readText(hookFile)
    return { hookFile, source: decodePluginSettings(content, root.path) }
  })

/** @internal */
export const loadPluginHookSources = Effect.fn('loadPluginHookSources')(function*(
  homeDir: string,
  cwd: string,
) {
  const loaded = yield* Effect.forEach(
    yield* listEnabledClaudePluginRoots(homeDir, cwd),
    loadOnePlugin,
    { concurrency: 'unbounded' },
  )
  return {
    sources: loaded.flatMap((row) => row.source === null ? [] : [row.source]),
    hookFiles: loaded.flatMap((row) => row.hookFile === null ? [] : [row.hookFile]),
  } as const
})
