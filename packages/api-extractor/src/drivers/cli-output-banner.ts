import * as Layer from 'effect/Layer'
import { CliOutput } from 'effect/unstable/cli'

import { bannerText } from '../console-text.js'
import { extractorVersion } from '../version.js'

const withBanner = (text: string): string => `${bannerText(extractorVersion)}\n${text}`

/**
 * Upstream's `start.ts` prints the banner before it parses anything, so help and version output
 * carry it too. The framework renders that output through this driver, which decorates the
 * formatter it is handed; error sections stay banner-free because upstream keeps the banner on
 * standard output, apart from the error text.
 */
export const layer = (formatter: CliOutput.Formatter = CliOutput.defaultFormatter()): Layer.Layer<never> =>
  CliOutput.layer({
    formatCliError: (error) => formatter.formatCliError(error),
    formatError: (error) => formatter.formatError(error),
    formatErrors: (errors) => formatter.formatErrors(errors),
    formatHelpDoc: (doc) => withBanner(formatter.formatHelpDoc(doc)),
    formatVersion: (name, version) => withBanner(formatter.formatVersion(name, version)),
  })
