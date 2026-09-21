import { it } from '@effect/vitest'
import { Result } from 'effect'
import * as Match from 'effect/Match'
import * as Arbitrary from 'effect/unstable/arbitrary/Arbitrary'
import {
  AssessVirtualization,
  assessVirtualization,
  type ProbeObservation,
  type VirtualizationVerdict,
} from '../assess-virtualization.workflow.js'

const commandArb = Arbitrary.schema(AssessVirtualization)

const familyOf = (observation: ProbeObservation): 'eligible' | 'refused' =>
  Match.value(observation).pipe(
    Match.tag('KvmAccessible', () => 'eligible' as const),
    Match.tag('KvmDenied', () => 'refused' as const),
    Match.tag('KvmAbsent', () => 'refused' as const),
    Match.tag('HvfUnavailable', () => 'refused' as const),
    Match.tag('WHPUnavailable', () => 'refused' as const),
    Match.tag('PlatformUnsupported', () => 'refused' as const),
    Match.exhaustive,
  )

const verdictFamilyOf = (verdict: VirtualizationVerdict): 'eligible' | 'refused' =>
  Match.value(verdict).pipe(
    Match.tag('VirtualizationEligible', () => 'eligible' as const),
    Match.tag('VirtualizationRefused', () => 'refused' as const),
    Match.exhaustive,
  )

const observedTopologyOf = (observation: ProbeObservation): string | undefined =>
  Match.value(observation).pipe(
    Match.tag('KvmDenied', ({ topology }) => topology),
    Match.tag('KvmAbsent', ({ topology }) => topology),
    Match.tag('WHPUnavailable', ({ topology }) => topology),
    Match.tag('KvmAccessible', () => undefined),
    Match.tag('HvfUnavailable', () => undefined),
    Match.tag('PlatformUnsupported', () => undefined),
    Match.exhaustive,
  )

it.prop('∀cmd_Total_=Success', [commandArb], ([command]) => Result.isSuccess(assessVirtualization(command)))

it.prop('∀cmd_Family_=Oracle', [commandArb], ([command]) => {
  const verdict = Result.getOrThrow(assessVirtualization(command))
  return verdictFamilyOf(verdict) === familyOf(command.observation)
})

it.prop('∀refused_Remediation_=Nonempty', [commandArb], ([command]) => {
  const verdict = Result.getOrThrow(assessVirtualization(command))
  return Match.value(verdict).pipe(
    Match.tag('VirtualizationEligible', () => true),
    Match.tag('VirtualizationRefused', ({ remediation }) => remediation.length > 0),
    Match.exhaustive,
  )
})

it.prop('∀refused_Topology_=Echo', [commandArb], ([command]) => {
  const verdict = Result.getOrThrow(assessVirtualization(command))
  const observed = observedTopologyOf(command.observation)
  return Match.value(verdict).pipe(
    Match.tag('VirtualizationEligible', () => true),
    Match.tag('VirtualizationRefused', ({ topology }) =>
      Match.value(observed).pipe(
        Match.when(undefined, () => true),
        Match.orElse((observedTopology) => topology === observedTopology),
      )),
    Match.exhaustive,
  )
})
