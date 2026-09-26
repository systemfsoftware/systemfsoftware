import * as Layer from 'effect/Layer'
import { CliOutput } from 'effect/unstable/cli'

import { bannerText } from '../console-text.js'
import { extractorVersion } from '../version.js'

const withBanner = (text: string): string => `${bannerText(extractorVersion)}\n${text}`

/**
 * Upstream's `start.ts` prints the banner before it parses anything, so help and version output
 * carry it too. The framework renders that output through this formatter; error sections stay
 * banner-free because upstream keeps the banner on standard output, apart from the error text.
 */
export const layer: Layer.Layer<never> = (() => {
  const base = CliOutput.defaultFormatter()
  return CliOutput.layer({
    formatCliError: (error) => base.formatCliError(error),
    formatError: (error) => base.formatError(error),
    formatErrors: (errors) => base.formatErrors(errors),
    formatHelpDoc: (doc) => withBanner(base.formatHelpDoc(doc)),
    formatVersion: (name, version) => withBanner(base.formatVersion(name, version)),
  })
})()
