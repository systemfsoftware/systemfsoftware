import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { failureEnvelope, listEnvelope, presentField, successEnvelope } from '../cloudflare-envelope.schema.js'
import {
  ContainerApplication,
  ContainerApplicationApplied,
  ContainerApplicationCommand,
  ContainerApplicationOutcome,
  ContainerApplicationRefused,
  ContainerApplicationState,
  ContainerInstance,
  CreateContainerApplication,
  DeleteContainerApplication,
  DurableObjectsNamespaceId,
  GetApplicationInstance,
  GetContainerApplication,
  ListApplicationInstances,
  ListContainerApplications,
  ModifyContainerApplication,
} from './container-application.schema.js'
import type { ApplicationConfiguration, DurableObjectApplicationConfiguration } from './container-application.schema.js'

const orElse = <A>(first: A | undefined, second: A | undefined): A | undefined =>
  Option.getOrUndefined(Option.orElse(Option.fromUndefinedOr(first), () => Option.fromUndefinedOr(second)))

const configField = <A>(
  configuration: ApplicationConfiguration | undefined,
  select: (config: ApplicationConfiguration) => A | undefined,
): A | undefined =>
  Option.getOrUndefined(
    Option.flatMap(Option.fromUndefinedOr(configuration), (config) => Option.fromUndefinedOr(select(config))),
  )

const activeInstanceStates: ReadonlyArray<ContainerInstance['status']['state']> = [
  'provisioning',
  'running',
  'stopping',
]

const notFoundApplication = (state: ContainerApplicationState): ContainerApplicationRefused =>
  ContainerApplicationRefused.make({
    state,
    status: 404,
    body: failureEnvelope({ code: 10006, message: 'Application not found.' }),
  })

const notFoundInstance = (state: ContainerApplicationState): ContainerApplicationRefused =>
  ContainerApplicationRefused.make({
    state,
    status: 404,
    body: failureEnvelope({ code: 10006, message: 'Container instance not found.' }),
  })

const applicationImage = (application: ContainerApplication): Option.Option<string> =>
  Option.flatMap(
    Option.fromUndefinedOr(application.configuration),
    (configuration) => Option.fromUndefinedOr(configuration.image),
  )

const matchesName = (name: string | undefined) => (application: ContainerApplication): boolean =>
  Option.match(Option.fromUndefinedOr(name), {
    onNone: () => true,
    onSome: (wanted) => application.name === wanted,
  })

const matchesImage = (image: string | undefined) => (application: ContainerApplication): boolean =>
  Option.match(Option.fromUndefinedOr(image), {
    onNone: () => true,
    onSome: (wanted) =>
      Option.match(applicationImage(application), {
        onNone: () => false,
        onSome: (found) => found === wanted,
      }),
  })

const listApplications = (
  command: ContainerApplicationCommand,
  request: ListContainerApplications,
): ContainerApplicationOutcome => {
  const filtered = Array.filter(
    Array.filter(command.state.applications, matchesName(request.name)),
    matchesImage(request.image),
  )
  const perPage = Option.getOrElse(Option.fromUndefinedOr(request.per_page), () => filtered.length)
  return ContainerApplicationApplied.make({
    state: command.state,
    status: 200,
    body: listEnvelope({ result: filtered, info: { page: 1, per_page: perPage, total_count: filtered.length } }),
  })
}

const namespaceIdOf = (request: CreateContainerApplication, fallback: string): string =>
  Option.getOrElse(
    Option.flatMap(Option.fromUndefinedOr(request.durable_objects), (durableObjects) =>
      Option.fromUndefinedOr(durableObjects.namespace_id)),
    () =>
      fallback,
  )

const durableObjectConfiguration = (configuration: ApplicationConfiguration | undefined): ApplicationConfiguration =>
  Option.getOrElse(
    Option.map(Option.fromUndefinedOr(configuration), (config): ApplicationConfiguration => ({
      ...presentField(config.authorized_keys, 'authorized_keys'),
      ...presentField(config.wrangler_ssh, 'wrangler_ssh'),
    })),
    (): ApplicationConfiguration => ({}),
  )

