import type { Handle } from '@systemfsoftware/effect-cell-types'
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'
import * as Scope from 'effect/Scope'
import { expect } from 'vitest'

import { echo } from './__fixtures__/recording-device.handle.js'
import { DeviceLog, ProbeService, VolumeSpec } from './__fixtures__/recording-driver.js'
import { lines } from './__fixtures__/recording-volume.handle.js'
import { DeviceSpec, RecordingDevices, RecordingVolumes } from './__fixtures__/recording.resource.js'

type Top<A = unknown> = A

const Feature = makeFeature({ it, layer })

const FreshLog = Layer.effect(DeviceLog)(Ref.make<ReadonlyArray<string>>([]))

const heard = Effect.flatMap(DeviceLog, Ref.get)

class HeldDevice
  extends Context.Service<HeldDevice, Handle.Handle<'RecordingDevice', { name: string }>>()('HeldDevice')
{}

const failuresOf = <A, E>(exit: Exit.Exit<A, E>): ReadonlyArray<Top> =>
  Exit.match(exit, {
    onSuccess: () => [],
    onFailure: (cause) => cause.reasons.filter(Cause.isFailReason).map((reason) => reason.error),
  })

const device = (name: string, reachable: boolean, readiness: DeviceSpec['readiness']) =>
  RecordingDevices.of(new DeviceSpec({ name, reachable, readiness }))

/** Builds a layer under a scope of its own, runs the work against its context, then lets the scope go. */
const builtThenLetGo = <Provided, E, R, A, E2, R2>(
  built: Layer.Layer<Provided, E, R>,
  work: (context: Context.Context<Provided>) => Effect.Effect<A, E2, R2>,
) =>
  Effect.gen(function*() {
    const scope = yield* Scope.make()
    const context = yield* Layer.buildWithScope(built, scope)
    const produced = yield* work(context)
    yield* Scope.close(scope, Exit.void)
    return produced
  })

Feature('Holding a device from its specification')
  .withScenarioLayer(FreshLog)
  .body(({ scenario }) => {
    scenario(
      'A device that refuses to become ready is released once and its refusal reaches the caller',
      Gherkin.Do.pipe(
        When('the device "alpha" is held but refuses to become ready')(
          'outcome',
          () => device('alpha', true, 'refuses').scoped.pipe(Effect.scoped, Effect.exit),
        ),
        Then('the caller receives the refusal')((s) => {
          expect(failuresOf(s.outcome)).toMatchObject([{ _tag: 'DeviceNotReady', name: 'alpha' }])
        }),
        And('the device was switched on and released exactly once')(() =>
          Effect.map(heard, (log) => {
            expect(log).toEqual(['create alpha', 'stop', 'destroy'])
          })
        ),
      ),
    )

    scenario(
      'A device whose holder gives up while it warms up is released once',
      Gherkin.Do.pipe(
        Given('the device "beta" was switched on and is still warming up')(
          'holder',
          () =>
            Effect.gen(function*() {
              const holder = yield* device('beta', true, 'hangs').scoped.pipe(Effect.scoped, Effect.forkChild)
              yield* Effect.repeat(heard, { until: (log) => log.length > 0 })
              return holder
            }),
        ),
        When('the holder gives up')('outcome', (s) => Fiber.interrupt(s.holder)),
        Then('the device was released exactly once')(() =>
          Effect.map(heard, (log) => {
            expect(log).toEqual(['create beta', 'stop', 'destroy'])
          })
        ),
      ),
    )

    scenario(
      'An unreachable device is never switched on',
      Gherkin.Do.pipe(
        When('the unreachable device "gamma" is held')(
          'outcome',
          () => device('gamma', false, 'answers').scoped.pipe(Effect.scoped, Effect.exit),
        ),
        Then('the caller learns the device is unreachable')((s) => {
          expect(failuresOf(s.outcome)).toMatchObject([{ _tag: 'DeviceUnreachable', name: 'gamma' }])
        }),
        And('nothing was switched on or released')(() =>
          Effect.map(heard, (log) => {
            expect(log).toEqual([])
          })
        ),
      ),
    )

    scenario(
      'A device lent to a program as services is switched on once and released when the program ends',
      Gherkin.Do.pipe(
        When('a program holds the device "delta" through its services and pings it')(
          'outcome',
          () =>
            builtThenLetGo(
              device('delta', true, 'answers').layer,
              (context) => Context.get(context, ProbeService).ping,
            ),
        ),
        Then('the device became ready, answered the ping, and was released once the program ended')(() =>
          Effect.map(heard, (log) => {
            expect(log).toEqual(['create delta', 'ping', 'ping', 'stop', 'destroy'])
          })
        ),
      ),
    )

    scenario(
      "A device bound under the program's own name is switched on once and released when the program ends",
      Gherkin.Do.pipe(
        When('a program holds the device "epsilon" under its own name and asks it to echo "hi"')(
          'outcome',
          () =>
            builtThenLetGo(
              device('epsilon', true, 'answers').bind(HeldDevice),
              (context) => echo(Context.get(context, HeldDevice), 'hi'),
            ),
        ),
        Then('the device echoes "hi"')((s) => {
          expect(s.outcome).toBe('hi')
        }),
        And('the device was switched on once and released once the program ended')(() =>
          Effect.map(heard, (log) => {
            expect(log).toEqual(['create epsilon', 'ping', 'echo hi', 'stop', 'destroy'])
          })
        ),
      ),
    )

    scenario(
      'A volume is mounted straight from its specification and recognised as a volume',
      Gherkin.Do.pipe(
        When('the volume "scratch" is mounted and read from')(
          'outcome',
          () => {
            const volume = RecordingVolumes.of(new VolumeSpec({ label: 'scratch' }))
            return Effect.map(
              Effect.scoped(Effect.flatMap(volume.scoped, (mounted) => lines(mounted, 0))),
              (read) => ({ read, isVolume: RecordingVolumes.is(volume), isDevice: RecordingDevices.is(volume) }),
            )
          },
        ),
        Then('the volume answers what it heard')((s) => {
          expect(s.outcome.read).toEqual([])
        }),
        And('it is recognised as a volume and not as a device')((s) => {
          expect([s.outcome.isVolume, s.outcome.isDevice]).toEqual([true, false])
        }),
      ),
    )
  })
