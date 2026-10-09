import * as Context from 'effect/Context'
import { probeLayer } from './drivers/probe.js'

export class Probe extends Context.Service<Probe, { readonly tty: boolean }>()('app/Probe') {}

export const ProbeLive = probeLayer
