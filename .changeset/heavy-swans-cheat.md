---
"@systemfsoftware/effect-daemon-socket": minor
---

First release. `SocketMedium` supervises long-lived socket connections as children of an `effect-daemon-spec` supervisor: bind it with `SocketMedium.layer` and declare children with `Supervisor.ChildSpecs.on(SocketMedium.port)`. Each incarnation dials once and is ready when its declared readiness condition holds. A refused dial or a reset reports the operating system error, a peer close reports the close code, and a graceful stop half-closes the connection before forcing it shut.
