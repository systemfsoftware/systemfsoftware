/**
 * The human-readable text of a tagged error and its cause chain.
 *
 * Every stage error in the engine is an `S.TaggedError` whose payload field is
 * `reason` — `DryRunNoTestsError`, `DryRunFailedError`, `PrepareFailedError`
 * and friends. Those classes extend `Error`, but nothing assigns `.message`, so
 * reading `.message` off one yields the empty string. This renderer reads the
 * field the errors actually populate, and falls back only when it is absent.
 *
 * A domain error names its fault in `reason`; a worker error that crossed the
 * socket arrives as plain JSON, so it is not an `Error` and its text is in a
 * `message` key rather than the prototype's property. Both are read before
 * falling back to the discriminant, which names the class and not the fault.
 *
 * Recurses through the `cause` chain because these errors nest: a stage error
 * wraps a `TestRunnerFailed`, which wraps the spawn or import failure that
 * actually happened. Each layer contributes only what it knows, so the reader
 * gets the chain down to the real fault. Depth is capped to avoid unbounded
 * recursion on malformed chains.
 */

const stringField = (value: object, key: string): string | undefined => {
  if (!(key in value)) return undefined
  const field: unknown = Reflect.get(value, key)
  return typeof field === 'string' && field.length > 0 ? field : undefined
}

const tagOf = (value: object): string | undefined => {
  const tag: unknown = '_tag' in value ? Reflect.get(value, '_tag') : undefined
  if (typeof tag === 'string' && tag.length > 0) return tag
  return value instanceof Error && value.name.length > 0 ? value.name : undefined
}

export const causeText = (cause: unknown, depth: number): string | undefined => {
  if (depth > 4 || cause === undefined || cause === null) return undefined
  if (typeof cause === 'string') return cause.length > 0 ? cause : undefined
  if (typeof cause !== 'object') return undefined
  const own = stringField(cause, 'reason') ??
    stringField(cause, 'message') ??
    (cause instanceof Error && cause.message.length > 0 ? cause.message : tagOf(cause))
  const nested = 'cause' in cause ? causeText(Reflect.get(cause, 'cause'), depth + 1) : undefined
  if (own === undefined) return nested
  return nested === undefined ? own : `${own}: ${nested}`
}
