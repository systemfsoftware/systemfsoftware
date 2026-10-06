---
"@systemfsoftware/xstate": minor
"@systemfsoftware/xstate-effect": minor
"@systemfsoftware/xstate-test": minor
"@systemfsoftware/xstate-react": minor
"@systemfsoftware/xstate-store": minor
"@systemfsoftware/xstate-store-react": minor
---

Add the XState v6 packages under the `@systemfsoftware` scope, forked from statelyai/xstate's `next` branch as of 2026-10-05 (MIT): `@systemfsoftware/xstate` (statecharts, actors, and the `/actors`, `/durable`, `/fsm`, `/graph` and `/validation` entry points), `@systemfsoftware/xstate-effect`, `@systemfsoftware/xstate-test`, `@systemfsoftware/xstate-react`, `@systemfsoftware/xstate-store` and `@systemfsoftware/xstate-store-react`. They behave like upstream's 6.0.0-alpha.64 line, and need Effect 4.0.1 or later. Under `exactOptionalPropertyTypes`, optional members that can hold `undefined` declare it explicitly.
