import { Schema } from 'effect'

export const Exited = Schema.TaggedStruct('Exited', { code: Schema.Int })
export type Exited = typeof Exited.Type

export const Signaled = Schema.TaggedStruct('Signaled', { detail: Schema.String })
export type Signaled = typeof Signaled.Type

export const ProcessExit = Schema.Union([Exited, Signaled])
export type ProcessExit = typeof ProcessExit.Type
