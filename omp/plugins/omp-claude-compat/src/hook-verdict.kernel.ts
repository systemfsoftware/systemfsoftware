/**
 * The pure decisions behind the hook verdict, over primitives only.
 *
 * A kernel cell may import no other cell, so nothing here sees `HookResult`,
 * `ParsedHookOutput` or the `HookDecision` union. Each function takes the primitive fields
 * the workflow reads off its command and returns a tag the workflow dispatches on; the
 * workflow owns constructing the domain value, which is the only thing it can do that this
 * file cannot.
 */

/** How Claude Code reads a hook's exit code and stdout. */
export type ExitKind = 'ExitBlock' | 'ExitDecisionJson' | 'ExitNoDecision' | 'ExitOther'

/**
 * Exit 0 is success. Claude Code parses stdout for a decision object and otherwise treats
 * the output as non-decision text - blank, a status line, a debug echo. Only output opening
 * with `{` claims to be a decision, so only that shape can be malformed.
 */
export const exitKindOf = (code: number, stdout: string): ExitKind => {
  if (code === 2) return 'ExitBlock'
  if (code !== 0) return 'ExitOther'
  return stdout.trim().startsWith('{') ? 'ExitDecisionJson' : 'ExitNoDecision'
}

/** What a blocking hook says, or a stated fallback when it says nothing. */
export const blockReason = (stderr: string, event: string): string => {
  const spoken = stderr.trim()
  return spoken === '' ? `Blocked by ${event} hook` : spoken
}

/** Whether a non-standard exit spoke on stderr, and so warrants a warning over an allow. */
export type StderrVerdict = 'warning' | 'allow'

export const stderrVerdict = (stderr: string): StderrVerdict => (stderr.trim() === '' ? 'allow' : 'warning')

/** What a non-standard exit said, trimmed. Empty when it said nothing. */
export const spokenStderr = (stderr: string): string => stderr.trim()

/** Which decision a parsed hook output claims, read from its two decision keys. */
export type ParsedVerdict = 'block' | 'allow'

export const parsedVerdict = (permissionDecision: string | undefined, decision: string | undefined): ParsedVerdict => {
  const key = permissionDecision ?? decision
  return key === 'deny' || key === 'block' ? 'block' : 'allow'
}

/**
 * The reason a parsed block carries: the key's own reason field, or the stated fallback.
 *
 * `deny` states its reason in `permissionDecisionReason` and `block` in `reason`, so the
 * workflow reads both off the parsed value and this picks whichever the key implies.
 *
 * A blank reason counts as absent. `??` alone guards only nullish, so a hook emitting
 * `"reason": ""` produced a block with no explanation at all. Blankness is decided on the
 * trimmed value and the reason is returned verbatim, because the hook's own words - spacing
 * included - are what the user sees.
 */
export const parsedBlockReason = (
  permissionDecision: string | undefined,
  permissionDecisionReason: string | undefined,
  reason: string | undefined,
  event: string,
): string => {
  const stated = permissionDecision === 'deny' ? permissionDecisionReason : reason
  return stated === undefined || stated.trim() === '' ? `Blocked by ${event} hook` : stated
}
