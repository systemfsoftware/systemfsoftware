import { Schema } from 'effect'
import { JobExited, JobSignaled } from './classify-job-exit.workflow.js'

export class JobCompletion extends Schema.Class<JobCompletion>('JobCompletion')({
  status: Schema.Union([JobExited, JobSignaled]),
  stdout: Schema.Uint8Array,
  stderr: Schema.Uint8Array,
}) {}
