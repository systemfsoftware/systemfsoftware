import * as Exit from 'effect/Exit'

import { describeFailure, remediationFor, unrecognizedArgumentOf } from './cli-failure-text.kernel.js'
import { STREAM_SCHEMA_VERSION } from './stream-protocol.js'

export interface ErrorEnvelope {
  readonly schemaVersion: string
  readonly code: number
  readonly error: string
  readonly remediation: string
}

export function buildErrorEnvelope(
  exit: Exit.Exit<unknown, unknown>,
  code: number,
  captured: string,
  argv: readonly string[],
): ErrorEnvelope {
  // An unrecognized argument is the wire contract's own message, not the
  // framework's usage document: the document is what --help is for.
  const unrecognized = unrecognizedArgumentOf(exit, argv)
  return {
    schemaVersion: STREAM_SCHEMA_VERSION,
    code,
    error: unrecognized !== undefined
      ? `Received unknown argument: '${unrecognized}'`
      : captured.length > 0
      ? captured
      : describeFailure(exit),
    remediation: remediationFor(exit, code),
  }
}
