import { instrument } from './instrumenter.js'

export { instrument }

/**
 * Migration helper retaining the previous factory name.
 * New code should import `instrument` directly.
 */
export function createInstrumenter() {
  return { instrument }
}
