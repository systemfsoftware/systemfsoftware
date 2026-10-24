import * as Schema from 'effect/Schema'

const ArrayIndex = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0, { message: 'an array index is a whole number of at least 0' }),
)

/** One step of a key path: an object key or an array index. */
export const PathSegment = Schema.Union([Schema.String, ArrayIndex])
export type PathSegment = typeof PathSegment.Type

const stepText = (segment: PathSegment): string => (typeof segment === 'number' ? `[${segment}]` : `.${segment}`)

const keyPathText = (path: ReadonlyArray<PathSegment>): string => path.map(stepText).join('').replace(/^\./u, '')

const pathText = (path: ReadonlyArray<PathSegment>): string => (path.length === 0 ? '(root)' : keyPathText(path))

/** A config that does not decode: the key path of the first refusal and what that key expected. */
export class ConfigInvalid extends Schema.TaggedError<ConfigInvalid>()('ConfigInvalid', {
  path: Schema.Array(PathSegment),
  expected: Schema.String,
}) {
  override get message(): string {
    return `config ${pathText(this.path)}: ${this.expected}`
  }
}
