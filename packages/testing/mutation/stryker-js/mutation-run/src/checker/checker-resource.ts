import { type CheckResult } from '@systemfsoftware/stryker-js-plugin-api/check'
import { type Mutant } from '@systemfsoftware/stryker-js-plugin-api/core'

import { type Resource } from '../worker-pool/index.js'

export interface CheckerResource extends Resource {
  check(
    checkerName: string,
    mutant: Mutant[],
  ): Promise<Record<string, CheckResult>>
  group(checkerName: string, mutants: Mutant[]): Promise<string[][]>
}
