import { Sandbox } from '@systemfsoftware/effect-contract'

export { AdmitHost, admitHost, AdmitVerdict, Allow, Deny } from './admit-host.workflow.js'
export {
  EGRESS_DENIED_HEADER,
  type EgressGatewayCtx,
  type EgressGatewayEnv,
  egressGatewayFetch,
  type EgressGatewayRequest,
  type Fetcher,
} from './egress-gateway.js'
export {
  type DurableObjectIdLike,
  type DurableObjectNamespaceLike,
  type DurableObjectStubLike,
  layer,
  type PrincipalEncoded,
  SandboxHostFailed,
  type SandboxHostOptions,
  type WorkerCodeLike,
  type WorkerLoaderLike,
  type WorkerStubLike,
} from './host.js'
export { FacetPrepare, ProgramOutcome, ToolCall } from './lifetime.schema.js'
export {
  programModule,
  type ProgramModuleOptions,
  programSupervisorAlarm,
  programSupervisorFacet,
  programSupervisorPrepare,
  type SupervisorAlarmInput,
  type SupervisorCtx,
  type SupervisorEnv,
  type SupervisorFacetInput,
  type SupervisorPrepareInput,
} from './program-supervisor.js'
export {
  type ToolDispatcherCtx,
  type ToolDispatcherHandler,
  toolDispatcherOf,
  type ToolDispatcherOptions,
} from './tool-dispatcher.js'

export const ProgramId = Sandbox.ProgramId
export const Lifetime = Sandbox.Lifetime
export const Request = Sandbox.Request
export const Session = Sandbox.Session
export const SandboxInput = Sandbox.SandboxInput
export const SandboxEgressDenied = Sandbox.SandboxEgressDenied
export const SandboxThrew = Sandbox.SandboxThrew
export const SandboxTimeout = Sandbox.SandboxTimeout
export type ProgramId = Sandbox.ProgramId
export type Lifetime = Sandbox.Lifetime
export type Request = Sandbox.Request
export type Session = Sandbox.Session
export type SandboxInput = Sandbox.SandboxInput
export type SandboxEgressDenied = Sandbox.SandboxEgressDenied
export type SandboxThrew = Sandbox.SandboxThrew
export type SandboxTimeout = Sandbox.SandboxTimeout
