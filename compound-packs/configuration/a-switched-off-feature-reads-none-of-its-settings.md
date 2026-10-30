---
title: A feature that can be switched off has an Enabled | Disabled <Feature>Config, and its layer reads the feature's other settings only when it is on
applies_when:
  - adding a switch that turns a feature off
  - making a feature's credentials or settings optional
  - reading a feature's settings when the feature may be disabled
tags: [config, feature-switch, tagged-union, context]
---

`<Feature>Config` for a feature that can be switched off is a tagged value: Disabled carries nothing, Enabled carries every setting the feature needs, each one required.

Its layer reads the switch first and the feature's other variables only on the Enabled branch, so the application starts with the feature off and none of its other variables set.

Code dispatches on the tag. Never probe an optional setting (`if (config.apiKey)`) to learn whether the feature is on (schema-modelling pack, states-are-tagged-unions.md).

```typescript
// WRONG: an optional credential stands in for the switch
readonly apiKey: Option.Option<Redacted.Redacted<string>>
// RIGHT
| { readonly _tag: 'Disabled' }
| { readonly _tag: 'Enabled'; readonly apiKey: Redacted.Redacted<string> }
```
