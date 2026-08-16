/**
 * ACL: foreign `tool_call` input → `TargetPath`.
 *
 * The host's `tool_call` event ships its input as a generic record; the two
 * keys this plugin reads (`file_path` for edit-family tools, `path` for
 * read/grep/glob) are foreign spelling. The branded `TargetPath` domain type
 * is earned through the Schema decode, never cast (ACL1, `omp/AGENTS.md`):
 * `decodeTo` with a `SchemaGetter.transformOrFail` decode from the foreign
 * record, encode direction `Forbidden` — the tool input is the source, never
 * the destination. Absent/empty/typed-wrong target keys fail the decode,
 * which the handler maps to `NoTarget` (a `TaggedError`, never `null`).
 */
import { Effect, Option, Result, Schema as S, SchemaGetter, SchemaIssue } from 'effect'

export const TargetPath = S.String.pipe(S.brand('TargetPath'))
export type TargetPath = S.Schema.Type<typeof TargetPath>

/** Foreign shape: the `tool_call` input record, opened at the boundary. */
const ForeignToolInput = S.Record(S.String, S.Unknown)

const decodePathValue = (
  input: Readonly<Record<string, unknown>>,
  key: 'file_path' | 'path',
): Effect.Effect<TargetPath, SchemaIssue.Issue> => {
  const value = input[key]
  if (typeof value === 'string' && value.length > 0) {
    return S.decodeEffect(TargetPath)(value).pipe(
      Effect.mapError((error) => (S.isSchemaError(error) ? error.issue : error)),
    )
  }
  return Effect.fail(
    new SchemaIssue.InvalidValue({ message: `key '${key}' is absent or not a non-empty string` }),
  )
}

export const ToolCallTargetFromInput: S.Codec<TargetPath, Readonly<Record<string, unknown>>> = ForeignToolInput.pipe(
  S.decodeTo(TargetPath, {
    decode: SchemaGetter.transformOrFail((input) => {
      const filePath = input['file_path']
      if (typeof filePath === 'string' && filePath.length > 0) return decodePathValue(input, 'file_path')
      const path = input['path']
      if (typeof path === 'string' && path.length > 0) return decodePathValue(input, 'path')
      return Effect.fail(
        new SchemaIssue.InvalidValue({
          message: "input carries neither a non-empty 'file_path' nor a non-empty 'path'",
        }),
      )
    }),
    encode: SchemaGetter.forbidden(() => 'ToolCallTargetFromInput is decode-only'),
  }),
)

export class NoTarget extends S.TaggedError<NoTarget>()('NoTarget', {}) {}

export const decodeTarget = (input: unknown): Result.Result<TargetPath, NoTarget> => {
  const decoded = S.decodeUnknownOption(ToolCallTargetFromInput)(input)
  return Option.isSome(decoded)
    ? Result.succeed(decoded.value)
    : Result.fail(new NoTarget())
}
