import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { failureEnvelope, successEnvelope } from '../cloudflare-envelope.schema.js'
import {
  CheckAccountEligibility,
  CheckZoneEligibility,
  DeleteRule,
  DeleteRuleset,
  DeployRuleset,
  GetAccountEligibility,
  GetRule,
  GetZoneEligibility,
  ListRules,
  MonetizationApplied,
  MonetizationCommand,
  MonetizationOutcome,
  MonetizationRefused,
  MonetizationRule,
  MonetizationRuleset,
  MonetizationState,
  PatchRule,
} from './monetization.schema.js'
import type { AccountEligibility, EligibilityStatus, RulesetRule, ZoneEligibility } from './monetization.schema.js'

const addressPattern = /^0x[0-9a-fA-F]{40}$/
const pricePattern = /^([1-9]\d{3,7}|10{8})$/

const policyCode = 1001
const notFoundCode = 10006

const emptyJsonObject: Readonly<Record<string, Schema.Json>> = {}

const fields = (entries: ReadonlyArray<readonly [string, Option.Option<Schema.Json>]>): Schema.Json =>
  Array.reduce(entries, emptyJsonObject, (acc, [key, value]) =>
    Option.match(value, {
      onNone: () => acc,
      onSome: (json) => ({ ...acc, [key]: json }),
    }))

const eligibilityBody = (status: EligibilityStatus, reasons: readonly string[] | undefined): Schema.Json =>
  fields([
    ['status', Option.some(status)],
    ['reasons', Option.fromUndefinedOr(reasons)],
  ])

const zoneEligibilityBody = (
  status: EligibilityStatus,
  reasons: readonly string[] | undefined,
  enabled: boolean,
): Schema.Json =>
  fields([
    ['status', Option.some(status)],
    ['reasons', Option.fromUndefinedOr(reasons)],
    ['enabled', Option.some(enabled)],
  ])

const priceOf = (rule: MonetizationRule): Option.Option<Schema.Json> =>
  Match.value(rule.scheme).pipe(
    Match.when('exact', () => Option.map(Option.fromUndefinedOr(rule.price), (price): Schema.Json => price)),
    Match.when('upto', () => Option.map(Option.fromUndefinedOr(rule.price), (price): Schema.Json => price)),
    Match.when('origin_controlled', () => Option.none<Schema.Json>()),
    Match.exhaustive,
  )

const ruleBody = (rule: MonetizationRule): Schema.Json =>
  fields([
    ['id', Option.some(rule.id)],
    ['address', Option.some(rule.address)],
    ['enabled', Option.some(rule.enabled)],
    ['expression', Option.some(rule.expression)],
    ['scheme', Option.some(rule.scheme)],
    ['description', Option.fromUndefinedOr(rule.description)],
    ['price', priceOf(rule)],
  ])

const collectionBody = (rules: ReadonlyArray<MonetizationRule>): Schema.Json =>
  successEnvelope({ rules: Array.map(rules, ruleBody) })

const policy = (state: MonetizationState, message: string): MonetizationRefused =>
  MonetizationRefused.make({ state, status: 403, body: failureEnvelope({ code: policyCode, message }) })

const notFound = (state: MonetizationState, message: string): MonetizationRefused =>
  MonetizationRefused.make({ state, status: 404, body: failureEnvelope({ code: notFoundCode, message }) })

const ruleNotFound = (state: MonetizationState): MonetizationRefused =>
  notFound(state, 'No payment rule with the given ID exists in the zone.')

const findAccount = (state: MonetizationState, accountId: string): Option.Option<AccountEligibility> =>
  Array.findFirst(state.accountEligibility, (entry) => entry.account_id === accountId)

const findZone = (state: MonetizationState, zoneId: string): Option.Option<ZoneEligibility> =>
  Array.findFirst(state.zoneEligibility, (entry) => entry.zone_id === zoneId)

const findRuleset = (state: MonetizationState, zoneId: string): Option.Option<MonetizationRuleset> =>
  Array.findFirst(state.rulesets, (ruleset) => ruleset.zone_id === zoneId)

const findRule = (ruleset: MonetizationRuleset, ruleId: string): Option.Option<MonetizationRule> =>
  Array.findFirst(ruleset.rules, (rule) => rule.id === ruleId)

