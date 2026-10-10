# Storybook Testing Compound Pack

How a UI's behaviour is proven with Storybook stories: where a story gets its I/O and how each story's fakes start fresh, how a journey reads, how a story finds and asserts, where stories run and what fails them, when a layout claim counts, and which test kind proves what a person sees.

Rules:

- `stories-compose-at-their-own-root`: the preview gives stories port fakes through the provider the production entry uses; no first-party module is substituted by `sb.mock`, alias or subpath import.
- `fresh-fakes-per-story`: every story starts from freshly built fakes and sets I/O state only through their configurable responses.
- `journeys-are-embedded-gherkin`: a journey is one short embedded scenario whose Given sets state, whose one When acts, whose Then asserts what a person observes, and whose steps hold every query.
- `real-browser-axe-as-error`: stories run in a real browser with axe violations failing the command-line run; an exception disables one named rule with its reason.
- `assert-through-accessible-queries`: play functions and steps find elements by role, label or text, never by test id or selector.
- `pin-the-viewport-a-claim-needs`: a layout claim pins `globals.viewport`, and a responsive claim is proven on each side of the breakpoint.
- `stories-are-the-ui-integration-tests`: user-visible behaviour is proven by stories over the real app, not by a simulated-DOM suite or a shell test against a double.

What makes a port fake admissible, and how adapters are tested against local oracles, is governed by boundary-testing (`port-fakes-pass-the-port-contract.md`, `real-system-oracles.md`, `no-mocks-on-internal-glue.md`). The step DSL's API is documented by the `@systemfsoftware/storybook-gherkin` README and its API report.
