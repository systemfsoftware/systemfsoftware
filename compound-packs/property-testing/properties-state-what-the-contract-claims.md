---
title: A property states a relationship the contract claims, in a shape a constant or echoing implementation fails; a property the author only believes is never written
applies_when:
  - choosing which properties to write for a published operation or a decision
  - a property's statement has no clause in the docs, the schema, the types or the callers that it can cite
  - a property asserts only that a call does not crash, returns something, or echoes an input field
  - a file's properties all exercise one helper while the published operation it serves has none
tags: [property-test, contract, inverse, metamorphic, differential, invariant]
---

Every property cites the evidence that the code claims it: the operation's published docs, its schema or types, a sibling operation it pairs with, or what its callers rely on. A property the author thinks is true but nothing claims is not written; when it does catch a failure, that failure is a question for the contract's owner, not a bug.

State a relationship that a constant, an echo of the input or a skipped field would break. Look for these shapes, strongest first:

- **Inverse pairs**: `cancel(reserve(x))` restores the free-room count; `remove` undoes `add`.
- **Differential**: the operation agrees with a simpler model or a second implementation written from the contract (oracles-are-independent-of-the-code-under-test.md).
- **Metamorphic**: a known relation between two runs holds without knowing either answer. For example, adding a night to a stay never lowers its price.
- **Conservation and invariants**: a quantity or set the contract says is preserved or bounded. Splitting a bill loses nothing; a filter never grows its input; a sort keeps the same members.
- **Algebraic**: idempotence `f(f(x)) = f(x)`, commutativity, associativity, or confluence: independent steps applied in any order reach the same state.

"Does not crash", "returns a value", a length that is never negative, and a field copied from input to output are not properties: a trivial implementation passes them (properties-are-shown-to-fail.md). A schema's codec laws (decode after encode) are generated for every exported schema and never written by hand (schema-modelling pack).

Put the properties on the published operations and the decisions behind them, and prefer one property that relates several operations over several that each restate one.

Source: the property-based-testing agent by Muhammad Maaz ([agentic-pbt](https://github.com/mmaaz-git/agentic-pbt)), published on the Hypothesis project's site ([article](https://hypothesis.works/articles/claude-code-plugin/)), and the `architect-property-tests` skill (rule PT4).

```typescript
// WRONG: nothing claims a discount always lowers the price; the published rate rules allow a zero discount
it.prop(
  '∀b_Quote_→DiscountLowersPrice',
  { of: [Booking], subject: quote },
  (subject, [b]) => subject(withDiscount(b)).total < subject(b).total,
)
// RIGHT: the billing rules say a bill split between guests loses nothing and gives each guest a share
it.prop(
  '∀t,n_SplitBill_→SharesSumToTotal',
  { of: [Cents, GuestCount], subject: splitBill },
  (subject, [total, guests]) => {
    const shares = subject(total, guests)
    return shares.length === guests && shares.every((s) => s >= 0) && sum(shares) === total
  },
)
```
