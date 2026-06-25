import { Option } from 'effect'
import type { LockConfig } from '../daemon-spec.js'

export interface LockGateOptions {
  readonly key: string
  readonly mode: 'required' | 'optional'
}

export const decideLockGate = (
  lock: LockConfig,
): Option.Option<LockGateOptions> => {
  if (lock.mode === 'none') return Option.none()
  return Option.some({ key: lock.key, mode: lock.mode })
}
