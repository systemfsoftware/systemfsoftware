import {
  decodeTransitionDiagram,
  type DiagramDefect,
  type DiagramNodeKind,
  type TransitionDiagram,
} from '@systemfsoftware/transition-diagram'
import { Array as Arr, type Result } from 'effect'

export const TURNSTILE_ID = 'turnstile'

export interface TurnstileState {
  readonly id: string
  readonly label: string
  readonly kind: DiagramNodeKind
}

export interface TurnstileRow {
  readonly from: string
  readonly to: string
  readonly event: string
  readonly guard?: string
  readonly kind: 'normal' | 'error'
}

export const TURNSTILE_STATES: ReadonlyArray<TurnstileState> = [
  { id: 'locked', label: 'Locked', kind: 'initial' },
  { id: 'admit', label: 'Admit', kind: 'decision' },
  { id: 'unlocked', label: 'Unlocked', kind: 'outcome' },
  { id: 'alarm', label: 'Alarm', kind: 'error' },
  { id: 'closed', label: 'Closed', kind: 'final' },
]

export const TURNSTILE_TABLE: ReadonlyArray<TurnstileRow> = [
  { from: 'locked', to: 'admit', event: 'Coin', guard: 'hasFare', kind: 'normal' },
  { from: 'admit', to: 'unlocked', event: 'Allow', kind: 'normal' },
  { from: 'admit', to: 'alarm', event: 'Deny', kind: 'error' },
  { from: 'unlocked', to: 'locked', event: 'Push', kind: 'normal' },
  { from: 'alarm', to: 'closed', event: 'Reset', kind: 'normal' },
]

const transitionOf = (row: TurnstileRow) => ({ ...row })

export const turnstileToDiagram = (): Result.Result<TransitionDiagram, ReadonlyArray<DiagramDefect>> =>
  decodeTransitionDiagram({
    id: TURNSTILE_ID,
    title: 'turnstile',
    states: TURNSTILE_STATES,
    transitions: Arr.map(TURNSTILE_TABLE, transitionOf),
  })
