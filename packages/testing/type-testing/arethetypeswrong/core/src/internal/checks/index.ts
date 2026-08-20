import cjsOnlyExportsDefault from './CjsOnlyExportsDefault.js'
import entrypointResolutions from './EntrypointResolutions.js'
import exportDefaultDisagreement from './ExportDefaultDisagreement.js'
import internalResolutionError from './InternalResolutionError.js'
import moduleKindDisagreement from './ModuleKindDisagreement.js'
import namedExports from './NamedExports.js'
import unexpectedModuleSyntax from './UnexpectedModuleSyntax.js'

export default [
  entrypointResolutions,
  moduleKindDisagreement,
  exportDefaultDisagreement,
  namedExports,
  cjsOnlyExportsDefault,
  unexpectedModuleSyntax,
  internalResolutionError,
]
