import { Effect } from 'effect'
import type { Duration } from 'effect'

import { Conformance } from '@systemfsoftware/conformance-spec'

import { type Disk, diskOver, type DiskState, freshDisk } from './Disk.js'
import { ruleFrom } from './Rules.js'

export interface Order {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly amount: number
}

export interface InsufficientFunds {
  readonly _tag: 'InsufficientFunds'
}

export interface Payments {
  readonly balance: (account: string) => Effect.Effect<number>
  readonly debit: (account: string, amount: number, key?: string) => Effect.Effect<void, InsufficientFunds>
  readonly credit: (account: string, amount: number, key?: string) => Effect.Effect<void>
}

export const transferOrder: Order = { id: 't1', from: 'a', to: 'b', amount: 30 }

export const transferStopWithin: Duration.Input = '2 seconds'

const answering = '10 millis'

const transferPrefix = 'order:'

export interface TransferWorld {
  readonly balances: Map<string, number>
  readonly keyed: Map<string, 'ok' | 'insufficient'>
  readonly disk: DiskState
  readonly opening: number
}

export const transferWorldOf = (opening: number): Effect.Effect<TransferWorld> =>
  Effect.sync(() => ({
    balances: new Map([['a', opening], ['b', 0]]),
    keyed: new Map(),
    disk: freshDisk(),
    opening,
  }))

const balanceAt = (world: TransferWorld, account: string): number => world.balances.get(account) ?? 0

const moved = (world: TransferWorld, account: string, by: number): void => {
  world.balances.set(account, balanceAt(world, account) + by)
}

const remote = <A>(apply: () => A): Effect.Effect<A> =>
  Effect.flatMap(Effect.sync(apply), (answered) => Effect.as(Effect.sleep(answering), answered))

type Outcome = 'ok' | 'insufficient'

const seenResult = (world: TransferWorld, key: string | undefined): Outcome | undefined =>
  key === undefined ? undefined : world.keyed.get(key)

const recordedResult = (world: TransferWorld, key: string | undefined, result: Outcome): Outcome => {
  if (key !== undefined) world.keyed.set(key, result)
  return result
}

const keyedOnce = (world: TransferWorld, key: string | undefined, apply: () => Outcome): Outcome =>
  recordedResult(world, key, seenResult(world, key) ?? apply())

const debited = (world: TransferWorld, account: string, amount: number): Outcome => {
  moved(world, account, -amount)
  return 'ok'
}

const credited = (world: TransferWorld, account: string, amount: number): Outcome => {
  moved(world, account, amount)
  return 'ok'
}

const paymentsOver = (world: TransferWorld): Payments => ({
  balance: (account) => remote(() => balanceAt(world, account)),
  debit: (account, amount, key) =>
    Effect.flatMap(
      remote(() =>
        keyedOnce(
          world,
          key,
          () => (balanceAt(world, account) < amount ? 'insufficient' : debited(world, account, amount)),
        )
      ),
      (result) => (result === 'ok' ? Effect.void : Effect.fail({ _tag: 'InsufficientFunds' } as const)),
    ),
  credit: (account, amount, key) =>
    Effect.asVoid(remote(() => keyedOnce(world, key, () => credited(world, account, amount)))),
})

const RECORDED_PLANS: Readonly<Record<string, 'move' | 'refuse'>> = { move: 'move', refuse: 'refuse' }

const recordedPlan = (text: string | undefined): 'move' | 'refuse' | undefined =>
  text === undefined ? undefined : RECORDED_PLANS[text]

const decideFromBalance = (world: TransferWorld): Effect.Effect<'move' | 'refuse'> =>
  Effect.map(
    paymentsOver(world).balance(transferOrder.from),
    (balance) => balance >= transferOrder.amount ? ('move' as const) : ('refuse' as const),
  )

