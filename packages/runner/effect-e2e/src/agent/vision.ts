import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import { Base64 } from 'effect/encoding'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'

import type { EngineCapability } from '../engine/capability.schema.js'
import type { EngineShape } from '../engine/engine.service.js'
import type { Locator } from '../engine/locator.schema.js'
import type { Observation } from '../engine/observation.schema.js'
import type { SemanticNode } from '../engine/semantic-node.schema.js'
import type { ContentPart } from '../model/model.schema.js'
import type { EvidenceRef, VisionMode } from '../verdict/check.schema.js'
import {
  type AppNotOpen,
  type ArtifactWriteFailed,
  type AutomationUnsupported,
  PolicyDenied,
  UnsupportedCapability,
} from '../verdict/failure.schema.js'
import { lookupNode } from './located-node.schema.js'
import { formatObservation } from './observation.js'
import type { SecretLedgerShape } from './secret-ledger.service.js'

const VISION_CAPABILITIES: ReadonlyArray<EngineCapability> = ['screenshot', 'vision']

const IMAGE_ONLY_TEXT = 'Current screen: shown only as the attached image. No element tree is available, so no node ' +
  'has a [ref] id; name a control by its role and visible name.'

export interface VisionGateRequest {
  readonly mode: VisionMode
  readonly modelVision: boolean
  readonly capabilities: ReadonlyArray<EngineCapability>
}

export interface MaskedScreenshotRequest {
  readonly observation: Observation
  readonly engine: EngineShape
  readonly ledger: SecretLedgerShape
}

export interface VisionEvidenceRequest extends MaskedScreenshotRequest {
  readonly mode: VisionMode
}

export interface VisionEvidence {
  readonly parts: Arr.NonEmptyReadonlyArray<ContentPart>
  readonly screenshot: Option.Option<EvidenceRef>
  readonly refsOffered: boolean
}

export type VisionEvidenceFailure = PolicyDenied | AutomationUnsupported | ArtifactWriteFailed | AppNotOpen

const unsupported = (missing: ReadonlyArray<string>): UnsupportedCapability =>
  new UnsupportedCapability({
    message: `vision evidence needs ${Arr.join(missing, ' and ')}, so the judgment cannot use weaker evidence`,
    evidence: [{ _tag: 'LogEvidence', text: `missing ${Arr.join(missing, ', ')}` }],
  })

const missingOf = (request: VisionGateRequest): ReadonlyArray<string> => [
  ...(request.modelVision ? [] : ['a model that declares vision']),
  ...Arr.filter(VISION_CAPABILITIES, (capability) => !request.capabilities.includes(capability)).map(
    (capability) => `the engine capability "${capability}"`,
  ),
]

export const visionGate = (request: VisionGateRequest): Effect.Effect<void, UnsupportedCapability> =>
  Match.value(request.mode).pipe(
    Match.when(false, () => Effect.void),
    Match.orElse(() =>
      Arr.match(missingOf(request), {
        onEmpty: () => Effect.void,
        onNonEmpty: (missing) => Effect.fail(unsupported(missing)),
      })
    ),
  )

const visibleNodesOf = (nodes: ReadonlyArray<SemanticNode>): ReadonlyArray<SemanticNode> =>
  Arr.flatMap(nodes, (node) => (node.states.hidden ? [] : [node, ...visibleNodesOf(node.children)]))

const showsSecret = (ledger: SecretLedgerShape) => (node: SemanticNode): boolean =>
  Arr.some([node.name, node.text, node.value], (field) => field !== undefined && ledger.redact(field) !== field)

const unmaskable: PolicyDenied = new PolicyDenied({
  message: 'a node on screen shows a secret the engine cannot mask, so no screenshot is taken',
  evidence: [{ _tag: 'LogEvidence', text: 'unmaskable secret on screen' }],
})

const masksOf = (request: MaskedScreenshotRequest): Effect.Effect<ReadonlyArray<Locator>, PolicyDenied> =>
  Effect.forEach(
    Arr.filter(visibleNodesOf(request.observation.tree), showsSecret(request.ledger)),
    (node) =>
      Match.valueTags(lookupNode(request.observation, node.ref.id), {
        NodeLocated: ({ located }) => Effect.succeed(located.locator),
        NodeRoleless: () => Effect.fail(unmaskable),
        NodeAbsent: () => Effect.fail(unmaskable),
      }),
  )

interface Captured {
  readonly image: ContentPart
  readonly screenshot: EvidenceRef
}

const capturedOf = (bytes: Uint8Array): Captured => ({
  image: { _tag: 'ImagePart', mediaType: 'image/png', data: Base64.encode(bytes) },
  screenshot: { _tag: 'ScreenshotEvidence', screenshot: { digest: bytesToHex(sha256(bytes)) } },
})

export const maskedScreenshotOf = (
  request: MaskedScreenshotRequest,
): Effect.Effect<Uint8Array, VisionEvidenceFailure> =>
  Effect.flatMap(masksOf(request), (mask) => request.ledger.screenshot(request.engine.screenshot({ mask })))

const captured = (request: VisionEvidenceRequest): Effect.Effect<Captured, VisionEvidenceFailure> =>
  Effect.map(maskedScreenshotOf(request), capturedOf)

const treePartOf = (request: VisionEvidenceRequest): ContentPart => ({
  _tag: 'TextPart',
  text: `Current screen:\n${formatObservation(request.observation, request.ledger.redactCut)}`,
})

export const visionEvidenceOf = (
  request: VisionEvidenceRequest,
): Effect.Effect<VisionEvidence, VisionEvidenceFailure> =>
  Match.value(request.mode).pipe(
    Match.when(false, () =>
      Effect.succeed<VisionEvidence>({ parts: [treePartOf(request)], screenshot: Option.none(), refsOffered: true })),
    Match.when(true, () =>
      Effect.map(captured(request), ({ image, screenshot }): VisionEvidence => ({
        parts: [treePartOf(request), image],
        screenshot: Option.some(screenshot),
        refsOffered: true,
      }))),
    Match.when('only', () =>
      Effect.map(captured(request), ({ image, screenshot }): VisionEvidence => ({
        parts: [{ _tag: 'TextPart', text: IMAGE_ONLY_TEXT }, image],
        screenshot: Option.some(screenshot),
        refsOffered: false,
      }))),
    Match.exhaustive,
  )
