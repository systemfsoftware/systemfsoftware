import { Schema } from 'effect'

export const BecomeReady = Schema.TaggedStruct('BecomeReady', {})
export type BecomeReady = typeof BecomeReady.Type

export const ExitNormal = Schema.TaggedStruct('ExitNormal', {})
export type ExitNormal = typeof ExitNormal.Type

export const ExitAbnormal = Schema.TaggedStruct('ExitAbnormal', {})
export type ExitAbnormal = typeof ExitAbnormal.Type

export const IgnoreGracefulStop = Schema.TaggedStruct('IgnoreGracefulStop', {})
export type IgnoreGracefulStop = typeof IgnoreGracefulStop.Type

export const NeverBecomeReady = Schema.TaggedStruct('NeverBecomeReady', {})
export type NeverBecomeReady = typeof NeverBecomeReady.Type

/**
 * The closed set of scripted child steps a conformance control channel drives
 * (KTD14): become ready, exit normal, exit abnormal, run past a graceful stop,
 * or never become ready. A step reaches the child over its medium's own control
 * channel — a queue for the fiber reference, stdin or a loopback socket for the
 * process, socket and microVM fixtures — never through the supervisor's
 * mailbox, so no control step ever appears in a trace.
 */
export const ChildStep = Schema.Union([BecomeReady, ExitNormal, ExitAbnormal, IgnoreGracefulStop, NeverBecomeReady])
export type ChildStep = typeof ChildStep.Type

/** A child's medium-independent script; translating it into a program is the driver's job. */
export const ChildScript = Schema.Array(ChildStep)
export type ChildScript = typeof ChildScript.Type
