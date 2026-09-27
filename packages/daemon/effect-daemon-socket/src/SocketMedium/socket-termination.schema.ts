import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Cause, Exit, Match, Option, Schema } from 'effect'
import { absurd } from 'effect/Function'
import * as Result from 'effect/Result'
import type { Socket } from 'effect/unstable/socket'
import type { PeerCloseDecision } from './classify-peer-close.workflow.js'
import { SocketOsError } from './socket-failure.schema.js'

/**
 * What the socket medium reports when a connection ends. The report vocabulary is the
 * daemon spec's — the medium declares `{ reporting: 'exit' }`, so every failure it
 * reports is an exit-level `ExitReport` (DSK-M3) — and this file homes the socket's
 * operations over it: the mapping from a refusal, a reset, an errored read or write, or
 * a peer's close to the report the supervisor restarts on. The mappings live here, in
 * the mutated set, rather than as private helpers the mutation glob never measures.
 *
 * The peer-close classification is its own decision (`classify-peer-close.workflow.ts`);
 * a schema file cannot import a workflow, so this file consumes the decision as data and
 * the medium pairs each close failure with it.
 */

type ExitReport = Supervisor.Medium.ExitReport
type FailureReport = Supervisor.Medium.FailureReport
type TerminationReason = Supervisor.Medium.TerminationReason
type SocketCause = Cause.Cause<Socket.SocketError>
type CloseFailure = Option.Option<Socket.SocketCloseError>

/** The signal an exit report falls back to when it has no word for what the OS reported. */
const DEFECT_SIGNAL = 'defect'

/** The signal a close carries when its peer gave no reason: the close code is the report. */
const UNREASONED_CLOSE_SIGNAL = 'closed'

const exitReportOf = (code: number, signal: string): ExitReport => ({ _tag: 'ExitReport', code, signal })

const defectReportOf = (): ExitReport => exitReportOf(0, DEFECT_SIGNAL)

/** The report for the OS error a refused dial, a reset connection or an errored read or write raised. */
const osReportOf = (cause: Socket.SocketOpenError['cause']): ExitReport =>
  Option.match(Schema.decodeUnknownOption(SocketOsError)(cause), {
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

/** The exit-level report for a socket failure reason, as the medium's `exit` declaration requires. */
const failureReportOf = (reason: Socket.SocketErrorReason): FailureReport =>
  Match.value(reason).pipe(
    Match.tag(
      'SocketCloseError',
      (close) =>
        exitReportOf(
          close.code,
          Option.getOrElse(Option.fromNullishOr(close.closeReason), () => UNREASONED_CLOSE_SIGNAL),
        ),
    ),
    Match.tag('SocketOpenError', (open) => osReportOf(open.cause)),
    Match.tag('SocketReadError', (read) => osReportOf(read.cause)),
    Match.tag('SocketWriteError', (write) => osReportOf(write.cause)),
    Match.tag('SocketUpgradeError', (upgrade) => osReportOf(upgrade.cause)),
    Match.exhaustive,
  )

const normalTerminationOf = (): TerminationReason => ({ _tag: 'Normal' })

const abnormalTerminationOf = (reason: Socket.SocketErrorReason): TerminationReason => ({
  _tag: 'Abnormal',
  report: failureReportOf(reason),
})

const causeOf = (exit: Exit.Exit<void, Socket.SocketError>): SocketCause =>
  exit.pipe(Exit.getCause, Option.getOrElse(() => Cause.empty))

const closeTerminationOf = (close: Socket.SocketCloseError, decision: PeerCloseDecision): TerminationReason =>
  Match.value(decision).pipe(
    Match.tag('PeerClosedCleanly', normalTerminationOf),
    Match.tag('PeerClosedAbnormally', () => abnormalTerminationOf(close)),
    Match.exhaustive,
  )

const reasonTerminationOf = (
  reason: Socket.SocketErrorReason,
  decision: Option.Option<PeerCloseDecision>,
): TerminationReason =>
  Match.value(reason).pipe(
    Match.tag(
      'SocketCloseError',
      (close) =>
        Option.match(decision, {
          onNone: () => abnormalTerminationOf(reason),
          onSome: (present) => closeTerminationOf(close, present),
        }),
    ),
    Match.orElse(() => abnormalTerminationOf(reason)),
  )

const failureTerminationOf = (
  exit: Exit.Exit<void, Socket.SocketError>,
  decision: Option.Option<PeerCloseDecision>,
): TerminationReason =>
  Option.match(Cause.findErrorOption(causeOf(exit)), {
    onNone: () => ({ _tag: 'Abnormal', report: defectReportOf() }),
    onSome: (error) => reasonTerminationOf(error.reason, decision),
  })

/** A terminating connection's evidence: whether a stop was asked for, how the child's fiber ended, and the peer-close decision when the failure was the peer closing. */
export interface SocketChildOutcome {
  readonly stopping: boolean
  readonly exit: Exit.Exit<void, Socket.SocketError>
  readonly peerClose: Option.Option<PeerCloseDecision>
}

/** The `Shutdown` reason the medium reports when its evidence is not one of its own. */
export const shutdownTerminationOf = (): TerminationReason => ({ _tag: 'Shutdown' })

/** The peer close the exit failed with, when the failure was the peer closing the connection. */
export const closeFailureOf = (exit: Exit.Exit<void, Socket.SocketError>): CloseFailure =>
  Option.flatMap(Cause.findErrorOption(causeOf(exit)), (error) =>
    Match.value(error.reason).pipe(
      Match.tag('SocketCloseError', (close) => Option.some(close)),
      Match.orElse(() => Option.none()),
    ))

/**
 * The child's termination reason: the spec's own stopping/normal/abnormal split, with an
 * abnormal end reported from the failure the fiber died with. The peer-close decision,
 * when there is one, separates an orderly peer close from an abnormal one.
 */
export const terminationOf = (outcome: SocketChildOutcome): TerminationReason =>
  Match.value(
    Result.match(
      Supervisor.classifyChildExit(
        new Supervisor.ClassifyChildExit({ stopping: outcome.stopping, exit: outcome.exit }),
      ),
      { onFailure: (error: never): never => absurd(error), onSuccess: (decision) => decision },
    ),
  ).pipe(
    Match.tag('Normal', normalTerminationOf),
    Match.tag('Shutdown', shutdownTerminationOf),
    Match.tag('Abnormal', () => failureTerminationOf(outcome.exit, outcome.peerClose)),
    Match.exhaustive,
  )
