import { Array as Arr } from 'effect'
import type { Discovered } from './discover.js'

export interface DiagramRunOptions {
  readonly cwd: string
}

export interface DiagramReport {
  readonly exitCode: number
  readonly messages: ReadonlyArray<string>
  readonly machines: number
  readonly workflows: number
  readonly files: number
}

export const machineCountOf = (discovered: ReadonlyArray<Discovered>): number =>
  Arr.filter(discovered, (item) => item.kind === 'machine').length

export const workflowCountOf = (discovered: ReadonlyArray<Discovered>): number =>
  Arr.filter(discovered, (item) => item.kind === 'workflow').length