const planWhenUnrecorded = (
  world: TransferWorld,
  plan: 'move' | 'refuse' | undefined,
): Effect.Effect<'move' | 'refuse'> => (plan === undefined ? decideFromBalance(world) : Effect.succeed(plan))

const planOf = (world: TransferWorld, recorded: string | undefined): Effect.Effect<'move' | 'refuse'> =>
  planWhenUnrecorded(world, recordedPlan(recorded))

const writeWhenUnrecorded = (
  disk: Disk,
  at: string,
  plan: 'move' | 'refuse',
  recorded: string | undefined,
): Effect.Effect<void> => (recorded === undefined ? disk.write(at, plan) : Effect.void)

const keyedStep = (step: string): string => `${transferOrder.id}:${step}`

const movedAndCredited = (world: TransferWorld): Effect.Effect<'done' | 'refused'> =>
  Effect.gen(function*() {
    const payments = paymentsOver(world)
    yield* payments.debit(transferOrder.from, transferOrder.amount, keyedStep('debit')).pipe(Effect.orDie)
    yield* payments.credit(transferOrder.to, transferOrder.amount, keyedStep('credit'))
    return 'done' as const
  })

const actedOn = (world: TransferWorld, plan: 'move' | 'refuse'): Effect.Effect<'done' | 'refused'> =>
  plan === 'refuse' ? Effect.succeed('refused' as const) : movedAndCredited(world)

export type TransferImplementation = (world: TransferWorld) => Effect.Effect<'done' | 'refused'>

/** The correct transfer: the decision is recorded before anything acts, and every call carries a key. */
export const recordsDecision: TransferImplementation = (world) =>
  Effect.gen(function*() {
    const disk = diskOver(world.disk)
    const at = `${transferPrefix}${transferOrder.id}`
    const recorded = yield* disk.read(at)
    const plan = yield* planOf(world, recorded)
    yield* writeWhenUnrecorded(disk, at, plan, recorded)
    return yield* actedOn(world, plan)
  })

/** Wrong: keyed calls, but the decision is re-made from the balance on every start. */
export const rechecksBalance: TransferImplementation = (world) =>
  Effect.flatMap(decideFromBalance(world), (plan) => actedOn(world, plan))

/** Wrong: the receiver is credited without the sender ever being debited. */
export const creditsWithoutDebiting: TransferImplementation = (world) =>
  Effect.as(
    paymentsOver(world).credit(transferOrder.to, transferOrder.amount, keyedStep('credit')),
    'done' as const,
  )

const snapshot = (world: TransferWorld): string => `a=${balanceAt(world, 'a')} b=${balanceAt(world, 'b')}`

const expectedSnapshot = (world: TransferWorld): string =>
  world.opening >= transferOrder.amount
    ? `a=${world.opening - transferOrder.amount} b=${transferOrder.amount}`
    : `a=${world.opening} b=0`

export const transferRule = (world: TransferWorld): string | undefined =>
  snapshot(world) === expectedSnapshot(world)
    ? undefined
    : `expected ${expectedSnapshot(world)}, got ${snapshot(world)}`

export interface TransferScenario {
  readonly transfer: TransferImplementation
  readonly opening: number
}

export interface TransferSpec {
  readonly unit: TransferImplementation
  readonly world: Effect.Effect<TransferWorld>
  readonly program: (world: TransferWorld) => Effect.Effect<'done' | 'refused'>
  readonly restart: (world: TransferWorld) => Effect.Effect<'done' | 'refused'>
  readonly rule: (world: TransferWorld) => Effect.Effect<void, Conformance.RuleBroken>
  readonly stopWithin: Duration.Input
}

export const transferSpec = (scenario: TransferScenario): TransferSpec => ({
  unit: scenario.transfer,
  world: transferWorldOf(scenario.opening),
  program: scenario.transfer,
  restart: scenario.transfer,
  rule: (world) => ruleFrom(transferRule(world)),
  stopWithin: transferStopWithin,
})
