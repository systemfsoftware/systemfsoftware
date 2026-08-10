import { KnownKeys } from '@stryker-mutator/util'
import { WarningOptions } from '@systemfsoftware/stryker-js-plugin-api/core'

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
