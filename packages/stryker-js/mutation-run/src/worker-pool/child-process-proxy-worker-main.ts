import { createInjector } from 'typed-inject'

import { ChildProcessProxyWorker } from './child-process-proxy-worker.js'

// Composition root: the worker object graph is composed here, at the process
// entry point. This file must not export anything importable — a bundler is
// free to hoist any importable module into a shared chunk, so a module that
// both exports a class and self-detects as the entry (`import.meta.url ===
// process.argv[1]`) cannot survive code splitting: the guard moves into the
// chunk, never matches, and the forked child exits silently. Being executed
// as this entry IS the declaration.
new ChildProcessProxyWorker(createInjector)
