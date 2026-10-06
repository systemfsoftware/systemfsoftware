import { fixtureLedgerLayer, registry } from '@systemfsoftware/contract-fixtures'
import { Differential } from '@systemfsoftware/differential-spec'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { Contract } from '@systemfsoftware/effect-contract'
import { type Capabilities, groupOf, layerOf } from '@systemfsoftware/effect-contract/rpc'
import { directClient, parity, validInputs } from '@systemfsoftware/effect-contract/testing'
import { Effect, Equal, Exit, Layer, Schema } from 'effect'
import { RpcTest } from 'effect/rpc'
import * as fc from 'fast-check'
import { operationsEnvironment } from './__fixtures__/operations.fixture.js'
import { anonymous, rpcCall, rpcCensus, surfaceOf } from './__fixtures__/surface.fixture.js'

const runBudget = 20

const environment = Layer.merge(operationsEnvironment, fixtureLedgerLayer)

const buildInProcess = <R>(target: Capabilities<R>) =>
  RpcTest.makeClient(groupOf(target)).pipe(Effect.provide(layerOf(target)))

parity(
  registry,
  surfaceOf({ registry, build: buildInProcess }),
  { provide: environment, runBudget },
)

const dieCell: Cell.Cell<Contract.Invocation, Contract.Rejected, never, never> = Cell.fromEffect(
  Effect.die(new Error('handler defect')),
)

const dyingRegistry = { getBalance: Contract.implement(registry.getBalance.contract, dieCell) }
const dyingSurface = surfaceOf<never, never>({ registry: dyingRegistry, build: buildInProcess })

const outcomeOf = (exit: Exit.Exit<Schema.Json, Contract.Unavailable>): string =>
  Exit.isSuccess(exit) ? 'success' : Exit.hasDies(exit) ? 'die' : 'fail'

Differential.compare({
  name: 'a handler defect answers Die on the client, never a typed error',
  reference: () => Effect.succeed('die'),
  candidate: (input: Schema.Json) =>
    Effect.map(Effect.exit(dyingSurface.call('getBalance', { input, principal: anonymous })), outcomeOf),
})
  .on(validInputs(registry.getBalance.contract.input), { runBudget })
  .assert((expected, actual) => expected === actual)

const direct = directClient({ registry, provide: environment })

const samePair = (expected: readonly Schema.Json[], actual: readonly Schema.Json[]): boolean =>
  Equal.equals(expected, actual)

type BalanceAndTopUp = readonly [Schema.Json, Schema.Json]

Differential.compare({
  name: 'two concurrent calls on one client answer their own results',
  reference: ([balance, topUp]: BalanceAndTopUp) =>
    Effect.all([
      direct.call('getBalance', { input: balance, principal: anonymous }),
      direct.call('topUp', { input: topUp, principal: anonymous }),
    ]).pipe(Effect.provide(environment)),
  candidate: ([balance, topUp]: BalanceAndTopUp) =>
    Effect.provide(
      Effect.scoped(
        Effect.gen(function*() {
          const rpc = yield* buildInProcess(registry)
          return yield* Effect.all(
            [
              rpcCensus(
                registry.getBalance.contract,
                rpcCall({ rpc, name: 'getBalance', invocation: { input: balance, principal: anonymous } }),
              ),
              rpcCensus(
                registry.topUp.contract,
                rpcCall({ rpc, name: 'topUp', invocation: { input: topUp, principal: anonymous } }),
              ),
            ],
            { concurrency: 'unbounded' },
          )
        }),
      ),
      environment,
    ),
})
  .on(
    fc.tuple(validInputs(registry.getBalance.contract.input), validInputs(registry.topUp.contract.input)),
    { runBudget },
  )
  .assert(samePair)
