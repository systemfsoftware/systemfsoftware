/**
 * Target — the tool target domain, pure.
 *
 * The host's `tool_call` event ships its input as a generic record; the two
 * keys this plugin reads (`file_path` for edit-family tools, `path` for
 * read/grep/glob) are foreign spelling. The branded `TargetPath` is earned
 * through the Schema decode, never cast: `decodeTo` with a
 * `SchemaGetter.transformOrFail` decode from the foreign record, encode
 * direction `Forbidden` — the tool input is the source, never the
 * destination. Absent/empty/typed-wrong target keys fail the decode to
 * `NoTarget` (a `TaggedError`, never `null`).
 *
 * `relativeToRoot` maps a target onto the project root, returning `null`
 * when the target is outside the root — hardened against `..` traversal
 * segments anywhere in the path (escapee targets are treated as outside the
 * root, absolute or relative).
 */
import { Effect, Option, Result, Schema as S, SchemaGetter, SchemaIssue } from 'effect'
import { isAbsolute } from 'node:path/posix'

export const TargetPath = S.String.pipe(S.brand('TargetPath'))
export type TargetPath = S.Schema.Type<typeof TargetPath>

/** Foreign shape: the `tool_call` input record, opened at the boundary. */
const ForeignToolInput = S.Record(S.String, S.Unknown)

const readTargetPath = (input: Readonly<Record<string, unknown>>): string | null => {
  const filePath = input['file_path']
  if (typeof filePath === 'string' && filePath.length > 0) return filePath
  const path = input['path']
  if (typeof path === 'string' && path.length > 0) return path
  return null
}

export const ToolCallTargetFromInput: S.Codec<TargetPath, Readonly<Record<string, unknown>>> = ForeignToolInput.pipe(
  S.decodeTo(TargetPath, {
    decode: SchemaGetter.transformOrFail((input) => {
      const value = readTargetPath(input)
      if (value === null) {
        return Effect.fail(
          new SchemaIssue.InvalidValue({
            message: "input carries neither a non-empty 'file_path' nor a non-empty 'path'",
          }),
        )
      }
      return S.decodeEffect(TargetPath)(value).pipe(
        Effect.mapError((error) => (S.isSchemaError(error) ? error.issue : error)),
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

/**
 * Project-root-relative form of a tool target, or `null` when the target is
 * outside the project root. Ported from the deleted hook; hardened against
 * `..` traversal segments anywhere in the path.
 */
export const relativeToRoot = (target: string, root: string): string | null => {
  if (isAbsolute(target)) {
    if (!target.startsWith(root + '/')) return null
    const rel = target.slice(root.length + 1)
    return rel.split('/').includes('..') ? null : rel
  }
  if (target.length === 0 || target.split('/').includes('..')) return null
  return target
}
