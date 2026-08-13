// Shared hook-payload surface for the oxlint-guard hooks: the Claude Code hook
// contract shape, the edit-tool matcher, the oxlint config basenames, and the
// lintable extensions. Both guards decode the same payload; everything else
// about them is separate.

/** The edit tools both hooks register on, matching hooks/hooks.json. */
export const EDIT_TOOL_NAMES = [
  'Write',
  'Edit',
  'Update',
  'MultiEdit',
  'Create',
  'morph_mcp_edit-file',
  'morph_edit',
] as const

/** Standard oxlint config filenames, searched upward from the edited file. */
export const OXLINT_CONFIG_BASENAMES = [
  'oxlint.config.ts',
  'oxlint.config.js',
  'oxlint.config.mjs',
  'oxlint.config.cjs',
  '.oxlintrc.json',
  'oxlint.json',
] as const

/** Extensions the lint guard lints with oxlint. */
export const LINTABLE_EXTENSIONS = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'] as const

export interface EditCommand {
  readonly toolName: string
  readonly filePath: string
  readonly toolInput: Record<string, unknown>
}

/** True for any non-array object; the guards' shared record predicate. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Existence probe via Deno.stat: absent and unreadable both read as false. */
export const denoExists = async (target: string): Promise<boolean> => {
  try {
    await Deno.stat(target)
    return true
  } catch {
    return false
  }
}

// tool_input stays an open record: each tool contributes its own keys and the
// OMP bridge synthesizes more, and a payload that cannot be parsed must still
// be classifiable so the config guard can fail closed on it.
export const decodePayload = (raw: string): EditCommand | undefined => {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!isRecord(value)) {
    return undefined
  }
  const payload = value
  const toolName = payload['tool_name']
  if (typeof toolName !== 'string' || toolName === '' || !EDIT_TOOL_NAMES.includes(toolName as never)) {
    return undefined
  }
  const toolInput = payload['tool_input']
  const input: Record<string, unknown> = isRecord(toolInput) ? toolInput : {}
  const filePath = input['file_path']
  if (typeof filePath !== 'string' || filePath === '') {
    return undefined
  }
  return { toolName, filePath, toolInput: input }
}

/** Cap for the hook stdin payload: 1 MiB, defense in depth against a runaway pipe. */
export const STDIN_CAP_BYTES = 1024 * 1024

export type StdinResult =
  | { readonly tag: 'content'; readonly content: string }
  | { readonly tag: 'too-large' }

/**
 * Reads all of stdin, bounded: a payload that exceeds the cap returns
 * 'too-large' without buffering the overflow.
 */
export const readStdin = async (cap: number = STDIN_CAP_BYTES): Promise<StdinResult> => {
  const reader = Deno.stdin.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      if (value === undefined) {
        continue
      }
      total += value.byteLength
      if (total > cap) {
        return { tag: 'too-large' }
      }
      chunks.push(value)
    }
    const merged = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.byteLength
    }
    return { tag: 'content', content: new TextDecoder().decode(merged) }
  } finally {
    reader.releaseLock()
  }
}
