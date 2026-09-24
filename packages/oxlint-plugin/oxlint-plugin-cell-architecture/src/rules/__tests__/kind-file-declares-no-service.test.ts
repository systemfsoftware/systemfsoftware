import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { actualOf, EXPECTED, FIX } from '../kind-file-declares-no-service.config.js'
import { kindFileDeclaresNoService } from '../kind-file-declares-no-service.js'
import {
  CONTAINER_BLUEPRINT,
  CONTAINER_BLUEPRINT_FILENAME,
  RUNNING_CONTAINER_HANDLE,
  RUNNING_CONTAINER_HANDLE_FILENAME,
} from './_canonical-fixtures.js'

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

const serviceError = (name: string, declarationKind: string) => ({
  messageId: 'serviceDeclaration' as const,
  data: { name, expected: EXPECTED, actual: actualOf(declarationKind, name), fix: FIX },
})

ruleTester.run('kind-file-declares-no-service', kindFileDeclaresNoService, {
  valid: [
    {
      name: 'Should_Pass_When_AHandleModuleDeclaresOnlySchemaClasses',
      code: `import { Schema } from 'effect'
export class Stat extends Schema.Class<Stat>()('Stat', { size: Schema.Number }) {}`,
      filename: '/repo/packages/effect-memfs/src/open-file.handle.ts',
    },
    {
      name: 'Should_Pass_When_ABlueprintModuleTakesAContextKeyAsAParameter',
      code: `import { type Context, Effect, Layer } from 'effect'
export const layer = <Id>(service: Context.Key<Id, unknown>): Layer.Layer<Id> =>
  Layer.effect(service)(Effect.void)`,
      filename: '/repo/packages/effect-microsandbox/src/micro-vm.blueprint.ts',
    },
    {
      name: 'Should_Pass_When_TheCanonicalContainerFixtureDeclaresNoService',
      code: CONTAINER_BLUEPRINT,
      filename: CONTAINER_BLUEPRINT_FILENAME,
    },
    {
      name: 'Should_Pass_When_TheCanonicalRunningContainerFixtureDeclaresNoService',
      code: RUNNING_CONTAINER_HANDLE,
      filename: RUNNING_CONTAINER_HANDLE_FILENAME,
    },
    {
      name: 'Should_Pass_When_ANonKindFileDeclaresAService',
      code: `import { Context } from 'effect'
export class LedgerService extends Context.Service<LedgerService, { readonly record: () => void }>()('LedgerService') {}`,
      filename: '/repo/packages/shop/src/ledger.service.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_AHandleModelsItselfAsAContextService',
      code: `import { Context } from 'effect'
export interface Shape {
  readonly id: string
}
export class RunningContainer extends Context.Service<RunningContainer, Shape>()('RunningContainer') {}`,
      filename: '/repo/packages/effect-microsandbox/src/running-container.handle.ts',
      errors: [serviceError('RunningContainer', 'Context.Service class')],
    },
    {
      name: 'Should_Report_When_ABlueprintDeclaresAContextTag',
      code: `import { Context } from 'effect'
export interface Database {
  readonly query: (sql: string) => unknown
}
export const Database = Context.Tag('@app/Database')<Database, Database>()`,
      filename: '/repo/packages/shop/src/database.blueprint.ts',
      errors: [serviceError('Database', 'context identity')],
    },
    {
      name: 'Should_Report_When_AHandleDeclaresAContextKeyThroughAnAlias',
      code: `import { Context as Ctx } from 'effect'
export const DeviceTag = Ctx.Key<{ readonly name: string }>()('DeviceTag')`,
      filename: '/repo/packages/shop/src/device.handle.ts',
      errors: [serviceError('DeviceTag', 'context identity')],
    },
  ],
})
