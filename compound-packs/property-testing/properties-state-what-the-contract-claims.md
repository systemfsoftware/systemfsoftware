---
title: A property states something the contract claims, in a shape that can catch a real defect; a property the author only believes is never written
applies_when:
  - choosing which properties to write for a published operation, a decision or a codec
  - a property's statement has no clause in the docs, the schema, the types or the callers that it can cite
  - a file's properties all exercise one helper while the published operation it serves has none
tags: [property-test, contract, round-trip, metamorphic, differential, invariant]
---

Every property cites the evidence that the code claims it: the operation's published docs, its schema or types, a sibling operation it pairs with (`encode` and `decode`), or what its callers rely on. A property the author thinks is true but nothing claims is not written; when it does catch a failure, that failure is a question for the contract's owner, not a bug.

Look for these shapes, strongest first:

- **Round trip and inverse pairs**: `decode(encode(x)) = x`, `cancel(reserve(x))` restores the room count, `remove` undoes `add`.
- **Differential**: the operation agrees with a simpler model or a second implementation written from the contract (oracles-are-independent-of-the-code-under-test.md).
- **Metamorphic**: a known relation between two runs holds without knowing either answer, for example adding a night to a stay never lowers its price.
- **Invariant**: a quantity or set the contract says is preserved or bounded (a filter never grows its input; a sort keeps the same members).
- **Algebraic**: idempotence `f(f(x)) = f(x)`, commutativity, or confluence: independent steps applied in any order reach the same state.
- **Never crashes**: every input the contract admits is accepted without a defect. This is the weakest shape. Write it only for an entry whose contract is "accepts every X" (a parser), and never as a file's only property.

Put the properties on the published operations, and prefer one property that relates several operations over several that each restate one. A property over an internal helper counts only where the helper is the decision itself.

Source: the property-based-testing agent by Muhammad Maaz ([agentic-pbt](https://github.com/mmaaz-git/agentic-pbt)), published on the Hypothesis project's site ([article](https://hypothesis.works/articles/claude-code-plugin/)).

```typescript
// WRONG: nothing claims a discount always lowers the price; the published rate rules allow a zero discount
it.prop(
  '∀b_Quote_→DiscountLowersPrice',
  { of: [Booking], subject: quote },
  (subject, [b]) => subject(withDiscount(b)).total < subject(b).total,
)
// RIGHT: the confirmation codec publishes encode and decode as a pair
it.prop(
  '∀c_Confirmation_→RoundTrips',
  { of: [Confirmation] },
  (_, [c]) => Equal.equals(decodeConfirmation(encodeConfirmation(c)), c),
)
```
