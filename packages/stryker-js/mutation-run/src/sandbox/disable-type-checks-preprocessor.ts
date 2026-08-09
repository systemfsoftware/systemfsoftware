import path from 'path'

import type { disableTypeChecks } from '@stryker-mutator/instrumenter'
import { StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { commonTokens, tokens } from '@systemfsoftware/stryker-js-plugin-api/plugin'

import { FileMatcher } from '../config/index.js'
import { isWarningEnabled } from '../config/is-warning-enabled.js'
import { optionsPath } from '../config/options-path.js'
import { injectionTokens } from '../plugins/index.js'
import { map } from '../run-stages/map.js'

import { Project } from '../project/project.js'

import { FilePreprocessor } from './file-preprocessor.js'

/**
 * Disabled type checking by inserting `@ts-nocheck` atop TS/JS files and removing other @ts-xxx directives from comments:
 * @see https://github.com/stryker-mutator/stryker-js/issues/2438
 */
export class DisableTypeChecksPreprocessor implements FilePreprocessor {
  public static readonly inject = tokens(
    commonTokens.logger,
    commonTokens.options,
    injectionTokens.disableTypeChecksHelper,
  )
  constructor(
    private readonly log: Logger,
    private readonly options: StrykerOptions,
    private readonly impl: typeof disableTypeChecks,
  ) {}

  public async preprocess(project: Project): Promise<void> {
    const matcher = new FileMatcher(this.options.disableTypeChecks)
    let warningLogged = false
    await Promise.all(
      map(project.files, async (file, name) => {
        if (matcher.matches(path.resolve(name))) {
          try {
            const { content } = await this.impl(
              await file.toInstrumenterFile(),
              { plugins: this.options.mutator.plugins },
            )
            file.setContent(content)
          } catch (err) {
            if (
              isWarningEnabled(
                'preprocessorErrors',
                this.options.warnings,
              )
            ) {
              warningLogged = true
              this.log.warn(
                `Unable to disable type checking for file "${name}". Shouldn't type checking be disabled for this file? Consider configuring a more restrictive "${
                  optionsPath(
                    'disableTypeChecks',
                  )
                }" settings (or turn it completely off with \`false\`)`,
                err,
              )
            }
          }
        }
      }),
    )
    if (warningLogged) {
      this.log.warn(
        `(disable "${optionsPath('warnings', 'preprocessorErrors')}" to ignore this warning`,
      )
    }
  }
}
