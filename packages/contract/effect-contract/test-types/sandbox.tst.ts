import { type Effect, Schema } from 'effect'
import { describe, expect, it } from 'tstyche'
import type { SandboxShape } from '../src/Sandbox/mod.js'
import { SandboxError, SandboxInput } from '../src/Sandbox/sandbox.schema.js'

describe('The root sandbox service', () => {
  it('Should_AnswerAJsonResultOrATypedSandboxError_When_AProgramRuns', () => {
    expect<SandboxShape['run']>().type.toBe<
      (input: SandboxInput) => Effect.Effect<Schema.Json, SandboxError, never>
    >()
  })
})
