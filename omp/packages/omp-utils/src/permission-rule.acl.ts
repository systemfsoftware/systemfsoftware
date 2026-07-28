/**
 * ACL: match a Claude Code `if` permission rule against a tool call.
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