const scheduledConfiguration = (configuration: ApplicationConfiguration | undefined): ApplicationConfiguration =>
  Option.getOrElse(
    Option.map(Option.fromUndefinedOr(configuration), (config): ApplicationConfiguration => ({
      ...presentField(config.authorized_keys, 'authorized_keys'),
      ...presentField(config.command, 'command'),
      ...presentField(config.entrypoint, 'entrypoint'),
      ...presentField(config.environment_variables, 'environment_variables'),
      ...presentField(config.instance_type, 'instance_type'),
      ...presentField(config.wrangler_ssh, 'wrangler_ssh'),
      image: Option.getOrElse(Option.fromUndefinedOr(config.image), () => ''),
    })),
    (): ApplicationConfiguration => ({ image: '' }),
  )

const durableObjectApplication = (
  command: ContainerApplicationCommand,
  request: CreateContainerApplication,
): ContainerApplication => ({
  account_id: request.account_id,
  configuration: durableObjectConfiguration(request.configuration),
  created_at: command.now,
  durable_objects: { namespace_id: namespaceIdOf(request, command.newId) },
  id: command.newId,
  name: request.name,
  scheduling_policy: 'durable_object',
  updated_at: command.now,
  ...presentField(request.observability, 'observability'),
})

const scheduledDurableObjects = (
  command: ContainerApplicationCommand,
  request: CreateContainerApplication,
): DurableObjectsNamespaceId | undefined =>
  Option.getOrUndefined(
    Option.map(Option.fromUndefinedOr(request.durable_objects), (): DurableObjectsNamespaceId => ({
      namespace_id: namespaceIdOf(request, command.newId),
    })),
  )

const scheduledApplication = (
  command: ContainerApplicationCommand,
  request: CreateContainerApplication,
): ContainerApplication => ({
  account_id: request.account_id,
  configuration: scheduledConfiguration(request.configuration),
  created_at: command.now,
  id: command.newId,
  instances: Option.getOrElse(Option.fromUndefinedOr(request.instances), () => 0),
  name: request.name,
  scheduling_policy: 'default',
  updated_at: command.now,
  version: 1,
  ...presentField(request.constraints, 'constraints'),
  ...presentField(scheduledDurableObjects(command, request), 'durable_objects'),
  ...presentField(request.max_instances, 'max_instances'),
  ...presentField(request.observability, 'observability'),
  ...presentField(request.rollout_active_grace_period, 'rollout_active_grace_period'),
})

/**
 * A Durable Object actor ID for the instance a scheduler places at `index`.
 * slice.json cc_ContainerInstanceID fixes the shape at 64 lowercase hex.
 */
const instanceIdOf = (applicationId: string, index: number): string =>
  `${applicationId}${index.toString(16).padStart(32, '0')}`

/**
 * The instances the Containers scheduler maintains for a scheduler-backed
 * application. slice.json createApplication: "The Containers scheduler
 * maintains the requested instance count"; `instances` is "The initial number
 * of deployments to create". The emulator does not run the scheduler, so it
 * materializes one running instance per requested deployment.
 */
const scheduledInstances = (application: ContainerApplication, now: string): ReadonlyArray<ContainerInstance> =>
  Array.makeBy(
    Option.getOrElse(Option.fromUndefinedOr(application.instances), () => 0),
    (index): ContainerInstance => ({
      application_id: application.id,
      id: instanceIdOf(application.id, index),
      image: Option.getOrElse(applicationImage(application), () => ''),
      status: { state: 'running', updated_at: now },
    }),
  )

const createApplication = (
  command: ContainerApplicationCommand,
  request: CreateContainerApplication,
): ContainerApplicationOutcome => {
  const application = Match.value(request.scheduling_policy).pipe(
    Match.when('durable_object', () => durableObjectApplication(command, request)),
    Match.when('default', () => scheduledApplication(command, request)),
    Match.exhaustive,
  )
  const instances: ReadonlyArray<ContainerInstance> = Match.value(application.scheduling_policy).pipe(
    Match.when('default', () => scheduledInstances(application, command.now)),
    Match.when('durable_object', (): ReadonlyArray<ContainerInstance> => []),
    Match.exhaustive,
  )
  return ContainerApplicationApplied.make({
    state: {
      ...command.state,
      applications: Array.append(command.state.applications, application),
      instances: Array.appendAll(command.state.instances, instances),
    },
    status: 201,
    body: successEnvelope(application),
  })
}

