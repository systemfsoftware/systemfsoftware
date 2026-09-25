const FRAME = /^.*?\(?((?:file:\/\/)?\/[^()\s]+:\d+:\d+)\)?\s*$/

const INTERNAL = /\/effect-cell-types\/(?:src|dist)\/|node_modules|node:/

export const callSite = (): string => {
  const [outside = ''] = String(new Error().stack).split('\n').slice(1).filter((line) => !INTERNAL.test(line))
  return outside.trim().replace(FRAME, '$1').replace(/^file:\/\//, '')
}
