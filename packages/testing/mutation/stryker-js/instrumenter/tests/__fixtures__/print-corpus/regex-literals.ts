// Regex literals and regex-adjacent shapes the mutators synthesize or mutate.
const pattern = /ab+c/gi
const flagsOnly = /$^/g
const charClass = /[a-z_\d-]+/
const escaped = /\/home\/user/
const forward = /a|b|c/
new RegExp('pattern', 'g')
const fromCall = new RegExp(pattern)
export { charClass, escaped, forward, fromCall, pattern }
