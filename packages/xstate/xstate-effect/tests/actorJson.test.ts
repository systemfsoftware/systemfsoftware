import { it } from '@systemfsoftware/vitest'
import { createActor, createMachine } from '@systemfsoftware/xstate'
import { createEffectActor } from '@systemfsoftware/xstate-effect'
import { Effect } from 'effect'

it('Should_PublishTheCoreActorRefJson_When_AnEffectActorSerializesItself', function*({ expect }) {
  const machine = createMachine({ initial: 'a', states: { a: {} } })
  const core = createActor(machine).start()
  const coreJson = core.toJSON() as Record<string, unknown>
  core.stop()

  const json = yield* Effect.scoped(
    Effect.gen(function*() {
      const actor = yield* createEffectActor(machine)
      return actor.toJSON() as Record<string, unknown>
    }),
  )

  yield* expect({
    // The tag value is the frozen wire discriminant (packages/xstate/AGENTS.md XS2).
    tag: json['xstate$type'],
    keys: Object.keys(json).sort(),
    coreKeys: Object.keys(coreJson).sort(),
    idType: typeof json['id'],
    addressType: typeof json['address'],
  }).toEqual({
    tag: 'actorRef',
    keys: ['address', 'id', 'src', 'xstate$type'],
    coreKeys: ['address', 'id', 'src', 'xstate$type'],
    idType: 'string',
    addressType: 'string',
  })
})
