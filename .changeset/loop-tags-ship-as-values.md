---
"@systemfsoftware/effect-daemon-spec": minor
---

The loop kinds now ship their tags as values.

`PollLoopTag`, `StreamLoopTag` and `SubscriptionLoopTag` are new exports: each is a shared `{ _tag }`
value together with a type of the same name, and `PollLoop`, `StreamLoop` and
`SubscriptionLoop` inherit their discriminant from it. Members, tag strings and every existing
narrowing are unchanged, and constructing a loop can now spread the carrier instead of repeating
the literal.
