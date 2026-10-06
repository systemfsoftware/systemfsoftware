import { CloudflareApi } from '@systemfsoftware/alchemy-cloudflare/api'
import type { Monetization_monetization_ruleset_input } from '@systemfsoftware/alchemy-cloudflare/api'
import { Array } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'
import * as Result from 'effect/Result'
import { settledOf, settleOperation } from '../settle-operation.js'
import type { Settled } from '../settle-operation.js'
import type { EmulatorState } from '../state/emulator-state.js'
import { monetizationGateway } from '../state/monetization-gateway.workflow.js'
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
  MonetizationCommand,
  PatchRule,
  RulesetRule,
} from '../state/monetization.schema.js'
import type { MonetizationRequest, MonetizationState } from '../state/monetization.schema.js'
import { entitlementGate } from './entitlement-gate.js'

type MonetizationInput = { readonly now: string; readonly newId: string; readonly state: EmulatorState }

type RulesetRuleInput = Monetization_monetization_ruleset_input['rules'][number]

const runMonetization = (input: MonetizationInput, request: MonetizationRequest): Settled<MonetizationState> => {
  const outcome = Result.getOrThrow(
    monetizationGateway(
      MonetizationCommand.make({
        now: input.now,
        newId: input.newId,
        state: input.state.monetization,
        request,
      }),
    ),
  )
  return settledOf(outcome)
}

const gated = (input: MonetizationInput, request: MonetizationRequest): Settled<MonetizationState> =>
  entitlementGate(() => runMonetization(input, request), {
    product: 'monetization',
    state: input.state,
    unchanged: input.state.monetization,
  })

const applyMonetization = (
  operation: string,
  isWrite: boolean,
  decide: (input: MonetizationInput) => Settled<MonetizationState>,
) =>
  settleOperation({
    slot: 'monetization',
    operation,
    isWrite,
    decide,
  })

const toRulesetRule = (rule: RulesetRuleInput): RulesetRule =>
  RulesetRule.make({
    address: rule.address,
    description: rule.description,
    enabled: rule.enabled,
    expression: rule.expression,
    id: rule.id,
    price: 'price' in rule ? rule.price : undefined,
    scheme: rule.scheme,
  })

export const monetizationHandlers = HttpApiBuilder.group(CloudflareApi, 'Monetization', (handlers) =>
  handlers
    .handle('monetizationGetAccountEligibility', ({ params }) =>
      applyMonetization('monetizationGetAccountEligibility', false, (input) =>
        runMonetization(input, GetAccountEligibility.make({ account_id: params.account_id }))))
    .handle('monetizationCheckAccountEligibility', ({ params }) =>
      applyMonetization('monetizationCheckAccountEligibility', true, (input) =>
        gated(input, CheckAccountEligibility.make({ account_id: params.account_id }))))
    .handle('monetizationGetZoneEligibility', ({ params }) =>
      applyMonetization('monetizationGetZoneEligibility', false, (input) =>
        runMonetization(input, GetZoneEligibility.make({ zone_id: params.zone_id }))))
    .handle('monetizationCheckZoneEligibility', ({ params }) =>
      applyMonetization('monetizationCheckZoneEligibility', true, (input) =>
        gated(input, CheckZoneEligibility.make({ zone_id: params.zone_id }))))
    .handle('monetizationListRules', ({ params }) =>
      applyMonetization('monetizationListRules', false, (input) =>
        runMonetization(input, ListRules.make({ zone_id: params.zone_id }))))
    .handle('monetizationDeployRuleset', ({ params, payload }) =>
      applyMonetization('monetizationDeployRuleset', true, (input) =>
        gated(
          input,
          DeployRuleset.make({ rules: Array.map(payload.rules, toRulesetRule), zone_id: params.zone_id }),
        )))
    .handle('monetizationDeleteRuleset', ({ params }) =>
      applyMonetization('monetizationDeleteRuleset', true, (input) =>
        gated(input, DeleteRuleset.make({ zone_id: params.zone_id }))))
    .handle('monetizationGetRule', ({ params }) =>
      applyMonetization('monetizationGetRule', false, (input) =>
        runMonetization(input, GetRule.make({ rule_id: params.rule_id, zone_id: params.zone_id }))))
    .handle('monetizationDeleteRule', ({ params }) =>
      applyMonetization('monetizationDeleteRule', true, (input) =>
        gated(input, DeleteRule.make({ rule_id: params.rule_id, zone_id: params.zone_id }))))
    .handle('monetizationPatchRule', ({ params, payload }) =>
      applyMonetization('monetizationPatchRule', true, (input) =>
        gated(
          input,
          PatchRule.make({
            address: payload.address,
            description: payload.description,
            enabled: payload.enabled,
            expression: payload.expression,
            price: payload.price,
            rule_id: params.rule_id,
            scheme: payload.scheme,
            zone_id: params.zone_id,
          }),
        ))))
