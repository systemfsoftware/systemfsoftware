/**
 * ACL: normalize OMP tool names to Claude Code convention.
 *
 * OMP emits lowercase tool names (write, bash, read);
 * Claude Code hook system expects capitalized (Write, Bash, Read).
 */
export function normalizeToolName(name: string): string {
  if (name.length === 0) return name
  return name.charAt(0).toUpperCase() + name.slice(1)
}
