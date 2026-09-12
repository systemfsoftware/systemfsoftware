import type { Result } from 'effect'

export const identity = <D, E>(outcome: Result.Result<D, E>): Result.Result<D, E> => outcome
