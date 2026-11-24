import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
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
  SIDE_EFFECT_IMPORT_ACTUAL,
  SIDE_EFFECT_IMPORT_FIX,
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
const MISSING_PROOF_WORKSPACE = await mkdtemp(join(tmpdir(), 'decision-code-missing-proof-'))
const LEGACY_WORKSPACE = await mkdtemp(join(tmpdir(), 'decision-code-legacy-'))
const LINKED_PROOF_WORKSPACE = await mkdtemp(join(tmpdir(), 'decision-code-linked-proof-'))
const OUTSIDE = await mkdtemp(join(tmpdir(), 'decision-code-outside-'))

vitest.afterAll(async () => {
  await Promise.all(
    [
      WORKSPACE,
      BROKEN_WORKSPACE,
      PROOFLESS_WORKSPACE,
      MISSING_PROOF_WORKSPACE,
      LEGACY_WORKSPACE,
      LINKED_PROOF_WORKSPACE,
      OUTSIDE,
    ].map((root) => rm(root, { recursive: true, force: true })),
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

const KERNEL_PROOF = 'packages/kernel/src/__tests__/kernel.property.test.ts'

await plant(WORKSPACE, {
  ...workspaceFiles(JSON.stringify({ kernels: [{ package: '@acme/kernel', proof: KERNEL_PROOF }] })),
  [KERNEL_PROOF]: '',
  'packages/app/src/order.schema.ts': '',
  'packages/app/src/place-order.workflow.ts': '',
  'packages/app/src/next.workflow.ts': '',
  'packages/app/src/money/money.schema.ts': '',
  'packages/app/scripts/seed.schema.ts': '',
  'packages/app/src/dir.schema/index.ts': '',
  'packages/domain/src/price.schema.ts': '',
  'test-utils/fixture.schema.ts': '',
})
await plant(WORKSPACE, { 'outside-src/impure.ts': 'export const format = (n: number) => String(n)' })
await symlink(join(WORKSPACE, 'outside-src/impure.ts'), join(WORKSPACE, 'packages/app/src/linked.schema.ts'))
await plant(OUTSIDE, { 'proof.test.ts': '' })
await plant(
  LINKED_PROOF_WORKSPACE,
  workspaceFiles(JSON.stringify({ kernels: [{ package: '@acme/kernel', proof: 'packages/kernel/proof.test.ts' }] })),
)
await mkdir(join(LINKED_PROOF_WORKSPACE, 'packages/kernel'), { recursive: true })
await symlink(join(OUTSIDE, 'proof.test.ts'), join(LINKED_PROOF_WORKSPACE, 'packages/kernel/proof.test.ts'))
await plant(
  LEGACY_WORKSPACE,
  workspaceFiles(JSON.stringify({ legacy: ['packages/app/src/order.schema.ts'], kernels: [] })),
)
await plant(
  MISSING_PROOF_WORKSPACE,
  workspaceFiles(JSON.stringify({ kernels: [{ package: '@acme/kernel', proof: KERNEL_PROOF }] })),
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

const sideEffectImport = (source: string) =>
  finding(
    'sideEffectImport',
    `a side-effect import of ${source}`,
    SIDE_EFFECT_IMPORT_ACTUAL.replace('{{source}}', source),
    SIDE_EFFECT_IMPORT_FIX.replace('{{source}}', source),
  )

const requireReference = dynamicImport('a reference to require', 'require')

const unreadable = (root: string, reason: string) =>
  finding(
    'manifestUnreadable',
    'an unreadable decision-code.json',
    MANIFEST_UNREADABLE_ACTUAL.replace('{{path}}', join(root, 'decision-code.json')).replace('{{reason}}', reason),
    MANIFEST_UNREADABLE_FIX,
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
      code: `import { Money } from './money/money.schema.ts'
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
      name: 'Should_Pass_When_AWorkspaceSchemaIsReadThroughItsEffect4Members',
      code: `${SCHEMA_IMPORT}
import { Fee, Kind, Money, Side, Sku } from '@acme/domain'
const nonEmpty = S.isMinLength(1)
export const Price = Money.annotate({ description: 'a price' })
export const Code = Sku.check(nonEmpty)
export const Kinds = S.Literals(Kind.literals)
export const doubled = (n: number) => n * Fee.literal
export const empty = (side: Side) => Side.guards.Empty(side)
export const label = (side: Side) => Side.match(side, { Empty: () => 'none', Full: () => 'some' })
export const full = () => Side.cases.Full.make({})`,
      filename: SCHEMA,
    },
    {
      name: 'Should_Pass_When_AWorkspaceSchemaIsPipedThroughSchemaCombinatorsOnly',
      code: `${SCHEMA_IMPORT}
${NAMESPACE_IMPORT}
export const Items = PI.Item.pipe(S.toType, S.Array)
export const Checked = PI.Item.pipe(S.check(S.isMinLength(1)))`,
      filename: SCHEMA,
    },
    {
      name: 'Should_Pass_When_WorkflowMakeTakesWorkspaceSchemasInItsSchemaSlots',
      code: `${SCHEMA_IMPORT}
import { Workflow } from '@systemfsoftware/effect-cell-types'
import { PlaceOrder, Refused } from '@acme/domain'
import { Placed, decidePlace } from './order.schema.js'
export const placeOrder = Workflow.make({ command: PlaceOrder, decision: Placed, error: Refused, decide: decidePlace })`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Pass_When_WorkflowMakeOptionsAreWrappedOrReachedThroughANamespace',
      code: `import * as Cell from '@systemfsoftware/effect-cell-types'
import { Workflow } from '@systemfsoftware/effect-cell-types'
import { PlaceOrder, Refused } from '@acme/domain'
import { Placed, decidePlace } from './order.schema.js'
export const viaNamespace = Cell.Workflow.make({ command: PlaceOrder, decision: Placed, error: Refused, decide: decidePlace })
export const checked = Workflow.make({ command: PlaceOrder, error: Refused, decide: decidePlace } satisfies object)`,
      filename: WORKFLOW,
    },
    {
      name: 'Should_Pass_When_AnAnnotatedWorkspaceSchemaIsUsedAsASchema',
      code: `${SCHEMA_IMPORT}
${NAMESPACE_IMPORT}
export const Price = PI.Money.annotate({ description: 'price' }).pipe(S.Array)
export const zero = () => PI.Money.check(S.isGreaterThan(0)).make({ amount: 1 })
export const Row = S.Struct({ price: PI.Money.annotate({ description: 'price' }) })
const Described = PI.Money.annotate({ description: 'price' })
export const Line = S.Struct({ price: Described, prices: S.Array(Described) })`,
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
const rowFields = { id: Mutant.MutantId, tags: S.Array(Mutant.Tag) }
export const Row = S.Struct({ ...rowFields, name: S.String })
export const Rows = S.Array(S.Struct(rowFields))
export type RowFields = typeof rowFields`,
      filename: SCHEMA,
    },
    {
      name: 'Should_Pass_When_ANamedSchemaMemberOfEffectSchemaIsTheCallee',
      code: `import { Array as SArray, Struct } from 'effect/Schema'
${NAMESPACE_IMPORT}
export const Line = Struct({ items: SArray(PI.Item) })`,
      filename: SCHEMA,
    },
    {
      name: 'Should_Pass_When_BothBranchesOfAConditionalAreSchemaUses',
      code: `${SCHEMA_IMPORT}
${NAMESPACE_IMPORT}
import { Money } from '@acme/domain'
const strict = true
export const Line = S.Struct({ price: strict ? PI.Price : Money, items: S.Array(strict ? PI.Item : PI.LooseItem) })`,
      filename: SCHEMA,
    },
    {
      name: 'Should_Pass_When_WorkspaceSchemasFillTheFieldsAndMembersOfSchemaCombinators',
      code: `${SCHEMA_IMPORT}
${NAMESPACE_IMPORT}
import { Money } from '@acme/domain'
export const Line = S.TaggedStruct('Line', { sku: PI.Sku, price: Money })
export class Failed extends S.TaggedError<Failed>()('Failed', { cause: PI.Cause }) {}
export const Pair = S.Tuple([PI.Sku, Money])
const members = [PI.Card, PI.Cash]
export const Payment = S.Union(members)
const base = { sku: PI.Sku }
const extended = { ...base, price: Money } as const
export const Priced = S.Struct(extended)
export const Target = S.String.pipe(S.decodeTo(PI.Sku))
export const ById = S.Record(S.String, PI.Sku)
export const Leg = S.TaggedUnion({ Measured: { wallMs: PI.Millis }, Skipped: {} })`,
      filename: SCHEMA,
    },
    {
      name: 'Should_Pass_When_WorkspaceSchemasFillTheSchemaArgumentsOfEffectSchemaCombinators',
      code: `${SCHEMA_IMPORT}
${NAMESPACE_IMPORT}
export const Orders = S.NonEmptyArray(PI.Order)
export const Maybe = S.Option(PI.Order)
export const Nullable = S.NullishOr(S.UndefinedOr(S.NullOr(PI.Order)))
export const Line = S.Struct({ a: S.optional(PI.Order), b: S.optionalKey(PI.Order) })
export const ByKey = S.Record(PI.Key, PI.Order)
export const Lookup = S.ReadonlyMap(PI.Key, PI.Order)
export const Rows = S.mutable(S.Array(PI.Order))
export const Branded = S.brand('Id')(PI.Order)
export const parse = S.decodeUnknownSync(PI.Order)`,
      filename: SCHEMA,
    },
    {
      name: 'Should_Pass_When_ExtendToTakesWorkspaceFields',
      code: `${SCHEMA_IMPORT}
${NAMESPACE_IMPORT}
const Base = S.Struct({ a: S.Number })
export const Extended = Base.pipe(S.extendTo(PI.Other, { total: (s) => s.a }))
export const Inline = Base.pipe(S.extendTo({ total: PI.Money }, { total: (s) => s.a }))
export const Revealed = S.revealCodec(PI.Order)`,
      filename: SCHEMA,
    },
    {
      name: 'Should_Pass_When_ASuspendThunkReturnsAWorkspaceSchema',
      code: `${SCHEMA_IMPORT}
${NAMESPACE_IMPORT}
export const Lazy = S.suspend(() => PI.Order)
export const Typed = S.suspend((): S.Codec<PI.Order> => PI.Order)`,
      filename: SCHEMA,
    },
    {
      name: 'Should_Pass_When_TupleWithRestTakesWorkspaceSchemas',
      code: `${SCHEMA_IMPORT}
${NAMESPACE_IMPORT}
export const Rest = S.TupleWithRest(PI.Pair, [PI.Order, PI.Line])
export const Inline = S.TupleWithRest(S.Tuple([PI.Order]), [PI.Line])`,
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
  ],
  invalid: [
    {
      name: 'Should_Report_When_AnEffect4MemberCallArgumentUsesAWorkspaceFunction',
      code: `${SCHEMA_IMPORT}
${NAMESPACE_IMPORT}
export const Price = PI.Money.annotate({ default: () => PI.makeDefault() })
export const Code = PI.Sku.check(PI.isKnownSku)`,
      filename: SCHEMA,
      errors: [workspaceUse('PI'), workspaceUse('PI')],
    },
    {
      name: 'Should_Report_When_AWorkspaceSchemaIsPipedThroughANonSchemaFunction',
      code: `${SCHEMA_IMPORT}
${NAMESPACE_IMPORT}
const register = <A>(a: A) => a
export const Items = PI.Item.pipe(S.toType, register)`,
      filename: SCHEMA,
      errors: [workspaceUse('PI')],
    },
    {
      name: 'Should_Report_When_WorkflowMakeTakesAWorkspaceFunctionOutsideItsSchemaSlots',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import { PlaceOrder, decidePlace } from '@acme/domain'
export const placeOrder = Workflow.make({ command: PlaceOrder, decide: decidePlace })`,
      filename: WORKFLOW,
      errors: [workspaceUse('decidePlace')],
    },
    {
      name: 'Should_Report_When_AMakeCallIsNotFromCellTypes',
      code: `import { Workflow } from './order.schema.js'
import { PlaceOrder } from '@acme/domain'
export const placeOrder = Workflow.make({ command: PlaceOrder })`,
      filename: WORKFLOW,
      errors: [workspaceUse('PlaceOrder')],
    },
    {
      name: 'Should_Report_When_AWorkspaceBindingIsPassedToALocalFunction',
      code: `${SCHEMA_IMPORT}
${NAMESPACE_IMPORT}
const id = <T>(x: T): T => x
const columnsOf = (instant: S.Top) => ({ at: instant })
export const leaked = id(PI.impureFunction)
export const Row = S.Struct(columnsOf(PI.Instant))`,
      filename: SCHEMA,
      errors: [workspaceUse('PI'), workspaceUse('PI')],
    },
    {
      name: 'Should_Report_When_AnAnnotatedOrPipedWorkspaceSchemaIsPipedOnThroughANonSchemaFunction',
      code: `${SCHEMA_IMPORT}
${NAMESPACE_IMPORT}
const register = <A>(a: A) => a
export const Items = PI.Item.pipe(S.toType).pipe(register)
export const Price = PI.Money.annotate({ description: 'price' }).pipe(register)
export const Read = PI.Money.annotate`,
      filename: SCHEMA,
      errors: [workspaceUse('PI'), workspaceUse('PI'), workspaceUse('PI')],
    },
    {
      name: 'Should_Report_When_AChainedWorkspaceSchemaLeavesASchemaPosition',
      code: `${SCHEMA_IMPORT}
${NAMESPACE_IMPORT}
const id = <T>(x: T): T => x
const columnsOf = (instant: S.Top) => ({ at: instant })
const register = <A>(a: A) => a
export const leaked = id(PI.Money.annotate({ description: 'price' }))
export const Row = S.Struct(columnsOf(PI.Instant.pipe(S.toType)))
export const wrapped = (PI.Money.annotate({ description: 'price' }) satisfies S.Top).pipe(register)
const aliased = PI.Money.annotate({ description: 'price' })
export const indirect = aliased.pipe(register)`,
      filename: SCHEMA,
      errors: [workspaceUse('PI'), workspaceUse('PI'), workspaceUse('PI'), workspaceUse('PI')],
    },
    {
      name: 'Should_Report_When_AWorkspaceSchemaIsPassedToAWorkspaceFunction',
      code: `${SCHEMA_IMPORT}
${NAMESPACE_IMPORT}
export const Row = S.Struct(PI.columnsOf(PI.Instant))`,
      filename: SCHEMA,
      errors: [workspaceUse('PI'), workspaceUse('PI')],
    },
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
      name: 'Should_Report_When_AWorkspaceNamespaceIsUsedBare',
      code: `${SCHEMA_IMPORT}
${NAMESPACE_IMPORT}
export const Whole = S.Struct(PI)`,
      filename: SCHEMA,
      errors: [workspaceUse('PI')],
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
        sideEffectImport('@acme/domain'),
      ],
    },
    {
      name: 'Should_Report_When_DecisionCodeLoadsAModuleAtRunTime',
      code: `export const load = () => import('./order.schema.js')
export const legacy = () => require('./order.schema.js')`,
      filename: WORKFLOW,
      errors: [dynamicImport('an import() expression', 'import()'), requireReference],
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
      name: 'Should_Report_When_ASchemaSuffixedImportResolvesOutsideThePackageSrc',
      code: `import { Seed } from '../scripts/seed.schema.js'
import { Fixture } from '../../../test-utils/fixture.schema.js'
import { Price } from '../../domain/src/price.schema.js'
export const all = [Seed, Fixture, Price]`,
      filename: WORKFLOW,
      errors: [
        plainModule('../scripts/seed.schema.js'),
        plainModule('../../../test-utils/fixture.schema.js'),
        plainModule('../../domain/src/price.schema.js'),
      ],
    },
    {
      name: 'Should_Report_When_ASchemaSuffixedImportResolvesToADirectoryOrNothing',
      code: `import { Dir } from './dir.schema.js'
import { Gone } from './missing.workflow.js'
export const all = [Dir, Gone]`,
      filename: WORKFLOW,
      errors: [plainModule('./dir.schema.js'), plainModule('./missing.workflow.js')],
    },
    {
      name: 'Should_Report_When_RequireIsReferencedWithoutADirectCall',
      code: `export const a = (0, require)('./order.schema.js')
export const b = globalThis.require
export const c = Reflect.apply(require, undefined, ['x'])
export const d = globalThis['require']`,
      filename: WORKFLOW,
      errors: [requireReference, requireReference, requireReference, requireReference],
    },
    {
      name: 'Should_Report_When_AnImportEqualsRequireSitsInsideAModuleDeclaration',
      code: `declare module 'loader' {
  import fs = require('node:fs')
  export const read: typeof fs
}
export const x = 1`,
      filename: WORKFLOW,
      errors: [dynamicImport('an import = require(...) declaration', 'import = require(...)')],
    },
    {
      name: 'Should_Report_When_TheManifestStillCarriesALegacyList',
      code: 'export const x = 1',
      filename: join(LEGACY_WORKSPACE, 'packages/app/src/order.schema.ts'),
      errors: [unreadable(LEGACY_WORKSPACE, 'the top level has the unknown key "legacy"')],
    },
    {
      name: 'Should_Report_When_AKernelProofNamesAFileThatDoesNotExist',
      code: 'export const x = 1',
      filename: join(MISSING_PROOF_WORKSPACE, 'packages/app/src/order.schema.ts'),
      errors: [
        unreadable(
          MISSING_PROOF_WORKSPACE,
          `the "kernels" entry "@acme/kernel" names the proof target "${KERNEL_PROOF}", which is not a file in the repo`,
        ),
      ],
    },
    {
      name: 'Should_Report_When_ASchemaSuffixedImportIsASymlinkOutOfTheSrc',
      code: `import { format } from './linked.schema.js'
export const view = format`,
      filename: WORKFLOW,
      errors: [plainModule('./linked.schema.js')],
    },
    {
      name: 'Should_Report_When_AKernelProofIsASymlinkOutOfTheRepo',
      code: 'export const x = 1',
      filename: join(LINKED_PROOF_WORKSPACE, 'packages/app/src/order.schema.ts'),
      errors: [
        unreadable(
          LINKED_PROOF_WORKSPACE,
          'the "kernels" entry "@acme/kernel" names the proof target "packages/kernel/proof.test.ts", which is not a file in the repo',
        ),
      ],
    },
    {
      name: 'Should_Report_When_AWorkspaceBindingRidesInSchemaAnnotationsOrOptions',
      code: `${SCHEMA_IMPORT}
${NAMESPACE_IMPORT}
export const Shown = S.String.annotations({ formatter: PI.format })
export const Defaulted = S.String.annotations({ default: PI.makeDefault })
export const Checked = S.String.check(S.makeFilter(PI.isValid))
export const Decoded = S.String.pipe(S.decodeTo(PI.Sku, { decode: PI.parse, encode: PI.print }))
export class Titled extends S.Class<Titled>('Titled')({ a: S.String }, { title: PI.title }) {}
export const Leg = S.TaggedUnion({ Measured: { wallMs: { nested: PI.Millis } } })`,
      filename: SCHEMA,
      errors: [
        workspaceUse('PI'),
        workspaceUse('PI'),
        workspaceUse('PI'),
        workspaceUse('PI'),
        workspaceUse('PI'),
        workspaceUse('PI'),
        workspaceUse('PI'),
      ],
    },
    {
      name: 'Should_Report_When_AWorkspaceBindingIsAnArgumentNoEffectSchemaCombinatorTakesAsASchema',
      code: `${SCHEMA_IMPORT}
${NAMESPACE_IMPORT}
export const Group = S.makeFilterGroup(PI.checks)
export const Payment = S.Union([PI.Card, PI.Cash], PI.unionOptions)
export const Line = S.Struct({ sku: PI.Sku }, PI.structOptions)
export const Titled = S.Struct({ sku: PI.Sku }, { title: PI.title })
export const Widget = S.instanceOf(PI.Widget)
export const Extra = S.TupleWithRest(PI.Pair, [PI.Order], PI.extra)
export const Lazy = S.suspend(PI.thunk)
export const Late = S.suspend(async () => PI.Order)
export const Called = S.suspend((input) => PI.Order)`,
      filename: SCHEMA,
      errors: [
        workspaceUse('PI'),
        workspaceUse('PI'),
        workspaceUse('PI'),
        workspaceUse('PI'),
        workspaceUse('PI'),
        workspaceUse('PI'),
        workspaceUse('PI'),
        workspaceUse('PI'),
        workspaceUse('PI'),
      ],
    },
    {
      name: 'Should_Report_When_AWorkspaceValueIsALiteralATransformationOrAnUnknownCombinatorArgument',
      code: `${SCHEMA_IMPORT}
${NAMESPACE_IMPORT}
export const Target = S.String.pipe(S.decodeTo(PI.From, PI.To))
export const Source = S.String.pipe(S.encodeTo(PI.From, PI.To))
export const Constant = S.Literal(PI.someConstant)
export const Constants = S.Literals([PI.someConstant])
export const Colors = S.Enum(PI.Colors)
export const Cast = S.asSchema(PI.Order)`,
      filename: SCHEMA,
      errors: [
        workspaceUse('PI'),
        workspaceUse('PI'),
        workspaceUse('PI'),
        workspaceUse('PI'),
        workspaceUse('PI'),
        workspaceUse('PI'),
      ],
    },
    {
      name: 'Should_Report_When_AWorkspaceBindingSitsInANestedPlainObjectOfAStruct',
      code: `${SCHEMA_IMPORT}
${NAMESPACE_IMPORT}
export const Meta = S.Struct({ meta: { fn: PI.format } })
const helpers = { fn: PI.format }
export const keys = S.Struct({ ...helpers, other: { more: helpers } })`,
      filename: SCHEMA,
      errors: [workspaceUse('PI'), workspaceUse('PI')],
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
