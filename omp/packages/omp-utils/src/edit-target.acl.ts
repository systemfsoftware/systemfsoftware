/**
 * ACL: recover the target file paths from an OMP `edit` payload.
 *
 * OMP's `replace`/`patch` modes send `{ path, edits[] }`, but `hashline` and
 * `apply-patch` send `{ input: string }` with every target named *inside* the
 * patch text. Claude Code has no such shape — `Edit` always carries one
 * `file_path` — so a path-based hook reads nothing and fails open.
 *
 * Grammar mirrored from the harness so the two stay in step:
 * `edit/renderer.ts#getHashlineInputSections` and `edit/modes/apply-patch.lark`.
 */
const HASHLINE_TAG = /#[0-9a-fA-F]{4}$/u
const APPLY_PATCH_FILE = /^\*\*\* (?:Add|Update|Delete) File:\s*(.+)$/
const APPLY_PATCH_MOVE = /^\*\*\* Move to:\s*(.+)$/
const HASHLINE_MOVE = 'MV '

const PATH_TOOLS: Record<string, true> = {
  Write: true,
  Edit: true,
  Read: true,
  MultiEdit: true,
  Update: true,
  Create: true,
}

function stripTagAndQuotes(raw: string): string {
  const trimmed = raw.trim()
  const tagAt = HASHLINE_TAG.exec(trimmed)?.index
  const untagged = tagAt === undefined ? trimmed : trimmed.slice(0, tagAt)
  if (untagged.length < 2) return untagged
  const first = untagged[0]
  const last = untagged[untagged.length - 1]
  const quoted = (first === '"' || first === "'") && first === last
  return quoted ? untagged.slice(1, -1) : untagged
}

function hashlineHeaderPath(line: string): string | undefined {
  const trimmed = line.trimEnd()
  if (!trimmed.startsWith('[')) return undefined
  const end = trimmed.endsWith(']') ? trimmed.length - 1 : trimmed.length
  const path = stripTagAndQuotes(trimmed.slice(1, end))
  return path.length > 0 ? path : undefined
}

function patchTextTargets(input: string): readonly string[] {
  const found: string[] = []
  const body = input.startsWith('\uFEFF') ? input.slice(1) : input
  let inHashlineSection = false

  for (const line of body.split('\n')) {
    const header = hashlineHeaderPath(line)
    if (header !== undefined) {
      found.push(header)
      inHashlineSection = true
      continue
    }

    const file = APPLY_PATCH_FILE.exec(line)?.[1]
    if (file !== undefined) {
      found.push(file.trim())
      continue
    }

    const moveTo = APPLY_PATCH_MOVE.exec(line)?.[1]
    if (moveTo !== undefined) {
      found.push(moveTo.trim())
      continue
    }

    // `MV DEST` renames into a path the section header never named, so a guard
    // reading only headers misses a move into a protected tree. Gating on an
    // open section keeps an apply-patch context line (` MV x`) from matching;
    // hashline body rows are `+`-prefixed and cannot collide.
    const trimmed = line.trim()
    if (inHashlineSection && trimmed.startsWith(HASHLINE_MOVE)) {
      const dest = stripTagAndQuotes(trimmed.slice(HASHLINE_MOVE.length))
      if (dest.length > 0) found.push(dest)
    }
  }

  return found
}

function nonEmptyString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Every path the payload would write, in payload order, deduplicated.
 *
 * Returns all targets rather than the first: one `edit` call can carry many
 * sections, and populating only the first leaves an ordering bypass where an
 * innocent leading section screens a forbidden trailing one.
 */
export function editTargetPaths(toolName: string, input: Record<string, unknown>): readonly string[] {
  if (PATH_TOOLS[toolName] !== true) return []

  const patch = input['input']
  const fromText = typeof patch === 'string' ? patchTextTargets(patch) : []
  if (fromText.length > 0) return Array.from(new Set(fromText))

  const declared = nonEmptyString(input, 'file_path') ?? nonEmptyString(input, 'path')
  return declared === undefined ? [] : [declared]
}
