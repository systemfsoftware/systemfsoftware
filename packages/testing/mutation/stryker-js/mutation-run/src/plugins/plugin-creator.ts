import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Option from 'effect/Option'

import type { AnyPluginContribution, ContributionOf } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'

import { isCommandRunner } from '../test-runner/command-test-runner.js'

import { PluginNotFoundError } from './plugin-loader.schema.js'

/**
 * Finds the contribution a run asked for, among those its plugins loaded.
 *
 * Looking one up is a lookup: it reads no configuration and performs no I/O, so
 * it declares no requirement. Building the contribution's `Layer` is what needs
 * the plugin environment, and that belongs to whoever builds it.
 */
export class PluginCreator {
  constructor(
    private readonly pluginsByKind: HashMap.HashMap<PluginKind, readonly AnyPluginContribution[]>,
  ) {}

  /**
   * Find the contribution of one kind by name.
   *
   * Generic in the kind so the result's `layer` is typed to that kind's port —
   * a caller building a `TestRunner` gets a `Layer<TestRunner>` and needs no
   * assertion to say so.
   */
  public create<K extends PluginKind>(
    kind: K,
    name: string,
  ): Effect.Effect<ContributionOf<K>, PluginNotFoundError> {
    if (kind === PluginKind.TestRunner && isCommandRunner(name)) {
      return Effect.fail(new PluginNotFoundError({ descriptor: name }))
    }
    return this.findPlugin(kind, name)
  }

  public createAll<K extends PluginKind>(kind: K): Effect.Effect<readonly ContributionOf<K>[]> {
    const contributions = HashMap.get(this.pluginsByKind, kind)
    if (Option.isNone(contributions)) {
      return Effect.succeed([])
    }
    return Effect.succeed(contributions.value.filter((c): c is ContributionOf<K> => c.kind === kind))
  }

  private findPlugin<K extends PluginKind>(
    kind: K,
    name: string,
  ): Effect.Effect<ContributionOf<K>, PluginNotFoundError> {
    const contributionsOption = HashMap.get(this.pluginsByKind, kind)
    if (Option.isNone(contributionsOption)) {
      return Effect.fail(
        new PluginNotFoundError({ descriptor: `${kind}:${name} (no ${kind} plugins were loaded)` }),
      )
    }
    const contributions = contributionsOption.value
    const found = contributions.find(
      (c): c is ContributionOf<K> => c.kind === kind && c.name.toLowerCase() === name.toLowerCase(),
    )
    if (found === undefined) {
      return Effect.fail(
        new PluginNotFoundError({
          descriptor: `${kind}:${name} (available: ${contributions.map((c) => c.name).join(', ')})`,
        }),
      )
    }
    return Effect.succeed(found)
  }
}
