export const resolvedThroughFallback = (traces: ReadonlyArray<string>): boolean => {
  let i = 0
  while (i < traces.length) {
    i = traces.indexOf('Entering conditional exports.', i)
    if (i === -1) {
      return false
    }
    if (scanExportsForFallback()) {
      return true
    }
  }
  return false

  function scanExportsForFallback(): boolean {
    i++
    let seenFailure = false
    for (; i < traces.length; i++) {
      if (traces[i].startsWith("Failed to resolve under condition '")) {
        seenFailure = true
      } else if (seenFailure && traces[i].startsWith("Resolved under condition '")) {
        return true
      } else if (traces[i] === 'Entering conditional exports.') {
        if (scanExportsForFallback()) {
          return true
        }
      } else if (traces[i] === 'Exiting conditional exports.') {
        return false
      }
    }
    return false
  }
}
