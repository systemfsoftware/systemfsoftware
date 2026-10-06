import { Schema } from 'effect'

/**
 * The `io.modelcontextprotocol/<name>` identifiers an extension advertises
 * under `capabilities.extensions`.
 */
export const ExtensionCapabilityId = Schema.TemplateLiteral([
  Schema.String,
  Schema.Literal('/'),
  Schema.String,
])

/** The advertised extension map: identifier straight to inline settings. */
export const ServerExtensions = Schema.Record(ExtensionCapabilityId, Schema.Json)

export const ExtensionResult = Schema.TaggedStruct('ExtensionResult', {
  result: Schema.Json,
})

export const ExtensionError = Schema.TaggedStruct('ExtensionError', {
  code: Schema.Finite,
  message: Schema.String,
  data: Schema.optional(Schema.Json),
})

export type ExtensionCapabilityId = Schema.Schema.Type<typeof ExtensionCapabilityId>

export type ServerExtensions = Schema.Schema.Type<typeof ServerExtensions>
