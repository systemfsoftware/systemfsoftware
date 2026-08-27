import { Option, Schema as S } from 'effect'
import { ClaudeEdits, OmpEdits } from './wire.schema.js'

/** Derived recognisers, declared beside the shapes they decide. */
export const isOmpEditArray = S.is(OmpEdits)
export const isClaudeEditArray = S.is(ClaudeEdits)

// ── ToolName.ts ──
/**
 * Kernel: normalize OMP tool names to Claude Code hook-matcher convention.
 *
 * OMP emits lowercase tool names (`read`, `bash`, `write`, ...); Claude Code's
 * hook matchers are anchored `^(?:...)$` patterns over the PascalCase names
 * the runtime itself uses (`Read`, `Bash`, `Write`, ...). A naive
 * capitalize-first-character transform is wrong in two directions: tools
 * with no Claude Code equivalent (e.g. `github`) must NOT be renamed to a
 * shape no user matcher could anticipate, and MCP-prefixed names must stay
 * verbatim — Claude Code keeps the `mcp__...` casing as-is.
 *
 * Resolution order (first match wins):
 *   1. Empty string returns unchanged.
 *   2. `mcp__`-prefixed names return verbatim.
 *   3. Exact lookup in the explicit alias table for OMP tools that have a
 *      real Claude Code counterpart.
 *   4. Fallback: capitalize the first character. OMP-only tools (`github`,
 *      `eval`, `hub`, the `vibe_*` family, ...) keep this so user matchers
 *      written against today's names keep working.
 *
 * Purity: pure boundary translation. No I/O, no throwing, no logging.
 */
const OMP_TO_CLAUDE_TOOL_ALIAS: Readonly<Record<string, string>> = {
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  bash: 'Bash',
  glob: 'Glob',
  grep: 'Grep',
  task: 'Task',
  todo: 'TodoWrite',
  web_search: 'WebSearch',
  ask: 'AskUserQuestion',
}

export function normalizeToolName(name: string): string {
  if (name.length === 0) return name
  if (name.startsWith('mcp__')) return name
  const aliased = OMP_TO_CLAUDE_TOOL_ALIAS[name]
  if (aliased !== undefined) return aliased
  return name.charAt(0).toUpperCase() + name.slice(1)
}

// ── Matcher.ts ──
/**
 * Kernel: match OMP tool names against Claude Code hook matcher patterns.
 *
 * Hook matchers are pipe-separated regex alternatives (e.g. `"Write|Edit"`).
 * An empty/undefined matcher matches everything.
 *
 * The compiled regex is cached per-pattern. The cache is bounded at
 * `REGEX_CACHE_CAP` entries; once full it is cleared before inserting the
 * next entry (simplest bounded policy — do not grow without bound on
 * attacker-controlled settings strings).
 *
 * A malformed matcher from settings.json (e.g. `"Write("`) MUST NOT throw
 * out of this function: a throw inside hook dispatch takes down the
 * dispatch and silently drops every subsequent hook for the session.
 *
 * On an invalid pattern we FAIL CLOSED — we return `true` so the hook
 * RUNS. Rationale: these matchers gate security hooks; if we cannot
 * determine whether the matcher applies, running the hook is the safe
 * direction (the wrong direction here is silently disabling a guard).
 * The invalid pattern is cached too, so a broken pattern is not
 * re-compiled on every hook dispatch.
 *
 * Purity: pure boundary translation. No I/O, no logging.
 */
const REGEX_CACHE_CAP = 256

const regexCache = new Map<string, RegExp | true>()

export function matchesMatcher(toolName: string, matcher: string | undefined): boolean {
  if (matcher === undefined || matcher.length === 0) return true
  const pattern = matcher
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('|')
  if (pattern.length === 0) return true
  const cached = regexCache.get(pattern)
  if (cached !== undefined) {
    return cached === true ? true : cached.test(toolName)
  }
  const compiled = compilePattern(pattern)
  if (regexCache.size >= REGEX_CACHE_CAP) regexCache.clear()
  regexCache.set(pattern, compiled)
  return compiled === true ? true : compiled.test(toolName)
}

/**
 * Compile one matcher pattern. Returns the regex on success, or `true` to
 * signal "fail closed — run the hook" on a malformed pattern. Never throws.
 */
function compilePattern(pattern: string): RegExp | true {
  try {
    return new RegExp(`^(?:${pattern})$`)
  } catch {
    return true
  }
}

// ── PermissionRule.ts ──
/**
 * Kernel: match a Claude Code `if` permission rule against a tool call.
 *
 * A rule is exactly one `Tool` or `Tool(specifier)`. There is no `&&`, `||`,
 * or list syntax — several conditions mean several hook handlers.
 *
 * Anthropic specifies the filter as best-effort and FAILS OPEN: anything that
 * cannot be judged runs the hook. That is also the safe direction here, since
 * `if` gates security hooks and the harmful mistake is silently skipping a
 * guard. Only a definite mismatch skips a hook.
 *
 * Purity: pure boundary translation. No I/O, no logging, never throws.
 */
const RULE = /^\s*([^\s()]+)\s*(?:\(([\s\S]*)\))?\s*$/

