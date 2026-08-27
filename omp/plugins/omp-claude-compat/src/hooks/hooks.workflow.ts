import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Result, Schema as S } from 'effect'
import { HookResult } from './hooks.schema.js'
import { ParsedHookOutputSchema } from './hooks.schema.js'

/**
 * The pure decisions behind the hook verdict.
 *
 * This file holds the decision and everything it references: the primitive
 * helpers it reads (`exitKindOf`, `blockReason`, …) and the verdict classes it
 * constructs (`Block`, `Allow`, `Warning`, `HookDecision`) live beside the
 * make, because a `Workflow.make` body may reference only declarations in this
 * same file. Decoding is the shell's job — the run wraps the raw result and
 * the already-decoded stdout together into `InterpretHookCommand`, and the
 * decision refuses the decode (a malformed decision object becomes
 * `HookVerdictError`) rather than decoding.
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

/** The closed tag set the workflow dispatches on. */
const EXIT_KINDS = ['ExitBlock', 'ExitDecisionJson', 'ExitNoDecision', 'ExitOther'] as const

/**
 * The verdict a hook exit returns, as the decision's own wire: the tagged
 * classes move across the Cell phases, so the reader imports the workflow —
 * never the reverse. The run's raw wire (`HookResult`) and the run outcome
 * (`HookOutcome`) stay in `HookDispatcher.schema.ts`; these are the verdict,
 * not the run.
 */
export class Block extends S.TaggedClass<Block>()('Block', { reason: S.String }) {}

export class Allow extends S.TaggedClass<Allow>()(
  'Allow',
  { updatedInput: S.optional(S.Record(S.String, S.Unknown)) },
) {}

export class Warning extends S.TaggedClass<Warning>()('Warning', { message: S.String }) {}

export const HookDecision = S.Union([Block, Allow, Warning])
export type HookDecision = S.Schema.Type<typeof HookDecision>

const InterpretHookCommandTypeId: unique symbol = Symbol.for('@systemfsoftware/omp-claude-compat/InterpretHookCommand')
type InterpretHookCommandTypeId = typeof InterpretHookCommandTypeId

/**
 * The decision's input, gathered at the edge: the run's raw result plus the
 * already-decoded stdout. `parsed` carries the decode's outcome as data —
 * `None` when stdout never decoded to a decision object — so the decision
 * refuses a malformed decision object instead of decoding, because decoding
 * is the shell's job (see the `decode` phase in the hook run chain).
 */
export class InterpretHookCommand extends S.TaggedClass<InterpretHookCommand>()('InterpretHookCommand', {
  result: HookResult,
  event: S.String,
  parsed: S.Option(ParsedHookOutputSchema),
}) {
  readonly [InterpretHookCommandTypeId] = InterpretHookCommandTypeId
}

const HookVerdictErrorTypeId: unique symbol = Symbol.for('@systemfsoftware/omp-claude-compat/HookVerdictError')
type HookVerdictErrorTypeId = typeof HookVerdictErrorTypeId

export class HookVerdictError extends S.TaggedError<HookVerdictError>()('HookVerdictError', {
  raw: S.String,
}) {
  readonly [HookVerdictErrorTypeId] = HookVerdictErrorTypeId
}

/**
 * The hook-exit verdict: how a typed exit code and stdout decide an Allow, a
 * Block, or a Warning. Same-file decision core of {@link submitVerdict} — the
 * merged make composes this with the raw's context, so the brand lives there.
 */