const findApplication = (state: ContainerApplicationState, id: string): Option.Option<ContainerApplication> =>
  Array.findFirst(state.applications, (application) => application.id === id)

const getApplication = (
  command: ContainerApplicationCommand,
  request: GetContainerApplication,
): ContainerApplicationOutcome =>
  Option.match(findApplication(command.state, request.application_id), {
    onNone: () => notFoundApplication(command.state),
    onSome: (application) =>
      ContainerApplicationApplied.make({ state: command.state, status: 200, body: successEnvelope(application) }),
  })

const replaceApplication = (
  applications: ReadonlyArray<ContainerApplication>,
  updated: ContainerApplication,
): ReadonlyArray<ContainerApplication> =>
  Array.map(applications, (candidate) =>
    Match.value(candidate.id === updated.id).pipe(
      Match.when(true, () => updated),
      Match.when(false, () => candidate),
      Match.exhaustive,
    ))

const deleteApplication = (
  command: ContainerApplicationCommand,
  request: DeleteContainerApplication,
): ContainerApplicationOutcome =>
  Option.match(findApplication(command.state, request.application_id), {
    onNone: () => notFoundApplication(command.state),
    onSome: (application) =>
      ContainerApplicationApplied.make({
        state: {
          applications: Array.filter(command.state.applications, (candidate) => candidate.id !== application.id),
          instances: Array.filter(command.state.instances, (instance) => instance.application_id !== application.id),
        },
        status: 200,
        body: successEnvelope({ message: `Application ${application.id} deleted.` }),
      }),
  })

const patchConfiguration = (
  existing: ApplicationConfiguration | undefined,
  patch: DurableObjectApplicationConfiguration | undefined,
): ApplicationConfiguration | undefined =>
  Option.match(Option.fromUndefinedOr(patch), {
    onNone: () => existing,
    onSome: (value): ApplicationConfiguration => ({
      ...Option.getOrElse(Option.fromUndefinedOr(existing), (): ApplicationConfiguration => ({})),
      ...presentField(
        orElse(value.authorized_keys, configField(existing, (config) => config.authorized_keys)),
        'authorized_keys',
      ),
      ...presentField(
        orElse(value.wrangler_ssh, configField(existing, (config) => config.wrangler_ssh)),
        'wrangler_ssh',
      ),
    }),
  })

const patchDurableObjectApplication = (
  command: ContainerApplicationCommand,
  request: ModifyContainerApplication,
  application: ContainerApplication,
): ContainerApplication => ({
  ...application,
  ...presentField(patchConfiguration(application.configuration, request.configuration), 'configuration'),
  ...presentField(orElse(request.observability, application.observability), 'observability'),
  updated_at: command.now,
})

const patchScheduledApplication = (
  command: ContainerApplicationCommand,
  request: ModifyContainerApplication,
  application: ContainerApplication,
): ContainerApplication => ({
  ...application,
  ...presentField(patchConfiguration(application.configuration, request.configuration), 'configuration'),
  ...presentField(orElse(request.constraints, application.constraints), 'constraints'),
  ...presentField(orElse(request.max_instances, application.max_instances), 'max_instances'),
  ...presentField(orElse(request.observability, application.observability), 'observability'),
  ...presentField(
    orElse(request.rollout_active_grace_period, application.rollout_active_grace_period),
    'rollout_active_grace_period',
  ),
  updated_at: command.now,
})

const patchApplication = (
  command: ContainerApplicationCommand,
  request: ModifyContainerApplication,
  application: ContainerApplication,
): ContainerApplication =>
  Match.value(application.scheduling_policy === 'durable_object').pipe(
    Match.when(true, () => patchDurableObjectApplication(command, request, application)),
    Match.when(false, () => patchScheduledApplication(command, request, application)),
    Match.exhaustive,
  )

const modifyApplication = (
  command: ContainerApplicationCommand,
  request: ModifyContainerApplication,
): ContainerApplicationOutcome =>
  Option.match(findApplication(command.state, request.application_id), {
    onNone: () => notFoundApplication(command.state),
    onSome: (application) => {
      const updated = patchApplication(command, request, application)
      return ContainerApplicationApplied.make({
        state: { ...command.state, applications: replaceApplication(command.state.applications, updated) },
        status: 200,
        body: successEnvelope(updated),
      })
    },
  })

