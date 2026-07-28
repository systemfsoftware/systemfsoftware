/**
 * ACL: translate OMP tool input shapes to Claude Code hook input shapes.
 *
 * OMP sends `edits: [{ old_text, new_text }]` and `path`;
 * Claude Code hooks expect `old_string`/`new_string` and `file_path`.
 */
const FILE_TOOLS: Record<string, true> = {
  Write: true,
  Edit: true,
  Read: true,
  MultiEdit: true,
  Update: true,
  Create: true,
}
const EDIT_TOOLS: Record<string, true> = { Edit: true, MultiEdit: true, Update: true }

function isOmpEditArray(value: unknown): value is readonly Record<string, unknown>[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => typeof entry === 'object' && entry !== null && ('new_text' in entry || 'old_text' in entry))
  )
}

export function normalizeToolInput(toolName: string, input: Record<string, unknown>): Record<string, unknown> {
  let out = input
  if (FILE_TOOLS[toolName] === true && 'path' in out && !('file_path' in out)) {
    const { path, ...rest } = out
    out = { file_path: path, ...rest }
  }

  if (EDIT_TOOLS[toolName] === true && 'edits' in out && isOmpEditArray(out['edits']) && !('new_string' in out)) {
    const claudeEdits = out['edits'].map((entry) => ({
      old_string: typeof entry['old_text'] === 'string' ? entry['old_text'] : '',
      new_string: typeof entry['new_text'] === 'string' ? entry['new_text'] : '',
    }))
    out = {
      ...out,
      edits: claudeEdits,
      old_string: claudeEdits.map((entry) => entry['old_string']).join('\n'),
      new_string: claudeEdits.map((entry) => entry['new_string']).join('\n'),
    }
  }

  return out
}

function isClaudeEditArray(value: unknown): value is readonly Record<string, unknown>[] {
  return (
    Array.isArray(value) &&
    value.every((entry) =>
      typeof entry === 'object' && entry !== null && ('new_string' in entry || 'old_string' in entry)
    )
  )
}

/**
 * Re-key a hook's `updatedInput` back to the names the payload arrived with.
 *
 * `normalizeToolInput` renames `path` to `file_path` and rewrites `edits`, so a
 * rewrite echoed back under Claude Code names would land beside the original
 * keys that OMP actually reads, and be silently discarded.
 */
export function denormalizeToolInput(
  original: Record<string, unknown>,
  updated: unknown,
): Record<string, unknown> {
  if (typeof updated !== 'object' || updated === null || Array.isArray(updated)) return {}
  const pathKey = 'file_path' in original || !('path' in original) ? 'file_path' : 'path'
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(updated)) {
    if (key === 'file_path') {
      out[pathKey] = value
      continue
    }
    // Derived by the forward pass from `edits`; echoing them back would add
    // keys the OMP payload never had.
    if ((key === 'old_string' || key === 'new_string') && !(key in original)) continue
    if (key === 'edits' && isClaudeEditArray(value) && isOmpEditArray(original['edits'])) {
      out['edits'] = value.map((entry) => ({
        old_text: typeof entry['old_string'] === 'string' ? entry['old_string'] : '',
        new_text: typeof entry['new_string'] === 'string' ? entry['new_string'] : '',
      }))
      continue
    }
    out[key] = value
  }

  return out
}