const upsertAccount = (state: MonetizationState, entry: AccountEligibility): MonetizationState => ({
  ...state,
  accountEligibility: Array.append(
    Array.filter(state.accountEligibility, (candidate) => candidate.account_id !== entry.account_id),
    entry,
  ),
})

const upsertZone = (state: MonetizationState, entry: ZoneEligibility): MonetizationState => ({
  ...state,
  zoneEligibility: Array.append(
    Array.filter(state.zoneEligibility, (candidate) => candidate.zone_id !== entry.zone_id),
    entry,
  ),
})

const replaceRuleset = (state: MonetizationState, ruleset: MonetizationRuleset): MonetizationState => ({
  ...state,
  rulesets: Array.append(
    Array.filter(state.rulesets, (candidate) => candidate.zone_id !== ruleset.zone_id),
    ruleset,
  ),
})

const getAccount = (command: MonetizationCommand, request: GetAccountEligibility): MonetizationOutcome =>
  Option.match(findAccount(command.state, request.account_id), {
    onNone: () => notFound(command.state, 'No account eligibility result exists.'),
    onSome: (entry) =>
      MonetizationApplied.make({
        state: command.state,
        status: 200,
        body: successEnvelope(eligibilityBody(entry.status, entry.reasons)),
      }),
  })

const checkAccount = (command: MonetizationCommand, request: CheckAccountEligibility): MonetizationOutcome => {
  const entry: AccountEligibility = { account_id: request.account_id, status: 'approved' }
  return MonetizationApplied.make({
    state: upsertAccount(command.state, entry),
    status: 200,
    body: successEnvelope(eligibilityBody(entry.status, entry.reasons)),
  })
}

const getZone = (command: MonetizationCommand, request: GetZoneEligibility): MonetizationOutcome =>
  Option.match(findZone(command.state, request.zone_id), {
    onNone: () => notFound(command.state, 'No zone eligibility result exists.'),
    onSome: (entry) =>
      MonetizationApplied.make({
        state: command.state,
        status: 200,
        body: successEnvelope(zoneEligibilityBody(entry.status, entry.reasons, entry.enabled)),
      }),
  })

const checkZone = (command: MonetizationCommand, request: CheckZoneEligibility): MonetizationOutcome => {
  const entry: ZoneEligibility = { enabled: true, status: 'approved', zone_id: request.zone_id }
  return MonetizationApplied.make({
    state: upsertZone(command.state, entry),
    status: 200,
    body: successEnvelope(zoneEligibilityBody(entry.status, entry.reasons, entry.enabled)),
  })
}

const listRules = (command: MonetizationCommand, request: ListRules): MonetizationOutcome =>
  Option.match(findRuleset(command.state, request.zone_id), {
    onNone: () => notFound(command.state, 'The zone has no Payment Required ruleset.'),
    onSome: (ruleset) =>
      MonetizationApplied.make({ state: command.state, status: 200, body: collectionBody(ruleset.rules) }),
  })

const addressValid = (address: string): boolean => addressPattern.test(address)

const priceValid = (price: string): boolean => pricePattern.test(price)

const distinctAddresses = (rules: ReadonlyArray<RulesetRule>): number =>
  Array.length(Array.dedupe(Array.map(rules, (rule) => rule.address.toLowerCase())))

const addressViolation = (rule: RulesetRule): Option.Option<string> =>
  Match.value(addressValid(rule.address)).pipe(
    Match.when(true, () => Option.none<string>()),
    Match.when(false, () => Option.some(`Address ${rule.address} is not a valid 0x-prefixed Ethereum address.`)),
    Match.exhaustive,
  )

const fixedPriceViolation = (rule: RulesetRule): Option.Option<string> =>
  Option.match(Option.fromUndefinedOr(rule.price), {
    onNone: () => Option.some('A price is required for the exact and upto schemes.'),
    onSome: (price) =>
      Match.value(priceValid(price)).pipe(
        Match.when(true, () => Option.none<string>()),
        Match.when(
          false,
          () => Option.some(`Price ${price} must be a canonical decimal integer in [1000, 100000000].`),
        ),
        Match.exhaustive,
      ),
  })

