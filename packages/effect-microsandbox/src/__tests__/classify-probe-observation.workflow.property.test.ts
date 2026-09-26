import { it } from '@systemfsoftware/vitest'
import { Schema } from 'effect'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import {
  AppleHypervisorFacts,
  ClassifyProbeObservation,
  classifyProbeObservation,
  HvfUnavailable,
  KvmAbsent,
  KvmAccessible,
  KvmDenied,
  KvmDeviceFacts,
  NoProbeForPlatform,
  PlatformUnsupported,
  type ProbeFacts,
  type ProbeObservation,
  VmcomputeFacts,
  WHPUnavailable,
} from '../classify-probe-observation.workflow.js'

const verdictHolds = (
  classify: typeof classifyProbeObservation,
  facts: ProbeFacts,
  platform: string,
  holds: (observed: ProbeObservation) => boolean,
): boolean =>
  Result.match(classify(new ClassifyProbeObservation({ platform, facts })), {
    onFailure: () => false,
    onSuccess: (observed) => holds(observed),
  })

it.prop(
  '∀k_KvmDeviceFacts_≡AccessVerdict',
  { of: [KvmDeviceFacts], subject: classifyProbeObservation },
  (subject, [facts]) =>
    verdictHolds(subject, facts, 'linux', (observed) =>
      Match.value(facts.accessible).pipe(
        Match.when(true, () => Schema.is(KvmAccessible)(observed)),
        Match.when(false, () =>
          Match.value(facts.present).pipe(
            Match.when(true, () => Schema.is(KvmDenied)(observed) && observed.topology === 'kvm exists=true rw=false'),
            Match.when(false, () => Schema.is(KvmAbsent)(observed) && observed.topology === 'kvm exists=false'),
            Match.exhaustive,
          )),
        Match.exhaustive,
      )),
)

it.prop(
  '∀w_VmcomputeFacts_≡WindowsVerdict',
  { of: [VmcomputeFacts], subject: classifyProbeObservation },
  (subject, [facts]) =>
    verdictHolds(subject, facts, 'win32', (observed) =>
      Match.value(facts.present).pipe(
        Match.when(true, () => Schema.is(KvmAccessible)(observed)),
        Match.when(false, () => Schema.is(WHPUnavailable)(observed) && observed.topology === 'vmcompute present=false'),
        Match.exhaustive,
      )),
)

it.prop(
  '∀a_AppleHypervisorFacts_≡ArchVerdict',
  { of: [AppleHypervisorFacts], subject: classifyProbeObservation },
  (subject, [facts]) =>
    verdictHolds(subject, facts, 'darwin', (observed) =>
      Match.value(facts.arch === 'arm64').pipe(
        Match.when(true, () => Schema.is(KvmAccessible)(observed)),
        Match.when(false, () => Schema.is(HvfUnavailable)(observed) && observed.arch === facts.arch),
        Match.exhaustive,
      )),
)

it.prop(
  '∀p_NoProbeForPlatform_≡UnsupportedVerdict',
  { of: [NoProbeForPlatform, Schema.String], subject: classifyProbeObservation },
  (subject, [facts, platform]) =>
    verdictHolds(
      subject,
      facts,
      platform,
      (observed) =>
        Schema.is(PlatformUnsupported)(observed) && observed.platform === platform && observed.arch === facts.arch,
    ),
)
