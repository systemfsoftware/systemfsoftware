import * as Schema from 'effect/Schema'

import { EngineCapability } from './capability.schema.js'
import { LogEntry } from './engine.schema.js'
import { Route } from './route.schema.js'
import { SemanticNode } from './semantic-node.schema.js'

export const MemoryPage = Schema.Struct({
  tree: Schema.Array(SemanticNode),
  links: Schema.Record(Schema.String, Schema.String),
  logs: Schema.Array(LogEntry),
})
export type MemoryPage = typeof MemoryPage.Type

export const MemorySite = Schema.Struct({
  origin: Schema.String,
  capabilities: Schema.Array(EngineCapability),
  pages: Schema.Record(Schema.String, MemoryPage),
})
export type MemorySite = typeof MemorySite.Type

export const OpenPage = Schema.Struct({
  route: Route,
  tree: Schema.Array(SemanticNode),
  links: Schema.Record(Schema.String, Schema.String),
  revision: Schema.Int,
})
export type OpenPage = typeof OpenPage.Type

export const MemorySession = Schema.Union([
  Schema.TaggedStruct('Idle', {}),
  Schema.TaggedStruct('Open', { page: OpenPage, logs: Schema.Array(LogEntry) }),
  Schema.TaggedStruct('Closed', {}),
]).pipe(Schema.toTaggedUnion('_tag'))
export type MemorySession = typeof MemorySession.Type
