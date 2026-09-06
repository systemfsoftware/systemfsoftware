const Schema = {
  String: 'string',
  Struct: (fields: Record<string, unknown>) => fields,
  TaggedClass: (tag: string) => (fields: Record<string, unknown>) =>
    class {
      readonly tag = tag
      constructor() {
        Object.assign(this, fields)
      }
    },
  is: (_schema: unknown) => (value: unknown): boolean => value !== undefined,
  toJsonSchemaDocument: (schema: unknown) => ({ schema }),
}

export interface PinSchemaState {
  readonly tag: string
}

export const pinFirst: PinSchemaState = { tag: 'a' }

export const pinSecond: PinSchemaState | undefined = undefined

export const pinStruct = Schema.Struct({ x: Schema.String })

export class PinTagged extends Schema.TaggedClass('PinTagged')({ x: Schema.String }) {}

export const pinGuard = Schema.is(Schema.String)
export const pinJsonDoc = Schema.toJsonSchemaDocument(pinStruct).schema

export const pinPlain = 42

export const pinUseOnly = { enc: 'payload' }
