import * as Schema from 'effect/Schema'

import { Locator } from './locator.schema.js'
import { NodeBounds } from './semantic-node.schema.js'

export const ReadRequest = Schema.Union([
  Schema.TaggedStruct('Text', {}),
  Schema.TaggedStruct('Value', {}),
  Schema.TaggedStruct('Attribute', { name: Schema.String }),
  Schema.TaggedStruct('Visible', {}),
  Schema.TaggedStruct('Enabled', {}),
  Schema.TaggedStruct('Checked', {}),
  Schema.TaggedStruct('Bounds', {}),
]).pipe(Schema.toTaggedUnion('_tag'))
export type ReadRequest = typeof ReadRequest.Type

export const ReadResult = Schema.Union([
  Schema.TaggedStruct('Text', { text: Schema.String }),
  Schema.TaggedStruct('Value', { value: Schema.String }),
  Schema.TaggedStruct('Attribute', { name: Schema.String, value: Schema.NullOr(Schema.String) }),
  Schema.TaggedStruct('Visible', { visible: Schema.Boolean }),
  Schema.TaggedStruct('Enabled', { enabled: Schema.Boolean }),
  Schema.TaggedStruct('Checked', { checked: Schema.Boolean }),
  Schema.TaggedStruct('Bounds', { bounds: Schema.NullOr(NodeBounds) }),
]).pipe(Schema.toTaggedUnion('_tag'))
export type ReadResult = typeof ReadResult.Type

export const ConsoleLevel = Schema.Literals(['debug', 'log', 'info', 'warning', 'error'])
export type ConsoleLevel = typeof ConsoleLevel.Type

export const LogEntry = Schema.Union([
  Schema.TaggedStruct('Console', { level: ConsoleLevel, text: Schema.String }),
  Schema.TaggedStruct('PageError', { message: Schema.String }),
  Schema.TaggedStruct('Network', { method: Schema.String, url: Schema.String, status: Schema.Int }),
  Schema.TaggedStruct('RequestFailed', { method: Schema.String, url: Schema.String, failure: Schema.String }),
]).pipe(Schema.toTaggedUnion('_tag'))
export type LogEntry = typeof LogEntry.Type

export const ScreenshotRequest = Schema.Struct({ mask: Schema.Array(Locator) })
export type ScreenshotRequest = typeof ScreenshotRequest.Type
