import { apiTokenCredentials, Credentials } from '@distilled.cloud/cloudflare'
import { NodeServices } from '@effect/platform-node'
import { client as cloudflare } from '@systemfsoftware/alchemy-cloudflare'
import type {
  IssuesAutomationsCreateRequestJson as CreateAutomationPayload,
  IssuesAutomationsUpdateRequestJson as UpdateAutomationPayload,
  NotificationPoliciesCreateANotificationPolicyRequestJson as CreatePolicyPayload,
} from '@systemfsoftware/alchemy-cloudflare/api'
import { Emulator, layer as emulatorLayer } from '@systemfsoftware/cloudflare-emulator'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { observed } from './__fixtures__/observed-refusal.fixture.js'

const Feature = makeFeature({ it })

const ACCOUNT = '0123456789abcdef0123456789abcdef'
const params = { account_id: ACCOUNT }
const MISSING_POLICY = 'ffffffffffffffffffffffffffffffff'
const MISSING_AUTOMATION = 'ffffffffffffffffffffffffffffffff'

const issues = Effect.map(cloudflare.CloudflareClient, (api) => api['Issues'])
const policies = Effect.map(cloudflare.CloudflareClient, (api) => api['Notification policies'])

const createPolicy = (payload: CreatePolicyPayload) =>
  Effect.flatMap(policies, (p) => p.notificationPoliciesCreateANotificationPolicy({ params, payload }))

const createAutomation = (payload: CreateAutomationPayload) =>
  Effect.flatMap(issues, (i) => i.issuesAutomationsCreate({ params, payload }))

const listAutomations = (query: { readonly service?: string }) =>
  Effect.flatMap(issues, (i) => i.issuesAutomationsList({ params, query }))

const getAutomation = (automationId: string) =>
  Effect.flatMap(issues, (i) => i.issuesAutomationsGet({ params: { account_id: ACCOUNT, automationId } }))

const updateAutomation = (automationId: string, payload: UpdateAutomationPayload) =>
  Effect.flatMap(
    issues,
    (i) => i.issuesAutomationsUpdate({ params: { account_id: ACCOUNT, automationId }, payload }),
  )

const deleteAutomation = (automationId: string) =>
  Effect.flatMap(issues, (i) => i.issuesAutomationsDelete({ params: { account_id: ACCOUNT, automationId } }))

// https://developers.cloudflare.com/api/operations/notification-policies-create-a-notification-policy
const billingPolicy: CreatePolicyPayload = {
  alert_type: 'billing_usage_alert',
  enabled: true,
  mechanisms: { email: [{ id: 'ops@example.com' }] },
  name: 'billing-policy',
}

const emulatorCredentials = Layer.effect(
  Credentials,
  Effect.map(
    Emulator,
    (emulator) => Effect.succeed(apiTokenCredentials({ apiToken: 'emulator', apiBaseUrl: emulator.baseUrl })),
  ),
)

const clientOnEmulator = Layer.mergeAll(
  cloudflare.CloudflareClientLive.pipe(Layer.provide(FetchHttpClient.layer)),
  emulatorCredentials,
).pipe(Layer.provideMerge(emulatorLayer), Layer.provideMerge(NodeServices.layer), Layer.orDie)

