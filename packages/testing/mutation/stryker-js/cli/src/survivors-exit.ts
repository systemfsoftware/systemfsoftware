import { ExitClass } from '@systemfsoftware/stryker-js-mutation-run'

/** The exit class a rejected survivors run exits with (R6: exit 2). */
export const SURVIVORS_REJECT_EXIT_CLASS: ExitClass = ExitClass.ConfigError

/** The rejected-run exit code the law pins. */
const CONFIG_ERROR_EXIT = 2

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { describe, it } = await import('@systemfsoftware/effect-gherkin-spec')
  const { ExitClass } = await import('@systemfsoftware/stryker-js-mutation-run')
  const { FastCheck: fc } = await import('effect/testing')

  /**
   * One exit constant is exported, and the law pins the contract a
   * reassignment would break: R6 classes a rejected survivors run as exit 2, and
   * `ExitClass.ConfigError` is core's name for that number. Asserting both the
   * name and the literal is what makes the law cross-package — it fails if core
   * renumbers the class as well as if this module points at a different one.
   */
  describe('survivors-exit constants', () => {
    it.prop(
      '∀exitClass_Reject_≡ConfigErrorExit2',
      [fc.constant(SURVIVORS_REJECT_EXIT_CLASS)],
      ([exitClass]) => exitClass === ExitClass.ConfigError && exitClass === CONFIG_ERROR_EXIT,
    )
  })
}
