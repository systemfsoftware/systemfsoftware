import { WarningOptions } from '@stryker-mutator/api/core'
import { KnownKeys } from '@stryker-mutator/util'

export function isWarningEnabled(
  warningType: KnownKeys<WarningOptions>,
  warningOptions: WarningOptions | boolean,
): boolean {
  if (typeof warningOptions === 'boolean') {
    return warningOptions
  } else {
    return !!warningOptions[warningType]
  }
}
