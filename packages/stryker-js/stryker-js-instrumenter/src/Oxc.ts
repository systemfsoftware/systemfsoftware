import type * as OxcModule from 'oxc-parser'

type Oxc = typeof OxcModule

let oxc: Oxc | undefined

export const loadOxc = async (): Promise<Oxc> => {
  if (oxc === undefined) {
    // Lazy: importing this package must not construct a parser.
    oxc = await import('oxc-parser')
  }
  return oxc
}
