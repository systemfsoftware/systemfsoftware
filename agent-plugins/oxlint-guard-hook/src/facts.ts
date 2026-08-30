import { Data, Effect, Path } from 'effect'

const path = Effect.runSync(Effect.provide(Path.Path, Path.layer))

export interface ProcessResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export type SpawnFailureReason = 'not-found' | 'not-executable' | 'unknown'

export class SpawnFailure extends Data.TaggedClass('SpawnFailure')<{
  readonly reason: SpawnFailureReason
  readonly message: string
}> {}

export type RunOutcome =
  | { readonly _tag: 'result'; readonly result: ProcessResult }
  | { readonly _tag: 'timeout' }
  | { readonly _tag: 'spawn-failure'; readonly failure: SpawnFailure }

export interface Runner {
  readonly run: (
    program: string,
    args: string[],
    cwd: string,
    env: Record<string, string>,
    timeoutMs: number,
  ) => Promise<RunOutcome>
}

export interface EditCommand {
  readonly toolName: string
  readonly filePath: string
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const isEditTool = (toolName: string): boolean => EDIT_TOOL_NAMES.includes(toolName)

export const isLintable = (filePath: string): boolean =>
  LINTABLE_EXTENSIONS.includes(path.extname(filePath).slice(1).toLowerCase())

export const decodePayload = (raw: string): EditCommand | undefined => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!isRecord(parsed) || typeof parsed.tool_name !== 'string' || !isRecord(parsed.tool_input)) {
    return undefined
  }
  if (!isEditTool(parsed.tool_name)) {
    return undefined
  }
  if (typeof parsed.tool_input.file_path !== 'string' || parsed.tool_input.file_path === '') {
    return undefined
  }
  return { toolName: parsed.tool_name, filePath: parsed.tool_input.file_path }
}

export const EDIT_TOOL_NAMES: readonly string[] = [
  'Write',
  'Edit',
  'Update',
  'MultiEdit',
  'Create',
  'morph_mcp_edit-file',
  'morph_edit',
]
export const LINTABLE_EXTENSIONS: readonly string[] = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'mts',
  'cts',
  'mjs',
  'cjs',
  'vue',
  'svelte',
  'astro',
]

export const COMMAND_BUDGET_MS = 30_000
export const STDIN_CAP_BYTES = 1024 * 1024

export const PROJECT_ROOT_ENV = 'CLAUDE_PROJECT_DIR'
export const ALLOWLISTED_ENV_VARS: readonly string[] = [
  'PATH',
  'HOME',
  'TMPDIR',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'SystemRoot',
  'COMSPEC',
  'PATHEXT',
]

const DENO_SHEBANG = /^#!.*\bdeno\b/

export interface GuardFs {
  readonly exists: (target: string) => Promise<boolean>
  readonly readFirstLine: (target: string) => Promise<string | null>
}

export interface GatherFacts {
  readonly resolvedPath: string
  readonly exists: boolean
  readonly extension: string
  readonly denoShebang: boolean
  readonly configPath: string | null
}

export const gather = async (
  fs: GuardFs,
  filePath: string,
  cwd: string,
  rootOverride: string | undefined,
): Promise<GatherFacts> => {
  const resolvedPath = path.resolve(cwd, filePath)
  const extension = path.extname(resolvedPath).slice(1)
  const exists = await fs.exists(resolvedPath)
  const firstLine = exists ? await fs.readFirstLine(resolvedPath) : null
  const denoShebang = DENO_SHEBANG.test(firstLine ?? '')
  const needsConfig = exists && !denoShebang && isLintable(resolvedPath)
  const configPath = needsConfig
    ? await firstExistingConfig(
      fs,
      walkUp(path.dirname(resolvedPath), await findProjectRoot(fs, cwd, rootOverride)),
    )
    : null
  return { resolvedPath, exists, extension, denoShebang, configPath }
}

const withinRoot = (root: string, dir: string): boolean => dir === root || dir.startsWith(root + path.sep)

const walkUp = (startDir: string, root: string): readonly string[] => {
  const dirs: string[] = []
  let dir = startDir
  while (withinRoot(root, dir)) {
    dirs.push(dir)
    const parent = path.dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }
  return dirs
}

const findProjectRoot = async (fs: GuardFs, cwd: string, rootOverride: string | undefined): Promise<string> => {
  if (rootOverride !== undefined && rootOverride.trim() !== '') {
    return path.resolve(rootOverride)
  }
  let dir = cwd
  while (true) {
    if (await fs.exists(path.join(dir, '.git'))) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      return cwd
    }
    dir = parent
  }
}

const firstExistingConfig = async (fs: GuardFs, dirs: readonly string[]): Promise<string | null> => {
  const candidates = dirs.flatMap((dir) => CONFIG_BASENAMES.map((name) => path.join(dir, name)))
  for (const candidate of candidates) {
    if (await fs.exists(candidate)) {
      return candidate
    }
  }
  return null
}

export const PRIMARY_CONFIG_BASENAMES: readonly string[] = [
  '.oxlintrc.json',
  '.oxlintrc.jsonc',
  'oxlint.config.ts',
  'oxlint.config.mts',
]
export const FALLBACK_CONFIG_BASENAMES: readonly string[] = [
  'oxlint.config.js',
  'oxlint.config.mjs',
  'oxlint.config.cjs',
  'oxlint.json',
]
export const CONFIG_BASENAMES: readonly string[] = [...PRIMARY_CONFIG_BASENAMES, ...FALLBACK_CONFIG_BASENAMES]

export type StdinResult =
  | { readonly _tag: 'content'; readonly content: string }
  | { readonly _tag: 'too-large' }

export const readStdin = async (
  stream: ReadableStream<Uint8Array> = Deno.stdin.readable,
  cap: number = STDIN_CAP_BYTES,
): Promise<StdinResult> => {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let tooLarge = false
  try {
    while (!tooLarge) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      if (value === undefined) {
        continue
      }
      if (total + value.byteLength > cap) {
        tooLarge = true
        break
      }
      chunks.push(value)
      total += value.byteLength
    }
  } finally {
    reader.releaseLock()
  }
  if (tooLarge) {
    return { _tag: 'too-large' }
  }
  const decoder = new TextDecoder()
  const parts = chunks.map((chunk) => decoder.decode(chunk, { stream: true }))
  parts.push(decoder.decode())
  return { _tag: 'content', content: parts.join('') }
}
