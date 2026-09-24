import { NodeFileSystem } from '@effect/platform-node'
import { expect } from '@effect/vitest'
import { Conformance } from '@systemfsoftware/conformance-spec'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, FileSystem, Layer, Path } from 'effect'

import { failReportOf, passReportOf } from './__fixtures__/checkReports.js'
import { releasingLock, successPathLock, tempFileReport } from './__fixtures__/Resources.js'

const Feature = makeFeature({ it })

Feature('Proving an interrupted program leaves nothing held', { timeout: 0 })
  .withLayer(Layer.empty)
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A lock released only after later steps succeed stays held when the holder stops between claiming and registering',
      Gherkin.Do.pipe(
        Given('a lock program that claims the lock first and registers its release only after a later step succeeds')(
          'holder',
          () => Effect.succeed(successPathLock()),
        ),
        When('the check stops the holder at every step and asks a fresh caller for the lock after each stop')(
          'checked',
          (s) => Conformance.released(s.holder.program, s.holder.check),
        ),
        Then('the check reports the stop that left the lock held')((s) => {
          expect(failReportOf(s.checked).failure.judgement.problem).toBe('interruption-left-held')
        }),
        And('the report names the step after the lock was claimed')((s) => {
          expect(failReportOf(s.checked).failure.judgement.step).toBeGreaterThan(0)
        }),
        And('the rendered report names the release and the step')((s) => {
          const text = Conformance.render(s.checked)
          expect(text).toContain('the release failed')
          expect(text).toContain('at step')
        }),
      ),
    )

    scenario(
      'A lock whose release is registered as it is claimed survives every interruption',
      Gherkin.Do.pipe(
        Given('a lock program that registers its release in the same step it claims the lock')(
          'holder',
          () => Effect.succeed(releasingLock()),
        ),
        When('the check stops the holder at every step and asks a fresh caller for the lock after each stop')(
          'checked',
          (s) => Conformance.released(s.holder.program, s.holder.check),
        ),
        Then('the lock passes after every interruption')((s) => {
          expect(passReportOf(s.checked).histories).toBeGreaterThan(0)
        }),
        And('the report states how many interruptions were tried')((s) => {
          const passing = passReportOf(s.checked)
          expect(Conformance.render(s.checked)).toContain(String(passing.histories))
        }),
      ),
    )

    scenario(
      'A file created before its removal is registered is left behind when the holder stops in between',
      { scenarioLayer: Layer.merge(NodeFileSystem.layer, Path.layer) },
      Gherkin.Do.pipe(
        Given('a program that creates a report file first and registers its removal only after a later step succeeds')(
          'holder',
          () =>
            Effect.flatMap(
              FileSystem.FileSystem,
              (fileSystem) =>
                Effect.acquireRelease(tempFileReport(fileSystem), (resource) => Effect.orDie(resource.cleanup)),
            ),
        ),
        When('the check stops the holder at every step and looks for the file on disk after each stop')(
          'checked',
          (s) => Conformance.released(s.holder.program, s.holder.check),
        ),
        Then('the check reports the stop that left the file behind')((s) => {
          expect(failReportOf(s.checked).failure.judgement.problem).toBe('interruption-left-held')
        }),
      ),
    )
  })
