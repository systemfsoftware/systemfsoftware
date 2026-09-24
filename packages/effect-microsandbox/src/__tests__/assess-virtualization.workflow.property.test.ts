import { it } from '@effect/vitest'
import { Result } from 'effect'
import * as Match from 'effect/Match'
import { AssessVirtualization, assessVirtualization } from '../assess-virtualization.workflow.js'

it.prop(
  '∀cmd_Verdict_=Sound',
  { of: [AssessVirtualization], subject: assessVirtualization, runs: 100 },
  (subject, [command]) => {
    const verdict = Result.getOrThrow(subject(command))
    return Match.value(command.observation).pipe(
      Match.tag('KvmAccessible', () =>
        Match.value(verdict).pipe(
          Match.tag('VirtualizationEligible', () => true),
          Match.tag('VirtualizationRefused', () => false),
          Match.exhaustive,
        )),
      Match.orElse((refusalObs) =>
        Match.value(verdict).pipe(
          Match.tag('VirtualizationEligible', () => false),
          Match.tag('VirtualizationRefused', ({ remediation, topology }) => {
            const expectedTopology = Match.value(refusalObs).pipe(
              Match.tag('KvmDenied', (o) => o.topology),
              Match.tag('KvmAbsent', (o) => o.topology),
              Match.tag('WHPUnavailable', (o) => o.topology),
              Match.tag('HvfUnavailable', (o) => `arch=${o.arch}`),
              Match.tag('PlatformUnsupported', (o) => `platform=${o.platform} (${o.arch})`),
              Match.exhaustive,
            )
            return remediation.length > 0 && topology === expectedTopology
          }),
          Match.exhaustive,
        )
      ),
    )
  },
)
