---
"@systemfsoftware/effect-daemon-spec": major
---

The supervisor now closes each child incarnation's scope after the medium's `stop` returns, including when `stop` fails. A medium's `stop` no longer closes the scope its `start` ran in; effect 4.0.0's `Scope.close` accepts only `Scope.Closeable`, which the ambient `Scope` is not.
