import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  DISABLE_DIRECTIVE_ACTUAL,
  DISABLE_DIRECTIVE_FIX,
  DYNAMIC_IMPORT_ACTUAL,
  DYNAMIC_IMPORT_FIX,
  EXPECTED,
  FOREIGN_SOURCE_ACTUAL,
  FOREIGN_SOURCE_FIX,
  MANIFEST_UNREADABLE_ACTUAL,
  MANIFEST_UNREADABLE_FIX,
  PLAIN_MODULE_ACTUAL,
  PLAIN_MODULE_FIX,
  RE_EXPORT_ACTUAL,
  RE_EXPORT_FIX,
  STALE_LEGACY_ACTUAL,
  STALE_LEGACY_FIX,
  WORKSPACE_BINDING_ACTUAL,
  WORKSPACE_BINDING_FIX,
} from '../decision-code-imports.config.js'
import { decisionCodeImports } from '../decision-code-imports.js'

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

const plant = async (root: string, files: Readonly<Record<string, string>>): Promise<void> => {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), text)
  }
}

const WORKSPACE = await mkdtemp(join(tmpdir(), 'decision-code-workspace-'))
const BROKEN_WORKSPACE = await mkdtemp(join(tmpdir(), 'decision-code-broken-'))
const PROOFLESS_WORKSPACE = await mkdtemp(join(tmpdir(), 'decision-code-proofless-'))

vitest.afterAll(async () => {
  await Promise.all(
    [WORKSPACE, BROKEN_WORKSPACE, PROOFLESS_WORKSPACE].map((root) => rm(root, { recursive: true, force: true })),
  )
})

const workspaceFiles = (manifest: string): Readonly<Record<string, string>> => ({
  'pnpm-workspace.yaml': 'packages: ["packages/*"]\n',
  'package.json': JSON.stringify({ name: 'acme-root', private: true }),
  'packages/app/package.json': JSON.stringify({ name: '@acme/app' }),
  'packages/domain/package.json': JSON.stringify({ name: '@acme/domain' }),
  'packages/kernel/package.json': JSON.stringify({ name: '@acme/kernel' }),
  'decision-code.json': manifest,
})

await plant(
  WORKSPACE,
  workspaceFiles(JSON.stringify({
    legacy: ['packages/app/src/carried.workflow.ts', 'packages/app/src/cleared.workflow.ts'],
    kernels: [{ package: '@acme/kernel', proof: 'packages/kernel/src/__tests__/kernel.property.test.ts' }],
  })),
)
await plant(BROKEN_WORKSPACE, workspaceFiles('{ "legacy": '))
await plant(PROOFLESS_WORKSPACE, workspaceFiles(JSON.stringify({ kernels: [{ package: '@acme/kernel' }] })))

const WORKFLOW = join(WORKSPACE, 'packages/app/src/place-order.workflow.ts')
const SCHEMA = join(WORKSPACE, 'packages/app/src/order.schema.ts')

const SCHEMA_IMPORT = `import { Schema as S } from 'effect'`
const NAMESPACE_IMPORT = `import * as PI from '@acme/domain'`

const finding = (messageId: string, name: string, actual: string, fix: string) => ({
  messageId,
  data: { name, expected: EXPECTED, actual, fix },
})

const plainModule = (source: string) =>
  finding(
    'plainModuleImport',
    `an import of ${source}`,
    PLAIN_MODULE_ACTUAL.replace('{{source}}', source),
    PLAIN_MODULE_FIX,
  )

const foreignSource = (source: string, name = `an import of ${source}`) =>
  finding('foreignSourceImport', name, FOREIGN_SOURCE_ACTUAL.replace('{{source}}', source), FOREIGN_SOURCE_FIX)

const workspaceUse = (binding: string, source = '@acme/domain') =>
  finding(
    'workspaceBindingUse',
    `a use of ${binding}`,
    WORKSPACE_BINDING_ACTUAL.replace('{{binding}}', binding).replace('{{source}}', source),
    WORKSPACE_BINDING_FIX,
  )

