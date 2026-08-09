import path from 'path'

import { StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { commonTokens, tokens } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { Either } from 'effect'

import { Project } from '../project/project.js'

import { FilePreprocessor } from './file-preprocessor.js'
import { parseTsConfig } from './parse-config-helper.js'
import type { TSConfig } from './parse-config-helper.js'
import { resolveProjectReferencePath } from './resolve-reference-helper.js'

export type { TSConfig } from './parse-config-helper.js'
/**
 * A helper class that rewrites `references` and `extends` file paths if they end up falling outside of the sandbox.
 * @example
 * {
 *   "extends": "../../tsconfig.settings.json",
 *   "references": {
 *      "path": "../model"
 *   }
 * }
 * becomes:
 * {
 *   "extends": "../../../../tsconfig.settings.json",
 *   "references": {
 *      "path": "../../../model"
 *   }
 * }
 */
export class TSConfigPreprocessor implements FilePreprocessor {
  private readonly touched = new Set<string>()
  public static readonly inject = tokens(
    commonTokens.logger,
    commonTokens.options,
  )
  constructor(
    private readonly log: Logger,
    private readonly options: StrykerOptions,
  ) {}

  public async preprocess(project: Project): Promise<void> {
    if (this.options.inPlace) {
      // If stryker is running 'inPlace', we don't have to change the tsconfig file
      return
    } else {
      this.touched.clear()
      await this.rewriteTSConfigFile(
        project,
        path.resolve(this.options.tsconfigFile),
      )
    }
  }

  private async rewriteTSConfigFile(
    project: Project,
    tsconfigFileName: string,
  ): Promise<void> {
    if (!this.touched.has(tsconfigFileName)) {
      this.touched.add(tsconfigFileName)
      const tsconfigFile = project.files.get(tsconfigFileName)
      if (tsconfigFile) {
        this.log.debug('Rewriting file %s', tsconfigFile)
        const parsed = parseTsConfig(
          tsconfigFileName,
          await tsconfigFile.readContent(),
        )
        if (Either.isRight(parsed)) {
          const config = parsed.right
          await this.rewriteExtends(project, config, tsconfigFileName)
          await this.rewriteProjectReferences(
            project,
            config,
            tsconfigFileName,
          )
          this.rewriteFileArrayProperty(config, tsconfigFileName, 'include')
          this.rewriteFileArrayProperty(config, tsconfigFileName, 'exclude')
          this.rewriteFileArrayProperty(config, tsconfigFileName, 'files')
          tsconfigFile.setContent(JSON.stringify(config, null, 2))
        } else {
          const error = parsed.left
          this.log.warn(
            `Could not rewrite tsconfig file "%s": %s. Its extends, project references, and file array properties were not rewritten for the sandbox, so this file still points at paths outside it.`,
            tsconfigFileName,
            error.reason,
          )
        }
      }
    }
  }

  private async rewriteExtends(
    project: Project,
    config: TSConfig,
    tsconfigFileName: string,
  ): Promise<void> {
    const extend = config.extends
    if (typeof extend === 'string') {
      config.extends = await this.rewriteExtendsEntry(
        project,
        extend,
        tsconfigFileName,
      )
    } else if (Array.isArray(extend)) {
      const rewritten: string[] = []
      for (const entry of extend) {
        rewritten.push(
          await this.rewriteExtendsEntry(project, entry, tsconfigFileName),
        )
      }
      config.extends = rewritten
    }
  }

  private async rewriteExtendsEntry(
    project: Project,
    extend: string,
    tsconfigFileName: string,
  ): Promise<string> {
    const rewritten = this.tryRewriteReference(extend, tsconfigFileName)
    if (rewritten) {
      return rewritten
    }
    await this.rewriteTSConfigFile(
      project,
      path.resolve(path.dirname(tsconfigFileName), extend),
    )
    return extend
  }

  private rewriteFileArrayProperty(
    config: TSConfig,
    tsconfigFileName: string,
    prop: 'exclude' | 'files' | 'include',
  ): void {
    const fileArray = config[prop]
    if (Array.isArray(fileArray)) {
      config[prop] = fileArray.map((pattern) => {
        const rewritten = this.tryRewriteReference(pattern, tsconfigFileName)
        if (rewritten) {
          return rewritten
        } else {
          return pattern
        }
      })
    }
  }

  private async rewriteProjectReferences(
    project: Project,
    config: TSConfig,
    originTSConfigFileName: string,
  ): Promise<void> {
    if (Array.isArray(config.references)) {
      for (const reference of config.references) {
        const referencePath = resolveProjectReferencePath(reference)
        const rewritten = this.tryRewriteReference(
          referencePath,
          originTSConfigFileName,
        )
        if (rewritten) {
          reference.path = rewritten
        } else {
          await this.rewriteTSConfigFile(
            project,
            path.resolve(path.dirname(originTSConfigFileName), referencePath),
          )
        }
      }
    }
  }

  private tryRewriteReference(
    reference: string,
    originTSConfigFileName: string,
  ): string | false {
    const dirName = path.dirname(originTSConfigFileName)
    const fileName = path.resolve(dirName, reference)
    const relativeToSandbox = path.relative(process.cwd(), fileName)
    if (relativeToSandbox.startsWith('..')) {
      return this.join('..', '..', reference)
    }
    return false
  }

  private join(...pathSegments: string[]) {
    return pathSegments.map((segment) => segment.replace(/\\/g, '/')).join('/')
  }
}
