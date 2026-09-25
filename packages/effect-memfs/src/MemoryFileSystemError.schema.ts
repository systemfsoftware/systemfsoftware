import { Schema } from 'effect'

export class ShapeRefusal extends Schema.TaggedError<ShapeRefusal>()('ShapeRefusal', {
  method: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  override get message(): string {
    return `The "${this.method}" call was given a value that is not a memory file system driver`
  }
}

export class CursorRefusal extends Schema.TaggedError<CursorRefusal>()('CursorRefusal', {
  method: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  override get message(): string {
    return `The "${this.method}" call would move the cursor before the start of the file`
  }
}

export type MemoryFileSystemError = ShapeRefusal | CursorRefusal

const shapeRefusalMessageOf = (method: string): string => new ShapeRefusal({ method }).message

const cursorRefusalMessageOf = (method: string): string => new CursorRefusal({ method }).message

if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')

  it.prop(
    '∀m_ShapeRefusalMessage_≡Expected',
    { of: [Schema.String], subject: shapeRefusalMessageOf },
    (subject, [method]) =>
      subject(method) === `The "${method}" call was given a value that is not a memory file system driver`,
  )

  it.prop(
    '∀m_CursorRefusalMessage_≡Expected',
    { of: [Schema.String], subject: cursorRefusalMessageOf },
    (subject, [method]) =>
      subject(method) === `The "${method}" call would move the cursor before the start of the file`,
  )
}
