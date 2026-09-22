import { Schema } from 'effect'

export const AbsolutePath = Schema.String.pipe(Schema.check(Schema.isStartsWith('/')))
export type AbsolutePath = typeof AbsolutePath.Type

export const Contents = Schema.Record(Schema.String, Schema.NullOr(Schema.Union([Schema.String, Schema.Uint8Array])))
export type Contents = typeof Contents.Type

export class MemoryFileSystemSpec extends Schema.Class<MemoryFileSystemSpec>('MemoryFileSystemSpec')({
  cwd: AbsolutePath,
  contents: Contents,
}) {}