const matchesInstanceState = (state: ListApplicationInstances['state']) => (instance: ContainerInstance): boolean =>
  Option.match(Option.fromUndefinedOr(state), {
    onNone: () => true,
    onSome: (wanted) =>
      Match.value(wanted).pipe(
        Match.when('active', () => Array.contains(activeInstanceStates, instance.status.state)),
        Match.when('not-active', () =>
          Option.isNone(Array.findFirst(activeInstanceStates, (active) => active === instance.status.state))),
        Match.exhaustive,
      ),
  })

const matchesInstanceNamePrefix = (namePrefix: string | undefined) => (instance: ContainerInstance): boolean =>
  Option.match(Option.fromUndefinedOr(namePrefix), {
    onNone: () => true,
    onSome: (prefix) =>
      Option.match(Option.fromUndefinedOr(instance.name), {
        onNone: () => false,
        onSome: (name) => name.startsWith(prefix),
      }),
  })

const instancesBody = (instances: ReadonlyArray<ContainerInstance>, perPage: number) => ({
  success: true,
  errors: [],
  messages: [],
  result: { instances },
  result_info: { count: instances.length, page: 1, per_page: perPage, total_count: instances.length },
})

const listInstances = (
  command: ContainerApplicationCommand,
  request: ListApplicationInstances,
): ContainerApplicationOutcome =>
  Option.match(findApplication(command.state, request.application_id), {
    onNone: () => notFoundApplication(command.state),
    onSome: () => {
      const filtered = Array.filter(
        Array.filter(command.state.instances, (instance) => instance.application_id === request.application_id),
        (instance) =>
          Array.every(
            [matchesInstanceState(request.state), matchesInstanceNamePrefix(request.name_prefix)],
            (predicate) => predicate(instance),
          ),
      )
      const perPage = Option.getOrElse(Option.fromUndefinedOr(request.per_page), () => filtered.length)
      return ContainerApplicationApplied.make({
        state: command.state,
        status: 200,
        body: instancesBody(filtered, perPage),
      })
    },
  })

const matchesInstanceIdentity = (applicationId: string, instanceId: string) => (instance: ContainerInstance): boolean =>
  Array.every(
    [
      (candidate: ContainerInstance) => candidate.application_id === applicationId,
      (candidate: ContainerInstance) => candidate.id === instanceId,
    ],
    (predicate) => predicate(instance),
  )

const findInstance = (
  state: ContainerApplicationState,
  applicationId: string,
  instanceId: string,
): Option.Option<ContainerInstance> =>
  Array.findFirst(state.instances, matchesInstanceIdentity(applicationId, instanceId))

const getInstance = (
  command: ContainerApplicationCommand,
  request: GetApplicationInstance,
): ContainerApplicationOutcome =>
  Option.match(findInstance(command.state, request.application_id, request.instance_id), {
    onNone: () => notFoundInstance(command.state),
    onSome: (instance) =>
      ContainerApplicationApplied.make({ state: command.state, status: 200, body: successEnvelope(instance) }),
  })

const decide = (command: ContainerApplicationCommand): Result.Result<ContainerApplicationOutcome, never> =>
  Result.succeed(
    Match.value(command.request).pipe(
      Match.tag('ListContainerApplications', (request) => listApplications(command, request)),
      Match.tag('CreateContainerApplication', (request) => createApplication(command, request)),
      Match.tag('GetContainerApplication', (request) => getApplication(command, request)),
      Match.tag('DeleteContainerApplication', (request) => deleteApplication(command, request)),
      Match.tag('ModifyContainerApplication', (request) => modifyApplication(command, request)),
      Match.tag('ListApplicationInstances', (request) => listInstances(command, request)),
      Match.tag('GetApplicationInstance', (request) => getInstance(command, request)),
      Match.exhaustive,
    ),
  )

export const containerApplication = Workflow.make({
  command: ContainerApplicationCommand,
  decision: ContainerApplicationOutcome,
  error: Schema.Never,
  decide,
})
