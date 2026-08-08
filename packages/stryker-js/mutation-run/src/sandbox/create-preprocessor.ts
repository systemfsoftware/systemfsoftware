import { commonTokens, Injector, PluginContext, tokens } from '@stryker-mutator/api/plugin'

import { disableTypeChecks } from '@stryker-mutator/instrumenter'

import { injectionTokens } from '../plugins/index.js'

import { DisableTypeChecksPreprocessor } from './disable-type-checks-preprocessor.js'
import { FilePreprocessor } from './file-preprocessor.js'
import { MultiPreprocessor } from './multi-preprocessor.js'
import { TSConfigPreprocessor } from './ts-config-preprocessor.js'

createPreprocessor.inject = tokens(commonTokens.injector)
export function createPreprocessor(
  injector: Injector<PluginContext>,
): FilePreprocessor {
  return new MultiPreprocessor([
    injector
      .provideValue(injectionTokens.disableTypeChecksHelper, disableTypeChecks)
      .injectClass(DisableTypeChecksPreprocessor),
    injector.injectClass(TSConfigPreprocessor),
  ])
}