const SUBSTITUTION = /\$\(|`|\$\{?\w/

const SUBSHELL = /\$\(([^()]*)\)|`([^`]*)`/g

const LEADING_ASSIGNMENTS = /^(?:\w+=(?:"[^"]*"|'[^']*'|\S*)\s+)+/

const SEPARATORS = /&&|\|\||[;|]/

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function matchesPermissionRule(
  rule: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  cwd: string,
): boolean {
  const parsed = RULE.exec(rule)
  const tool = parsed?.[1]
  if (tool === undefined) return true
  if (tool !== toolName) return false

  const specifier = parsed?.[2]?.trim()
  if (specifier === undefined || specifier.length === 0) return true

  return tool === 'Bash'
    ? matchesBashRule(specifier, toolInput['command'])
    : matchesPathRule(specifier, toolInput['file_path'], cwd)
}

function matchesBashRule(pattern: string, command: unknown): boolean {
  if (typeof command !== 'string') return true

  const subcommands = bashSubcommands(command)
  if (subcommands.length === 0) return true
  if (subcommands.some((sub) => globMatches(pattern, sub))) return true

  // A pattern naming more than the command itself cannot be judged against a
  // substitution whose expansion is unknown, so the hook runs.
  return namesMoreThanCommand(pattern) && SUBSTITUTION.test(command)
}

/** Every command the shell would run: the outer pipeline plus each substitution. */
function bashSubcommands(command: string): readonly string[] {
  const nested = [...command.matchAll(SUBSHELL)].map((match) => match[1] ?? match[2] ?? '')

  return [command.replace(SUBSHELL, ' '), ...nested]
    .flatMap((part) => part.split(SEPARATORS))
    .map((part) => part.trim().replace(LEADING_ASSIGNMENTS, ''))
    .filter((part) => part.length > 0)
}

function namesMoreThanCommand(pattern: string): boolean {
  return pattern.replace(/\*+$/, '').trim().split(/\s+/).filter(Boolean).length > 1
}

function globMatches(pattern: string, text: string): boolean {
  return new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`).test(text)
}

function matchesPathRule(pattern: string, filePath: unknown, cwd: string): boolean {
  if (typeof filePath !== 'string') return true

  // A prefix strip rather than a path-relative computation: `file_path` may
  // already be relative, and resolving it against the process directory
  // instead of the session's would silently match the wrong tree.
  const relative = filePath.startsWith(`${cwd}/`) ? filePath.slice(cwd.length + 1) : filePath
  const trimmed = pattern.replace(/\/+$/, '')

  // Gitignore convention: a pattern with no separator matches at any depth.
  const target = trimmed.includes('/') ? relative : basename(relative)

  return new RegExp(`^${pathGlobSource(trimmed)}$`).test(target)
}

const basename = (filePath: string): string => filePath.slice(filePath.lastIndexOf('/') + 1)

/** `dir/**` covers the directory itself as well as everything beneath it. */
function pathGlobSource(pattern: string): string {
  const body = segmentGlobSource(pattern)
  if (!pattern.endsWith('/**')) return body

  return `(?:${segmentGlobSource(pattern.slice(0, -3))}|${body})`
}

function segmentGlobSource(pattern: string): string {
  let source = ''
  let index = 0

  while (index < pattern.length) {
    const char = pattern.charAt(index)
    if (char !== '*') {
      source += char === '?' ? '[^/]' : escapeRegex(char)
      index += 1
      continue
    }
    if (pattern.charAt(index + 1) !== '*') {
      source += '[^/]*'
      index += 1
      continue
    }
    const spansSegments = pattern.charAt(index + 2) === '/'
    source += spansSegments ? '(?:[^/]+/)*' : '.*'
    index += spansSegments ? 3 : 2
  }

  return source
}

// ── Session.ts ──
/**
 * Kernel: construct session identifiers for OMP hook dispatch.
 *
 * OMP hooks receive a session_id and agent_id pair;
 * the bridge sets agent_id to null (no subagent concept in OMP).
 */
export interface SessionIds {
  readonly session_id: string
  readonly agent_id: null
}

export function sessionIds(getSessionId: () => string): SessionIds {
  return {
    session_id: getSessionId(),
    agent_id: null,
  }
}

// ── ContextMode.ts ──
/**
 * Kernel: detect and extract shell commands from context-mode tool invocations.
 *
 * Context-mode tools (ctx_execute, ctx_batch_execute) can execute shell
 * commands that should be inspected by shell-guard hooks.
 */
const CONTEXT_MODE_SHELL_TOOLS: Record<string, true> = {
  ctx_execute: true,
  ctx_batch_execute: true,
}

export function isContextModeShellTool(toolName: string, input: Record<string, unknown>): boolean {
  if (!CONTEXT_MODE_SHELL_TOOLS[toolName]) return false
  if (toolName === 'ctx_execute') return input['language'] === 'shell'
  return true
}

export function extractShellCommand(toolName: string, input: Record<string, unknown>): string | undefined {
  if (!isContextModeShellTool(toolName, input)) return undefined

  if (toolName === 'ctx_execute') {
    return typeof input['code'] === 'string' ? input['code'] : undefined
  }

  if (Array.isArray(input['commands'])) {
    // `Array.isArray` narrows `unknown` to `any[]`, so re-type the narrowed
    // array as `unknown[]` to keep each entry `unknown` and force explicit
    // narrowing at the member access below.
    const commands: unknown[] = input['commands']
    return commands
      .map((entry) =>
        typeof entry === 'object' && entry !== null && 'command' in entry && typeof entry['command'] === 'string'
          ? entry['command']
          : ''
      )
      .filter((cmd): cmd is string => typeof cmd === 'string')
      .join('\n')
  }

  return undefined
}

// ── EditTarget.ts ──
/**
 * Kernel: recover the target file paths from an OMP `edit` payload.
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

// ── ToolInput.ts ──

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
