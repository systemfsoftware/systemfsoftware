---
"@systemfsoftware/effect-cell-types": major
---

`Tagged` no longer ships in the `Workflow` namespace.

The requirement it expressed is unchanged: a decision error must still carry a tag the consumer can
dispatch on, and `UntaggedError` still names the failure when one does not. Replace an annotation
that referred to `Workflow.Tagged` with the concrete error type, or with a `Schema.TaggedError`
class, which satisfies the channel directly.
