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

/** The closed tag set the workflow dispatches on;. */
const EXIT_KINDS = ['ExitBlock', 'ExitDecisionJson', 'ExitNoDecision', 'ExitOther'] as const

if (import.meta.vitest !== void 0) {
  const { it } = await import('@effect/vitest')
  const { FastCheck: fc } = await import('effect/testing')

  /**
   * The kernel's observer.
   *
   * `stryker.config.json` mutates `src/*.workflow.ts`, and `guard-mutate-scope` forbids
   * enrolling a kernel, so the decisions this file holds are outside the public surface.
   * Measured on the move that put them here: the package's killed-mutant count fell from 15
   * to 1 while the score stayed at 100 - a perfect score over one mutant. These laws are what
   * observes the decisions instead.
   */

  /** Stdout shapes that straddle the `{` test, including whitespace-padded ones. */
  const stdout = fc.oneof(
    fc.constant(''),
    fc.constant('   '),
    fc.constant('{"decision":"block"}'),
    fc.constant('  {"a":1}  '),
    fc.constant('not json'),
    fc.string({ maxLength: 12 }),
  )

  const stderr = fc.oneof(fc.constant(''), fc.constant('   \n '), fc.string({ maxLength: 12 }))
  const event = fc.string({ minLength: 1, maxLength: 10 })
  const decisionKey = fc.oneof(
    fc.constant(undefined),
    fc.constant('deny'),
    fc.constant('block'),
    fc.constant('allow'),
    fc.string({ maxLength: 6 }),
  )

  /** Every code and output lands in the closed tag set the workflow dispatches on. */
  it.prop(
    '∀c_ExitKind_∈Four',
    [fc.integer({ min: -8, max: 8 }), stdout],
    ([code, out]) => EXIT_KINDS.includes(exitKindOf(code, out)),
  )

  /**
   * Only exit 0 reads stdout. A mutant that inspects the output on a failing exit, or that
   * lets a `{` change a non-zero verdict, breaks this without changing any single result's
   * plausibility.
   */
  it.prop(
    '∀c_NonZeroExit_=AnyStdout',
    [fc.integer({ min: -8, max: 8 }), stdout, stdout],
    ([code, a, b]) => code === 0 || exitKindOf(code, a) === exitKindOf(code, b),
  )

  /** Exit 0 splits on the decision-object shape and on nothing else. */
  it.prop(
    '∀s_ZeroExit_≡BraceTest',
    [stdout],
    ([out]) => exitKindOf(0, out) === (out.trim().startsWith('{') ? 'ExitDecisionJson' : 'ExitNoDecision'),
  )

  /** A blocked hook always states a reason, and states the hook's own words whenever it spoke. */
  it.prop('∀s_BlockReason_≠Empty', [stderr, event], ([err, ev]) => {
    const reason = blockReason(err, ev)
    return reason !== '' && (err.trim() === '' ? reason.includes(ev) : reason === err.trim())
  })

  /** The two stderr readers must agree; otherwise a warning carries an empty message. */
  it.prop(
    '∀s_StderrReaders_≡Agree',
    [stderr],
    ([err]) => (stderrVerdict(err) === 'warning') === (spokenStderr(err) !== ''),
  )

  /** The permission key shadows the legacy key whenever it is present. */
  it.prop(
    '∀k_ParsedVerdict_=Permission',
    [decisionKey, decisionKey],
    ([permission, legacy]) =>
      permission === undefined || parsedVerdict(permission, legacy) === parsedVerdict(permission, undefined),
  )

  /** A parsed block always states a reason, reading it from the field the key implies. */
  it.prop(
    '∀k_ParsedBlockReason_≠NonEmpty',
    [decisionKey, decisionKey, decisionKey, event],
    ([key, denyReason, reason, ev]) => {
      const stated = parsedBlockReason(key, denyReason, reason, ev)
      if (stated.trim() === '') return false
      const raw = key === 'deny' ? denyReason : reason
      return raw === undefined || raw.trim() === '' ? stated.includes(ev.trim()) : stated === raw
    },
  )
}
