import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'

import { ModuleNotFound } from './module-not-found.schema.js'

export { ModuleNotFound }

/**
 * The shape hosts implement: resolve a specifier to its filesystem path, or
 * import it, both relative to one project directory.
 *
 * @since 0.1.0
 */
export interface ProjectModulesShape {
  readonly resolve: (specifier: string) => Effect.Effect<string, ModuleNotFound>
  readonly import: (specifier: string) => Effect.Effect<unknown, ModuleNotFound>
}

/**
 * Resolves and imports modules relative to a project directory.
 *
 * The port behind plugin, config, and dependency loading: feature code yields
 * this service and never touches a host module API. The live implementation
 * ships in `@systemfsoftware/project-modules-node`; tests substitute a layer
 * returning fixed paths.
 *
 * @since 0.1.0
 */
export class ProjectModules extends Context.Service<ProjectModules, ProjectModulesShape>()(
  '@systemfsoftware/project-modules/ProjectModules',
) {}
