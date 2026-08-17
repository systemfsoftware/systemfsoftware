/**
 * Diagnostics parity (R15), ported from upstream's `diagnostics()` case
 * and upgraded to the typed report: the live container (minted into the
 * fleet registry via `ContainerHandle.fromRunning`, exactly as a by-id
 * reconstruction would) appears in `reportDiagnostics` with its name,
 * image, running state, loopback host, port map and a REAL bounded log
 * tail from the daemon; the pure renderer projects the report losslessly
 * — every row field and every log line appears in the output, in order.
 * Real containers; the report's diagnostics tail is real daemon bytes
 * (RS-LANE).
 */
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { renderDiagnostics, reportDiagnostics } from '../../src/fleet/diagnostics.js'
import { ContainerHandle } from '../../src/fleet/handle.js'
import { fromImage, toRunningContainer } from '../../src/generic-container.js'
import { launchContainer } from '../../src/lifecycle/launch.js'
import { Wait } from '../../src/wait/strategies.js'
import { laneOutcome, outcomeFailure } from './helpers.js'

const Feature = makeFeature({ it, layer })

Feature('the diagnostics contract runs real containers through the docker backend').liveClock().body(
  ({ scenario }) => {
    scenario(
      'ShouldReportALiveContainerAndRenderLosslessly_WhenDiagnosticsRunOverRealState',
      Gherkin.Do.pipe(
        Given('a container printing a marker and staying alive')(
          'container',
          () =>
            laneOutcome(
              Effect.map(
                launchContainer(
                  fromImage('alpine:3.19')
                    .withCommand('sh', '-c', 'echo diagnostics-marker; sleep 60')
                    .waitingFor(Wait.forLogMessage('diagnostics-marker'))
                    .withStartupTimeout(30_000)
                    .spec,
                ),
                toRunningContainer,
              ),
            ),
        ),
        When('the container is minted into the live registry as a durable handle')('mint', (s) =>
          Effect.sync(() => {
            if (s.container.ok && s.container.value !== undefined) {
              ContainerHandle.fromRunning({
                backend: s.container.value.backend,
                handle: s.container.value.handle,
                spec: s.container.value.spec,
              })
            }
            return undefined
          })),
        When('a diagnostics report is built over the live registry')(
          'report',
          (s) =>
            s.container.ok && s.container.value !== undefined
              ? laneOutcome(reportDiagnostics)
              : Effect.succeed(outcomeFailure<never>('launch-failed', s.container.failureMessage)),
        ),
        Then('the report row carries the live container with a real log tail')((s) => {
          expect(s.report.ok).toBe(true)
          const row = s.report.ok && s.report.value !== undefined
            ? s.report.value.containers.find((candidate) =>
              s.container.ok && s.container.value !== undefined
                ? candidate.name === s.container.value.spec.name
                : false
            )
            : undefined
          expect(row).toBeDefined()
          if (row !== undefined) {
            expect(row.image).toBe('alpine:3.19')
            expect(row.state).toBe('running')
            expect(row.host).toBe('127.0.0.1')
            expect(row.ports).toEqual([])
            expect(row.logTailLines).toContain('diagnostics-marker')
          }
        }),
        When('the report is rendered to text')('rendered', (s) =>
          Effect.sync(() => {
            const report = s.report.ok && s.report.value !== undefined ? s.report.value : undefined
            return report === undefined ? '' : renderDiagnostics(report)
          })),
        Then('the renderer is lossless: name, image, state, host, ports and log lines all appear')((s) => {
          const text = s.rendered
          const named = s.container.ok && s.container.value !== undefined ? s.container.value.spec.name : undefined
          expect(text.length).toBeGreaterThan(0)
          if (named !== undefined && s.report.ok && s.report.value !== undefined) {
            expect(text).toContain(named)
            expect(text).toContain('alpine:3.19')
            expect(text).toContain('running on 127.0.0.1')
            expect(text).toContain('ports:')
            expect(text).toContain('(none)')
            expect(text).toContain('diagnostics-marker')
          }
        }),
      ),
    )
  },
)
