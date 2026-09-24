import { Handle } from '@systemfsoftware/effect-cell-types'
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { pipe } from 'effect'
import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import { expect } from 'vitest'

import { echo, open, RecordingDevice, ticks } from './__fixtures__/recording-device.handle.js'
import { DeviceLog, ProbeService, TallyService, VolumeSpec } from './__fixtures__/recording-driver.js'
import { read } from './__fixtures__/recording-file.handle.js'
import { lines, RecordingVolume } from './__fixtures__/recording-volume.handle.js'

const Feature = makeFeature({ it, layer })

const FreshLog = Layer.effect(DeviceLog)(Ref.make<ReadonlyArray<string>>([]))

const heard = Effect.flatMap(DeviceLog, Ref.get)

type Top<A = unknown> = A

const defectsOf = <A, E>(exit: Exit.Exit<A, E>): ReadonlyArray<Top> =>
  Exit.match(exit, {
    onSuccess: () => [],
    onFailure: (cause) => cause.reasons.filter(Cause.isDieReason).map((reason) => reason.defect),
  })

/** Acquires inside a scope of its own, hands back what the work produced, then lets the scope go. */
const heldThenLetGo = <A, E, R>(work: Effect.Effect<A, E, R>) =>
  Effect.gen(function*() {
    const scope = yield* Scope.make()
    const produced = yield* Scope.provide(work, scope)
    yield* Scope.close(scope, Exit.void)
    return produced
  })

const switchedOn = (name: string, failing: ReadonlyArray<string>) =>
  Effect.flatMap(DeviceLog, (log) => RecordingDevice.acquire({ log, name, failing }))

