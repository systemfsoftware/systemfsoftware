## 0.4.0

### Minor Changes

- HTTP readiness evidence decodes the peer's status line into a branded `StatusCode` (an integer from 100 to 599): `Responded` now carries `statusCode` instead of `statusLine`, and its encoded form is still the raw status line. A line with no readable status code is refused at decode with a domain message, and the probe keeps waiting. A custom `HostProber` returns `{ _tag: 'Responded', statusCode }`. `TimedOut` is a tagged struct instead of a class: build it with `TimedOut.make({})`.

### Patch Changes

- Every tagged error class now has a one-line message built from its fields, so a failure shows what went wrong instead of an empty message.
