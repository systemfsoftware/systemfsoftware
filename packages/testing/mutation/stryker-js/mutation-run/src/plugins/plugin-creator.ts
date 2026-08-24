import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Option from 'effect/Option'

import type { AnyPluginContribution, ContributionOf } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'

import { isCommandRunner } from '../test-runner/command-test-runner.js'

import { PluginNotFoundError } from './plugin-loader.schema.js'

function findPlugin<K extends PluginKind>(
  pluginsByKind: HashMap.HashMap<PluginKind, readonly AnyPluginContribution[]>,
  kind: K,
  name: string,
): Effect.Effect<ContributionOf<K>, PluginNotFoundError> {
  const contributionsOption = HashMap.get(pluginsByKind, kind)
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

export function create<K extends PluginKind>(
  pluginsByKind: HashMap.HashMap<PluginKind, readonly AnyPluginContribution[]>,
  kind: K,
  name: string,
): Effect.Effect<ContributionOf<K>, PluginNotFoundError> {
  if (kind === PluginKind.TestRunner && isCommandRunner(name)) {
    return Effect.fail(new PluginNotFoundError({ descriptor: name }))
  }
  return findPlugin(pluginsByKind, kind, name)
}

export function createAll<K extends PluginKind>(
  pluginsByKind: HashMap.HashMap<PluginKind, readonly AnyPluginContribution[]>,
  kind: K,
): Effect.Effect<readonly ContributionOf<K>[]> {
  const contributions = HashMap.get(pluginsByKind, kind)
  if (Option.isNone(contributions)) {
    return Effect.succeed([])
  }
  return Effect.succeed(contributions.value.filter((c): c is ContributionOf<K> => c.kind === kind))
}
