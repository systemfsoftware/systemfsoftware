/**
 * ACL: normalize OMP tool names to Claude Code hook-matcher convention.
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
