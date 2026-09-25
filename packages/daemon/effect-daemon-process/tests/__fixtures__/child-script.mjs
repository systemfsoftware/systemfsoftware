import { appendFileSync } from 'node:fs'

const journal = process.argv[2]

const note = (line) => {
  if (journal === undefined) return
  appendFileSync(journal, `${line}\n`)
}

if (journal !== undefined) {
  appendFileSync(journal, `PID ${process.pid}\n`)
}

const steps = {
  BecomeReady: () => {
    process.stdout.write('READY\n')
  },
  ExitNormal: () => {
    process.exit(0)
  },
  ExitAbnormal: () => {
    process.kill(process.pid, 'SIGKILL')
  },
  IgnoreGracefulStop: () => {
    process.on('SIGTERM', () => note('TERM'))
    note('IGNORE')
  },
  NeverBecomeReady: () => {},
}

const apply = (tag) => {
  const step = steps[tag]
  if (step !== undefined) step()
}

let pending = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  pending += chunk
  const lines = pending.split('\n')
  pending = lines.pop() ?? ''
  for (const line of lines) {
    if (line.length > 0) apply(line)
  }
})
