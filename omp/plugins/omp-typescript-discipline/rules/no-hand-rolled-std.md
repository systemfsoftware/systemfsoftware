---
description: Prefer Effect / JSR @std/* over hand-rolled encoding, async, bytes, path, dates, uuid, and crypto primitives
condition: '(btoa\s*\(|atob\s*\(|Buffer\.from\([^)]*base64|\.toString\([^)]*base64|charCodeAt[^\n]*toString\(16\)|new\s+Date\s*\(|Date\.now\(\)|toISOString\(\)|getTimezoneOffset|randomUUID|createHash|crypto\.subtle|new\s+Promise\s*\(\s*\w+\s*=>\s*setTimeout|clearTimeout\s*\(|for\s*\([^)]*\)\s*\{[^\}]*setTimeout|Uint8Array[\s\S]*?for\s*\(|\.split\(|\+[\x22\x27]\/[\x22\x27])'
scope:
  - "tool:edit(**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs})"
  - "tool:write(**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs})"
interruptMode: 'tool-only'
---

> **Precedence: Effect-native > `@std/*` > hand-rolled.** If the edited file already imports from `"effect"` (portable signal `from "effect"`), prefer Effect for async; otherwise use `@std/*`. Encoding/bytes/path have no Effect overlap — always `@std/*`.

Hand-rolled primitives reinvent tested correctness, lose typed errors/interruption, and inflate bundle and review cost. Use the stdlib.

| Hand-rolled signal                                                                     | Effect-native (if `from "effect"` in file)                     | `@std/*` fallback                       | Import example                                                               |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| `btoa`/`atob`, `Buffer.from(x,'base64')`, `.toString('base64')`                        | —                                                              | `jsr:@std/encoding`                     | `import {encodeBase64, decodeBase64} from "jsr:@std/encoding"`               |
| hex loop `charCodeAt`→`toString(16)` table                                             | —                                                              | `jsr:@std/encoding`                     | `import {encodeHex, decodeHex} from "jsr:@std/encoding"`                     |
| `new Promise(r=>setTimeout(r,ms))`                                                     | `Effect.sleep(Duration.millis(ms))`                            | `jsr:@std/async` `delay`                | `import {delay} from "jsr:@std/async"` / `yield* Effect.sleep("100 millis")` |
| `clearTimeout`/`setTimeout` debounce/throttle closure                                  | `Schedule` / `Effect` composition                              | `jsr:@std/async` `debounce`             | `import {debounce} from "jsr:@std/async"`                                    |
| retry loop `for/while`+`try/catch`+`setTimeout`                                        | `Effect.retry({schedule: Schedule.exponential("100 millis")})` | `jsr:@std/async` `retry`                | `import {retry} from "jsr:@std/async"`                                       |
| concurrency pool `for`+`await`                                                         | `Effect.forEach(arr, fn, {concurrency:4})` / `Stream`          | `jsr:@std/async` `pooledMap`            | `import {pooledMap} from "jsr:@std/async"`                                   |
| `Uint8Array` manual concat/copy `for` loop                                             | —                                                              | `jsr:@std/bytes`                        | `import {concat} from "jsr:@std/bytes"`                                      |
| `dir + "/" + name`, `split("/")` path surgery                                          | —                                                              | `jsr:@std/path`                         | `import {join} from "jsr:@std/path"`                                         |
| `new Date()`, `Date.now()`, `toISOString()`, `getTimezoneOffset` hand-rolled date math | —                                                              | `jsr:@std/datetime` / `Temporal`        | `import {format} from "jsr:@std/datetime"`                                   |
| `randomUUID`, `uuid()` hand-rolled ids                                                 | —                                                              | `jsr:@std/uuid` / `crypto.randomUUID()` | `import {v4} from "jsr:@std/uuid"` / `crypto.randomUUID()`                   |
| `createHash`, `crypto.subtle` hand-rolled hashing                                      | —                                                              | `jsr:@std/crypto`                       | `import {crypto} from "jsr:@std/crypto"`                                     |

Resolver: `jsr:@std/*` in Deno, or `jsr:` catalog / `npm:@jsr/std__*` in Node/pnpm (one illustrative `catalog:` pin `"@std/encoding": "jsr:^1.0.11"`).

**When not to apply:** already using `Effect-native` or `jsr:@std/*`; genuine polyfill for legacy runtime with comment; trivial one-off helper justified in review.
