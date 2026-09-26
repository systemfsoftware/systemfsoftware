import type { MicroVM } from '@systemfsoftware/effect-microsandbox'
import { Effect, Fiber, Schema } from 'effect'
import type { Sandbox } from 'microsandbox'

export type SandboxPlan = Parameters<MicroVM.SandboxRuntimeShape['acquire']>[0]

export interface LawObservation {
  readonly held: boolean
}

export interface LawCase<R = never> {
  readonly name: string
  readonly check: Effect.Effect<LawObservation, never, R>
}

export class SandboxRuntimeLawBroken extends Schema.TaggedError<SandboxRuntimeLawBroken>()(
  'SandboxRuntimeLawBroken',
  { law: Schema.String, detail: Schema.String },
) {}

export interface SandboxRuntimeUnderTest<R = never> {
  readonly acquire: (plan: SandboxPlan) => Effect.Effect<Sandbox, MicroVM.SandboxBootError, R>
  readonly release: (sandbox: Sandbox) => Effect.Effect<void>
  readonly kill: (sandbox: Sandbox) => Effect.Effect<void>
  readonly heldByOutside: (sandbox: Sandbox) => Effect.Effect<boolean>
}

export interface SandboxRuntimeLawOptions<R = never> {
  readonly runtime: () => SandboxRuntimeUnderTest<R>
  readonly plan: SandboxPlan
}

export type SandboxRuntimeLawSuite<R = never> = readonly [LawCase<R>, LawCase<R>, LawCase<R>, LawCase<R>]

const broken = (law: string, detail: string): SandboxRuntimeLawBroken => SandboxRuntimeLawBroken.make({ law, detail })

const mustBeHeld = (law: string, held: boolean): Effect.Effect<void> =>
  held ? Effect.void : Effect.die(broken(law, 'the outside system never reported the sandbox as held'))

const lawOf = <R>(
  name: string,
  check: Effect.Effect<LawObservation, MicroVM.SandboxBootError, R>,
): LawCase<R> => ({ name, check: Effect.orDie(check) })

/**
 * The laws every `MicroVM.SandboxRuntime` obeys, written once for both adapters.
 *
 * They stop a call mid-flight, call again after a stop, and kill a sandbox mid-call,
 * because those are the cuts the stop check drives and the states its rule reads: an
 * acquired sandbox is held, and any run that *ended* leaves nothing held behind.
 */
export const sandboxRuntimeLaws = <R>(
  { runtime: runtimeFor, plan }: SandboxRuntimeLawOptions<R>,
): SandboxRuntimeLawSuite<R> => [
  lawOf(
    'an acquired sandbox is held by the outside system until it is released',
    Effect.gen(function*() {
      const runtime = runtimeFor()
      const sandbox = yield* runtime.acquire(plan)
      yield* mustBeHeld('held-until-released', yield* runtime.heldByOutside(sandbox))
      yield* runtime.release(sandbox)
      return { held: yield* runtime.heldByOutside(sandbox) }
    }),
  ),
  lawOf(
    'releasing a sandbox leaves the outside system holding nothing',
    Effect.gen(function*() {
      const runtime = runtimeFor()
      const sandbox = yield* runtime.acquire(plan)
      yield* runtime.release(sandbox)
      return { held: yield* runtime.heldByOutside(sandbox) }
    }),
  ),
  lawOf(
    'killing a sandbox mid-call leaves a later release able to clear it',
    Effect.gen(function*() {
      const runtime = runtimeFor()
      const sandbox = yield* runtime.acquire(plan)
      yield* runtime.kill(sandbox)
      yield* runtime.release(sandbox)
      return { held: yield* runtime.heldByOutside(sandbox) }
    }),
  ),
  lawOf(
    'a stop that interrupts a release still leaves nothing held',
    Effect.gen(function*() {
      const runtime = runtimeFor()
      const sandbox = yield* runtime.acquire(plan)
      const releasing = yield* Effect.forkChild(runtime.release(sandbox))
      yield* Effect.yieldNow
      yield* Fiber.interrupt(releasing)
      return { held: yield* runtime.heldByOutside(sandbox) }
    }),
  ),
]
