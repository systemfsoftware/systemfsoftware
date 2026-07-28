/**
 * ACL: match OMP tool names against Claude Code hook matcher patterns.
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
  if (!matcher || matcher.length === 0) return true
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
