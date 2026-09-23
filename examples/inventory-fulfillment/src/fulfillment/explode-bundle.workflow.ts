import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { KitDefinition, SkuId } from '../inventory/inventory.schema.js'
import { OrderLine } from './order.schema.js'

const ExplodeDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/example-inventory-fulfillment/ExplodeBundleDecision',
)
type ExplodeDecisionTypeId = typeof ExplodeDecisionTypeId

const ComponentQuantity = S.Int.pipe(S.check(S.isGreaterThan(0)))

export class ComponentDemand extends S.Class<ComponentDemand>('ComponentDemand')({
  sku: SkuId,
  quantity: ComponentQuantity,
}) {}

export class BundleExploded extends S.TaggedClass<BundleExploded>()('BundleExploded', {
  components: S.Array(ComponentDemand),
}) {
  readonly [ExplodeDecisionTypeId] = ExplodeDecisionTypeId
}

export class NothingToExplode extends S.TaggedClass<NothingToExplode>()('NothingToExplode', {
  components: S.Array(ComponentDemand),
}) {
  readonly [ExplodeDecisionTypeId] = ExplodeDecisionTypeId
}

export class ExplodeBundleCommand extends S.Class<ExplodeBundleCommand>('ExplodeBundleCommand')({
  lines: S.Array(OrderLine),
  kits: S.Array(KitDefinition),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const scaledDemands = (kit: KitDefinition, factor: number): readonly ComponentDemand[] =>
  Arr.map(
    kit.components,
    (component) => new ComponentDemand({ sku: component.sku, quantity: component.quantity * factor }),
  )

const componentsOfLine = (kits: readonly KitDefinition[], line: OrderLine): readonly ComponentDemand[] =>
  Match.value(Arr.findFirst(kits, (kit) => kit.kitSku === line.sku)).pipe(
    Match.tag('Some', (found) => scaledDemands(found.value, line.quantity)),
    Match.tag('None', () => Arr.of(new ComponentDemand({ sku: line.sku, quantity: line.quantity }))),
    Match.exhaustive,
  )

const explodedComponents = (command: ExplodeBundleCommand): readonly ComponentDemand[] =>
  Arr.flatMap(command.lines, (line) => componentsOfLine(command.kits, line))

const hasKitLine = (command: ExplodeBundleCommand): boolean =>
  Arr.some(command.lines, (line) => Arr.some(command.kits, (kit) => kit.kitSku === line.sku))

export const explodeBundle = Workflow.make({
  command: ExplodeBundleCommand,
  decision: S.Union([BundleExploded, NothingToExplode]),
  error: S.Never,
  decide: (command): Result.Result<BundleExploded | NothingToExplode, never> =>
    Match.value(hasKitLine(command)).pipe(
      Match.when(true, () => Result.succeed(new BundleExploded({ components: explodedComponents(command) }))),
      Match.when(false, () => Result.succeed(new NothingToExplode({ components: explodedComponents(command) }))),
      Match.exhaustive,
    ),
})
