import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const ContainerApplicationOutcomeTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/cloudflare-emulator/ContainerApplicationOutcome',
)
type ContainerApplicationOutcomeTypeId = typeof ContainerApplicationOutcomeTypeId

export const ContainerSshKey = Schema.Struct({
  name: Schema.optional(Schema.String),
  public_key: Schema.String,
})
export type ContainerSshKey = typeof ContainerSshKey.Type

export const WranglerSsh = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  port: Schema.optional(Schema.Finite),
})
export type WranglerSsh = typeof WranglerSsh.Type

export const DurableObjectApplicationConfiguration = Schema.Struct({
  authorized_keys: Schema.optional(Schema.Array(ContainerSshKey)),
  wrangler_ssh: Schema.optional(WranglerSsh),
})
export type DurableObjectApplicationConfiguration = typeof DurableObjectApplicationConfiguration.Type

export const ApplicationObservability = Schema.Struct({
  logs: Schema.optional(Schema.Struct({ enabled: Schema.optional(Schema.Boolean) })),
})
export type ApplicationObservability = typeof ApplicationObservability.Type

export const InstanceType = Schema.Literals([
  'lite',
  'basic',
  'standard-1',
  'standard-2',
  'standard-3',
  'standard-4',
])
export type InstanceType = typeof InstanceType.Type

export const EnvironmentVariable = Schema.Struct({
  name: Schema.String,
  value: Schema.String,
})
export type EnvironmentVariable = typeof EnvironmentVariable.Type

export const ApplicationConfiguration = Schema.Struct({
  authorized_keys: Schema.optional(Schema.Array(ContainerSshKey)),
  command: Schema.optional(Schema.Array(Schema.String)),
  entrypoint: Schema.optional(Schema.Array(Schema.String)),
  environment_variables: Schema.optional(Schema.Array(EnvironmentVariable)),
  image: Schema.optional(Schema.String),
  instance_type: Schema.optional(InstanceType),
  wrangler_ssh: Schema.optional(WranglerSsh),
})
export type ApplicationConfiguration = typeof ApplicationConfiguration.Type

export const DurableObjectsNamespaceId = Schema.Struct({ namespace_id: Schema.String })
export type DurableObjectsNamespaceId = typeof DurableObjectsNamespaceId.Type

export const DurableObjectsRequest = Schema.Struct({
  class_name: Schema.optional(Schema.String),
  namespace_id: Schema.optional(Schema.String),
  script_name: Schema.optional(Schema.String),
})
export type DurableObjectsRequest = typeof DurableObjectsRequest.Type

export const ContainerApplication = Schema.Struct({
  account_id: Schema.String,
  configuration: Schema.optional(ApplicationConfiguration),
  constraints: Schema.optional(Schema.Json),
  created_at: Schema.String,
  durable_objects: Schema.optional(DurableObjectsNamespaceId),
  id: Schema.String,
  instances: Schema.optional(Schema.Finite),
  max_instances: Schema.optional(Schema.Finite),
  name: Schema.String,
  observability: Schema.optional(ApplicationObservability),
  rollout_active_grace_period: Schema.optional(Schema.Finite),
  scheduling_policy: Schema.Literals(['default', 'durable_object']),
  updated_at: Schema.String,
  version: Schema.optional(Schema.Finite),
})
export type ContainerApplication = typeof ContainerApplication.Type

export const ContainerInstanceStatus = Schema.Struct({
  exit_code: Schema.optional(Schema.Finite),
  state: Schema.Literals([
    'provisioning',
    'running',
    'failed',
    'stopping',
    'stopped',
    'unhealthy',
    'inactive',
    'unknown',
  ]),
  updated_at: Schema.String,
})
export type ContainerInstanceStatus = typeof ContainerInstanceStatus.Type

export const ContainerInstance = Schema.Struct({
  application_id: Schema.String,
  id: Schema.String,
  image: Schema.String,
  name: Schema.optional(Schema.String),
  status: ContainerInstanceStatus,
})
export type ContainerInstance = typeof ContainerInstance.Type

export const ContainerApplicationState = Schema.Struct({
  applications: Schema.Array(ContainerApplication),
  instances: Schema.Array(ContainerInstance),
})
export type ContainerApplicationState = typeof ContainerApplicationState.Type

