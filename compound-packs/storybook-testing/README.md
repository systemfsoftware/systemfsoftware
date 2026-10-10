# Storybook Testing Compound Pack

How a UI is proven at composition altitude in Storybook: what a story may substitute, how the I/O fake stays honest to the real Layer, how a scenario reads, how scenario state is set, how the browser run asserts, and where UI behaviour is proven.

Rules:

- `mock-at-the-io-seam-only`: a UI composition test substitutes one module, the one that composes the app's typed I/O Layer, through Storybook's sibling `__mocks__/` module.
- `io-fake-typed-to-its-port`: the fake Layer is typed against the real Layer and composed from each port's `layerTest`, with no cast stand-ins.
- `storybook-io-fake-parity-law`: one shared history runs against the fake and the real Layer on a local oracle.
- `story-is-the-spec`: a journey is a short embedded Gherkin scenario in domain language over reusable steps.
- `states-via-fixture-controls`: scenario state and faults come from a domain-free controls DSL, bound once and reset by construction.
- `real-browser-a11y-and-interaction`: stories run in a real browser, axe failures are errors, assertions go through accessible roles, and responsive and visual claims carry their evidence.
- `stories-are-the-ui-integration-tests`: UI behaviour is proven in stories, with no RTL suite and no unit test of a UI shell.

Boundary adapters and their doubles are governed by `boundary-testing/no-mocks-on-internal-glue.md`, a store's own law suite by `boundary-testing/fake-and-real-store-laws.md`, and local system oracles by `boundary-testing/real-system-oracles.md`. Where `layerTest` and real implementations live is `cell-architecture/service-and-layer-boundaries.md`'s concern. The `sb.mock` setup, browser provider, viewports and CI sharding live in tool config.
