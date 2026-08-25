import * as Context from 'effect/Context'

import type { StrykerOptions } from '../core/StrykerOptions.schema.js'

/**
 * The resolved options for this run, as a capability a plugin reads.
 *
 * A plugin needs its configuration to be built, not merely to be called — a
 * checker has to know which tsconfig to load before it can check anything.
 * With registration expressed as a `Layer`, that configuration has to reach the
 * `Layer`, and the only honest way is for the plugin to ask for it.
 *
 * The alternative is what the container did: hand the options to a constructor
 * and let the plugin's own entry point export something that cannot work until
 * someone remembers to call a different factory. That produces a package whose
 * declared plugin fails on every call while the working implementation sits
 * beside it unexported to the engine, which compiles, lints and builds.
 *
 * Provided once by the composition root. A plugin that does not need
 * configuration never mentions it, and the type says so.
 */
export class RunConfiguration extends Context.Service<RunConfiguration, StrykerOptions>()(
  '@systemfsoftware/stryker-js-plugin-api/plugin/RunConfiguration',
) {}
