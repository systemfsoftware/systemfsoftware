import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MicroVM } from '@systemfsoftware/effect-microsandbox'
import { Effect, Schema } from 'effect'
import {
  leftBehind,
  runningProcess,
  sandboxRuntimeOver,
  type SandboxWorld,
  sandboxWorld,
} from './__fixtures__/sandbox-runtime.fixture.js'

const Feature = makeFeature({ it })

const twoPortService = MicroVM.spec('alpine:3.20').withExposedPorts([8080, 6379])
const oneShotJob = MicroVM.job('alpine:3.20', ['echo', 'ready'])

const ruleFrom = (message: string | undefined): Effect.Effect<void, Conformance.RuleBroken> =>
  message === undefined ? Effect.void : Effect.fail(new Conformance.RuleBroken({ message }))

/** The rule every boot owes: a run that ended leaves no sandbox created and no host port held. */
const nothingLeftBehind = (world: SandboxWorld): Effect.Effect<void, Conformance.RuleBroken> =>
  ruleFrom(leftBehind(world))

const serviceBootOf = (world: SandboxWorld) =>
  runningProcess(world)(Effect.provide(twoPortService.scoped, sandboxRuntimeOver(world)))

const jobRunOf = (world: SandboxWorld) =>
  runningProcess(world)(Effect.provide(oneShotJob.run, sandboxRuntimeOver(world)))

const execInRunningVMOf = (world: SandboxWorld) =>
  runningProcess(
    world,
  )(
    Effect.provide(
      Effect.flatMap(twoPortService.scoped, (vm) => MicroVM.exec(vm, 'echo', ['ready'])),
      sandboxRuntimeOver(world),
    ),
  )

/** Every world the check rebuilds, so the scenario can prove a boot really ran. */
const freshWorlds = (): { readonly seen: Array<SandboxWorld>; readonly world: Effect.Effect<SandboxWorld> } => {
  const seen: Array<SandboxWorld> = []
  return {
    seen,
    world: Effect.tap(sandboxWorld, (fresh) =>
      Effect.sync(() => {
        seen.push(fresh)
      })),
  }
}

const destroyed = (seen: ReadonlyArray<SandboxWorld>): number =>
  seen.reduce((count, world) => count + world.destroyed.length, 0)

Feature('Stopping a microVM boot at every step leaves nothing behind', { timeout: 0 })
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A two-port service boot stopped at every step destroys the sandbox it created and frees its host port',
      Gherkin.Do.pipe(
        Given('a world that records every sandbox a run creates and every host port it reserves')(
          'world',
          () => Effect.succeed(freshWorlds()),
        ),
        When('a two-port service boots, is stopped at every step, and is started again on the same world')(
          'checked',
          (s) =>
            Conformance.stopped({
              unit: MicroVM.make,
              world: s.world.world,
              program: serviceBootOf,
              restart: serviceBootOf,
              rule: nothingLeftBehind,
              stopWithin: MicroVM.bootStopWithin,
            }),
        ),
        Then('every cut passes and the boots that ended destroyed what they created')((state, expect) =>
          expect({
            report: state.checked,
            rendered: Conformance.render(state.checked),
            destroyed: destroyed(state.world.seen),
          }).toMatchObject({
            report: { _tag: 'Pass' },
            rendered: expect.stringContaining('every stop cut passed'),
            destroyed: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
          })
        ),
      ),
    )

    scenario(
      'A job run stopped at every step answers the completion it owes and leaves no sandbox created',
      Gherkin.Do.pipe(
        Given('a world that records every sandbox a run creates and every host port it reserves')(
          'world',
          () => Effect.succeed(freshWorlds()),
        ),
        When('a one-shot job runs, is stopped at every step, and is started again on the same world')(
          'checked',
          (s) =>
            Conformance.stopped({
              unit: MicroVM.job,
              world: s.world.world,
              program: jobRunOf,
              restart: jobRunOf,
              rule: nothingLeftBehind,
              stopWithin: MicroVM.bootStopWithin,
            }),
        ),
        Then('every cut passes and the jobs that ended destroyed what they created')((state, expect) =>
          expect({
            report: state.checked,
            rendered: Conformance.render(state.checked),
            destroyed: destroyed(state.world.seen),
          }).toMatchObject({
            report: { _tag: 'Pass' },
            rendered: expect.stringContaining('every stop cut passed'),
            destroyed: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
          })
        ),
      ),
    )

    scenario(
      'A running VM whose exec a stop interrupts destroys the VM the exec came from',
      Gherkin.Do.pipe(
        Given('a world that records every sandbox a run creates and every host port it reserves')(
          'world',
          () => Effect.succeed(freshWorlds()),
        ),
        When('a booted VM executes a command, the stop interrupts it, and the boot starts again')(
          'checked',
          (s) =>
            Conformance.stopped({
              unit: MicroVM.exec,
              world: s.world.world,
              program: execInRunningVMOf,
              restart: execInRunningVMOf,
              rule: nothingLeftBehind,
              stopWithin: MicroVM.bootStopWithin,
            }),
        ),
        Then('every cut passes and the VMs that ended destroyed what they created')((state, expect) =>
          expect({
            report: state.checked,
            rendered: Conformance.render(state.checked),
            destroyed: destroyed(state.world.seen),
          }).toMatchObject({
            report: { _tag: 'Pass' },
            rendered: expect.stringContaining('every stop cut passed'),
            destroyed: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
          })
        ),
      ),
    )
  })