const priceViolation = (rule: RulesetRule): Option.Option<string> =>
  Match.value(rule.scheme).pipe(
    Match.when('origin_controlled', () =>
      Option.map(Option.fromUndefinedOr(rule.price), (price) =>
        `Origin-controlled rules carry no price; ${price} was provided.`)),
    Match.when('exact', () =>
      fixedPriceViolation(rule)),
    Match.when('upto', () =>
      fixedPriceViolation(rule)),
    Match.exhaustive,
  )

const idViolation = (existingIds: ReadonlyArray<string>, rule: RulesetRule): Option.Option<string> =>
  Option.match(Option.fromUndefinedOr(rule.id), {
    onNone: () => Option.none<string>(),
    onSome: (id) =>
      Match.value(Array.contains(existingIds, id)).pipe(
        Match.when(true, () => Option.none<string>()),
        Match.when(false, () => Option.some(`Rule id ${id} does not match an existing payment rule in the zone.`)),
        Match.exhaustive,
      ),
  })

const ruleViolation = (existingIds: ReadonlyArray<string>, rule: RulesetRule): Option.Option<string> =>
  Option.orElse(
    Option.orElse(addressViolation(rule), () => priceViolation(rule)),
    () => idViolation(existingIds, rule),
  )

const firstRuleViolation = (
  existingIds: ReadonlyArray<string>,
  rules: ReadonlyArray<RulesetRule>,
): Option.Option<string> =>
  Option.flatMap(
    Array.findFirst(rules, (rule) => Option.isSome(ruleViolation(existingIds, rule))),
    (rule) => ruleViolation(existingIds, rule),
  )

const rulesetViolation = (
  existingIds: ReadonlyArray<string>,
  rules: ReadonlyArray<RulesetRule>,
): Option.Option<string> =>
  Match.value(distinctAddresses(rules) > 40).pipe(
    Match.when(true, () => Option.some('A ruleset may contain at most 40 distinct addresses.')),
    Match.when(false, () => firstRuleViolation(existingIds, rules)),
    Match.exhaustive,
  )

const ruleId = (newId: string, index: number): string => `${index.toString(16).padStart(2, '0')}${newId.slice(0, 30)}`

const storedRule = (newId: string, rule: RulesetRule, index: number): MonetizationRule =>
  MonetizationRule.make({
    id: Option.getOrElse(Option.fromUndefinedOr(rule.id), () => ruleId(newId, index)),
    address: rule.address,
    description: rule.description,
    enabled: Option.getOrElse(Option.fromUndefinedOr(rule.enabled), () => true),
    expression: rule.expression,
    scheme: rule.scheme,
    price: rule.price,
  })

const deployRuleset = (command: MonetizationCommand, request: DeployRuleset): MonetizationOutcome => {
  const existingIds = Option.getOrElse(
    Option.map(findRuleset(command.state, request.zone_id), (ruleset) => Array.map(ruleset.rules, (rule) => rule.id)),
    (): ReadonlyArray<string> => [],
  )
  return Option.match(rulesetViolation(existingIds, request.rules), {
    onNone: () => {
      const rules = Array.map(request.rules, (rule, index) => storedRule(command.newId, rule, index))
      return MonetizationApplied.make({
        state: replaceRuleset(command.state, { rules, zone_id: request.zone_id }),
        status: 200,
        body: collectionBody(rules),
      })
    },
    onSome: (message) => policy(command.state, message),
  })
}

const deleteRuleset = (command: MonetizationCommand, request: DeleteRuleset): MonetizationOutcome =>
  Option.match(findRuleset(command.state, request.zone_id), {
    onNone: () => MonetizationApplied.make({ state: command.state, status: 200, body: collectionBody([]) }),
    onSome: () =>
      MonetizationApplied.make({
        state: replaceRuleset(command.state, { rules: [], zone_id: request.zone_id }),
        status: 200,
        body: collectionBody([]),
      }),
  })

const getRule = (command: MonetizationCommand, request: GetRule): MonetizationOutcome =>
  Option.match(findRuleset(command.state, request.zone_id), {
    onNone: () => ruleNotFound(command.state),
    onSome: (ruleset) =>
      Option.match(findRule(ruleset, request.rule_id), {
        onNone: () => ruleNotFound(command.state),
        onSome: (rule) =>
          MonetizationApplied.make({ state: command.state, status: 200, body: successEnvelope(ruleBody(rule)) }),
      }),
  })

