/**
 * ACL: match OMP tool names against Claude Code hook matcher patterns.
 *
 * Hook matchers are pipe-separated regex patterns (e.g. "Write|Edit").
 * An empty/undefined matcher matches everything.
 */
const regexCache = new Map<string, RegExp>()

export function matchesMatcher(toolName: string, matcher: string | undefined): boolean {
  if (!matcher || matcher.length === 0) return true
  const pattern = matcher
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('|')
  if (pattern.length === 0) return true
  const cached = regexCache.get(pattern)
  if (cached !== undefined) return cached.test(toolName)
  const regex = new RegExp(`^(?:${pattern})$`)
  regexCache.set(pattern, regex)
  return regex.test(toolName)
}
