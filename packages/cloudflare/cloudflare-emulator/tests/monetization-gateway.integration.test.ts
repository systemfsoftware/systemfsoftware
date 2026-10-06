import { apiTokenCredentials, Credentials } from '@distilled.cloud/cloudflare'
import { NodeServices } from '@effect/platform-node'
import { client as cloudflare } from '@systemfsoftware/alchemy-cloudflare'
import type {
  Monetization_monetization_rule_collection_response,
  Monetization_monetization_rule_patch,
  Monetization_monetization_ruleset_input,
} from '@systemfsoftware/alchemy-cloudflare/api'
import { Emulator, layer as emulatorLayer } from '@systemfsoftware/cloudflare-emulator'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Array, Effect, Layer } from 'effect'
import * as FetchHttpClient from 'effect/http/FetchHttpClient'
import { observed } from './__fixtures__/observed-refusal.fixture.js'

const Feature = makeFeature({ it })

type RulesetRuleInput = Monetization_monetization_ruleset_input['rules'][number]

const ACCOUNT = '0123456789abcdef0123456789abcdef'
const OTHER_ACCOUNT = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const ZONE = 'fedcba9876543210fedcba9876543210'
const OTHER_ZONE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const UNKNOWN_RULE = 'ffffffffffffffffffffffffffffffff'

// 0x-prefixed 20-byte addresses, hand-written literals rather than computed.
const ADDRESS = '0x1111111111111111111111111111111111111111'
const ADDRESS_2 = '0x2222222222222222222222222222222222222222'

// The emulator's current refusal messages, asserted verbatim until the
// live-capture lane replaces uncited codes; never derived from a run.
const NOT_ACCOUNT = 'No account eligibility result exists.'
const NOT_ZONE = 'No zone eligibility result exists.'
const NOT_RULESET = 'The zone has no Payment Required ruleset.'
const NOT_RULE = 'No payment rule with the given ID exists in the zone.'
const TAKEN_ID = (id: string): string => `Rule id ${id} does not match an existing payment rule in the zone.`
const TOO_MANY_ADDRESSES = 'A ruleset may contain at most 40 distinct addresses.'
const PRICE_REQUIRED = 'A price is required for the exact and upto schemes.'
const ENTITLEMENT = 'Monetization Gateway is not available for this account.'

const monetization = Effect.map(cloudflare.CloudflareClient, (api) => api['Monetization'])

const checkAccount = () =>
  Effect.flatMap(
    monetization,
    (m) =>
      m.monetizationCheckAccountEligibility({
        params: { account_id: ACCOUNT },
        payload: { acceptedTermsOfService: true },
      }),
  )

const getAccount = (account_id: string) =>
  Effect.flatMap(monetization, (m) => m.monetizationGetAccountEligibility({ params: { account_id } }))

const checkZone = () =>
  Effect.flatMap(monetization, (m) => m.monetizationCheckZoneEligibility({ params: { zone_id: ZONE } }))

const getZone = (zone_id: string) =>
  Effect.flatMap(monetization, (m) => m.monetizationGetZoneEligibility({ params: { zone_id } }))

const listRules = (zone_id: string) =>
  Effect.flatMap(monetization, (m) => m.monetizationListRules({ params: { zone_id } }))

const deployRules = (rules: ReadonlyArray<RulesetRuleInput>) =>
  Effect.flatMap(monetization, (m) => m.monetizationDeployRuleset({ params: { zone_id: ZONE }, payload: { rules } }))

const deleteRuleset = () =>
  Effect.flatMap(monetization, (m) => m.monetizationDeleteRuleset({ params: { zone_id: ZONE } }))

const getRule = (rule_id: string) =>
  Effect.flatMap(monetization, (m) => m.monetizationGetRule({ params: { rule_id, zone_id: ZONE } }))

const deleteRule = (rule_id: string) =>
  Effect.flatMap(monetization, (m) => m.monetizationDeleteRule({ params: { rule_id, zone_id: ZONE } }))

const patchRule = (rule_id: string, payload: Monetization_monetization_rule_patch) =>
  Effect.flatMap(monetization, (m) => m.monetizationPatchRule({ params: { rule_id, zone_id: ZONE }, payload }))

const seedMonetization = (entitled: boolean) =>
  Effect.flatMap(Emulator, (emulator) => emulator.admin.seedEntitlement({ product: 'monetization', entitled }))

