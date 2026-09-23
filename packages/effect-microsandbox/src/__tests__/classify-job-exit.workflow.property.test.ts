import { it } from '@effect/vitest'
import { Equal, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { ClassifyJobExit, classifyJobExit, JobExited, type JobExitStatus } from '../classify-job-exit.workflow.js'

const classifiedOf = (code: number, stdout: Uint8Array, stderr: Uint8Array): JobExitStatus =>
  Result.getOrThrow(classifyJobExit(new ClassifyJobExit({ code, stdout, stderr })))

const exitedOf = (status: JobExitStatus): Option.Option<JobExited> =>
  Match.value(status).pipe(
    Match.tag('JobExited', (exited) => Option.some(exited)),
    Match.tag('JobSignaled', () => Option.none<JobExited>()),
    Match.exhaustive,
  )

const signaledOf = (status: JobExitStatus): boolean =>
  Match.value(status).pipe(
    Match.tag('JobExited', () => false),
    Match.tag('JobSignaled', () => true),
    Match.exhaustive,
  )

it.prop(
  '∀code_ClassifyJobExit_=JobExited',
  [
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 255 }))),
    Schema.Uint8Array,
    Schema.Uint8Array,
  ],
  ([code, stdout, stderr]) =>
    Option.match(exitedOf(classifiedOf(code, stdout, stderr)), {
      onNone: () => false,
      onSome: (exited) => Equal.equals(exited.code, code),
    }),
)

it.prop(
  '∀negative_ClassifyJobExit_=JobSignaled',
  [Schema.Int.pipe(Schema.check(Schema.isLessThan(0))), Schema.Uint8Array, Schema.Uint8Array],
  ([code, stdout, stderr]) => signaledOf(classifiedOf(code, stdout, stderr)),
)

it.prop(
  '∀code_JobExited_⊥Decoded',
  [Schema.Int.pipe(Schema.check(Schema.isLessThan(0)))],
  ([code]) => Option.isNone(Schema.decodeOption(JobExited)({ _tag: 'JobExited', code })),
)
