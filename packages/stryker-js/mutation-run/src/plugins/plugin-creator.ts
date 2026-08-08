import {
  ClassPlugin,
  commonTokens,
  FactoryPlugin,
  InjectionToken,
  Injector,
  Plugin,
  PluginContext,
  PluginInterfaces,
  PluginKind,
  Plugins,
  tokens,
  ValuePlugin,
} from '@stryker-mutator/api/plugin'
import { InjectableClass, InjectableFunction } from 'typed-inject'

import { ConfigError } from '../errors.js'
import { injectionTokens } from './index.js'

export class PluginCreator {
  public static readonly inject = tokens(
    injectionTokens.pluginsByKind,
    commonTokens.injector,
  )
  constructor(
    private readonly pluginsByKind: Map<PluginKind, Array<Plugin<PluginKind>>>,
    private readonly injector: Injector<PluginContext>,
  ) {}

  public create<TPlugin extends keyof Plugins>(
    kind: TPlugin,
    name: string,
  ): PluginInterfaces[TPlugin] {
    const plugin = this.findPlugin(kind, name)
    if (isFactoryPlugin(plugin)) {
      return this.injector.injectFunction(
        plugin.factory as InjectableFunction<
          PluginContext,
          PluginInterfaces[TPlugin],
          Array<InjectionToken<PluginContext>>
        >,
      )
    } else if (isClassPlugin(plugin)) {
      return this.injector.injectClass(
        plugin.injectableClass as InjectableClass<
          PluginContext,
          PluginInterfaces[TPlugin],
          Array<InjectionToken<PluginContext>>
        >,
      )
    } else if (isValuePlugin(plugin)) {
      return plugin.value
    }
    throw new Error(
      `Plugin "${kind}:${name}" could not be created, missing "factory", "injectableClass" or "value" property.`,
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
      if (pluginFound) {
        return pluginFound as Plugins[T]
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

function isFactoryPlugin(
  plugin: Plugin<PluginKind>,
): plugin is FactoryPlugin<PluginKind, Array<InjectionToken<PluginContext>>> {
  return Boolean(
    (plugin as FactoryPlugin<PluginKind, Array<InjectionToken<PluginContext>>>)
      .factory,
  )
}
function isClassPlugin(
  plugin: Plugin<PluginKind>,
): plugin is ClassPlugin<PluginKind, Array<InjectionToken<PluginContext>>> {
  return Boolean(
    (plugin as ClassPlugin<PluginKind, Array<InjectionToken<PluginContext>>>)
      .injectableClass,
  )
}
function isValuePlugin(
  plugin: Plugin<PluginKind>,
): plugin is ValuePlugin<PluginKind> {
  return Boolean((plugin as ValuePlugin<PluginKind>).value)
}
