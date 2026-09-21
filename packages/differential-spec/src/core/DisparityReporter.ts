import { Cause, Exit } from 'effect'
import type { DisparityRecord } from './RelationalOracle.js'

const stringify = (value: unknown): string | undefined => {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return undefined
  }
}

export const renderUnknown = (value: unknown): string => stringify(value) ?? String(value)

export const renderExit = <A, E>(exit: Exit.Exit<A, E>): string =>
  Exit.isSuccess(exit) ? renderUnknown(exit.value) : Cause.pretty(exit.cause)

export const formatDisparity = (record: DisparityRecord): string => {
  const lines = [
    `Differential test failed!`,
    `Input: ${renderUnknown(record.input)}`,
    `Output A: ${record.outputA}`,
    `Output B: ${record.outputB}`,
    `Trace: ${record.trace}`,
    `Reproduction Snippet:`,
    record.reproSnippet,
  ]
  return lines.join('\n')
}
