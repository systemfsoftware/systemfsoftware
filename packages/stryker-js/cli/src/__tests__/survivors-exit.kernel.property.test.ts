import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import { ExitClass } from '@systemfsoftware/stryker-js-mutation-run/exit-classification'
import { FastCheck as fc } from 'effect/testing'

import { SURVIVORS_REJECT_EXIT_CLASS } from '../survivors-exit.kernel.js'

/**
 * The kernel exports one exit constant, and the law pins the contract a
 * reassignment would break: R6 classes a rejected survivors run as exit 2, and
 * `ExitClass.ConfigError` is core's name for that number. Asserting both the
 * name and the literal is what makes the law cross-package — it fails if core
 * renumbers the class as well as if this kernel points at a different one.
 */
describe('survivors-exit constants', () => {
  it.prop(
    '∀exitClass_Reject_≡ConfigErrorExit2',
    [fc.constant(SURVIVORS_REJECT_EXIT_CLASS)],
    ([exitClass]) => exitClass === ExitClass.ConfigError && exitClass === 2,
  )
})
