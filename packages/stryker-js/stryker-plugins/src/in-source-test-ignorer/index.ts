import type { IgnorerFactory } from '@systemfsoftware/stryker-js/Ignorer'
import { declarePlugin } from '@systemfsoftware/stryker-js/Plugin'

import { ancestorsOf } from '../AncestorPath.js'
import { decideInSourceTestIgnore, IN_SOURCE_TEST_IGNORED, isInSourceTestGuard } from './InSourceTestIgnore.js'

const makeIgnorer: IgnorerFactory = () => (path) => decideInSourceTestIgnore(ancestorsOf(path)) ?? null

export const strykerPlugins = [
  declarePlugin('Ignorer', 'in-source-vitest-block', makeIgnorer),
]

// Public-surface decision: tests reach the decision function through the barrel.
export { decideInSourceTestIgnore, IN_SOURCE_TEST_IGNORED, isInSourceTestGuard }
