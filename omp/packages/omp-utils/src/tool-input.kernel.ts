import { Option, Schema as S } from 'effect'
import { isClaudeEditArray, isOmpEditArray } from './tool-input.schema.js'

/**
 * Kernel: translate OMP tool input shapes to Claude Code hook input shapes.
 *
 * OMP sends `edits: [{ old_text, new_text }]` and `path`;
 * Claude Code hooks expect `old_string`/`new_string` and `file_path`.
 *
 * OMP's `hashline` and `apply-patch` edit modes send neither: the whole change
 * arrives as one `input` string. A hook that scans the text being written —
 * comment, secret, and lint guards all do — then reads no content at all and
 * silently passes, while the same hook fires correctly on `Write`. Both
 * grammars mark an added line with a leading `+` and a removed line with `-`,
 * which is all the content recovery needs; path recovery from the same string
 * is `editTargetPaths` in `edit-target.kernel.ts`.
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

const patchLines = (input: string, sigil: string): string | undefined => {
  const marked = input.split('\n').filter((line) => line.startsWith(sigil))
  return marked.length === 0 ? undefined : marked.map((line) => line.slice(sigil.length)).join('\n')
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

  if (EDIT_TOOLS[toolName] === true && typeof out['input'] === 'string' && !('new_string' in out)) {
    const added = patchLines(out['input'], '+')
    const removed = patchLines(out['input'], '-')
    out = {
      ...out,
      ...(added === undefined ? {} : { new_string: added }),
      ...(removed === undefined ? {} : { old_string: removed }),
    }
  }

  return out
}

const asRecord = S.decodeUnknownOption(S.Record(S.String, S.Unknown))

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
  const fields = Option.getOrNull(asRecord(updated))
  if (fields === null) return {}
  const pathKey = 'file_path' in original || !('path' in original) ? 'file_path' : 'path'
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(fields)) {
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
