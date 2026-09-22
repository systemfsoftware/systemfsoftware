import { Schema } from 'effect'
import { PortNumber } from './Port.schema.js'

export const TcpCondition = Schema.TaggedStruct('Tcp', { guestPort: PortNumber })
export const HttpCondition = Schema.TaggedStruct('Http', { guestPort: PortNumber, path: Schema.String })
export const LogCondition = Schema.TaggedStruct('Log', { pattern: Schema.String })
export const Condition = Schema.Union([TcpCondition, HttpCondition, LogCondition])
export type Condition = typeof Condition.Type
