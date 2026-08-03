/**
 * Kernel cell — pure, domain-blind matchers for the dispatch-doctrine gate.
 * The executor cell imports these as predicates; no kernel file does I/O.
 */

const DELEGATOR_TOOLS: Record<string, true> = { task: true, agent: true }

export const isDelegatorTool = (name: string): boolean => DELEGATOR_TOOLS[name.trim().toLowerCase()] === true

const SKILL_SCHEME = 'skill://'
const SKILLS_DIR = '/skills/'
const SKILL_FILE = '/SKILL.md'

/**
 * Extract the skill name from a `skill://` URI. The name closes at the first
 * `:` (selector, e.g. `:raw`, `:10-40`) or `/` (sub-path) after the scheme;
 * everything after it is ignored, so selectors and sub-paths both resolve to
 * the base skill.
 */
const skillUriName = (path: string): string | null => {
  const body = path.slice(SKILL_SCHEME.length)
  if (body.length === 0) return null
  const nameEnd = body.search(/[:/]/)
  return nameEnd === -1 ? body : body.slice(0, nameEnd)
}

/**
 * Path-normalization sufficient for tail-matching without realpath: backslash
 * to forward slash. `~` and `./` are preserved — tail-matching is
 * prefix-insensitive, so `./skills/<name>/SKILL.md` and
 * `~/.claude/skills/<name>/SKILL.md` both match as-is.
 */
const normalizeFilesystemPath = (path: string): string => path.split('\\').join('/')

const matchesSkillTail = (normalizedPath: string, skill: string): boolean => {
  const tail = SKILLS_DIR + skill + SKILL_FILE
  return normalizedPath.endsWith(tail)
}

/**
 * Recognize a read-path that targets a doctrine skill. Pure-string only.
 *
 * Recognized shapes:
 *   1. `skill://<name>` (with optional `:selector` stripped)
 *   2. `skill://<name>/<sub-path>` (selector before sub-path also stripped)
 *   3. Filesystem paths ending in `/skills/<name>/SKILL.md` — workspace,
 *      installed (`~/.omp/plugins/node_modules/...`), and standalone
 *      (`~/.claude/skills/<name>/SKILL.md`) layouts.
 *
 * Non-matches: empty path, non-skill paths, names not in `skills`, the
 * prefix-trap `skill://<name>-extra` where `<name>-extra` is not in `skills`.
 */
export const matchesDoctrineSkillPath = (
  path: string,
  skills: readonly string[],
): boolean => {
  if (path.startsWith(SKILL_SCHEME)) {
    const name = skillUriName(path)
    if (name === null) return false
    return skills.includes(name)
  }

  const normalized = normalizeFilesystemPath(path)
  for (const skill of skills) {
    if (matchesSkillTail(normalized, skill)) return true
  }
  return false
}

/**
 * Structured spec-shape extraction for the dispatch telemetry.
 *
 * `agent_discipline.dispatch.observed` carries a deterministic shape check
 * so the dogfood adoption query can spot dispatches that already read the
 * doctrine and explicitly named the unit-spec fields. The check is purely
 * textual (case-insensitive, word-boundary) and reports three booleans
 * matching the kernel's SPEC rule field names.
 */
const SPEC_FIELD_PATTERNS = {
  hasObjective: /\bobjective\b/i,
  hasWriteScope: /\bwrite_scope\b/i,
  hasVerifyCommands: /\bverify_commands\b/i,
} as const

export const extractSpecShape = (text: string): {
  readonly hasObjective: boolean
  readonly hasWriteScope: boolean
  readonly hasVerifyCommands: boolean
} => ({
  hasObjective: SPEC_FIELD_PATTERNS.hasObjective.test(text),
  hasWriteScope: SPEC_FIELD_PATTERNS.hasWriteScope.test(text),
  hasVerifyCommands: SPEC_FIELD_PATTERNS.hasVerifyCommands.test(text),
})
