import fs from 'fs'
import { createRequire } from 'module'
import path from 'path'
import { pathToFileURL } from 'url'

import type { PartialStrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { Match } from 'effect'
import * as S from 'effect/Schema'

import { ConfigError } from '../errors.js'

import { ConfigDocumentSchema, ImportedModuleSchema } from './config-document.schema.js'
import type { ExtendsStepState } from './extends-step.js'
import { decideExtendsStep, initialExtendsStepState } from './extends-step.js'

export async function readConfigFile(configFile: string): Promise<PartialStrykerOptions> {
  const ext = path.extname(configFile).toLowerCase()
  if (ext === '.json') {
    let fileContent: string
    try {
      fileContent = await fs.promises.readFile(configFile, 'utf-8')
    } catch (err) {
      throw new ConfigError(
        `Cannot read config file "${configFile}"`,
        err,
      )
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(fileContent)
    } catch (err) {
      throw new ConfigError(
        `Invalid config file "${configFile}". File contains invalid JSON`,
        err,
      )
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ConfigError(
        `Invalid config file "${configFile}". Config must be a JSON object`,
      )
    }
    return S.decodeUnknownSync(ConfigDocumentSchema)(parsed)
  }
  // Dynamic import: the module specifier is the runtime-resolved config path,
  // not a literal known at author time, so static import cannot apply.
  let importedModule: unknown
  try {
    importedModule = await import(
      pathToFileURL(path.resolve(configFile)).toString()
    )
  } catch (err) {
    throw new ConfigError(
      `Invalid config file "${configFile}". Error during import`,
      err,
    )
  }
  const exported = S.decodeUnknownSync(ImportedModuleSchema)(importedModule).default
  if (exported === undefined || exported === null || typeof exported !== 'object') {
    throw new ConfigError(
      `Invalid config file "${configFile}". Default export of config file must be an object!`,
    )
  }
  return S.decodeUnknownSync(ConfigDocumentSchema)(exported)
}

/**
 * The resolve act, split out of the deleted `resolveExtendsTarget`. Its
 * relative-path branch became the decision's `read` request; only this branch
 * survives, converting a bare specifier to an absolute path through node's
 * require resolver from the declaring config's directory — never the process
 * working directory (R10). The error message is the pre-split one, verbatim.
 */
function resolveExtendsSpecifier(specifier: string, configDir: string): string {
  const requireFrom = createRequire(path.join(configDir, 'noop.js'))
  try {
    return requireFrom.resolve(specifier)
  } catch (err) {
    throw new ConfigError(
      `Cannot resolve extends target "${specifier}" from "${configDir}"`,
      err,
    )
  }
}

/**
 * Interpret the `extends` decision at the shell boundary (R9, KTD2).
 *
 * Drives `decideExtendsStep` in a plain async loop. The entry document is
 * already read by the caller; each returned request names the act the shell
 * performs — read this absolute path, or resolve this specifier from the
 * declaring directory — and the document the act yields is fed back together
 * with the state the request carried. The shell holds no decision of its own:
 * it only dispatches on the request it received and maps a refusal to the
 * `ConfigError` the pre-split chain surfaced, byte for byte.
 */
export async function resolveExtends(
  configFile: string,
  document: PartialStrykerOptions,
): Promise<PartialStrykerOptions> {
  const absolute = path.resolve(configFile)
  let state: ExtendsStepState = initialExtendsStepState
  let file = absolute
  let currentDocument = document
  for (;;) {
    const outcome = await Match.value(decideExtendsStep(state, currentDocument, file)).pipe(
      Match.tag('done', (value) => ({ kind: 'done' as const, options: value.options })),
      Match.tag('read', (value) =>
        readConfigFile(value.path).then((nextDocument) => ({
          kind: 'next' as const,
          state: value.state,
          file: value.path,
          document: nextDocument,
        }))),
      Match.tag('resolve', (value) => {
        let resolvedPath: string
        try {
          resolvedPath = resolveExtendsSpecifier(value.specifier, value.directory)
        } catch (err) {
          if (err instanceof ConfigError) throw err
          const reason = err instanceof Error ? `. ${err.message}` : ''
          throw new ConfigError(
            `Cannot resolve extends target "${value.specifier}" from "${file}"${reason}`,
            err,
          )
        }
        return readConfigFile(resolvedPath).then((nextDocument) => ({
          kind: 'next' as const,
          state: value.state,
          file: resolvedPath,
          document: nextDocument,
        }))
      }),
      Match.tag('refused', (value) => {
        const message = value.reason === 'cycle'
          ? `Config inheritance cycle detected at "${value.file}"`
          : `Invalid config file "${value.file}". "extends" must be a string`
        throw new ConfigError(message)
      }),
      Match.exhaustive,
    )
    if (outcome.kind === 'done') return outcome.options
    state = outcome.state
    file = outcome.file
    currentDocument = outcome.document
  }
}
