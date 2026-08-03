import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { OPERATIONAL_EXPORT_EXPECTED, OPERATIONAL_EXPORT_FIX } from '../observer-operational-exports.config.js'
import { observerOperationalExports } from '../observer-operational-exports.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

const errorFor = (name: string) => ({
  messageId: 'nonOperationalExport',
  data: {
    name,
    expected: OPERATIONAL_EXPORT_EXPECTED,
    actual: `an exported name '${name}'`,
    fix: OPERATIONAL_EXPORT_FIX,
  },
})

ruleTester.run('observer-operational-exports', observerOperationalExports, {
  valid: [
    {
      name: 'Should_Pass_When_ExportingVerbLedConst',
      code: `export const runSteps = (steps: readonly Step[]) => steps`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ExportingVerbLedFunction',
      code: `export function makeHarness() { return {} }`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ExportingTokenLedClass',
      code: `export class StepHarness {}`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ExportingUpperSnakeConstant',
      code: `export const STEP_TIMEOUT_MS = 5000`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ExportingUpperSnakeNonTokenConstant',
      code: `export const DEFAULT_PORT = 3000`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ExportingTokenNamedType',
      code: `export type SpanEvent = { name: string }`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ExportingTokenNamedInterface',
      code: `export interface FixtureSet { ok: boolean }`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ExportingFixtureNamedValue',
      code: `export const fixture = { a: 1 }`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ExportSpecifierIsOperational',
      code: `const runSteps = 1\n\nexport { runSteps }`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ExportingAnonymousDefaultFunction',
      code: `export default function () { return {} }`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ExportingAnonymousDefaultClass',
      code: `export default class {}`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ExportingDestructuredConst',
      code: `export const { a } = thing`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_ExportingEmptySpecifierList',
      code: `export {}`,
      filename: 'step-harness.observer.ts',
    },
    {
      name: 'Should_Pass_When_DomainNameInNonObserverFile',
      code: `export const anOrder = (o) => o`,
      filename: 'cancel-order.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_ExportingArticlePrefixedFixture',
      code: `export const anOrder = (o) => o`,
      filename: 'step-harness.observer.ts',
      errors: [errorFor('anOrder')],
    },
    {
      name: 'Should_Report_When_ExportingDomainNounFunction',
      code: `export function cancelOrder() { return 1 }`,
      filename: 'step-harness.observer.ts',
      errors: [errorFor('cancelOrder')],
    },
    {
      name: 'Should_Report_When_ExportingDomainNounClass',
      code: `export class OrderService {}`,
      filename: 'step-harness.observer.ts',
      errors: [errorFor('OrderService')],
    },
    {
      name: 'Should_Report_When_ExportingDomainNounType',
      code: `export type Order = { id: string }`,
      filename: 'step-harness.observer.ts',
      errors: [errorFor('Order')],
    },
    {
      name: 'Should_Report_When_ExportingDomainNounInterface',
      code: `export interface OrderState { id: string }`,
      filename: 'step-harness.observer.ts',
      errors: [errorFor('OrderState')],
    },
    {
      name: 'Should_Report_When_ExportSpecifierIsDomainNoun',
      code: `const anOrder = 1\n\nexport { anOrder }`,
      filename: 'step-harness.observer.ts',
      errors: [errorFor('anOrder')],
    },
    {
      name: 'Should_Report_When_ExportingBareNounConstant',
      code: `export const config = { timeout: 1000 }`,
      filename: 'step-harness.observer.ts',
      errors: [errorFor('config')],
    },
    {
      name: 'Should_Report_When_ExportingDomainLedComposite',
      code: `export const orderFixture = { a: 1 }`,
      filename: 'step-harness.observer.ts',
      errors: [errorFor('orderFixture')],
    },
    {
      name: 'Should_Report_When_OneOfMultipleDeclaratorsIsDomainNoun',
      code: `export const runSteps = 1, anOrder = 2`,
      filename: 'step-harness.observer.ts',
      errors: [errorFor('anOrder')],
    },
    {
      name: 'Should_Report_When_ExportingNamedDefaultFunction',
      code: `export default function anOrder() { return {} }`,
      filename: 'step-harness.observer.ts',
      errors: [errorFor('anOrder')],
    },
  ],
})
