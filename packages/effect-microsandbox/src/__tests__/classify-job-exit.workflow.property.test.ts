import { it } from '@systemfsoftware/vitest'
import { Crypto, Effect, Equal, Layer, Match, Option, Schema, Tracer } from 'effect'
import * as Result from 'effect/Result'
import { recordingSandboxRuntime } from '../../tests/__fixtures__/sandbox-runtime.fixture.js'
import { awaitJobCompletion } from '../await-job-completion.cell.js'
import type { AcquiredVM } from '../boot-sandbox.cell.js'
import { bootSandbox } from '../boot-sandbox.cell.js'
import { ClassifyJobExit, classifyJobExit } from '../classify-job-exit.workflow.js'
import { JobExited, type JobExitStatus } from '../JobExitStatus.schema.js'
import { JobSpec } from '../MicroVMSpec.schema.js'

type Classify = typeof classifyJobExit

const classifiedHolds = (
  classify: Classify,
  code: number,
  stdout: Uint8Array,
  stderr: Uint8Array,
  law: (status: JobExitStatus) => boolean,
): boolean =>
  Result.match(classify(new ClassifyJobExit({ code, stdout, stderr })), {
    onFailure: () => false,
    onSuccess: (status) => law(status),
  })

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
  {
    of: [
      Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 255 }))),
      Schema.Uint8Array,
      Schema.Uint8Array,
    ],
    subject: classifyJobExit,
  },
  (subject, [code, stdout, stderr]) =>
    classifiedHolds(subject, code, stdout, stderr, (status) =>
      Option.match(exitedOf(status), {
        onNone: () => false,
        onSome: (exited) => Equal.equals(exited.code, code),
      })),
)

it.prop(
  '∀negative_ClassifyJobExit_=JobSignaled',
  {
    of: [Schema.Int.pipe(Schema.check(Schema.isLessThan(0))), Schema.Uint8Array, Schema.Uint8Array],
    subject: classifyJobExit,
  },
  (subject, [code, stdout, stderr]) => classifiedHolds(subject, code, stdout, stderr, signaledOf),
)

it.prop(
  '∀code_JobExited_≡Natural',
  { of: [Schema.TaggedStruct('JobExited', { code: Schema.Int })], subject: Schema.decodeOption(JobExited) },
  (subject, [candidacy]) => Option.isSome(subject(candidacy)) === (candidacy.code >= 0),
)

const captureCellSpans = <A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<ReadonlyArray<Tracer.Span>, E, R> =>
  Effect.gen(function*() {
    const spans: Array<Tracer.Span> = []
    const tracer = Tracer.make({
      span: (options) => {
        const span = new Tracer.NativeSpan(options)
        spans.push(span)
        return span
      },
    })
    yield* Effect.provideService(program, Tracer.Tracer, tracer)
    return spans
  })

const numberAttributeOf = (spans: ReadonlyArray<Tracer.Span>, name: string, attribute: string): number | undefined => {
  const value = spans.find((span) => span.name === name)?.attributes.get(attribute)
  return typeof value === 'number' ? value : undefined
}

const sharedCrypto = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({ randomBytes: (size) => new Uint8Array(size), digest: () => Effect.succeed(new Uint8Array()) }),
)

const withExitCode = (vm: AcquiredVM, code: number): AcquiredVM => ({
  spec: vm.spec,
  plan: vm.plan,
  sandbox: Object.assign(vm.sandbox, {
    execDefault: () =>
      Promise.resolve({ code, stdoutBytes: () => new Uint8Array(), stderrBytes: () => new Uint8Array() }),
  }),
})

const jobSpecOf = (code: number): JobSpec =>
  JobSpec.make({ image: 'alpine:3.20', env: {}, mounts: [], cmd: ['sh', '-c', `exit ${code}`] })

const awaitJobCompletionSpans = (code: number) =>
  captureCellSpans(
    Effect.provide(
      Effect.scoped(
        Effect.flatMap(bootSandbox.run(jobSpecOf(code)), (acquired) =>
          Match.value(acquired).pipe(
            Match.tag('LoopbackViolationError', (refused) => Effect.fail(refused)),
            Match.orElse((vm) => awaitJobCompletion.run(withExitCode(vm, code))),
          )),
      ),
      Layer.merge(recordingSandboxRuntime, sharedCrypto),
    ),
  )

it.effect.prop(
  '∀code_AwaitJobCompletionSpan_≡JobExitCode',
  {
    of: [Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 255 })))],
    subject: awaitJobCompletionSpans,
  },
  (subject, [code]) =>
    Effect.map(
      subject(code),
      (spans) => numberAttributeOf(spans, 'await_job_completion', 'microsandbox.job.exit.code') === code,
    ),
)
