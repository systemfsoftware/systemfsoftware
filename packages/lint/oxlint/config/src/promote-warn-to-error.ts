/**
 * Promote every `warn` severity to `error`.
 * Leaves `error`, `off`, and tuple severities intact (tuple form unsupported by tsgo presets — preserved as-is).
 * Scope: used for `effecttsgo/*` rules so agents fail CI instead of ignoring warnings.
 */
export type RuleSeverity = unknown

export const promoteWarnToError = (
  rules: Record<string, RuleSeverity>,
): Record<string, 'error' | 'off'> => {
  const out: Record<string, 'error' | 'off'> = {}
  for (const [key, severity] of Object.entries(rules)) {
    if (severity === 'warn') out[key] = 'error'
    else if (severity === 'error') out[key] = 'error'
    else if (severity === 'off') out[key] = 'off'
    // array/tuple or unknown → preserve as error if first element is warn-like, else off/error as declared
    else if (Array.isArray(severity) && severity[0] === 'warn') out[key] = 'error'
    else if (Array.isArray(severity) && severity[0] === 'error') out[key] = 'error'
    else if (Array.isArray(severity) && severity[0] === 'off') out[key] = 'off'
  }
  return out
}
