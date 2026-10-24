---
title: A surviving mutant is killed by a test that asserts the contract clause it breaks, or its code is deleted because nothing reads it
applies_when:
  - a mutation report lists a surviving mutant in a *.workflow.ts file
  - deciding whether the code a survivor sits in is dead or the mutant is equivalent
tags: [testing, mutation, survivors, stryker]
---

A survivor is killed by a test that asserts the contract clause the mutant breaks, in the workflow's <stem>.workflow.property.test.ts or a behaviour test through the public entry; its expected value comes from the contract, never from the mutated expression.
Code is deleted only when nothing reads it at runtime; never empty a map, drop a field or remove an operand a reader consumes to make a mutant disappear.
An equivalent mutant on live code is removed by rewriting the code so the mutant cannot occur; no baseline, allowlist, ignorer or accepted-survivor record is added.
Never clear a survivor with a Stryker disable comment, an excluded mutator, an ignorer, or a thresholds value in a package's Stryker config.
Whether code is dead or a mutant is equivalent is decided by the review judge; an uncertain case escalates.

Gate: judge
