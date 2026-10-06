import { Match, Schema } from 'effect'
import { dual } from 'effect/Function'
import { Contract } from '../../mod.js'
import type { Census } from './exit.js'

export interface RenderOptions {
  readonly program: string
}

const getOperationNext = (operation: string): Contract.NextAction => ({
  operation: 'getOperation',
  input: { operation },
})

export const nextActionsOf = (census: Census): ReadonlyArray<Contract.NextAction> =>
  Match.value(census).pipe(
    Match.tag('Completed', (completed) => completed.next),
    Match.tag('Refused', (refused) => refused.next),
    Match.tag('Accepted', (accepted) =>
      accepted.next.length === 0 ? [getOperationNext(accepted.operation)] : accepted.next),
    Match.tag('Rejected', () => []),
    Match.tag('Unavailable', () => []),
    Match.exhaustive,
  )

export interface CommandLineOf {
  (program: string, action: Contract.NextAction): string
  (action: Contract.NextAction): (program: string) => string
}

export const commandLineOf: CommandLineOf = dual(
  2,
  (program: string, action: Contract.NextAction): string =>
    `${program} ${action.operation} --input '${JSON.stringify(action.input)}'`,
)

const headlineOf = (census: Census): string =>
  Match.value(census).pipe(
    Match.tag('Completed', () => 'Completed'),
    Match.tag('Accepted', (accepted) => `Accepted ${accepted.operation}`),
    Match.tag('Refused', (refused) => `Refused ${refused.refusal._tag}`),
    Match.tag('Rejected', (rejected) => `Rejected: ${rejected.issue}`),
    Match.tag('Unavailable', (unavailable) => `Unavailable: ${unavailable.reason}`),
    Match.exhaustive,
  )

export interface HumanTextOf {
  (census: Census, options: RenderOptions): string
  (options: RenderOptions): (census: Census) => string
}

export const humanTextOf: HumanTextOf = dual(2, (census: Census, options: RenderOptions): string => {
  const actions = nextActionsOf(census)
  const lines = [headlineOf(census), ...actions.map((action) => commandLineOf(options.program, action))]
  return lines.join('\n')
})

export const jsonTextOf = (census: Schema.Json): string => JSON.stringify(census)
