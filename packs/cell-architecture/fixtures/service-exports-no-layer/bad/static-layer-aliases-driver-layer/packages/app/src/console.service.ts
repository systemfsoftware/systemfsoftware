import * as Context from 'effect/Context'
import { consoleLayer } from './stdout-console.js'

export class Console extends Context.Service<Console, { readonly write: (line: string) => void }>()('app/Console') {
  static readonly layer = consoleLayer
}
