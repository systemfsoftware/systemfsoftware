import { Schema } from 'effect'

export const ProcessRun = Schema.Struct({ exitCode: Schema.Int, output: Schema.String })
export type ProcessRun = typeof ProcessRun.Type
