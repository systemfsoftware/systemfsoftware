import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL, URL } from 'url'

import { Schema as S } from 'effect'

import { type Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { commonTokens, type Plugin, PluginKind, tokens } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { errorToString, isErrnoException, notEmpty, propertyPath } from '@systemfsoftware/stryker-js-util'

import { importModule } from '../config/module-loader.js'
import { defaultOptions } from '../config/options-validator.js'

import { PluginModuleSchema, SchemaValidationContributionSchema } from './plugin-loader.schema.js'

const IGNORED_PACKAGES = [
  'stryker-js-plugin-api',
  'stryker-js-util',
  'stryker-js-instrumenter',
  'stryker-js-mutation-run',
  'stryker-js-mutation-report',
  'stryker-js-cli',
]

interface PluginModule {
  strykerPlugins: Plugin<PluginKind>[]
}

interface SchemaValidationContribution {
  strykerValidationSchema: Record<string, unknown>
}

/**
 * Represents a collection of loaded plugins and metadata
 */
export interface LoadedPlugins {
  /**
   * The JSON schema contributions loaded
   */
  schemaContributions: Record<string, unknown>[]
  /**
   * The actual Stryker plugins loaded, sorted by type
   */
  pluginsByKind: Map<PluginKind, Plugin<PluginKind>[]>
  /**
   * The import specifiers or full URL paths to the actual plugins
   */
  pluginModulePaths: string[]
}

/**
 * Can resolve modules and pull them into memory
 */
export class PluginLoader {
  public static inject = tokens(commonTokens.logger)
  constructor(private readonly log: Logger) {}

  /**
   * Loads plugins based on configured plugin descriptors.
   * A plugin descriptor can be:
   *  * A full url: "file:///home/user/github/my-plugin.js"
   *  * An absolute file path: "/home/user/github/my-plugin.js"
   *  * A relative path: "./my-plugin.js"
   *  * A bare import expression: "@systemfsoftware/stryker-js-vitest-runner"
   *  * A simple glob expression (only wild cards are supported): "@systemfsoftware/stryker-js-*"
   */
  public async load(
    pluginDescriptors: readonly string[],
  ): Promise<LoadedPlugins> {
    const pluginModules = await this.resolvePluginModules(pluginDescriptors)
    const loadedPluginModules = (
      await Promise.all(
        pluginModules.map(async (moduleName) => {
          const plugin = await this.loadPlugin(moduleName)
          return {
            ...plugin,
            moduleName,
          }
        }),
      )
    ).filter(notEmpty)

    const result: LoadedPlugins = {
      schemaContributions: [],
      pluginsByKind: new Map<PluginKind, Plugin<PluginKind>[]>(),
      pluginModulePaths: [],
    }

    loadedPluginModules.forEach(
      ({ plugins, schemaContribution, moduleName }) => {
        if (plugins) {
          result.pluginModulePaths.push(moduleName)
          plugins.forEach((plugin) => {
            const pluginsForKind = result.pluginsByKind.get(plugin.kind)
            if (pluginsForKind) {
              pluginsForKind.push(plugin)
            } else {
              result.pluginsByKind.set(plugin.kind, [plugin])
            }
          })
        }
        if (schemaContribution) {
          result.schemaContributions.push(schemaContribution)
        }
      },
    )
    return result
  }

  private async resolvePluginModules(
    pluginDescriptors: readonly string[],
  ): Promise<string[]> {
    return (
      await Promise.all(
        pluginDescriptors.map(async (pluginExpression) => {
          if (pluginExpression.includes('*')) {
            return await this.globPluginModules(pluginExpression)
          } else if (
            path.isAbsolute(pluginExpression) ||
            pluginExpression.startsWith('.')
          ) {
            return pathToFileURL(path.resolve(pluginExpression)).toString()
          } else {
            // Bare plugin expression like "@systemfsoftware/stryker-js-vitest-runner" (or file URL)
            return pluginExpression
          }
        }),
      )
    )
      .filter(notEmpty)
      .flat()
  }

  private async globPluginModules(pluginExpression: string) {
    const { org, pkg } = parsePluginExpression(pluginExpression)

    const regexp = new RegExp('^' + pkg.replace('*', '.*'))
    const pluginNames = await this.readOrgDirectory(org)
    const plugins = pluginNames
      .filter(
        (pluginName) => !IGNORED_PACKAGES.includes(pluginName) && regexp.test(pluginName),
      )
      .map((pluginName) => `${org.length ? `${org}/` : ''}${pluginName}`)
    if (
      plugins.length === 0 &&
      !defaultOptions.plugins.includes(pluginExpression)
    ) {
      this.log.warn(
        'Expression "%s" not resulted in plugins to load.',
        pluginExpression,
      )
    }
    plugins.forEach((plugin) =>
      this.log.debug(
        'Loading plugin "%s" (matched with expression %s)',
        plugin,
        pluginExpression,
      )
    )
    return plugins
  }

  /**
   * Reads the org's package names from every install directory above this
   * module, unioned.
   *
   * Never a fixed number of `..` segments: `dist/` and `src/plugins/` sit at
   * different depths, so a numeric walk resolves to a different directory
   * depending on which one is running — and a wrong directory yields zero
   * plugins rather than an error, so the mistake ships as a silent 100% score.
   *
   * Never the first directory that happens to be populated either: under a
   * pnpm-isolated install this package's own virtual `node_modules` holds only
   * its own dependencies, and stopping there hides every sibling plugin the
   * project installed one level up. The union spans both, so discovery reaches
   * as far as a hoisted layout does. A missing org directory contributes
   * nothing; it is not an error.
   */
  private async readOrgDirectory(org: string): Promise<string[]> {
    const names = new Set<string>()
    let directory = path.dirname(fileURLToPath(import.meta.url))
    for (;;) {
      const installRoot = path.basename(directory) === 'node_modules'
        ? directory
        : path.join(directory, 'node_modules')
      const orgDirectory = path.resolve(installRoot, org)
      try {
        const entries = await fs.promises.readdir(orgDirectory)
        if (entries.length > 0) {
          this.log.debug('Found %d %s packages in %s', entries.length, org, orgDirectory)
          entries.forEach((entry) => names.add(entry))
        }
      } catch (error: unknown) {
        if (!isErrnoException(error) || error.code !== 'ENOENT') {
          throw error
        }
      }
      const parent = path.dirname(directory)
      if (parent === directory) {
        return [...names]
      }
      directory = parent
    }
  }

  private async loadPlugin(descriptor: string): Promise<
    | {
      plugins: Plugin<PluginKind>[] | undefined
      schemaContribution: Record<string, unknown> | undefined
    }
    | undefined
  > {
    this.log.debug('Loading plugin %s', descriptor)
    try {
      const module = await importModule(descriptor)
      const plugins = isPluginModule(module)
        ? module.strykerPlugins
        : undefined
      const schemaContribution = hasValidationSchemaContribution(module)
        ? module.strykerValidationSchema
        : undefined
      if (plugins ?? schemaContribution) {
        return {
          plugins,
          schemaContribution,
        }
      } else {
        this.log.warn(
          'Module "%s" did not contribute a StrykerJS plugin. It didn\'t export a "%s" or "%s".',
          descriptor,
          propertyPath<PluginModule>()('strykerPlugins'),
          propertyPath<SchemaValidationContribution>()(
            'strykerValidationSchema',
          ),
        )
      }
    } catch (e: unknown) {
      if (
        isErrnoException(e) &&
        e.code === 'ERR_MODULE_NOT_FOUND' &&
        e.message.indexOf(descriptor) !== -1
      ) {
        this.log.warn(
          'Cannot find plugin "%s".\n  Did you forget to install it ?',
          descriptor,
        )
      } else {
        this.log.warn(
          'Error during loading "%s" plugin:\n  %s',
          descriptor,
          errorToString(e),
        )
      }
    }
    return
  }
}

/**
 * Distills organization name from a package expression.
 * @example
 *  '@systemfsoftware/stryker-js-mutation-run' => { org: '@systemfsoftware', 'stryker-js-mutation-run' }
 *  'glob' => { org: '', 'glob' }
 */
function parsePluginExpression(pluginExpression: string) {
  const parts = pluginExpression.split('/')
  if (parts.length > 1) {
    return {
      org: parts.slice(0, parts.length - 1).join('/'),
      pkg: parts[parts.length - 1] ?? '',
    }
  } else {
    return {
      org: '',
      pkg: parts[0] ?? '',
    }
  }
}

function isPluginModule(module: unknown): module is PluginModule {
  return S.is(PluginModuleSchema)(module)
}

function hasValidationSchemaContribution(
  module: unknown,
): module is SchemaValidationContribution {
  return S.is(SchemaValidationContributionSchema)(module)
}