export const interpretHookResult = (
  command: InterpretHookCommand,
): Result.Result<HookDecision, HookVerdictError> =>
  Match.value(exitKindOf(command.result.code, command.result.stdout)).pipe(
    Match.when(
      'ExitBlock',
      () => Result.succeed(new Block({ reason: blockReason(command.result.stderr, command.event) })),
    ),
    Match.when('ExitNoDecision', () => Result.succeed(new Allow({}))),
    Match.when('ExitDecisionJson', () =>
      Option.match(command.parsed, {
        onNone: () => Result.fail(new HookVerdictError({ raw: command.result.stdout })),
        onSome: (parsed) =>
          Match.value(parsedVerdict(parsed.hookSpecificOutput?.permissionDecision, parsed.decision)).pipe(
            Match.when('block', () =>
              Result.succeed(
                new Block({
                  reason: parsedBlockReason(
                    parsed.hookSpecificOutput?.permissionDecision,
                    parsed.hookSpecificOutput?.permissionDecisionReason,
                    parsed.reason,
                    command.event,
                  ),
                }),
              )),
            Match.when('allow', () =>
              Result.succeed(new Allow({ updatedInput: parsed.hookSpecificOutput?.updatedInput }))),
            Match.exhaustive,
          ),
      })),
    Match.when('ExitOther', () =>
      Match.value(stderrVerdict(command.result.stderr)).pipe(
        Match.when('warning', () => Result.succeed(new Warning({ message: spokenStderr(command.result.stderr) }))),
        Match.when('allow', () => Result.succeed(new Allow({}))),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

/**
 * The submit chain's command: the verdict command plus the raw's code and stdout.
 *
 * A schema class rather than an interface because `Workflow.make` constrains its
 * command argument on the class value — a declared type produces none, so it cannot
 * reach the argument position at all. `InterpretHookCommand` is itself a tagged class,
 * so it is usable directly as a field schema.
 */
export class SubmitVerdictCommand extends S.TaggedClass<SubmitVerdictCommand>()('SubmitVerdictCommand', {
  cmd: InterpretHookCommand,
  code: S.Finite,
  stdout: S.String,
}) {}

/** The submit chain's decision: the verdict plus the context the write acts on. */
export interface SubmitVerdictDecision {
  readonly verdict: HookDecision
  readonly code: number
  readonly stdout: string
}

/**
 * The submit decision's failure: the verdict error plus the raw's code and
 * stdout, as a schema-derived tagged struct — the error channel of a branded
 * decide run must carry a tag, and the struct derives one instead of declaring
 * a `_tag` by hand.
 */
const SubmitHookVerdictError = S.TaggedStruct('SubmitHookVerdictError', {
  error: HookVerdictError,
  code: S.Finite,
  stdout: S.String,
})
export type SubmitHookVerdictError = S.Schema.Type<typeof SubmitHookVerdictError>

/**
 * The submit verdict decision, and this file's one make: the hook verdict
 * composed with the raw's code and stdout, both channels carrying the context
 * the write still needs. `interpretHookResult` is the same-file decision core;
 * the reader imports this workflow and never reaches past it.
 */
export const submitVerdict = Workflow.make(
  SubmitVerdictCommand,
  ({ cmd, code, stdout }): Result.Result<SubmitVerdictDecision, SubmitHookVerdictError> =>
    Result.mapBoth(interpretHookResult(cmd), {
      onFailure: (error) => SubmitHookVerdictError.make({ error, code, stdout }),
      onSuccess: (verdict) => ({ verdict, code, stdout }),
    }),
)

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this
  // branch is statically dead in the build and never enters the published module graph.
  const { it } = await import('@effect/vitest')
  const { FastCheck: fc } = await import('effect/testing')

  /**
   * The decision's observer.
   *
   * `stryker.config.json` mutates `src/*.workflow.ts`, and the guard over the
   * pure helpers forbids enrolling them elsewhere, so the decisions this file
   * holds are observed here, beside the make. Measured on the move that put
   * them here: the package's killed-mutant count fell from 15 to 1 while the
   * score stayed at 100 - a perfect score over one mutant. These laws are what
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
      return raw === undefined || raw.trim() === '' ? stated.includes(ev) : stated === raw
    },
  )

  // The command's sole obligation: `code` is a finite exit status, so a non-finite one
  // is the refusal class. A spawned process reports no exit code at all when it is
  // signalled, so this is a wire shape the edge can really hand over.
  //
  // The witness is a valid instance encoded and then broken on one field, because the
  // discrimination law requires a value the schema rejects for exactly this reason -
  // a hand-written record that also got the nested `parsed` wire shape wrong would be
  // rejected for that instead, and would discharge nothing.
  const validWire = S.encodeUnknownSync(SubmitVerdictCommand)(
    new SubmitVerdictCommand({
      cmd: new InterpretHookCommand({
        result: { code: 0, stdout: '', stderr: '' },
        event: 'UserPromptSubmit',
        parsed: Option.none(),
      }),
      code: 0,
      stdout: '',
    }),
  )
}
