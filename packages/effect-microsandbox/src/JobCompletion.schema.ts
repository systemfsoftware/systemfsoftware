import { Schema } from 'effect'
import { JobExited, JobSignaled } from './classify-job-exit.workflow.js'

export const JobCompletion = Schema.Struct({
  status: Schema.Union([JobExited, JobSignaled]),
  stdout: Schema.Uint8Array,
  stderr: Schema.Uint8Array,
})
export type JobCompletion = typeof JobCompletion.Type