Feature('Issues automations against the Cloudflare emulator')
  .live('drives the emulator over a real loopback HTTP socket with the generated client')
  .withScenarioLayer(clientOnEmulator)
  .body(({ scenario }) => {
    scenario(
      'An automation is created, listed, filtered by service, read, updated and deleted',
      Gherkin.Do.pipe(
        Given('an account with no policies or automations')('account', () => Effect.succeed(ACCOUNT)),
        When('a notification policy is created')('policy', () => createPolicy(billingPolicy)),
        When('an occurrence-threshold automation for the api service is created')(
          'created',
          (s) =>
            createAutomation({
              afterOccurrences: 5,
              enabled: false,
              name: 'threshold-automation',
              policyId: s.policy.result?.id ?? MISSING_POLICY,
              service: 'api',
            }),
        ),
        Then('the created automation carries its derived trigger, scope and defaults')((s, expect) =>
          expect({
            ansPolicyId: s.created.result.automation.ansPolicyId,
            createdByUserId: s.created.result.automation.createdByUserId,
            enabled: s.created.result.automation.enabled,
            inactivitySeconds: s.created.result.automation.inactivitySeconds,
            name: s.created.result.automation.name,
            revision: s.created.result.automation.revision,
            scope: s.created.result.automation.scope,
            service: s.created.result.automation.service,
            serviceType: s.created.result.automation.serviceType,
            threshold: s.created.result.automation.threshold,
            triggerType: s.created.result.automation.triggerType,
            updatedByUserId: s.created.result.automation.updatedByUserId,
          }).toEqual({
            ansPolicyId: s.policy.result?.id,
            createdByUserId: null,
            enabled: false,
            inactivitySeconds: null,
            name: 'threshold-automation',
            revision: 1,
            scope: 'service',
            service: 'api',
            serviceType: null,
            threshold: 5,
            triggerType: 'occurrence_threshold',
            updatedByUserId: null,
          })
        ),
        When('the automation is read by its id')(
          'read',
          (s) => getAutomation(s.created.result.automation.id),
        ),
        Then('the read repeats the created automation')((s, expect) =>
          expect({
            ansPolicyId: s.read.result.automation.ansPolicyId,
            id: s.read.result.automation.id,
            name: s.read.result.automation.name,
            revision: s.read.result.automation.revision,
            triggerType: s.read.result.automation.triggerType,
          }).toEqual({
            ansPolicyId: s.policy.result?.id,
            id: s.created.result.automation.id,
            name: 'threshold-automation',
            revision: 1,
            triggerType: 'occurrence_threshold',
          })
        ),
        When('every automation is listed')('listed', () => listAutomations({})),
        Then('the unfiltered listing carries the created automation')((s, expect) =>
          expect({
            count: s.listed.result.automations.length,
            names: s.listed.result.automations.map((automation) => automation.name),
          }).toEqual({ count: 1, names: ['threshold-automation'] })
        ),
        When('automations are listed for the api service')('filtered', () => listAutomations({ service: 'api' })),
        Then('the matching service filter keeps the automation')((s, expect) =>
          expect(s.filtered.result.automations.map((automation) => automation.service)).toEqual(['api'])
        ),
        When('automations are listed for an unrelated service')(
          'unrelated',
          () => listAutomations({ service: 'edge' }),
        ),
        Then('the non-matching service filter drops the automation')((s, expect) =>
          expect(s.unrelated.result.automations).toEqual([])
        ),
        When('the automation is replaced by an inactivity-triggered definition')(
          'updated',
          (s) =>
            updateAutomation(s.created.result.automation.id, {
              afterInactivitySeconds: 3600,
              name: 'inactivity-automation',
              policyId: s.policy.result?.id ?? MISSING_POLICY,
            }),
        ),
        When('the updated automation is read back')(
          'updatedRead',
          (s) => getAutomation(s.created.result.automation.id),
        ),
        Then('the update bumps the revision and switches the trigger and scope')((s, expect) =>
          expect({
            enabled: s.updatedRead.result.automation.enabled,
            inactivitySeconds: s.updatedRead.result.automation.inactivitySeconds,
            name: s.updatedRead.result.automation.name,
            revision: s.updatedRead.result.automation.revision,
            scope: s.updatedRead.result.automation.scope,
            service: s.updatedRead.result.automation.service,
            threshold: s.updatedRead.result.automation.threshold,
            triggerType: s.updatedRead.result.automation.triggerType,
          }).toEqual({
            enabled: true,
            inactivitySeconds: 3600,
            name: 'inactivity-automation',
            revision: 2,
            scope: 'account',
            service: null,
            threshold: null,
            triggerType: 'recurrence_after_inactivity',
          })
        ),
        When('the automation is deleted')('deleted', (s) => deleteAutomation(s.created.result.automation.id)),
        Then('the delete answers the removed automation')((s, expect) =>
          expect({
            ansPolicyId: s.deleted.result.automation.ansPolicyId,
            id: s.deleted.result.automation.id,
          }).toEqual({ ansPolicyId: s.policy.result?.id, id: s.created.result.automation.id })
        ),
        When('the same automation is deleted again')(
          'reDeleted',
          (s) => observed(deleteAutomation(s.created.result.automation.id)),
        ),
        Then('the second delete is refused as not found')((s, expect) =>
          expect(s.reDeleted).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'Not found',
            retryAfter: null,
          })
        ),
      ),
    )

    scenario(
      'An unnamed automation takes a generated name and missing policies or automations are not found',
      Gherkin.Do.pipe(
        Given('an account with no policies or automations')('account', () => Effect.succeed(ACCOUNT)),
        When('a notification policy is created')('policy', () => createPolicy(billingPolicy)),
        When('an automation for that policy is created with no name')(
          'created',
          (s) => createAutomation({ policyId: s.policy.result?.id ?? MISSING_POLICY }),
        ),
        Then('the automation takes the generated name and the account scope defaults')((s, expect) =>
          expect({
            enabled: s.created.result.automation.enabled,
            inactivitySeconds: s.created.result.automation.inactivitySeconds,
            name: s.created.result.automation.name,
            revision: s.created.result.automation.revision,
            scope: s.created.result.automation.scope,
            service: s.created.result.automation.service,
            threshold: s.created.result.automation.threshold,
            triggerType: s.created.result.automation.triggerType,
          }).toEqual({
            enabled: true,
            inactivitySeconds: null,
            name: `automation-${s.created.result.automation.id}`,
            revision: 1,
            scope: 'account',
            service: null,
            threshold: null,
            triggerType: 'occurrence_threshold',
          })
        ),
        When('an automation is created for a policy that does not exist')(
          'badCreate',
          () => observed(createAutomation({ policyId: MISSING_POLICY })),
        ),
        Then('the create is refused as not found')((s, expect) =>
          expect(s.badCreate).toEqual({ code: 10006, kind: 'NotFound', message: 'Not found', retryAfter: null })
        ),
        When('an automation that was never created is read')(
          'missingGet',
          () => observed(getAutomation(MISSING_AUTOMATION)),
        ),
        Then('the read is refused as not found')((s, expect) =>
          expect(s.missingGet).toEqual({ code: 10006, kind: 'NotFound', message: 'Not found', retryAfter: null })
        ),
        When('an automation that was never created is updated')(
          'missingUpdate',
          (s) => observed(updateAutomation(MISSING_AUTOMATION, { policyId: s.policy.result?.id ?? MISSING_POLICY })),
        ),
        Then('the update is refused as not found')((s, expect) =>
          expect(s.missingUpdate).toEqual({ code: 10006, kind: 'NotFound', message: 'Not found', retryAfter: null })
        ),
        When('the existing automation is updated to point at a missing policy')(
          'badUpdate',
          (s) => observed(updateAutomation(s.created.result.automation.id, { policyId: MISSING_POLICY })),
        ),
        Then('the update is refused as not found for the missing policy')((s, expect) =>
          expect(s.badUpdate).toEqual({ code: 10006, kind: 'NotFound', message: 'Not found', retryAfter: null })
        ),
        When('an automation that was never created is deleted')(
          'missingDelete',
          () => observed(deleteAutomation(MISSING_AUTOMATION)),
        ),
        Then('the delete is refused as not found')((s, expect) =>
          expect(s.missingDelete).toEqual({ code: 10006, kind: 'NotFound', message: 'Not found', retryAfter: null })
        ),
      ),
    )

    scenario(
      'An account without Issues is refused until the product is granted',
      Gherkin.Do.pipe(
        Given('an account whose Issues entitlement is not granted')(
          'account',
          () =>
            Effect.flatMap(
              Emulator,
              (emulator) => emulator.admin.seedEntitlement({ product: 'issues', entitled: false }),
            )
              .pipe(Effect.as(ACCOUNT)),
        ),
        When('the automations are listed')('refused', () => observed(listAutomations({}))),
        Then('the listing is refused with the Issues entitlement message')((s, expect) =>
          expect(s.refused).toEqual({
            code: 1000,
            kind: 'Validation',
            message: 'Issues is not available for this account.',
            retryAfter: null,
          })
        ),
        When('Issues is granted and the automations are listed again')(
          'granted',
          () =>
            Effect.flatMap(
              Emulator,
              (emulator) => emulator.admin.seedEntitlement({ product: 'issues', entitled: true }),
            )
              .pipe(Effect.andThen(observed(listAutomations({})))),
        ),
        Then('the listing is answered')((s, expect) =>
          expect(s.granted).toEqual({ kind: 'Ok', code: 0, message: '', retryAfter: null })
        ),
      ),
    )
  })
