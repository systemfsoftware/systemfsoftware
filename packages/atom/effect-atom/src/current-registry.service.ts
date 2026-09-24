import { Context } from 'effect'
import type { Registry } from './registry.handle.js'

/**
 * Service tag for the registry evaluating an effect.
 *
 * **When to use**
 *
 * Use to access or provide the registry that stores atom values,
 * dependencies, subscriptions, and disposal state for a reactive lifetime.
 *
 * @since 4.0.0
 */
export class Current
  extends Context.Service<Current, Registry>()('@systemfsoftware/effect-atom/current-registry.service/Current')
{}
