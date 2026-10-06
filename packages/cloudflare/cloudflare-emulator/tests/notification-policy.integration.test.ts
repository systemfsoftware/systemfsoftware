import { apiTokenCredentials, Credentials } from '@distilled.cloud/cloudflare'
import { NodeServices } from '@effect/platform-node'
import { client as cloudflare } from '@systemfsoftware/alchemy-cloudflare'
import type {
  NotificationPoliciesCreateANotificationPolicyRequestJson as CreatePolicyPayload,
  NotificationPoliciesUpdateANotificationPolicyRequestJson as UpdatePolicyPayload,
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

const policies = Effect.map(cloudflare.CloudflareClient, (api) => api['Notification policies'])

const createPolicy = (payload: CreatePolicyPayload) =>
  Effect.flatMap(policies, (p) => p.notificationPoliciesCreateANotificationPolicy({ params, payload }))

const listPolicies = () => Effect.flatMap(policies, (p) => p.notificationPoliciesListNotificationPolicies({ params }))

const getPolicy = (policy_id: string) =>
  Effect.flatMap(
    policies,
    (p) => p.notificationPoliciesGetANotificationPolicy({ params: { account_id: ACCOUNT, policy_id } }),
  )

const updatePolicy = (policy_id: string, payload: UpdatePolicyPayload) =>
  Effect.flatMap(
    policies,
    (p) => p.notificationPoliciesUpdateANotificationPolicy({ params: { account_id: ACCOUNT, policy_id }, payload }),
  )

const deletePolicy = (policy_id: string) =>
  Effect.flatMap(
    policies,
    (p) => p.notificationPoliciesDeleteANotificationPolicy({ params: { account_id: ACCOUNT, policy_id } }),
  )

// https://developers.cloudflare.com/api/operations/notification-policies-create-a-notification-policy
// The body requires alert_type (from Cloudflare's enum), enabled, mechanisms, and name.
const billingPolicy: CreatePolicyPayload = {
  alert_interval: '1h',
  alert_type: 'billing_usage_alert',
  description: 'Billing spikes',
  enabled: true,
  filters: { actions: ['billing'] },
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

Feature('Notification policies against the Cloudflare emulator')
  .live('drives the emulator over a real loopback HTTP socket with the generated client')
  .withScenarioLayer(clientOnEmulator)
  .body(({ scenario }) => {
    scenario(
      'A policy is created, listed, read, patched, replaced and deleted',
      Gherkin.Do.pipe(
        Given('an account with no policies')('account', () => Effect.succeed(ACCOUNT)),
        When('a billing policy is created')('created', () => createPolicy(billingPolicy)),
        Then('the create answers a successful envelope with a new id')((s, expect) =>
          expect({ hasId: typeof s.created.result?.id === 'string', success: s.created.success }).toEqual({
            hasId: true,
            success: true,
          })
        ),
        When('every policy is listed')('listed', () => listPolicies()),
        Then('the listing carries the created policy projection')((s, expect) =>
          expect(
            s.listed.result?.map((policy) => ({
              alert_interval: policy.alert_interval,
              alert_type: policy.alert_type,
              description: policy.description,
              enabled: policy.enabled,
              filters: policy.filters,
              name: policy.name,
            })),
          ).toEqual([
            {
              alert_interval: '1h',
              alert_type: 'billing_usage_alert',
              description: 'Billing spikes',
              enabled: true,
              filters: { actions: ['billing'] },
              name: 'billing-policy',
            },
          ])
        ),
        When('the policy is read by its id')('read', (s) => getPolicy(s.created.result?.id ?? MISSING_POLICY)),
        Then('the read repeats the created policy')((s, expect) =>
          expect({
            id: s.read.result?.id,
            mechanisms: s.read.result?.mechanisms,
            name: s.read.result?.name,
          }).toEqual({
            id: s.created.result?.id,
            mechanisms: { email: [{ id: 'ops@example.com' }] },
            name: 'billing-policy',
          })
        ),
        When('the policy is patched with only a new name')(
          'paatched',
          (s) => updatePolicy(s.created.result?.id ?? MISSING_POLICY, { name: 'renamed' }),
        ),
        When('the patched policy is read back')(
          'patchRead',
          (s) => getPolicy(s.created.result?.id ?? MISSING_POLICY),
        ),
        Then('only the name changed and every other field is preserved')((s, expect) =>
          expect({
            alert_interval: s.patchRead.result?.alert_interval,
            alert_type: s.patchRead.result?.alert_type,
            description: s.patchRead.result?.description,
            enabled: s.patchRead.result?.enabled,
            filters: s.patchRead.result?.filters,
            id: s.patchRead.result?.id,
            mechanisms: s.patchRead.result?.mechanisms,
            name: s.patchRead.result?.name,
          }).toEqual({
            alert_interval: '1h',
            alert_type: 'billing_usage_alert',
            description: 'Billing spikes',
            enabled: true,
            filters: { actions: ['billing'] },
            id: s.created.result?.id,
            mechanisms: { email: [{ id: 'ops@example.com' }] },
            name: 'renamed',
          })
        ),
        When('the policy is replaced with every field supplied')(
          'replaced',
          (s) =>
            updatePolicy(s.created.result?.id ?? MISSING_POLICY, {
              alert_interval: '30m',
              alert_type: 'advanced_http_alert_error',
              description: 'HTTP errors',
              enabled: false,
              filters: { actions: ['http'] },
              mechanisms: { webhooks: [{ id: 'wh' }] },
              name: 'replaced',
            }),
        ),
        When('the replaced policy is read back')(
          'replaceRead',
          (s) => getPolicy(s.created.result?.id ?? MISSING_POLICY),
        ),
        Then('every replaced field is stored')((s, expect) =>
          expect({
            alert_interval: s.replaceRead.result?.alert_interval,
            alert_type: s.replaceRead.result?.alert_type,
            description: s.replaceRead.result?.description,
            enabled: s.replaceRead.result?.enabled,
            filters: s.replaceRead.result?.filters,
            id: s.replaceRead.result?.id,
            mechanisms: s.replaceRead.result?.mechanisms,
            name: s.replaceRead.result?.name,
          }).toEqual({
            alert_interval: '30m',
            alert_type: 'advanced_http_alert_error',
            description: 'HTTP errors',
            enabled: false,
            filters: { actions: ['http'] },
            id: s.created.result?.id,
            mechanisms: { webhooks: [{ id: 'wh' }] },
            name: 'replaced',
          })
        ),
        When('the policy is deleted')('deleted', (s) => deletePolicy(s.created.result?.id ?? MISSING_POLICY)),
        Then('the delete answers a successful envelope with an empty result')((s, expect) =>
          // The delete success schema (Aaa_api_response_collection) declares no `result`, only an
          // index signature, so the empty envelope result is read through the index signature.
          expect({ result: s.deleted['result'], success: s.deleted.success }).toEqual({ result: {}, success: true })
        ),
        When('the same policy is deleted again')(
          'reDeleted',
          (s) => observed(deletePolicy(s.created.result?.id ?? MISSING_POLICY)),
        ),
        Then('the second delete is refused as not found')((s, expect) =>
          expect(s.reDeleted).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'Policy not found.',
            retryAfter: null,
          })
        ),
      ),
    )

    scenario(
      'An account with no policies lists nothing and policies list in creation order',
      Gherkin.Do.pipe(
        Given('an account with no policies')('account', () => Effect.succeed(ACCOUNT)),
        When('every policy is listed')('empty', () => listPolicies()),
        Then('the listing is an empty success')((s, expect) =>
          expect({ result: s.empty.result, success: s.empty.success }).toEqual({ result: [], success: true })
        ),
        When('a policy named alpha is created')(
          'alpha',
          () => createPolicy({ ...billingPolicy, name: 'alpha' }),
        ),
        When('a policy named beta is created')('beta', () => createPolicy({ ...billingPolicy, name: 'beta' })),
        Then('both creates answer new ids')((s, expect) =>
          expect({
            alpha: typeof s.alpha.result?.id === 'string',
            beta: typeof s.beta.result?.id === 'string',
          }).toEqual({ alpha: true, beta: true })
        ),
        When('every policy is listed again')('listed', () => listPolicies()),
        Then('the listing carries both policies in creation order')((s, expect) =>
          expect({ names: s.listed.result?.map((policy) => policy.name), success: s.listed.success }).toEqual({
            names: ['alpha', 'beta'],
            success: true,
          })
        ),
      ),
    )

    scenario(
      'A policy without any mechanism is refused while missing policies are not found',
      Gherkin.Do.pipe(
        Given('an account with no policies')('account', () => Effect.succeed(ACCOUNT)),
        When('a policy with no mechanisms at all is created')(
          'empty',
          () => observed(createPolicy({ ...billingPolicy, mechanisms: {} })),
        ),
        Then('the empty mechanism set is refused as a validation failure')((s, expect) =>
          expect(s.empty).toEqual({
            code: 17102,
            kind: 'Validation',
            message: 'At least one mechanism is required.',
            retryAfter: null,
          })
        ),
        When('a policy whose email mechanism list is empty is created')(
          'emptyEmail',
          () => observed(createPolicy({ ...billingPolicy, mechanisms: { email: [] } })),
        ),
        Then('an empty mechanism list is also refused')((s, expect) =>
          expect(s.emptyEmail).toEqual({
            code: 17102,
            kind: 'Validation',
            message: 'At least one mechanism is required.',
            retryAfter: null,
          })
        ),
        When('a policy whose webhooks mechanism carries one id is created')(
          'webhooks',
          () => observed(createPolicy({ ...billingPolicy, mechanisms: { webhooks: [{ id: 'wh' }] } })),
        ),
        Then('a populated webhooks mechanism is accepted')((s, expect) =>
          expect(s.webhooks).toEqual({ kind: 'Ok', code: 0, message: '', retryAfter: null })
        ),
        When('a policy whose pagerduty mechanism carries one id is created')(
          'pagerduty',
          () => observed(createPolicy({ ...billingPolicy, mechanisms: { pagerduty: [{ id: 'pd' }] } })),
        ),
        Then('a populated pagerduty mechanism is accepted')((s, expect) =>
          expect(s.pagerduty).toEqual({ kind: 'Ok', code: 0, message: '', retryAfter: null })
        ),
        When('a minimal policy without an interval, description or filters is created')(
          'minimal',
          () =>
            createPolicy({
              alert_type: 'billing_usage_alert',
              enabled: true,
              mechanisms: { email: [{ id: 'ops@example.com' }] },
              name: 'minimal',
            }),
        ),
        When('the minimal policy is read back')(
          'minimalRead',
          (s) => getPolicy(s.minimal.result?.id ?? MISSING_POLICY),
        ),
        Then('the absent optional fields surface as empty strings and an empty filter object')((s, expect) =>
          expect({
            alert_interval: s.minimalRead.result?.alert_interval,
            description: s.minimalRead.result?.description,
            filters: s.minimalRead.result?.filters,
          }).toEqual({ alert_interval: '', description: '', filters: {} })
        ),
        When('a policy that was never created is read')('missingRead', () => observed(getPolicy(MISSING_POLICY))),
        Then('the read is refused as not found')((s, expect) =>
          expect(s.missingRead).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'Policy not found.',
            retryAfter: null,
          })
        ),
        When('a policy that was never created is updated')(
          'missingUpdate',
          () => observed(updatePolicy(MISSING_POLICY, { name: 'other' })),
        ),
        Then('the update is refused as not found')((s, expect) =>
          expect(s.missingUpdate).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'Policy not found.',
            retryAfter: null,
          })
        ),
        When('a policy that was never created is deleted')(
          'missingDelete',
          () => observed(deletePolicy(MISSING_POLICY)),
        ),
        Then('the delete is refused as not found')((s, expect) =>
          expect(s.missingDelete).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: 'Policy not found.',
            retryAfter: null,
          })
        ),
      ),
    )

    scenario(
      'A create or update with an undecodable body is refused with a 400',
      Gherkin.Do.pipe(
        Given('an account with no policies')('account', () => Effect.succeed(ACCOUNT)),
        When('a create sends a body that is not a policy object')(
          'badCreate',
          () => observed(createPolicy('not-a-policy')),
        ),
        Then('the create body is refused with the emulator 400 envelope')((s, expect) =>
          expect(s.badCreate).toEqual({
            code: 1000,
            kind: 'Validation',
            message: 'Invalid request body.',
            retryAfter: null,
          })
        ),
        When('an update sends a body that is not a patch object')(
          'badUpdate',
          () => observed(updatePolicy(MISSING_POLICY, 'not-a-patch')),
        ),
        Then('the update body is refused with the emulator 400 envelope')((s, expect) =>
          expect(s.badUpdate).toEqual({
            code: 1000,
            kind: 'Validation',
            message: 'Invalid request body.',
            retryAfter: null,
          })
        ),
      ),
    )
  })
