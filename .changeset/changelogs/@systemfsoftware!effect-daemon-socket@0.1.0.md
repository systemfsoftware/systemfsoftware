## 0.1.0

### Minor Changes

- First release. `SocketMedium` supervises long-lived socket connections as children of an `effect-daemon-spec` supervisor: bind it with `SocketMedium.layer` and declare children with `Supervisor.ChildSpecs.on(SocketMedium.port)`. Each incarnation dials once and is ready when its declared readiness condition holds. A refused dial or a reset reports the operating system error, a peer close reports the close code, and a graceful stop half-closes the connection before forcing it shut.

  The medium dials through `SocketMedium.Dialer`, and `SocketMedium.makeLoopbackServer` listens through `SocketMedium.LoopbackListener`. Both default to Node sockets; provide a layer for either port to run the medium over another transport.
