import { Cause, Exit, Match, Schema, SchemaIssue } from 'effect'

const ValueTag = { _tag: 'Value' } as const
const RefusedTag = { _tag: 'Refused' } as const
const FailedTag = { _tag: 'Failed' } as const

type ValueTag = typeof ValueTag
type RefusedTag = typeof RefusedTag
type FailedTag = typeof FailedTag

interface CodecValue<A> extends ValueTag {
  readonly value: A
}

interface CodecRefused extends RefusedTag {}

interface CodecFailed extends FailedTag {}

/**
 * What one side of a codec returned for one input.
 *
 * - `Value` — the step succeeded.
 * - `Refused` — the step failed with schema issues only, and every leaf issue is `Forbidden`.
 * - `Failed` — a step failure with at least one leaf issue that is not `Forbidden`.
 *
 * A defect — the step died, was interrupted, or failed with a non-schema reason — is thrown, so the property runner
 * reports it as `LawErred` with the drawn values, never as a refusal.
 */
export type CodecStep<A> = CodecValue<A> | CodecRefused | CodecFailed

const refused: CodecRefused = RefusedTag

const failed: CodecFailed = FailedTag

const codecValue = <A>(value: A): CodecValue<A> => ({ ...ValueTag, value })

const childIssues = (issue: SchemaIssue.Issue): ReadonlyArray<SchemaIssue.Issue> =>
  Match.value(issue).pipe(
    Match.when({ _tag: 'Encoding' }, (encoding) => [encoding.issue] as const),
    Match.when({ _tag: 'Pointer' }, (pointer) => [pointer.issue] as const),
    Match.when({ _tag: 'Filter' }, (filter) => [filter.issue] as const),
    Match.when({ _tag: 'Composite' }, (composite) => composite.issues),
    Match.when({ _tag: 'AnyOf' }, (anyOf) => anyOf.issues),
    Match.orElse((): ReadonlyArray<SchemaIssue.Issue> => []),
  )

/** An issue with no child issue. An empty `Composite` or `AnyOf` is its own leaf, so it is never a refusal. */
const leavesOf = (issues: ReadonlyArray<SchemaIssue.Issue>): ReadonlyArray<SchemaIssue.Issue> =>
  issues.flatMap((issue) => {
    const children = childIssues(issue)
    return children.length === 0 ? [issue] : leavesOf(children)
  })

const isRefusal = (issues: ReadonlyArray<SchemaIssue.Issue>): boolean => {
  const leaves = leavesOf(issues)
  return leaves.length > 0 && leaves.every((leaf) => leaf._tag === 'Forbidden')
}

const issuesOf = (cause: Cause.Cause<Schema.SchemaError>): ReadonlyArray<SchemaIssue.Issue> =>
  cause.reasons.map((reason) => {
    if (!Cause.isFailReason(reason)) throw Cause.squash(cause)
    return reason.error.issue
  })

const failureStep = (cause: Cause.Cause<Schema.SchemaError>): CodecRefused | CodecFailed =>
  isRefusal(issuesOf(cause)) ? refused : failed

const stepOf = <A>(exit: Exit.Exit<A, Schema.SchemaError>): CodecStep<A> =>
  Exit.isSuccess(exit) ? codecValue(exit.value) : failureStep(exit.cause)

/** Encode one `Type` value, collecting every issue the codec reports for it. */
export const encodeStep = <A, I>(schema: Schema.Codec<A, I>) => (value: A): CodecStep<I> =>
  stepOf(Schema.encodeExit(schema, { errors: 'all' })(value))

/** Decode one `Encoded` value, collecting every issue the codec reports for it. */
export const decodeStep = <A, I>(schema: Schema.Codec<A, I>) => (value: I): CodecStep<A> =>
  stepOf(Schema.decodeExit(schema, { errors: 'all' })(value))