export const emptyContainerApplicationState: ContainerApplicationState = { applications: [], instances: [] }

export class ListContainerApplications extends Schema.TaggedClass<ListContainerApplications>()(
  'ListContainerApplications',
  {
    image: Schema.optional(Schema.String),
    name: Schema.optional(Schema.String),
    page_token: Schema.optional(Schema.String),
    per_page: Schema.optional(Schema.Finite),
  },
) {}

export class CreateContainerApplication extends Schema.TaggedClass<CreateContainerApplication>()(
  'CreateContainerApplication',
  {
    account_id: Schema.String,
    configuration: Schema.optional(ApplicationConfiguration),
    constraints: Schema.optional(Schema.Json),
    durable_objects: Schema.optional(DurableObjectsRequest),
    instances: Schema.optional(Schema.Finite),
    max_instances: Schema.optional(Schema.Finite),
    name: Schema.String,
    observability: Schema.optional(ApplicationObservability),
    rollout_active_grace_period: Schema.optional(Schema.Finite),
    scheduling_policy: Schema.Literals(['default', 'durable_object']),
  },
) {}

export class GetContainerApplication extends Schema.TaggedClass<GetContainerApplication>()('GetContainerApplication', {
  application_id: Schema.String,
}) {}

export class DeleteContainerApplication extends Schema.TaggedClass<DeleteContainerApplication>()(
  'DeleteContainerApplication',
  {
    application_id: Schema.String,
  },
) {}

export class ModifyContainerApplication extends Schema.TaggedClass<ModifyContainerApplication>()(
  'ModifyContainerApplication',
  {
    application_id: Schema.String,
    configuration: Schema.optional(DurableObjectApplicationConfiguration),
    constraints: Schema.optional(Schema.Json),
    max_instances: Schema.optional(Schema.Finite),
    observability: Schema.optional(ApplicationObservability),
    rollout_active_grace_period: Schema.optional(Schema.Finite),
  },
) {}

export class ListApplicationInstances extends Schema.TaggedClass<ListApplicationInstances>()(
  'ListApplicationInstances',
  {
    application_id: Schema.String,
    name_prefix: Schema.optional(Schema.String),
    page_token: Schema.optional(Schema.String),
    per_page: Schema.optional(Schema.Finite),
    state: Schema.optional(Schema.Literals(['active', 'not-active'])),
  },
) {}

export class GetApplicationInstance extends Schema.TaggedClass<GetApplicationInstance>()('GetApplicationInstance', {
  application_id: Schema.String,
  instance_id: Schema.String,
}) {}

export const ContainerApplicationRequest = Schema.Union([
  ListContainerApplications,
  CreateContainerApplication,
  GetContainerApplication,
  DeleteContainerApplication,
  ModifyContainerApplication,
  ListApplicationInstances,
  GetApplicationInstance,
])
export type ContainerApplicationRequest = typeof ContainerApplicationRequest.Type

export class ContainerApplicationApplied extends Schema.TaggedClass<ContainerApplicationApplied>()(
  'ContainerApplicationApplied',
  {
    state: ContainerApplicationState,
    status: Schema.Finite,
    body: Schema.Json,
  },
) {
  readonly [ContainerApplicationOutcomeTypeId] = ContainerApplicationOutcomeTypeId
}

export class ContainerApplicationRefused extends Schema.TaggedClass<ContainerApplicationRefused>()(
  'ContainerApplicationRefused',
  {
    state: ContainerApplicationState,
    status: Schema.Finite,
    body: Schema.Json,
  },
) {
  readonly [ContainerApplicationOutcomeTypeId] = ContainerApplicationOutcomeTypeId
}

export const ContainerApplicationOutcome = Schema.Union([ContainerApplicationApplied, ContainerApplicationRefused])
export type ContainerApplicationOutcome = typeof ContainerApplicationOutcome.Type

export class ContainerApplicationCommand extends Schema.TaggedClass<ContainerApplicationCommand>()(
  'ContainerApplicationCommand',
  {
    now: Schema.String,
    newId: Schema.String,
    state: ContainerApplicationState,
    request: ContainerApplicationRequest,
  },
) {
  static readonly [Workflow.InstrumentationBrand] = {}
}
