#!/usr/bin/env -S deno run --allow-read

/**
 * Gate: deno.enablePaths in .vscode/settings.json must cover every
 * Deno project under agent-plugins/.
 *
 * Discovery rule: a directory directly under agent-plugins/ that contains
 * deno.json or deno.jsonc is a Deno project and MUST be covered by a
 * prefix entry in deno.enablePaths. Coverage is prefix-based (pathStartsWith
 * semantics in vscode_deno — no globs): entry "agent-plugins" covers
 * "agent-plugins/foo", entry "agent-plugins/foo" covers only that child.
 *
 * Findings are recomputed from source bytes — the gate never trusts a
 * self-reported field (CHK1).
 */

type FindingKind = 'missing-settings' | 'uncovered' | 'stale' | 'unparseable'

interface Finding {
  readonly kind: FindingKind
  readonly detail: string
}

// — pure core —

const isCovered = (pluginDir: string, enablePaths: readonly string[]): boolean =>
  enablePaths.some((p) => pluginDir === p || pluginDir.startsWith(`${p}/`))

const isStaleEntry = (
  entry: string,
  pluginDirs: readonly string[],
): boolean => {
  if (!entry.startsWith('agent-plugins')) return false
  if (entry === 'agent-plugins') return false // prefix covers future plugins
  return !pluginDirs.includes(entry)
}

const findingsFor = (args: {
  readonly settingsJson: string
  readonly pluginDirs: readonly string[]
}): readonly Finding[] => {
  let parsed: unknown
  try {
    parsed = JSON.parse(args.settingsJson)
  } catch (error) {
    return [{
      kind: 'unparseable',
      detail: `.vscode/settings.json unparseable: ${error instanceof Error ? error.message : String(error)}`,
    }]
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return [{ kind: 'unparseable', detail: '.vscode/settings.json is not an object' }]
  }

  const enablePathsRaw = (parsed as Record<string, unknown>)['deno.enablePaths']

  if (enablePathsRaw === undefined) {
    // No restriction — every file is Deno-enabled; plugin dirs trivially covered.
    // Gate requires explicit denylist-free allowlist, so treat as missing.
    return [{
      kind: 'missing-settings',
      detail:
        'deno.enablePaths is missing — add "agent-plugins" (or exhaustive per-plugin entries) so agent-plugins Deno projects are covered',
    }]
  }

  if (!Array.isArray(enablePathsRaw) || !enablePathsRaw.every((v) => typeof v === 'string')) {
    return [{ kind: 'unparseable', detail: 'deno.enablePaths must be string[]' }]
  }

  const enablePaths = enablePathsRaw as readonly string[]

  const findings: Finding[] = []

  for (const dir of args.pluginDirs) {
    if (!isCovered(dir, enablePaths)) {
      findings.push({
        kind: 'uncovered',
        detail:
          `${dir} contains deno.json(c) but no deno.enablePaths entry covers it — add "agent-plugins" or "${dir}" to deno.enablePaths`,
      })
    }
  }

  for (const entry of enablePaths) {
    if (isStaleEntry(entry, args.pluginDirs)) {
      findings.push({
        kind: 'stale',
        detail: `${entry} is in deno.enablePaths but no agent-plugins Deno project exists at that path — remove it`,
      })
    }
  }

  return findings
}

// — imperative shell —

const SETTINGS_PATH = '.vscode/settings.json'
const PLUGINS_ROOT = 'agent-plugins'

const discoverPluginDirs = async (): Promise<readonly string[]> => {
  const dirs: string[] = []
  try {
    for await (const entry of Deno.readDir(PLUGINS_ROOT)) {
      if (!entry.isDirectory) continue
      const base = `${PLUGINS_ROOT}/${entry.name}`
      // check for deno.json or deno.jsonc
      let hasConfig = false
      for (const candidate of [`${base}/deno.json`, `${base}/deno.jsonc`]) {
        try {
          await Deno.stat(candidate)
          hasConfig = true
          break
        } catch {
          // missing
        }
      }
      if (hasConfig) dirs.push(base)
    }
  } catch (error) {
    // PLUGINS_ROOT missing — no plugins, vacuously covered
    if (error instanceof Deno.errors.NotFound) return []
    throw error
  }
  dirs.sort()
  return dirs
}

const selftest = (): number => {
  const assert = (cond: boolean, msg: string): void => {
    if (!cond) throw new Error(`selftest failed: ${msg}`)
  }
  const json = (paths: readonly string[]) => JSON.stringify({ 'deno.enablePaths': paths })

  // covered by parent prefix
  assert(
    findingsFor({ settingsJson: json(['agent-plugins']), pluginDirs: ['agent-plugins/a', 'agent-plugins/b'] })
      .length === 0,
    'parent prefix covers',
  )
  // per-plugin exhaustive
  assert(
    findingsFor({
      settingsJson: json(['agent-plugins/a', 'agent-plugins/b']),
      pluginDirs: ['agent-plugins/a', 'agent-plugins/b'],
    }).length === 0,
    'exhaustive per-plugin',
  )
  // uncovered
  assert(
    findingsFor({ settingsJson: json(['agent-plugins/a']), pluginDirs: ['agent-plugins/a', 'agent-plugins/b'] }).some((
      f,
    ) => f.kind === 'uncovered'),
    'detects uncovered',
  )
  // stale per-plugin entry
  assert(
    findingsFor({ settingsJson: json(['agent-plugins', 'agent-plugins/stale']), pluginDirs: ['agent-plugins/a'] }).some(
      (f) => f.kind === 'stale',
    ),
    'detects stale',
  )
  // parent prefix not stale
  assert(
    !findingsFor({ settingsJson: json(['agent-plugins']), pluginDirs: ['agent-plugins/a'] }).some((f) =>
      f.kind === 'stale'
    ),
    'parent not stale',
  )
  // missing settings
  assert(
    findingsFor({ settingsJson: JSON.stringify({}), pluginDirs: ['agent-plugins/a'] }).some((f) =>
      f.kind === 'missing-settings'
    ),
    'missing',
  )
  // non-agent-plugins entries ignored for stale
  assert(
    findingsFor({ settingsJson: json(['.claude', 'scripts', 'agent-plugins']), pluginDirs: ['agent-plugins/a'] })
      .length === 0,
    'non-plugin entries ok',
  )
  // empty plugins — no findings
  assert(findingsFor({ settingsJson: json(['agent-plugins']), pluginDirs: [] }).length === 0, 'empty plugins ok')

  return 0
}

if (import.meta.main) {
  const args = Deno.args
  if (args.includes('--selftest')) {
    Deno.exit(selftest())
  }

  const settingsJson = await Deno.readTextFile(SETTINGS_PATH)
  const pluginDirs = await discoverPluginDirs()
  const findings = findingsFor({ settingsJson, pluginDirs })

  if (findings.length === 0) Deno.exit(0)

  for (const f of findings) {
    // GitHub annotation + human line — no console.* print-debugging; this is the gate's product output
    Deno.stderr.writeSync(new TextEncoder().encode(`::error file=${SETTINGS_PATH}::${f.detail}\n`))
  }
  Deno.stderr.writeSync(new TextEncoder().encode(findings.map((f) => `error: ${f.detail}`).join('\n') + '\n'))
  Deno.exit(1)
}
