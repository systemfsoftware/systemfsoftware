## 1.4.0

### Minor Changes

- `no-unported-time-source` accepts the virtual clock shipped by `@systemfsoftware/vitest` as a registered port, so that clock's host-timer call is not reported as an unported time source.

- Adds `no-unported-time-source`, enabled at `error` in the recommended config. Production source can no longer call `Date.now`, `performance.now`, `process.hrtime`, `Math.random`, `crypto.getRandomValues`, `crypto.randomUUID`, `setTimeout`, `setInterval`, or `setImmediate`, construct an argument-less `new Date()`, or import `node:timers` or `node:timers/promises`.

  Route those reads through the module that owns the source, and register that module as a port by naming its path, or a path suffix, in the rule's `ports` option. A source injected as a parameter, a local, or an import is not reported, `queueMicrotask` and `new Date(arg)` are not reported, and test and fixture files are outside the rule.
