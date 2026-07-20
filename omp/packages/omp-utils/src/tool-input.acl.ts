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