Feature('Reaching a device only while it is held')
  .withScenarioLayer(FreshLog)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'An echo prepared while the device was held fails once the device is let go',
      Gherkin.Do.pipe(
        Given('the device "alpha" was switched on, an echo of "late" was prepared, and the device was let go')(
          'prepared',
          () => heldThenLetGo(Effect.map(switchedOn('alpha', []), (device) => pipe(device, echo('late')))),
        ),
        When('the prepared echo is run')('outcome', (s) => Effect.exit(s.prepared)),
        Then('the echo fails, naming the device')((s) => {
          expect(defectsOf(s.outcome)).toMatchObject([{ _tag: 'HandleReleased', handle: 'RecordingDevice' }])
        }),
        And('the device heard nothing after it was let go')(() =>
          Effect.map(heard, (log) => {
            expect(log).toEqual(['create alpha', 'stop', 'destroy'])
          })
        ),
      ),
    )

    scenario(
      'Ticks started after the device is let go end at once',
      Gherkin.Do.pipe(
        Given('the device "beta" was switched on and then let go')(
          'device',
          () => heldThenLetGo(switchedOn('beta', [])),
        ),
        When('two ticks are started on it')('outcome', (s) => ticks(s.device, 2).pipe(Stream.runCollect, Effect.exit)),
        Then('the ticks fail, naming the device')((s) => {
          expect(defectsOf(s.outcome)).toMatchObject([{ _tag: 'HandleReleased', handle: 'RecordingDevice' }])
        }),
        And('the device heard no tick')(() =>
          Effect.map(heard, (log) => {
            expect(log).toEqual(['create beta', 'stop', 'destroy'])
          })
        ),
      ),
    )

    scenario(
      'A device that is held answers echoes and ticks',
      Gherkin.Do.pipe(
        When('the device "gamma" echoes "hi" and ticks twice while held')(
          'outcome',
          () =>
            Effect.scoped(
              Effect.flatMap(switchedOn('gamma', []), (device) =>
                Effect.zip(echo(device, 'hi'), Stream.runCollect(ticks(device, 2)))),
            ),
        ),
        Then('the echo answers "hi"')((s) => {
          expect(s.outcome[0]).toBe('hi')
        }),
        And('the device heard the echo and both ticks before it was let go')(() =>
          Effect.map(heard, (log) => {
            expect(log).toEqual(['create gamma', 'echo hi', 'tick', 'tick', 'stop', 'destroy'])
          })
        ),
      ),
    )

    scenario(
      'A volume with nothing to release is used and let go without a release call',
      Gherkin.Do.pipe(
        When('the volume "scratch" is mounted, read from, and let go')(
          'outcome',
          () =>
            Effect.scoped(
              Effect.gen(function*() {
                const volume = yield* RecordingVolume.acquire(new VolumeSpec({ label: 'scratch' }))
                const context = yield* RecordingVolume.context(volume)
                return { read: yield* lines(volume, 0), lends: Context.getOption(context, ProbeService) }
              }),
            ),
        ),
        Then('the volume answered what it had heard so far')((s) => {
          expect(s.outcome.read).toEqual([])
        }),
        And('the volume lends no services')((s) => {
          expect(Option.isNone(s.outcome.lends)).toBe(true)
        }),
        And('nothing was released when it was let go')(() =>
          Effect.map(heard, (log) => {
            expect(log).toEqual([])
          })
        ),
      ),
    )

    scenarioOutline(
      'A file opened from a device is closed exactly once when its reader {work}',
      [
        { work: 'finishes', fails: false },
        { work: 'gives up', fails: true },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          When('the device "delta" opens "/notes" and the reader reads four characters')(
            'outcome',
            () =>
              Effect.scoped(
                Effect.flatMap(switchedOn('delta', []), (device) =>
                  Effect.exit(
                    open(device, '/notes').pipe(
                      Effect.flatMap((file) =>
                        Effect.andThen(read(file, 4), row.fails ? Effect.fail('reader gave up') : Effect.void)
                      ),
                      Effect.scoped,
                    ),
                  )),
              ),
          ),
          Then('the reader ends as it chose to')((s) => {
            expect(Exit.isFailure(s.outcome)).toBe(row.fails)
          }),
          And('the file was closed once, before the device was let go')(() =>
            Effect.map(heard, (log) => {
              expect(log).toEqual([
                'create delta',
                'open /notes',
                'read /notes',
                'close /notes on release',
                'stop',
                'destroy',
              ])
            })
          ),
        ),
    )

    scenario(
      'A device that refuses to switch on leaves nothing to release',
      Gherkin.Do.pipe(
        When('a device with no name is switched on')(
          'outcome',
          () => switchedOn('', []).pipe(Effect.scoped, Effect.exit),
        ),
        Then('switching on fails with the refusal')((s) => {
          expect(Exit.isFailure(s.outcome)).toBe(true)
          expect(defectsOf(s.outcome)).toEqual([])
        }),
        And('the device heard nothing at all')(() =>
          Effect.map(heard, (log) => {
            expect(log).toEqual([])
          })
        ),
      ),
    )

    scenarioOutline(
      'Letting go of a device whose {trouble} escalates through its release steps',
      [
        { trouble: 'release goes smoothly', failing: [], steps: ['stop', 'destroy'], unrecovered: [] },
        { trouble: 'stop fails', failing: ['stop'], steps: ['stop', 'kill', 'destroy'], unrecovered: [] },
        {
          trouble: 'every step fails',
          failing: ['stop', 'kill', 'destroy'],
          steps: ['stop', 'kill', 'destroy'],
          unrecovered: ['kill', 'destroy'],
        },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          When('the device "epsilon" is switched on and let go')(
            'outcome',
            () => switchedOn('epsilon', row.failing).pipe(Effect.scoped, Effect.exit),
          ),
          Then('each release step ran in escalation order')(() =>
            Effect.map(heard, (log) => {
              expect(log).toEqual(['create epsilon', ...row.steps])
            })
          ),
          And('every stage no later step recovered is reported')((s) => {
            expect(defectsOf(s.outcome)).toMatchObject(row.unrecovered.map((step) => ({ _tag: 'StepFailed', step })))
          }),
        ),
    )

    scenario(
      'A held device lends its probe and its tally to the program',
      Gherkin.Do.pipe(
        When('the device "zeta" is held and the program pings it through its probe')(
          'outcome',
          () =>
            Effect.scoped(
              Effect.gen(function*() {
                const device = yield* switchedOn('zeta', [])
                const context = yield* RecordingDevice.context(device)
                yield* Context.get(context, ProbeService).ping
                return yield* Context.get(context, TallyService).lines
              }),
            ),
        ),
        Then('the tally counts the ping the device heard')((s) => {
          expect(s.outcome).toEqual(['create zeta', 'ping'])
        }),
        And('a released device lends nothing')(() =>
          Effect.map(
            heldThenLetGo(switchedOn('eta', [])).pipe(Effect.flatMap(RecordingDevice.context), Effect.exit),
            (exit) => {
              expect(defectsOf(exit)).toMatchObject([{ _tag: Handle.HandleReleased.name, handle: 'RecordingDevice' }])
            },
          )
        ),
      ),
    )
  })
