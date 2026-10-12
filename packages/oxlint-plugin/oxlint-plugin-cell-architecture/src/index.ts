import { atomsReadServices } from './rules/atoms-read-services.js'
import { banClasses } from './rules/ban-classes.js'
import { banErrorString } from './rules/ban-error-string.js'
import { banUnknown } from './rules/ban-unknown.js'
import { cellFileExportsCellOnly } from './rules/cell-file-exports-cell-only.js'
import { handleDefinitionStaysPrivate } from './rules/handle-definition-stays-private.js'
import { handleExportsGuard } from './rules/handle-exports-guard.js'
import { internalExportJsdoc } from './rules/internal-export-jsdoc.js'
import { kindFileConstruction } from './rules/kind-file-construction.js'
import { kindFileDeclaresNoService } from './rules/kind-file-declares-no-service.js'
import { kindFileHoldsNoModuleState } from './rules/kind-file-holds-no-module-state.js'
import { kindRecordMintedByKind } from './rules/kind-record-minted-by-kind.js'
import { kindTypeIdBySymbolFor } from './rules/kind-typeid-by-symbol-for.js'
import { mediumOwnsNoRecovery } from './rules/medium-owns-no-recovery.js'
import { noBodylessStatusAssertion } from './rules/no-bodyless-status-assertion.js'
import { noContextGenericTag } from './rules/no-context-generic-tag.js'
import { noDirectTagAccess } from './rules/no-direct-tag-access.js'
import { noEitherTagAssertions } from './rules/no-either-tag-assertions.js'
import { sandwichShellIsStraightLine } from './rules/sandwich-shell-is-straight-line.js'
import { shellMachineFollowsEvents } from './rules/shell-machine-follows-events.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin-cell-architecture'

const rule = (name: string): string => `${PLUGIN_NAME}/${name}`

const recommendedRules = {
  [rule('ban-classes')]: 'error',
  [rule('ban-error-string')]: 'error',
  [rule('ban-unknown')]: 'error',
  [rule('cell-file-exports-cell-only')]: 'error',
  [rule('handle-definition-stays-private')]: 'error',
  [rule('handle-exports-guard')]: 'error',
  [rule('internal-export-jsdoc')]: 'error',
  [rule('kind-file-construction')]: 'error',
  [rule('kind-file-declares-no-service')]: 'error',
  [rule('kind-file-holds-no-module-state')]: 'error',
  [rule('kind-record-minted-by-kind')]: 'error',
  [rule('kind-typeid-by-symbol-for')]: 'error',
  [rule('no-bodyless-status-assertion')]: 'error',
  [rule('no-context-generic-tag')]: 'error',
  [rule('no-direct-tag-access')]: 'error',
  [rule('no-either-tag-assertions')]: 'error',
  [rule('sandwich-shell-is-straight-line')]: 'error',
  [rule('medium-owns-no-recovery')]: 'error',
  [rule('shell-machine-follows-events')]: 'error',
  [rule('atoms-read-services')]: 'error',
} as const

export default {
  meta: {
    name: PLUGIN_NAME,
  },
  rules: {
    'atoms-read-services': atomsReadServices,
    'ban-classes': banClasses,
    'ban-error-string': banErrorString,
    'ban-unknown': banUnknown,
    'cell-file-exports-cell-only': cellFileExportsCellOnly,
    'handle-definition-stays-private': handleDefinitionStaysPrivate,
    'handle-exports-guard': handleExportsGuard,
    'internal-export-jsdoc': internalExportJsdoc,
    'kind-file-construction': kindFileConstruction,
    'kind-file-declares-no-service': kindFileDeclaresNoService,
    'kind-file-holds-no-module-state': kindFileHoldsNoModuleState,
    'kind-record-minted-by-kind': kindRecordMintedByKind,
    'kind-typeid-by-symbol-for': kindTypeIdBySymbolFor,
    'no-bodyless-status-assertion': noBodylessStatusAssertion,
    'no-context-generic-tag': noContextGenericTag,
    'no-direct-tag-access': noDirectTagAccess,
    'no-either-tag-assertions': noEitherTagAssertions,
    'sandwich-shell-is-straight-line': sandwichShellIsStraightLine,
    'medium-owns-no-recovery': mediumOwnsNoRecovery,
    'shell-machine-follows-events': shellMachineFollowsEvents,
  },
  configs: {
    recommended: {
      rules: recommendedRules,
    },
  },
}
