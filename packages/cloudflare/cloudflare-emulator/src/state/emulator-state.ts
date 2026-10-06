import { type BasinState, emptyBasinState } from './basin.schema.js'
import { type ContainerApplicationState, emptyContainerApplicationState } from './container-application.schema.js'
import { type ContainerImageState, emptyContainerImageState } from './container-image.schema.js'
import type { EntitlementSeed } from './entitlement.schema.js'
import type { OperationFault } from './faults.schema.js'
import { emptyIssuesAutomationState, type IssuesAutomationState } from './issues-automation.schema.js'
import type { K2StreamState } from './k2-stream.schema.js'
import type { KvNamespaceState } from './kv-namespace.schema.js'
import { emptyMonetizationState, type MonetizationState } from './monetization.schema.js'
import { emptyNotificationPolicyState, type NotificationPolicyState } from './notification-policy.schema.js'
import { emptyNotificationWebhookState, type NotificationWebhookState } from './notification-webhook.schema.js'
import {
  emptyObservabilityDestinationState,
  type ObservabilityDestinationState,
} from './observability-destination.schema.js'
import type { PipelinesSinkState } from './pipelines-sink.schema.js'
import type { R2BucketState } from './r2-bucket.schema.js'
import { emptySpectrumAppState, type SpectrumAppState } from './spectrum-app.schema.js'
import { emptyTelemetryState, type TelemetryState } from './telemetry.schema.js'
import { emptyUrlScanState, type UrlScanState } from './url-scan.schema.js'
import { emptyWorkerScriptState, type WorkerScriptState } from './worker-script.schema.js'
import { emptyZoneTracingState, type ZoneTracingState } from './zone-tracing.schema.js'

export interface WriteCount {
  readonly operation: string
  readonly count: number
}

export interface EmulatorState {
  readonly sequence: number
  readonly k2Streams: K2StreamState
  readonly pipelinesSinks: PipelinesSinkState
  readonly r2Buckets: R2BucketState
  readonly kvNamespaces: KvNamespaceState
  readonly basinCatalogs: BasinState
  readonly urlScans: UrlScanState
  readonly monetization: MonetizationState
  readonly issuesAutomations: IssuesAutomationState
  readonly notificationWebhooks: NotificationWebhookState
  readonly notificationPolicies: NotificationPolicyState
  readonly spectrumApps: SpectrumAppState
  readonly zoneTracing: ZoneTracingState
  readonly observabilityDestinations: ObservabilityDestinationState
  readonly telemetry: TelemetryState
  readonly containerApplications: ContainerApplicationState
  readonly containerImages: ContainerImageState
  readonly workerScripts: WorkerScriptState
  readonly faults: ReadonlyArray<OperationFault>
  readonly entitlements: ReadonlyArray<EntitlementSeed>
  readonly writes: ReadonlyArray<WriteCount>
}

export const emptyState: EmulatorState = {
  sequence: 0,
  k2Streams: [],
  pipelinesSinks: [],
  r2Buckets: [],
  kvNamespaces: [],
  basinCatalogs: emptyBasinState,
  urlScans: emptyUrlScanState,
  monetization: emptyMonetizationState,
  issuesAutomations: emptyIssuesAutomationState,
  notificationWebhooks: emptyNotificationWebhookState,
  notificationPolicies: emptyNotificationPolicyState,
  spectrumApps: emptySpectrumAppState,
  zoneTracing: emptyZoneTracingState,
  observabilityDestinations: emptyObservabilityDestinationState,
  telemetry: emptyTelemetryState,
  containerApplications: emptyContainerApplicationState,
  containerImages: emptyContainerImageState,
  workerScripts: emptyWorkerScriptState,
  faults: [],
  entitlements: [],
  writes: [],
}
