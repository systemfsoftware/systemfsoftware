import { NodeFileSystem } from '@effect/platform-node'
import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, FileSystem, Layer, Path, Schema } from 'effect'

import { passReportOf } from './__fixtures__/checkReports.js'
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
        Then(
          'the check reports the stop that left the lock held, naming the failed release and the step after the claim',
        )(
          (s, expect) =>
            expect(
              {
                report: s.checked,
                rendered: Conformance.render(s.checked),
              },
              Conformance.render(s.checked),
            ).toMatchObject({
              report: {
                _tag: 'Fail',
                failure: {
                  judgement: {
                    problem: 'interruption-left-held',
                    step: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
                  },
                },
              },
              rendered: expect.stringMatching(/the release failed[\s\S]*at step/),
            }),
        ),
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
        Then('the lock passes after every interruption, and the report states how many were tried')((s, expect) => {
          const passing = passReportOf(s.checked)
          return expect(
            { report: s.checked, rendered: Conformance.render(s.checked) },
            Conformance.render(s.checked),
          ).toMatchObject({
            report: {
              _tag: 'Pass',
              histories: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
            },
            rendered: expect.stringContaining(String(passing.histories)),
          })
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
        Then('the check reports the stop that left the file behind')((s, expect) =>
          expect(s.checked, Conformance.render(s.checked)).toMatchObject({
            _tag: 'Fail',
            failure: { judgement: { problem: 'interruption-left-held' } },
          })
        ),
      ),
    )
  })