const rulesOf = (response: Monetization_monetization_rule_collection_response) =>
  response.result.rules.map((rule) => ({
    address: rule.address,
    price: 'price' in rule ? rule.price : null,
    scheme: rule.scheme,
  }))

const exactRule: RulesetRuleInput = { address: ADDRESS, expression: 'true', price: '1000', scheme: 'exact' }
const originRule: RulesetRuleInput = { address: ADDRESS_2, expression: 'true', scheme: 'origin_controlled' }

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

const fortyOneAddresses = Array.makeBy(41, (index) => `0x${index.toString(16).padStart(40, '0')}`)

Feature('Monetization Gateway against the Cloudflare emulator')
  .live('drives the emulator over a real loopback HTTP socket with the generated client')
  .withScenarioLayer(clientOnEmulator)
  .body(({ scenario }) => {
    scenario(
      'Account and zone eligibility are checked, read back, and absent results are not found',
      Gherkin.Do.pipe(
        Given('an account and a zone with no monetization state')('setup', () => Effect.succeed({ ACCOUNT, ZONE })),
        When('the account eligibility is checked')('account', () => checkAccount()),
        Then('the account is approved with no reasons')((s, expect) =>
          expect({ reasons: s.account.result.reasons, status: s.account.result.status }).toEqual({
            reasons: undefined,
            status: 'approved',
          })
        ),
        When('the account eligibility is read back')('readAccount', () => getAccount(ACCOUNT)),
        Then('the stored account decision is approved')((s, expect) =>
          expect(s.readAccount.result.status).toEqual('approved')
        ),
        When('the zone eligibility is checked')('zone', () => checkZone()),
        Then('the zone is approved and enabled')((s, expect) =>
          expect({ enabled: s.zone.result.enabled, status: s.zone.result.status }).toEqual({
            enabled: true,
            status: 'approved',
          })
        ),
        When('the zone eligibility is read back')('readZone', () => getZone(ZONE)),
        Then('the stored zone decision is approved')((s, expect) =>
          expect(s.readZone.result.status).toEqual('approved')
        ),
        When('an account that was never checked is read')(
          'missingAccount',
          () => observed(getAccount(OTHER_ACCOUNT)),
        ),
        Then('the account read is not found')((s, expect) =>
          expect(s.missingAccount).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: NOT_ACCOUNT,
            retryAfter: null,
          })
        ),
        When('a zone that was never checked is read')('missingZone', () => observed(getZone(OTHER_ZONE))),
        Then('the zone read is not found')((s, expect) =>
          expect(s.missingZone).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: NOT_ZONE,
            retryAfter: null,
          })
        ),
      ),
    )

    scenario(
      'A ruleset is deployed, listed, read and patched',
      Gherkin.Do.pipe(
        Given('a zone with no payment rules')('setup', () => Effect.succeed({ ZONE })),
        When('a fixed-price and an origin-controlled rule are deployed without ids')(
          'deployed',
          () => deployRules([exactRule, originRule]),
        ),
        Then('both rules are stored with server-assigned identities')((s, expect) =>
          expect(s.deployed.result.rules.map((rule) => rule.id.length)).toEqual([32, 32])
        ),
        When('the deployed ruleset is listed')('listed', () => listRules(ZONE)),
        Then('the listing mirrors the deployed rules')((s, expect) =>
          expect(rulesOf(s.listed)).toEqual([
            { address: ADDRESS, price: '1000', scheme: 'exact' },
            { address: ADDRESS_2, price: null, scheme: 'origin_controlled' },
          ])
        ),
        When('the first rule is read by its id')(
          'read',
          (s) => getRule(s.deployed.result.rules[0]?.id ?? UNKNOWN_RULE),
        ),
        Then('the read rule carries its address, scheme and price')((s, expect) =>
          expect({
            address: s.read.result.address,
            price: 'price' in s.read.result ? s.read.result.price : null,
            scheme: s.read.result.scheme,
          }).toEqual({ address: ADDRESS, price: '1000', scheme: 'exact' })
        ),
        When('the first rule is patched with a new price and description')(
          'patched',
          (s) =>
            patchRule(s.deployed.result.rules[0]?.id ?? UNKNOWN_RULE, {
              description: 'updated',
              price: '2000',
            }),
        ),
        Then('only the patched rule changes')((s, expect) =>
          expect(rulesOf(s.patched)).toEqual([
            { address: ADDRESS, price: '2000', scheme: 'exact' },
            { address: ADDRESS_2, price: null, scheme: 'origin_controlled' },
          ])
        ),
      ),
    )

    scenario(
      'Deleting a missing rule, clearing a ruleset and reading an unowned zone are not found or empty',
      Gherkin.Do.pipe(
        Given('a zone with no payment rules')('setup', () => Effect.succeed({ ZONE })),
        When('a fixed-price and an origin-controlled rule are deployed')(
          'deployed',
          () => deployRules([exactRule, originRule]),
        ),
        Then('both rules are stored with server-assigned identities')((s, expect) =>
          expect(s.deployed.result.rules.map((rule) => rule.id.length)).toEqual([32, 32])
        ),
        When('the origin-controlled rule is deleted')(
          'deleted',
          (s) => deleteRule(s.deployed.result.rules[1]?.id ?? UNKNOWN_RULE),
        ),
        Then('the remaining collection holds only the fixed-price rule')((s, expect) =>
          expect(rulesOf(s.deleted)).toEqual([{ address: ADDRESS, price: '1000', scheme: 'exact' }])
        ),
        When('the deleted rule is read')(
          'readDeleted',
          (s) => observed(getRule(s.deployed.result.rules[1]?.id ?? UNKNOWN_RULE)),
        ),
        Then('the deleted rule is not found')((s, expect) =>
          expect(s.readDeleted).toEqual({ code: 10006, kind: 'NotFound', message: NOT_RULE, retryAfter: null })
        ),
        When('the deleted rule is deleted again')(
          'reDeleted',
          (s) => observed(deleteRule(s.deployed.result.rules[1]?.id ?? UNKNOWN_RULE)),
        ),
        Then('the second delete is not found')((s, expect) =>
          expect(s.reDeleted).toEqual({ code: 10006, kind: 'NotFound', message: NOT_RULE, retryAfter: null })
        ),
        When('the deleted rule is patched')(
          'rePatched',
          (s) => observed(patchRule(s.deployed.result.rules[1]?.id ?? UNKNOWN_RULE, { enabled: false })),
        ),
        Then('the patch of the deleted rule is not found')((s, expect) =>
          expect(s.rePatched).toEqual({ code: 10006, kind: 'NotFound', message: NOT_RULE, retryAfter: null })
        ),
        When('the whole ruleset is deleted')('cleared', () => deleteRuleset()),
        Then('the cleared collection is empty and successful')((s, expect) =>
          expect({ rules: s.cleared.result.rules, success: s.cleared.success }).toEqual({ rules: [], success: true })
        ),
        When('the rules are listed again')('emptied', () => listRules(ZONE)),
        Then('the zone lists an empty ruleset')((s, expect) => expect(rulesOf(s.emptied)).toEqual([])),
        When('a zone that never had a ruleset is listed')('missingRuleset', () => observed(listRules(OTHER_ZONE))),
        Then('the unowned zone listing is not found')((s, expect) =>
          expect(s.missingRuleset).toEqual({
            code: 10006,
            kind: 'NotFound',
            message: NOT_RULESET,
            retryAfter: null,
          })
        ),
      ),
    )

    scenario(
      'Unknown ids, too many addresses and an unpriced fixed scheme are refused by policy',
      Gherkin.Do.pipe(
        Given('a zone with no payment rules')('setup', () => Effect.succeed({ ZONE })),
        When('a rule carrying an id that matches nothing is deployed')(
          'takenId',
          () => observed(deployRules([{ ...exactRule, id: 'orphan' }])),
        ),
        Then('the deployment is refused by policy')((s, expect) =>
          expect(s.takenId).toEqual({
            code: 1001,
            kind: 'CloudflareApiError',
            message: TAKEN_ID('orphan'),
            retryAfter: null,
          })
        ),
        When('a ruleset with forty-one distinct addresses is deployed')(
          'tooMany',
          () => observed(deployRules(Array.map(fortyOneAddresses, (address) => ({ ...exactRule, address })))),
        ),
        Then('the address limit is refused by policy')((s, expect) =>
          expect(s.tooMany).toEqual({
            code: 1001,
            kind: 'CloudflareApiError',
            message: TOO_MANY_ADDRESSES,
            retryAfter: null,
          })
        ),
        When('an origin-controlled rule is deployed')('control', () => deployRules([originRule])),
        Then('the origin-controlled rule stores no price')((s, expect) =>
          expect(rulesOf(s.control)).toEqual([{ address: ADDRESS_2, price: null, scheme: 'origin_controlled' }])
        ),
        When('that rule is patched to the exact scheme without a price')(
          'noPrice',
          (s) => observed(patchRule(s.control.result.rules[0]?.id ?? UNKNOWN_RULE, { scheme: 'exact' })),
        ),
        Then('the missing price is refused by policy')((s, expect) =>
          expect(s.noPrice).toEqual({
            code: 1001,
            kind: 'CloudflareApiError',
            message: PRICE_REQUIRED,
            retryAfter: null,
          })
        ),
      ),
    )

    scenario(
      'Rule operations on a zone with no ruleset are not found and clearing an empty zone is a no-op',
      Gherkin.Do.pipe(
        Given('a zone with no payment rules')('setup', () => Effect.succeed({ ZONE })),
        When('a rule is read in a zone with no ruleset')('readMissing', () => observed(getRule(UNKNOWN_RULE))),
        Then('the read is not found')((s, expect) =>
          expect(s.readMissing).toEqual({ code: 10006, kind: 'NotFound', message: NOT_RULE, retryAfter: null })
        ),
        When('a rule is patched in a zone with no ruleset')(
          'patchMissing',
          () => observed(patchRule(UNKNOWN_RULE, { enabled: false })),
        ),
        Then('the patch is not found')((s, expect) =>
          expect(s.patchMissing).toEqual({ code: 10006, kind: 'NotFound', message: NOT_RULE, retryAfter: null })
        ),
        When('a rule is deleted in a zone with no ruleset')('deleteMissing', () => observed(deleteRule(UNKNOWN_RULE))),
        Then('the delete is not found')((s, expect) =>
          expect(s.deleteMissing).toEqual({ code: 10006, kind: 'NotFound', message: NOT_RULE, retryAfter: null })
        ),
        When('the ruleset is deleted in a zone that has none')('clearEmpty', () => deleteRuleset()),
        Then('the no-op clear answers an empty collection')((s, expect) =>
          expect({ rules: s.clearEmpty.result.rules, success: s.clearEmpty.success }).toEqual({
            rules: [],
            success: true,
          })
        ),
      ),
    )

    scenario(
      'A redeployed ruleset reuses an existing rule id in place',
      Gherkin.Do.pipe(
        Given('a zone with no payment rules')('setup', () => Effect.succeed({ ZONE })),
        When('a fixed-price rule is deployed')('deployed', () => deployRules([exactRule])),
        Then('one rule is stored with a generated id')((s, expect) =>
          expect(s.deployed.result.rules.map((rule) => rule.id.length)).toEqual([32])
        ),
        When('the same id is redeployed with a new price')(
          'redeployed',
          (s) =>
            deployRules([
              { ...exactRule, id: s.deployed.result.rules[0]?.id ?? UNKNOWN_RULE, price: '5000' },
            ]),
        ),
        Then('the id is reused and the price updated')((s, expect) =>
          expect({
            price: rulesOf(s.redeployed)[0]?.price,
            sameId: s.redeployed.result.rules[0]?.id === s.deployed.result.rules[0]?.id,
          }).toEqual({ price: '5000', sameId: true })
        ),
      ),
    )

    scenario(
      'A zone write is refused while Monetization is not entitled and accepted once granted',
      Gherkin.Do.pipe(
        Given('an account whose Monetization entitlement is withheld')(
          'setup',
          () => Effect.as(seedMonetization(false), { ZONE }),
        ),
        When('the zone eligibility is checked')('ungranted', () => observed(checkZone())),
        Then('the check is refused as a pending entitlement')((s, expect) =>
          expect(s.ungranted).toEqual({
            code: 1000,
            kind: 'Validation',
            message: ENTITLEMENT,
            retryAfter: null,
          })
        ),
        When('the entitlement is granted and the zone eligibility is checked again')(
          'granted',
          () => Effect.andThen(seedMonetization(true), checkZone()),
        ),
        Then('the granted check is approved and enabled')((s, expect) =>
          expect({ enabled: s.granted.result.enabled, status: s.granted.result.status }).toEqual({
            enabled: true,
            status: 'approved',
          })
        ),
      ),
    )
  })
