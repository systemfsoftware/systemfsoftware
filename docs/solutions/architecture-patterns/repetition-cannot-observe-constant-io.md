---
title: Repetition cannot observe constant-returning I/O
date: 2026-08-19
topic: architecture-patterns
---

# Repetition cannot observe constant-returning I/O

A determinism law — `∀x. f(x) = f(x)`, two applications of a function claimed pure to the same input must agree — has one boundary it cannot
cross.

## The doctrine

Repetition cannot observe I/O whose result is constant. A write that returns the same value every time, an emitted metric, a mutation outside
the function that leaves its return value alone — `∀x. f(x) = f(x)` stays green over all of them, and a reader who infers purity from that green
is wrong. This limit is the reason a determinism law can only demote, never certify: it proves impurity when it fails and proves nothing when it
passes.

Gate: review — for each function under a determinism law that touches anything outside itself, the reviewer names why repetition suffices, or the
purity claim is withdrawn.

The law itself is three lines at the call site: one `it.prop` over the domain's arbitrary, comparator `Equal.equals` (or `Schema.toEquivalence`
when the codomain is a schema type), and no dependency.

## Related

- ../architecture-patterns/make-boundary-owns-a-decision.md
