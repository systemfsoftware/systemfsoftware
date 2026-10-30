# Property Testing

What makes a property test a real property: drawn inputs that reach the decision, constructed boundaries and collisions with declared coverage, an oracle independent of the code under test, evidence the property can fail, and which properties a Workflow decider needs. Work that writes or reviews a property test must honor it.

Rules are top-level `.md` files with `title`, `applies_when` and `tags`, cited as `(pack: property-testing, <file>.md)`. Rule text is evidence that `ce-plan` and `ce-code-review` quote, not an enforcement contract. Subfolders are storage the resolver never reads.
