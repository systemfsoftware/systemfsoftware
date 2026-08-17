import * as ESchema from 'effect/Schema'

export function padLeft(input: string): string {
  return input
    .split('\n')
    .map((str) => '\t' + str)
    .join('\n')
}

export function serialize(thing: unknown): string {
  return JSON.stringify(thing)
}

export function deserialize<T>(
  stringified: string,
  schema: ESchema.ConstraintDecoder<T>,
): T {
  const parsed: unknown = JSON.parse(stringified)
  return ESchema.decodeUnknownSync(schema)(parsed)
}
