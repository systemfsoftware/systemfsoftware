---
'@systemfsoftware/stryker-js': minor
"@systemfsoftware/stryker-js-engine": minor
---

Checker and test-runner workers now talk over Effect's own worker RPC, and every
call they exchange is a declared operation with a declared result.

Before, the parent and its workers spoke a protocol written by hand: messages were
newline-delimited JSON, arguments were typed as "any JSON value", and each method
was reached by name through a proxy. Nothing checked that a payload was one the far
end could serve, so a value it could not read was refused after it arrived, and a
call whose message never landed was waited on anyway.

The six operations that cross that boundary — a checker's `check` and `group`, a
runner's `capabilities`, `dryRun` and `mutantRun` — now each name what they take
and what they return, and the options a worker starts from are sent once when it
starts rather than as a first method call. A payload that does not fit is refused
where it is built, and a worker that cannot answer fails the call that was waiting.

The two worker entry points are no longer importable subpaths of this package.
They were only ever spawned as processes, and the paths resolved to TypeScript
sources that could not be executed.
