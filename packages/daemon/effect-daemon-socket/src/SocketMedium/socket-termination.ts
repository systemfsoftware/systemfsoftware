import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Cause, Exit, Match, Option, Result, Schema as S } from 'effect'
import { absurd } from 'effect/Function'
import type { Socket } from 'effect/unstable/socket'
import { ClassifyPeerClose, classifyPeerClose, type PeerCloseDecision } from './classify-peer-close.workflow.js'
import { SocketOsError } from './socket-failure.schema.js'

type TerminationReason = Supervisor.Medium.TerminationReason
type ExitReport = Supervisor.Medium.ExitReport

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
    onSome: (osError) =>
      Match.value(osError).pipe(
        Match.tag('SocketOsErrnoAndCode', (both) => exitReportOf(both.errno, both.code)),
        Match.tag('SocketOsErrnoOnly', (numbered) => exitReportOf(numbered.errno, DEFECT_SIGNAL)),
        Match.tag('SocketOsCodeOnly', (named) => exitReportOf(0, named.code)),
        Match.tag('SocketOsUnrecognized', () => defectReportOf()),
        Match.exhaustive,
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

const peerCloseOf = (close: Socket.SocketCloseError): PeerCloseDecision =>
  Result.match(classifyPeerClose(new ClassifyPeerClose({ code: close.code })), {
    onFailure: (error: never): never => absurd(error),
    onSuccess: (decision) => decision,
  })

const terminationOfClose = (close: Socket.SocketCloseError): TerminationReason =>
  Match.value(peerCloseOf(close)).pipe(
    Match.tag('PeerClosedCleanly', normalTerminationOf),
    Match.tag('PeerClosedAbnormally', () => abnormalTerminationOf(close)),
    Match.exhaustive,
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

const causeOf = (exit: Exit.Exit<void, Socket.SocketError>): Cause.Cause<Socket.SocketError> =>
  exit.pipe(Exit.getCause, Option.getOrElse(() => Cause.empty))

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
  Match.value(
    Result.match(
      Supervisor.classifyChildExit(new Supervisor.ClassifyChildExit({ stopping: parts.stopping, exit: parts.exit })),
      { onFailure: (error: never): never => absurd(error), onSuccess: (decision) => decision },
    ),
  ).pipe(
    Match.tag('Normal', normalTerminationOf),
    Match.tag('Shutdown', shutdownTerminationOf),
    Match.tag('Abnormal', () => parts.exit.pipe(causeOf, terminationOfFailure)),
    Match.exhaustive,
  )
