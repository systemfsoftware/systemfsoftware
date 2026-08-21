import { type KnownKeys } from '@stryker-mutator/util'
import { type StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'

/**
 * The warning-option record: `warnings` accepts `true`/`false` or this
 * per-type object. The plugin-api schema exports options as a whole, not the
 * nested `WarningOptions` name the generated core used to carry.
 */
export type WarningOptions = Exclude<StrykerOptions['warnings'], boolean>

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
