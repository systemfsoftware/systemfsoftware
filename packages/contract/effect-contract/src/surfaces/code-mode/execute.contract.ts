import { Cell } from '@systemfsoftware/effect-cell-types'
import { Effect, Result, Schema } from 'effect'
import { Contract, Sandbox } from '../../mod.js'

type AnswerOf<C extends Contract.Any> = C['answer']['Type']

export const execute: Contract.Any & {
  readonly name: 'execute'
  readonly access: Contract.Write
  readonly links: readonly []
} = Contract.make({
  name: 'execute',
  description: 'Runs an agent program in a dynamic-worker sandbox that may reach only its allowed hosts.',
  input: Sandbox.SandboxInput,
  output: Schema.Json,
  refusals: Sandbox.SandboxError,
  access: new Contract.Write({ risk: 'ContainedWrite' }),
  exposure: new Contract.Public({}),
  egress: new Contract.Closed({}),
  links: [],
})

const completed = (output: Schema.Json): AnswerOf<typeof execute> => ({ _tag: 'Completed', output, next: [] })

const refused = (refusal: Sandbox.SandboxError): AnswerOf<typeof execute> => ({ _tag: 'Refused', refusal, next: [] })

const rejected = (issue: string): AnswerOf<typeof execute> => ({ _tag: 'Rejected', issue })

const run = (invocation: Contract.Invocation): Effect.Effect<AnswerOf<typeof execute>, never, Sandbox.Sandbox> =>
  Effect.gen(function*() {
    const decoded = Schema.decodeUnknownResult(Sandbox.SandboxInput)(invocation.input)
    return yield* Result.match(decoded, {
      onFailure: (error) => Effect.succeed(rejected(error.message)),
      onSuccess: (input) =>
        Effect.gen(function*() {
          const sandbox = yield* Sandbox.Sandbox
          return yield* Effect.match(sandbox.run(input), {
            onFailure: (error) => refused(error),
            onSuccess: (output) => completed(output),
          })
        }),
    })
  })

export const executeCapability: Contract.Capability<typeof execute, Sandbox.Sandbox> = {
  contract: execute,
  cell: Cell.flatMap(Cell.id<Contract.Invocation>(), (invocation) => Cell.fromEffect(run(invocation))),
}
