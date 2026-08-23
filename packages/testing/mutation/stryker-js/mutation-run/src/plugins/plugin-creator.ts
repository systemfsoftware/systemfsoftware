import {
  type ClassPlugin,
  commonTokens,
  type FactoryPlugin,
  type InjectionToken,
  type Injector,
  type Plugin,
  type PluginContext,
  type PluginInterfaces,
  PluginKind,
  type Plugins,
  tokens,
  type ValuePlugin,
} from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { type InjectableClass, type InjectableFunction } from 'typed-inject'

import { ConfigError } from '../errors.js'
import { injectionTokens } from './index.js'

export class PluginCreator {
  public static readonly inject = tokens(
    injectionTokens.pluginsByKind,
    commonTokens.injector,
  )
  constructor(
    private readonly pluginsByKind: Map<PluginKind, Plugin<PluginKind>[]>,
    private readonly injector: Injector<PluginContext>,
  ) {}

  public create<TPlugin extends keyof Plugins>(
    kind: TPlugin,
    name: string,
  ): PluginInterfaces[TPlugin] {
    return this.instantiate(this.findPlugin(kind, name))
  }

  public createAll<TPlugin extends keyof Plugins>(kind: TPlugin): PluginInterfaces[TPlugin][] {
    const plugins = this.pluginsByKind.get(kind) ?? []
    return plugins
      .filter((plugin): plugin is Plugins[TPlugin] => isPluginOfKind(plugin, kind))
      .map((plugin) => this.instantiate(plugin))
  }

  private instantiate<TPlugin extends keyof Plugins>(
    plugin: Plugins[TPlugin],
  ): PluginInterfaces[TPlugin] {
    if (isFactoryPlugin(plugin)) {
      return this.injector.injectFunction(
        plugin.factory,
      )
    } else if (isClassPlugin(plugin)) {
      return this.injector.injectClass(
        plugin.injectableClass,
      )
    } else if (isValuePlugin(plugin)) {
      return plugin.value
    }
    throw new Error(
      'Plugin could not be created, missing "factory", "injectableClass" or "value" property.',
    )
  }

  private findPlugin<T extends keyof Plugins>(
    kind: T,
    name: string,
  ): Plugins[T] {
    const plugins = this.pluginsByKind.get(kind)
    if (plugins) {
      const pluginFound = plugins.find(
        (plugin) => plugin.name.toLowerCase() === name.toLowerCase(),
      )
      if (pluginFound && isPluginOfKind(pluginFound, kind)) {
        return pluginFound
      } else {
        // A missing plugin is a configuration problem: ConfigError keeps it on the config-error exit class (R2).
        throw new ConfigError(
          `Cannot find ${kind} plugin "${name}". Did you forget to install it? Loaded ${kind} plugins were: ${
            new Intl.ListFormat('en').format(plugins.map((p) => `"${p.name}"`))
          }`,
        )
      }
    } else {
      throw new ConfigError(
        `Cannot find ${kind} plugin "${name}". In fact, no ${kind} plugins were loaded. Did you forget to install it?`,
      )
    }
  }
}

function isPluginOfKind<T extends keyof Plugins>(
  plugin: Plugin<PluginKind>,
  kind: T,
): plugin is Plugins[T] {
  return plugin.kind === kind
}

function isFactoryPlugin<TPluginKind extends PluginKind>(
  plugin: Plugin<TPluginKind>,
): plugin is FactoryPlugin<TPluginKind, InjectionToken<PluginContext>[]> {
  return 'factory' in plugin
}
function isClassPlugin<TPluginKind extends PluginKind>(
  plugin: Plugin<TPluginKind>,
): plugin is ClassPlugin<TPluginKind, InjectionToken<PluginContext>[]> {
  return 'injectableClass' in plugin
}
function isValuePlugin<TPluginKind extends PluginKind>(
  plugin: Plugin<TPluginKind>,
): plugin is ValuePlugin<TPluginKind> {
  return 'value' in plugin
}