const deleteRule = (command: MonetizationCommand, request: DeleteRule): MonetizationOutcome =>
  Option.match(findRuleset(command.state, request.zone_id), {
    onNone: () => ruleNotFound(command.state),
    onSome: (ruleset) =>
      Option.match(findRule(ruleset, request.rule_id), {
        onNone: () => ruleNotFound(command.state),
        onSome: () => {
          const rules = Array.filter(ruleset.rules, (rule) => rule.id !== request.rule_id)
          return MonetizationApplied.make({
            state: replaceRuleset(command.state, { rules, zone_id: request.zone_id }),
            status: 200,
            body: collectionBody(rules),
          })
        },
      }),
  })

const effectivePrice = (
  scheme: MonetizationRule['scheme'],
  request: PatchRule,
  rule: MonetizationRule,
): Option.Option<string> =>
  Match.value(scheme).pipe(
    Match.when('origin_controlled', () => Option.none<string>()),
    Match.when('exact', () =>
      Option.orElse(Option.fromUndefinedOr(request.price), () => Option.fromUndefinedOr(rule.price))),
    Match.when('upto', () =>
      Option.orElse(Option.fromUndefinedOr(request.price), () =>
        Option.fromUndefinedOr(rule.price))),
    Match.exhaustive,
  )

const mergeRule = (rule: MonetizationRule, request: PatchRule): MonetizationRule => {
  const scheme = Option.getOrElse(Option.fromUndefinedOr(request.scheme), () => rule.scheme)
  return MonetizationRule.make({
    id: rule.id,
    address: Option.getOrElse(Option.fromUndefinedOr(request.address), () => rule.address),
    description: Option.getOrElse(Option.fromUndefinedOr(request.description), () => rule.description),
    enabled: Option.getOrElse(Option.fromUndefinedOr(request.enabled), () => rule.enabled),
    expression: Option.getOrElse(Option.fromUndefinedOr(request.expression), () => rule.expression),
    scheme,
    price: Option.getOrElse(effectivePrice(scheme, request, rule), () => undefined),
  })
}

const replaceRule = (ruleset: MonetizationRuleset, merged: MonetizationRule): ReadonlyArray<MonetizationRule> =>
  Array.map(ruleset.rules, (candidate) =>
    Match.value(candidate.id === merged.id).pipe(
      Match.when(true, () => merged),
      Match.when(false, () => candidate),
      Match.exhaustive,
    ))

const patchRule = (command: MonetizationCommand, request: PatchRule): MonetizationOutcome =>
  Option.match(findRuleset(command.state, request.zone_id), {
    onNone: () => ruleNotFound(command.state),
    onSome: (ruleset) =>
      Option.match(findRule(ruleset, request.rule_id), {
        onNone: () => ruleNotFound(command.state),
        onSome: (rule) => {
          const merged = mergeRule(rule, request)
          return Option.match(ruleViolation(Array.map(ruleset.rules, (candidate) => candidate.id), merged), {
            onNone: () => {
              const rules = replaceRule(ruleset, merged)
              return MonetizationApplied.make({
                state: replaceRuleset(command.state, { rules, zone_id: request.zone_id }),
                status: 200,
                body: collectionBody(rules),
              })
            },
            onSome: (message) => policy(command.state, message),
          })
        },
      }),
  })

const decide = (command: MonetizationCommand): Result.Result<MonetizationOutcome, never> =>
  Result.succeed(
    Match.value(command.request).pipe(
      Match.tag('GetAccountEligibility', (request) => getAccount(command, request)),
      Match.tag('CheckAccountEligibility', (request) => checkAccount(command, request)),
      Match.tag('GetZoneEligibility', (request) => getZone(command, request)),
      Match.tag('CheckZoneEligibility', (request) => checkZone(command, request)),
      Match.tag('ListRules', (request) => listRules(command, request)),
      Match.tag('DeployRuleset', (request) => deployRuleset(command, request)),
      Match.tag('DeleteRuleset', (request) => deleteRuleset(command, request)),
      Match.tag('GetRule', (request) => getRule(command, request)),
      Match.tag('DeleteRule', (request) => deleteRule(command, request)),
      Match.tag('PatchRule', (request) => patchRule(command, request)),
      Match.exhaustive,
    ),
  )

export const monetizationGateway = Workflow.make({
  command: MonetizationCommand,
  decision: MonetizationOutcome,
  error: Schema.Never,
  decide,
})
