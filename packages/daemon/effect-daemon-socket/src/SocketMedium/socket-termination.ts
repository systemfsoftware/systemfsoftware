import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Cause, Exit, Match, Option, Schema as S } from 'effect'
import type { Socket } from 'effect/unstable/socket'
import { SocketOsError } from './socket-failure.schema.js'

type TerminationReason = Supervisor.Medium.TerminationReason
type ExitReport = Supervisor.Medium.ExitReport

/** The close code the adapter mints for an orderly end, the only close treated as normal. */
const CLEAN_CLOSE_CODE = 1000

/** The signal an exit report carries when the failure below it is not a Node error at all. */
const DEFECT_SIGNAL = 'defect'

/** The signal a close carries when the peer sent no reason with its close code. */
const UNREASONED_CLOSE_SIGNAL = 'closed'

export const normalTerminationOf = (): TerminationReason => ({ _tag: 'Normal' })

export const shutdownTerminationOf = (): TerminationReason => ({ _tag: 'Shutdown' })

const exitReportOf = (code: number, signal: string): ExitReport => ({ _tag: 'ExitReport', code, signal })

const defectReportOf = (): ExitReport => exitReportOf(0, DEFECT_SIGNAL)

const osReportOf = (cause: Socket.SocketOpenError['cause']): ExitReport =>
  Option.match(S.decodeUnknownOption(SocketOsError)(cause), {
    onNone: defectReportOf,
    onSome: (fields) =>
      exitReportOf(
        Option.getOrElse(Option.fromNullishOr(fields.errno), () => 0),
        Option.getOrElse(Option.fromNullishOr(fields.code), () => DEFECT_SIGNAL),
      ),
  })

/**
 * The failure report a socket reason carries at the `exit` reporting level: the
 * close code with the reason the peer sent, or the OS error a refused dial, a
 * reset connection or a failed read or write raised.
 */
export const failureReportOf = (reason: Socket.SocketErrorReason): Supervisor.Medium.FailureReport =>
  Match.value(reason).pipe(
    Match.tag('SocketCloseError', (close) =>
      exitReportOf(
        close.code,
        Option.getOrElse(Option.fromNullishOr(close.closeReason), () => UNREASONED_CLOSE_SIGNAL),
      )),
    Match.tag('SocketOpenError', (open) => osReportOf(open.cause)),
    Match.tag('SocketReadError', (read) => osReportOf(read.cause)),
    Match.tag('SocketWriteError', (write) => osReportOf(write.cause)),
    Match.tag('SocketUpgradeError', (upgrade) => osReportOf(upgrade.cause)),
    Match.exhaustive,
  )

const abnormalTerminationOf = (reason: Socket.SocketErrorReason): TerminationReason => ({
  _tag: 'Abnormal',
  report: failureReportOf(reason),
})

const terminationOfClose = (close: Socket.SocketCloseError): TerminationReason =>
  Match.value(close.code).pipe(
    Match.when(CLEAN_CLOSE_CODE, normalTerminationOf),
    Match.orElse(() => abnormalTerminationOf(close)),
  )

const terminationOfReason = (reason: Socket.SocketErrorReason): TerminationReason =>
  Match.value(reason).pipe(
    Match.tag('SocketCloseError', (close) => terminationOfClose(close)),
    Match.orElse(() => abnormalTerminationOf(reason)),
  )

const terminationOfFailure = (cause: Cause.Cause<Socket.SocketError>): TerminationReason =>
  Option.match(Cause.findErrorOption(cause), {
    onNone: () => ({ _tag: 'Abnormal', report: defectReportOf() }),
    onSome: (error) => terminationOfReason(error.reason),
  })

/**
 * The child's termination reason: a stop the supervisor asked for is `Shutdown`,
 * an orderly end is `Normal`, and every other way a connection ends — a refused
 * dial, a peer's close code, an OS error on the read or write side — is abnormal
 * with the exit report that failure carried.
 */
export const terminationOf = (parts: {
  readonly stopping: boolean
  readonly exit: Exit.Exit<void, Socket.SocketError>
}): TerminationReason =>
  Match.value(parts.stopping).pipe(
    Match.when(true, shutdownTerminationOf),
    Match.orElse(() =>
      Exit.match(parts.exit, {
        onSuccess: normalTerminationOf,
        onFailure: (cause) =>
          Match.value(Cause.hasInterruptsOnly(cause)).pipe(
            Match.when(true, shutdownTerminationOf),
            Match.orElse(() => terminationOfFailure(cause)),
          ),
      })
    ),
  )