const dynamicImport = (name: string, form: string) =>
  finding('dynamicImport', name, DYNAMIC_IMPORT_ACTUAL.replace('{{form}}', form), DYNAMIC_IMPORT_FIX)

const reExport = (source: string) =>
  finding(
    'reExport',
    `a re-export from ${source}`,
    RE_EXPORT_ACTUAL.replace('{{source}}', source),
    RE_EXPORT_FIX.replace('{{source}}', source),
  )

const disableDirective = (directive: string) =>
  finding(
    'disableDirective',
    'an inline disable directive',
    DISABLE_DIRECTIVE_ACTUAL.replace('{{directive}}', directive),
    DISABLE_DIRECTIVE_FIX,
  )

ruleTester.run('decision-code-imports', decisionCodeImports, {
  valid: [
    {
      name: 'Should_Pass_When_AWorkflowImportsARelativeSchemaModule',
      code: `import { Order } from './order.schema.js'
export const total = (order: Order) => Order.make(order)
const helper = (order: Order) => Order.is(order)`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Pass_When_ASchemaImportsRelativeSchemaAndWorkflowModules',
      code: `import { Money } from '../money/money.schema.ts'
import { placeOrder } from './place-order.workflow.js'
export const Order = Money
export const decide = placeOrder`,
      filename: SCHEMA,
    },
    {
      name: 'Should_Pass_When_EveryPlainImportIsTypeOnly',
      code: `import type { Renderer } from './render.js'
import { type Stats } from 'node:fs'
import type * as Domain from '@acme/domain'
export type View = Renderer | Stats | Domain.Order`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Pass_When_EffectAndCellTypesAreReferencedAnywhereInTheFile',
      code: `import { Array as Arr, Schema as S } from 'effect'
import * as Option from 'effect/Option'
import { Workflow } from '@systemfsoftware/effect-cell-types'
const firstOf = (xs: ReadonlyArray<number>) => Option.getOrElse(Arr.head(xs), () => 0)
export const decide = Workflow.make({ command: S.Number, decision: S.Number, error: S.Never, decide: firstOf })`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Pass_When_AWorkspaceBindingIsUsedOnlyAsASchema',
      code: `${SCHEMA_IMPORT}
import { Money, Sku } from '@acme/domain'
${NAMESPACE_IMPORT}
export const Line = S.Struct({ sku: Sku, price: S.optional(Money), items: S.Array(PI.Item) })
export class Order extends S.Class<Order>('Order')({ lines: S.Array(PI.Line), total: Money }) {}
export const parse = S.decodeUnknownSync(PI.Order)
export const isMoney = (value: unknown) => Money.is(value)
export const zero = () => PI.Money.make({ amount: 0 })
export const keys = Object.keys(Sku.fields)
export const annotated = PI.Sku.annotations({ title: 'sku' })
export const ast = Money.ast
export type Amount = typeof Money.Type | PI.Money
export const both = S.Union([PI.Money, Money as typeof Money])`,
      filename: SCHEMA,
    },
    {
      name: 'Should_Pass_When_ANamedNamespaceExportIsWalkedToTheEndOfItsChain',
      code: `${SCHEMA_IMPORT}
import { Mutant, Report } from '@acme/domain'
export const Row = S.Struct({ id: Mutant.MutantId, ms: S.optional(Report.NonNegativeFinite), rule: Mutant.Subsumed.fields.rule })
export const fresh = () => Mutant.Location.make({ line: 1 })`,
      filename: SCHEMA,
    },
    {
      name: 'Should_Pass_When_AConstFieldRecordOfWorkspaceSchemasIsSpreadIntoASchemaCall',
      code: `${SCHEMA_IMPORT}
import { Mutant } from '@acme/domain'
const rowFields = { id: Mutant.MutantId, tags: [Mutant.Tag] }
export const Row = S.Struct({ ...rowFields, name: S.String })
export const Rows = S.Array(S.Struct(rowFields))
export type RowFields = typeof rowFields`,
      filename: SCHEMA,
    },
    {
      name: 'Should_Pass_When_SchemaIsImportedFromTheEffectSchemaSubpath',
      code: `import * as Schema from 'effect/Schema'
${NAMESPACE_IMPORT}
export const Orders = Schema.Array(PI.Order)`,
      filename: SCHEMA,
    },
    {
      name: 'Should_Pass_When_AProvedKernelIsCalled',
      code: `import { add } from '@acme/kernel'
export const total = (a: number, b: number) => add(a, b)`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Ignore_When_TheReferenceSitsInAnInSourceTestBlock',
      code: `${NAMESPACE_IMPORT}
export const id = (n: number) => n
if (import.meta.vitest !== void 0) {
  const { it } = await import('vitest')
  it('formats', () => PI.format(id(1)))
}`,
      filename: SCHEMA,
    },
    {
      name: 'Should_Ignore_When_TheFileIsNotDecisionCode',
      code: `import { format } from './format.js'
import * as PI from '@acme/domain'
export const view = () => format(PI.render(import('node:fs')))`,
      filename: join(WORKSPACE, 'packages/app/src/view.ts'),
    },
    {
      name: 'Should_Ignore_When_TheDecisionFileSitsOutsideSrc',
      code: `import { format } from './format.js'
export const view = format`,
      filename: join(WORKSPACE, 'packages/app/tests/__fixtures__/view.workflow.ts'),
    },
    {
      name: 'Should_Pass_When_ADirectiveNamesOnlyAnotherRule',
      code: `// oxlint-disable-next-line no-console
export const x = 1`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Pass_When_ALegacyListedFileStillHasFindingsToCarry',
      code: `import { format } from './format.js'
export const view = format`,
      filename: join(WORKSPACE, 'packages/app/src/carried.workflow.ts'),
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_AWorkflowImportsAPlainModule',
      code: `import { formatTotal } from './format.js'
export const describe = (n: number) => formatTotal(n)`,
      filename: WORKFLOW,
      errors: [plainModule('./format.js')],
    },
    {
      name: 'Should_Report_When_ASchemaSideEffectImportsAPlainModule',
      code: `import './register.js'
export const x = 1`,
      filename: SCHEMA,
      errors: [plainModule('./register.js')],
    },
    {
      name: 'Should_Report_When_ASchemaFileCallsAWorkspaceFunction',
      code: `import { normalize } from '@acme/domain'
export const canonical = (s: string) => normalize(s)`,
      filename: SCHEMA,
      errors: [workspaceUse('normalize')],
    },
    {
      name: 'Should_Report_When_AWorkspaceNamespaceMemberIsPassedToANonSchemaCall',
      code: `import { Array as Arr } from 'effect'
${NAMESPACE_IMPORT}
export const render = (xs: ReadonlyArray<number>) => Arr.map(xs, PI.fn)`,
      filename: WORKFLOW,
      errors: [workspaceUse('PI')],
    },
    {
      name: 'Should_Report_When_AWorkspaceMemberIsDestructuredOrAliased',
      code: `${NAMESPACE_IMPORT}
import { Order } from '@acme/domain'
const { format } = PI
const make = PI.Order
const alias = Order
export const all = [format, make, alias]`,
      filename: WORKFLOW,
      errors: [workspaceUse('PI'), workspaceUse('PI'), workspaceUse('Order')],
    },
    {
      name: 'Should_Report_When_AFunctionOfANamedNamespaceExportIsCalled',
      code: `import { Mutant } from '@acme/domain'
export const firstDuplicate = (ids: ReadonlyArray<string>) => Mutant.duplicatedValue(ids)`,
      filename: WORKFLOW,
      errors: [workspaceUse('Mutant')],
    },
    {
      name: 'Should_Report_When_AFieldRecordOfWorkspaceSchemasEscapesToANonSchemaUse',
      code: `${SCHEMA_IMPORT}
import { Mutant } from '@acme/domain'
const rowFields = { id: Mutant.MutantId }
export const Row = S.Struct(rowFields)
export const keys = Object.keys(rowFields)`,
      filename: SCHEMA,
      errors: [workspaceUse('Mutant')],
    },
    {
      name: 'Should_Report_When_AWorkspaceSchemaIsPipedOrUsedBare',
      code: `${SCHEMA_IMPORT}
${NAMESPACE_IMPORT}
export const Branded = PI.Sku.pipe(S.brand('Sku'))
export const Whole = S.Struct(PI)`,
      filename: SCHEMA,
      errors: [workspaceUse('PI'), workspaceUse('PI')],
    },
    {
      name: 'Should_Report_When_DecisionCodeImportsAForeignPackage',
      code: `import { readFileSync } from 'node:fs'
import { Ledger } from '@acme/unlisted'
import '@acme/domain'
export const read = () => [readFileSync, Ledger]`,
      filename: WORKFLOW,
      errors: [
        foreignSource('node:fs'),
        foreignSource('@acme/unlisted'),
        foreignSource('@acme/domain', 'a side-effect import of @acme/domain'),
      ],
    },
    {
      name: 'Should_Report_When_DecisionCodeLoadsAModuleAtRunTime',
      code: `export const load = () => import('./order.schema.js')
export const legacy = () => require('./order.schema.js')`,
      filename: WORKFLOW,
      errors: [dynamicImport('an import() expression', 'import()'), dynamicImport('a require() call', 'require()')],
    },
    {
      name: 'Should_Report_When_DecisionCodeReExports',
      code: `export { Order } from './order.schema.js'
export * from '@acme/domain'
export type { View } from './view.js'`,
      filename: SCHEMA,
      errors: [reExport('./order.schema.js'), reExport('@acme/domain')],
    },
    {
      name: 'Should_Report_When_AnInlineDirectiveWouldSilenceTheRule',
      code: `// oxlint-disable-next-line @systemfsoftware/oxlint-plugin-dmmf-workflow/decision-code-imports
import { formatTotal } from './format.js'
/* eslint-disable */
export const describe = formatTotal`,
      filename: WORKFLOW,
      errors: [
        disableDirective('oxlint-disable-next-line @systemfsoftware/oxlint-plugin-dmmf-workflow/decision-code-imports'),
        disableDirective('eslint-disable'),
        plainModule('./format.js'),
      ],
    },
    {
      name: 'Should_Report_When_ALegacyEntryHasNothingLeftToCarry',
      code: `import { Order } from './order.schema.js'
export const decide = Order`,
      filename: join(WORKSPACE, 'packages/app/src/cleared.workflow.ts'),
      errors: [
        finding(
          'staleLegacyEntry',
          'a stale legacy entry',
          STALE_LEGACY_ACTUAL.replace('{{path}}', 'packages/app/src/cleared.workflow.ts'),
          STALE_LEGACY_FIX.replace('{{path}}', 'packages/app/src/cleared.workflow.ts'),
        ),
      ],
    },
    {
      name: 'Should_Report_When_TheManifestIsNotJson',
      code: 'export const x = 1',
      filename: join(BROKEN_WORKSPACE, 'packages/app/src/order.schema.ts'),
      errors: [{ messageId: 'manifestUnreadable' }],
    },
    {
      name: 'Should_Report_When_AKernelEntryNamesNoProof',
      code: 'export const x = 1',
      filename: join(PROOFLESS_WORKSPACE, 'packages/app/src/order.schema.ts'),
      errors: [
        finding(
          'manifestUnreadable',
          'an unreadable decision-code.json',
          MANIFEST_UNREADABLE_ACTUAL.replace('{{path}}', join(PROOFLESS_WORKSPACE, 'decision-code.json')).replace(
            '{{reason}}',
            'the "kernels" entry "@acme/kernel" names no "proof" target',
          ),
          MANIFEST_UNREADABLE_FIX,
        ),
      ],
    },
  ],
})
