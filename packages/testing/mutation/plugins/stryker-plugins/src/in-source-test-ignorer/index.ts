import { Ignorer } from '@systemfsoftware/stryker-js/Ignorer'
import { declarePlugin } from '@systemfsoftware/stryker-js/Plugin'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

import { ancestorsOf, type IgnorerPath } from '../AncestorPath.js'
import { decideInSourceTestIgnore, IN_SOURCE_TEST_IGNORED, isInSourceTestGuard } from './InSourceTestIgnore.js'

/** @public */
export const strykerPlugins = [
  declarePlugin(
    'Ignore',
    'in-source-vitest-block',
    Layer.succeed(Ignorer, {
      // The decision returns a reason or nothing; `Option` is how the port
      // states that difference, so absence cannot be read as a reason.
      shouldIgnore: (path: IgnorerPath) => Option.fromUndefinedOr(decideInSourceTestIgnore(ancestorsOf(path))),
    }),
  ),
]

// Public-surface decision: tests reach the decision function through the
// barrel rather than deep-importing the .kernel.ts cell.
export { decideInSourceTestIgnore, IN_SOURCE_TEST_IGNORED, isInSourceTestGuard }
