import { Match } from 'effect'
import { Contract } from '../../mod.js'

export type ExitCode = 0 | 1 | 2 | 3 | 4 | 5

export type Census = Contract.Answer | Contract.Unavailable

export const exitCodeOf = (census: Census): ExitCode =>
  Match.value(census).pipe(
    Match.tag('Completed', (): ExitCode => 0),
    Match.tag('Accepted', (): ExitCode => 0),
    Match.tag('Rejected', (): ExitCode => 2),
    Match.tag('Refused', (): ExitCode => 3),
    Match.tag('Unavailable', (): ExitCode => 5),
    Match.exhaustive,
  )
