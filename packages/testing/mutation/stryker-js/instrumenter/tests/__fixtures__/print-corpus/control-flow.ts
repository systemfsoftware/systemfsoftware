// Control-flow statements: switch, loops, try, labeled, with the empty and
// degenerate forms the statement mutator wraps.
label: for (const item of list) {
  if (item === null) continue label
  if (item === undefined) break
}

outer: while (running) {
  inner: do {
    running = step()
    if (!running) break outer
  } while (false)
}

switch (mode) {
  case 'a': {
    run()
    break
  }
  case 'b':
  case 'c':
    run('bc')
    break
  default:
    run('other')
}

try {
  risky()
} catch (error: unknown) {
  recover(error)
} finally {
  cleanup()
}

try {
  risky()
} catch {
  recover()
}

for (let i = 0; i < 10; i++) sum += i
for (; running;) tick()
for (const key in map) walk(map[key])

export { list, map, mode, running, sum }
